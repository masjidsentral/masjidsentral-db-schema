#!/usr/bin/env node
/**
 * deduplicate.js — Compare your masjid data against records already in MasjidDB.
 *
 * Run this AFTER your partner has inserted their data into the DB.
 *
 * Usage:
 *   node deduplicate.js your_data.csv existing_db.csv
 *
 * Setup:
 *   npm install
 *
 * Required CSV columns: name, lat, lng, geohash
 * (Run add_geohash.js first if geohash column is missing)
 *
 * Outputs:
 *   new_records.csv    — safe to insert, no duplicates found
 *   needs_review.csv   — potential duplicates, review manually before inserting
 */

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { stringify } = require('csv-stringify/sync')
const ngeohash = require('ngeohash')
const natural = require('natural')

const GEOHASH_PREFIX_LEN = 5      // ~4.9km search box — generous for candidate fetch
const DISTANCE_THRESHOLD_M = 100  // metres
const NAME_SIMILARITY_THRESHOLD = 0.85

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6_371_000
  const toRad = (deg) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/^(masjid|surau|musolla)\s+/, '')
    .trim()
}

function readCsv(filePath) {
  const raw = fs.readFileSync(path.resolve(filePath), 'utf8')
  return parse(raw, { columns: true, skip_empty_lines: true })
}

function validateColumns(records, filePath) {
  const required = ['name', 'lat', 'lng', 'geohash']
  const missing = required.filter((col) => !(col in records[0]))
  if (missing.length) {
    console.error(`Error: ${filePath} is missing columns: ${missing.join(', ')}`)
    if (missing.includes('geohash')) {
      console.error('       Run add_geohash.js first to compute the geohash column.')
    }
    process.exit(1)
  }
}

const [, , yourFile, existingFile] = process.argv

if (!yourFile || !existingFile) {
  console.error('Usage: node deduplicate.js your_data.csv existing_db.csv')
  process.exit(1)
}

const yourRecords = readCsv(yourFile)
const existingRecords = readCsv(existingFile)

validateColumns(yourRecords, yourFile)
validateColumns(existingRecords, existingFile)

// Build a prefix map for fast candidate lookup
const existingByPrefix = {}
for (const record of existingRecords) {
  const prefix = record.geohash.slice(0, GEOHASH_PREFIX_LEN)
  if (!existingByPrefix[prefix]) existingByPrefix[prefix] = []
  existingByPrefix[prefix].push(record)
}

const newRecords = []
const needsReview = []
let duplicateCount = 0

for (const row of yourRecords) {
  const prefix = row.geohash.slice(0, GEOHASH_PREFIX_LEN)
  const candidates = existingByPrefix[prefix] ?? []

  if (!candidates.length) {
    newRecords.push(row)
    continue
  }

  let isDuplicate = false
  let isAmbiguous = false

  for (const cand of candidates) {
    const dist = haversine(
      parseFloat(row.lat), parseFloat(row.lng),
      parseFloat(cand.lat), parseFloat(cand.lng)
    )
    const nameSim = natural.JaroWinklerDistance(
      normalizeName(row.name),
      normalizeName(cand.name)
    )

    const closeEnough = dist <= DISTANCE_THRESHOLD_M
    const similarName = nameSim >= NAME_SIMILARITY_THRESHOLD

    if (closeEnough && similarName) {
      isDuplicate = true
      break
    } else if (closeEnough || similarName) {
      needsReview.push({
        ...row,
        _match_name: cand.name,
        _match_lat: cand.lat,
        _match_lng: cand.lng,
        _distance_m: dist.toFixed(1),
        _name_similarity: nameSim.toFixed(3),
      })
      isAmbiguous = true
      break
    }
  }

  if (isDuplicate) {
    duplicateCount++
  } else if (!isAmbiguous) {
    newRecords.push(row)
  }
}

fs.writeFileSync('new_records.csv', stringify(newRecords, { header: true }))
fs.writeFileSync('needs_review.csv', stringify(needsReview, { header: true }))

const total = yourRecords.length
console.log(`\nResults (${total} records processed):`)
console.log(`  ${String(newRecords.length).padStart(5)}  new records    → new_records.csv  (safe to insert)`)
console.log(`  ${String(needsReview.length).padStart(5)}  needs review   → needs_review.csv (check manually)`)
console.log(`  ${String(duplicateCount).padStart(5)}  duplicates     → skipped`)

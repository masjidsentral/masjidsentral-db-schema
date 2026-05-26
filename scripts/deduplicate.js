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

const GEOHASH_PREFIX_LEN = 5       // ~4.9km search box — generous for candidate fetch
const GEOHASH_EXACT_LEN = 9        // ~4.8m x 4.8m — exact location match
const DISTANCE_THRESHOLD_M = 500   // within 500m → duplicate regardless of name
const DISTANCE_HIGH_SIM_M = 1000   // within 1km + high name similarity → duplicate
const NAME_SIMILARITY_HIGH = 0.95  // threshold for 500m–1km range

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

// Build lookup maps from existing (Qiyam) records
const existingByPrefix = {}
const existingByGeohash9 = {}
for (const record of existingRecords) {
  const prefix = record.geohash.slice(0, GEOHASH_PREFIX_LEN)
  if (!existingByPrefix[prefix]) existingByPrefix[prefix] = []
  existingByPrefix[prefix].push(record)

  const gh9 = ngeohash.encode(parseFloat(record.lat), parseFloat(record.lng), GEOHASH_EXACT_LEN)
  existingByGeohash9[gh9] = record
}

const newRecords = []
let duplicateCount = 0

for (const row of yourRecords) {
  // Exact 9-char geohash match → definite duplicate, keep Qiyam's record
  const gh9 = ngeohash.encode(parseFloat(row.lat), parseFloat(row.lng), GEOHASH_EXACT_LEN)
  if (existingByGeohash9[gh9]) {
    duplicateCount++
    continue
  }

  const prefix = row.geohash.slice(0, GEOHASH_PREFIX_LEN)
  const candidates = existingByPrefix[prefix] ?? []

  if (!candidates.length) {
    newRecords.push({
      ...row,
      geohash: ngeohash.encode(parseFloat(row.lat), parseFloat(row.lng), GEOHASH_EXACT_LEN),
    })
    continue
  }

  let isDuplicate = false

  for (const cand of candidates) {
    const dist = haversine(
      parseFloat(row.lat), parseFloat(row.lng),
      parseFloat(cand.lat), parseFloat(cand.lng)
    )
    const nameSim = natural.JaroWinklerDistance(
      normalizeName(row.name),
      normalizeName(cand.name)
    )

    if (dist <= DISTANCE_THRESHOLD_M) {
      isDuplicate = true
      break
    } else if (dist <= DISTANCE_HIGH_SIM_M && nameSim >= NAME_SIMILARITY_HIGH) {
      isDuplicate = true
      break
    }
  }

  if (isDuplicate) {
    duplicateCount++
  } else {
    newRecords.push({
      ...row,
      geohash: ngeohash.encode(parseFloat(row.lat), parseFloat(row.lng), GEOHASH_EXACT_LEN),
    })
  }
}

fs.writeFileSync('new_records.csv', stringify(newRecords, { header: true }))

const total = yourRecords.length
console.log(`\nResults (${total} records processed):`)
console.log(`  ${String(newRecords.length).padStart(5)}  new records    → new_records.csv  (safe to insert)`)
console.log(`  ${String(duplicateCount).padStart(5)}  duplicates     → skipped`)

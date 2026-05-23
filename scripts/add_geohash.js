#!/usr/bin/env node
/**
 * add_geohash.js — Compute and append a geohash column to a masjid CSV.
 *
 * Run this if your CSV has lat/lng columns but no geohash column.
 *
 * Usage:
 *   node add_geohash.js input.csv output.csv
 *
 * Setup:
 *   npm install
 *
 * Expected CSV columns (minimum): name, lat, lng
 * Output: same CSV with an additional 'geohash' column (precision 7, ~76m x ~76m)
 */

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { stringify } = require('csv-stringify/sync')
const ngeohash = require('ngeohash')

const GEOHASH_PRECISION = 7 // ~76m x ~76m

const [, , inputFile, outputFile] = process.argv

if (!inputFile || !outputFile) {
  console.error('Usage: node add_geohash.js input.csv output.csv')
  process.exit(1)
}

const raw = fs.readFileSync(path.resolve(inputFile), 'utf8')
const records = parse(raw, { columns: true, skip_empty_lines: true })

if (!records.length) {
  console.error('Error: CSV is empty.')
  process.exit(1)
}

const first = records[0]
if (!('lat' in first) || !('lng' in first)) {
  console.error("Error: CSV must have 'lat' and 'lng' columns.")
  process.exit(1)
}

const output = records.map((row) => ({
  ...row,
  geohash: ngeohash.encode(parseFloat(row.lat), parseFloat(row.lng), GEOHASH_PRECISION),
}))

fs.writeFileSync(path.resolve(outputFile), stringify(output, { header: true }))
console.log(`Done. ${output.length} records written to ${outputFile}`)

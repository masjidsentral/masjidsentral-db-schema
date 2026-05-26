#!/usr/bin/env node
// sql_to_csv.js — Convert wrangler d1 export SQL dump to CSV for deduplication
// Usage: node sql_to_csv.js masjids_dump.sql existing_db.csv

const fs = require('fs')
const path = require('path')
const { stringify } = require('csv-stringify/sync')

const [, , inputFile, outputFile] = process.argv

if (!inputFile || !outputFile) {
  console.error('Usage: node sql_to_csv.js input.sql output.csv')
  process.exit(1)
}

// Rename source column names to the canonical names used by import_to_d1.js
const RENAME = {
  state_name:    'state',
  district_name: 'city',
}

function parseValues(valStr) {
  const values = []
  let i = 0
  while (i < valStr.length) {
    while (i < valStr.length && valStr[i] === ' ') i++
    if (i >= valStr.length) break

    if (valStr[i] === "'") {
      let str = ''
      i++
      while (i < valStr.length) {
        if (valStr[i] === "'" && valStr[i + 1] === "'") { str += "'"; i += 2 }
        else if (valStr[i] === "'") { i++; break }
        else { str += valStr[i++] }
      }
      values.push(str)
    } else if (valStr.slice(i, i + 4) === 'NULL') {
      values.push(null)
      i += 4
    } else {
      let token = ''
      while (i < valStr.length && valStr[i] !== ',') token += valStr[i++]
      values.push(token.trim())
    }

    while (i < valStr.length && (valStr[i] === ',' || valStr[i] === ' ')) i++
  }
  return values
}

const lines = fs.readFileSync(path.resolve(inputFile), 'utf8').split('\n')

let columns = null
let tablePattern = null
const rows = []

for (const line of lines) {
  if (!tablePattern) {
    const m = line.match(/^INSERT INTO "([^"]+)" \(([^)]+)\)/)
    if (m) {
      tablePattern = m[1]
      columns = m[2].split(',').map(c => c.trim().replace(/"/g, ''))
    }
  }

  if (!tablePattern || !line.startsWith(`INSERT INTO "${tablePattern}"`)) continue

  const valStart = line.indexOf('VALUES(') + 7
  const valEnd = line.lastIndexOf(');')
  if (valStart < 7 || valEnd < 0) continue

  const values = parseValues(line.slice(valStart, valEnd))
  const row = {}
  for (let i = 0; i < columns.length; i++) {
    const col = RENAME[columns[i]] ?? columns[i]
    row[col] = values[i] ?? null
  }
  rows.push(row)
}

fs.writeFileSync(path.resolve(outputFile), stringify(rows, { header: true }))
console.log(`Converted ${rows.length} records → ${outputFile}`)

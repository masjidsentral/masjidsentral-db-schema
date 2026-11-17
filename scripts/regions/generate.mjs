#!/usr/bin/env node
// Deterministic generator for migrations/006_regions.sql.
// Reads ONLY the files under ./sources and ./my_cities_existing.sql as data (regex/JSON parsing, never executed).
// Usage: node scripts/regions/generate.mjs   (from masjidsentral-db-schema/) -> writes migrations/006_regions.sql
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const here = path.dirname(fileURLToPath(import.meta.url))
const outFile = path.resolve(here, '../../migrations/006_regions.sql')
const src = (f) => readFileSync(path.join(here, 'sources', f), 'utf8')

export function slugify(s, amp = 'dan') {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ` ${amp} `)
    .replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
const clean = (s) => s.replace(/\s+/g, ' ').trim()
const titleCase = (s) =>
  s.toLowerCase().replace(/(^|[\s-])([a-z])/g, (_, a, b) => a + b.toUpperCase())
const q = (s) => `'${s.replace(/'/g, "''")}'`

const states = new Map() // id -> {name, country}
const cities = new Map() // id -> {name, state, raw?}
const counts = {}
function addState(id, name, country) {
  if (states.has(id)) throw new Error('dup state ' + id)
  states.set(id, { name, country })
}
function addCity(id, name, state, raw) {
  if (!states.has(state) && !state.startsWith('my-')) throw new Error('no state ' + state)
  if (cities.has(id)) return false
  cities.set(id, { name, state, raw })
  return true
}

// ---------- Malaysia: existing 612 cities (byte-for-byte values) ----------
const MY_STATES = ['jhr', 'kdh', 'ktn', 'mlk', 'nsn', 'phg', 'prk', 'pls', 'png', 'sbh', 'swk', 'sgr', 'trg', 'kul', 'lbn', 'pjy'].map((c) => 'my-' + c)
const existing = [...readFileSync(path.join(here, 'my_cities_existing.sql'), 'utf8')
  .matchAll(/^INSERT INTO "cities" \("id","name","state_id"\) VALUES\('([^']*)','((?:[^']|'')*)','([^']*)'\);$/gm)]
  .map((m) => ({ id: m[1], rawName: m[2], state: m[3] }))
if (existing.length !== 612) throw new Error('expected 612 existing MY cities, got ' + existing.length)
for (const e of existing) {
  if (!MY_STATES.includes(e.state)) throw new Error('unknown MY state ' + e.state)
  if (cities.has(e.id)) throw new Error('duplicate existing id ' + e.id)
  cities.set(e.id, { name: e.rawName, state: e.state, raw: true })
}

// ---------- Malaysia: districts (Wikipedia "List of districts in Malaysia") ----------
const flagToState = { Johor: 'jhr', Kedah: 'kdh', Kelantan: 'ktn', Malacca: 'mlk', 'Negeri Sembilan': 'nsn', Pahang: 'phg', Penang: 'png', Perak: 'prk', Perlis: 'pls', Selangor: 'sgr', Terengganu: 'trg', Sabah: 'sbh', Sarawak: 'swk' }
// English wiki name -> official Malay name
const MY_RENAME = {
  'Central Seberang Perai': 'Seberang Perai Tengah',
  'North Seberang Perai': 'Seberang Perai Utara',
  'South Seberang Perai': 'Seberang Perai Selatan',
  'Northeast Penang Island': 'Timur Laut',
  'Southwest Penang Island': 'Barat Daya',
  'Larut, Matang and Selama': 'Larut, Matang dan Selama',
}
// Districts that already exist in prod under a different slug (never create a second row for the same place)
const MY_SAME_PLACE = { 'my-prk-larut-matang-dan-selama': 'my-prk-larut-matang-and-selama' }
const wiki = src('my_districts_wikipedia.wikitext').split('\n')
const start = wiki.findIndex((l) => l.startsWith('===West Malaysia'))
const end = wiki.findIndex((l) => l.startsWith('==Mukim'))
let cur = null
const myDistricts = []
for (const l of wiki.slice(start, end)) {
  const f = l.match(/^\|[^[{]*\{\{flag\|([^}]+)\}\}/)
  if (f) { cur = flagToState[f[1]] || null; continue }
  const m = l.match(/^\|\s*(?:\{\{flagicon image\|[^}]*\}\}\s*)?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/)
  if (m && cur) {
    const disp = m[2] || m[1]
    if (/ District(, \w+)?$/.test(disp) && !/Council/.test(disp)) {
      const en = clean(disp.replace(/ District(, \w+)?$/, ''))
      myDistricts.push({ state: 'my-' + cur, name: MY_RENAME[en] || en })
    }
  }
}
let myAdded = 0
const myDistrictTotal = myDistricts.length
for (const d of myDistricts) {
  const id = `${d.state}-${slugify(d.name)}`
  if (MY_SAME_PLACE[id] && cities.has(MY_SAME_PLACE[id])) continue
  if (addCity(id, d.name.replace(/'/g, "''"), d.state, false)) myAdded++
}

// ---------- Singapore (URA Master Plan 2019 planning areas) ----------
addState('sg-singapore', 'Singapore', 'sg')
const sg = JSON.parse(src('sg_planning_areas_2019.geojson')).features.map((f) => f.properties.PLN_AREA_N)
for (const n of sg) addCity(`sg-singapore-${slugify(titleCase(n), 'and')}`, titleCase(n).replace(/'/g, "''"), 'sg-singapore', false)

// ---------- Brunei (4 districts, 39 mukims) ----------
const bnStates = { 'Brunei-Muara': 'bn-brunei-muara', Belait: 'bn-belait', Tutong: 'bn-tutong', Temburong: 'bn-temburong' }
for (const [n, id] of Object.entries(bnStates)) addState(id, n, 'bn')
let bnDistrict = null
const bnRows = []
for (const l of src('bn_mukims_wikipedia.wikitext').split('\n')) {
  const m = l.match(/^\|\[\[Mukim ([^\]|]+)(?:\|[^\]]*)?\]\]/)
  if (!m) continue
  const d = l.match(/\[\[(Brunei-Muara|Belait|Tutong|Temburong) District\|/)
  if (d) bnDistrict = d[1]
  bnRows.push({ state: bnStates[bnDistrict], name: clean(m[1]) })
}
if (bnRows.length !== 39) throw new Error('expected 39 mukims, got ' + bnRows.length)
for (const r of bnRows) addCity(`${r.state}-${slugify(r.name)}`, r.name.replace(/'/g, "''"), r.state, false)
addCity('bn-brunei-muara-bandar-seri-begawan', 'Bandar Seri Begawan', 'bn-brunei-muara', false)

// ---------- Indonesia (Kepmendagri 300.2.2-2138/2025 via cahyadsn/wilayah) ----------
const ID_STATE_SLUG = { 'Daerah Khusus Ibukota Jakarta': 'dki-jakarta', 'Daerah Istimewa Yogyakarta': 'di-yogyakarta' }
const wil = src('wilayah.sql')
const prov = new Map()
for (const m of wil.matchAll(/\('(\d{2})','([^']*)'\)/g)) {
  const name = clean(m[2])
  const id = 'id-' + (ID_STATE_SLUG[name] || slugify(name))
  prov.set(m[1], id)
  addState(id, name, 'id')
}
let kab = 0, kota = 0
for (const m of wil.matchAll(/\('(\d{2})\.(\d{2})','([^']*)'\)/g)) {
  const sid = prov.get(m[1])
  if (!sid) throw new Error('no province for ' + m[1])
  let name = clean(m[3]).replace(/\bKep\. /g, 'Kepulauan ')
  const isKab = name.startsWith('Kabupaten ')
  const isKota = name.startsWith('Kota ')
  if (!isKab && !isKota) throw new Error('unexpected name ' + name)
  const core = name.replace(/^(Kabupaten|Kota)( Administrasi)? /, '')
  if (isKab) kab++; else kota++
  addCity(`${sid}-${isKab ? 'kab' : 'kota'}-${slugify(core)}`, name.replace(/'/g, "''"), sid, false)
}

// ---------- validate + emit ----------
const idRe = /^[a-z]{2}(-[a-z0-9]+)+$/
const stateRows = [...states.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
const cityRows = [...cities.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
for (const [id] of stateRows) if (!idRe.test(id)) throw new Error('bad state id ' + id)
for (const [id, c] of cityRows) {
  // 33 legacy prod ids contain runs of hyphens (e.g. my-sbh-taw---tawau); they are copied unchanged by spec, so only new ids are checked
  if (!existing.some((e) => e.id === id) && !idRe.test(id)) throw new Error('bad city id ' + id)
  if (!id.startsWith(c.state + '-')) throw new Error('city id prefix ' + id)
}
const cc = (country) => ({
  states: stateRows.filter(([, s]) => s.country === country).length,
  cities: cityRows.filter(([, c]) => (country === 'my' ? c.state.startsWith('my-') : states.get(c.state)?.country === country)).length,
})
for (const k of ['my', 'sg', 'bn', 'id']) counts[k] = cc(k)
counts.my.states = 16
counts._detail = { myExisting: 612, myDistrictsParsed: myDistrictTotal, myDistrictsAdded: myAdded, idKabupaten: kab, idKota: kota, bnMukims: bnRows.length, sgPlanningAreas: sg.length }

const header = `-- 006_regions.sql: complete regions (states and cities) for MY, SG, BN, ID.
-- GENERATED by masjidsentral-db-schema/scripts/regions/generate.mjs from scripts/regions/sources/*. Do not edit by hand.
-- Every statement is INSERT OR IGNORE: a no-op for rows that already exist (16 MY states, 612 MY cities in prod).
--
-- Sources (downloaded 2026-11-17, raw copies in scripts/regions/sources/):
--  ID: Kepmendagri No 300.2.2-2138 Tahun 2025 via github.com/cahyadsn/wilayah db/wilayah.sql (commit d68e8d5516f969d1905d0b2940f20034becb0db7, last edit 2026-02-13). 38 provinces, 514 kabupaten/kota.
--  SG: URA Master Plan 2019 Planning Area Boundary (No Sea), data.gov.sg dataset d_4765db0e87b9c86336792efe8a1f7a66 (updated 2025-12-05). 55 planning areas.
--  BN: Wikipedia "Mukims of Brunei" (en.wikipedia.org/wiki/Mukims_of_Brunei, 4 districts, 39 mukims, citing the Brunei Information Dept district lists) + Bandar Seri Begawan.
--  MY: 612 existing prod cities (scripts/regions/my_cities_existing.sql, unchanged) + districts from Wikipedia "List of districts in Malaysia" (en.wikipedia.org/wiki/List_of_districts_in_Malaysia).
--
-- Counts: ${Object.entries(counts).filter(([k]) => k !== '_detail').map(([k, v]) => `${k}: ${v.states} states / ${v.cities} cities`).join('; ')}.
`
const lines = [header, '-- States']
for (const [id, s] of stateRows) {
  if (s.country === 'my') continue
  lines.push(`INSERT OR IGNORE INTO states (id, name, country_id) VALUES (${q(id)}, ${q(s.name)}, ${q(s.country)});`)
}
lines.push('', '-- Cities')
for (const [id, c] of cityRows) {
  // names are already SQL-escaped ('' form) at insertion
  lines.push(`INSERT OR IGNORE INTO cities (id, name, state_id) VALUES (${q(id)}, '${c.name}', ${q(c.state)});`)
}
writeFileSync(outFile, lines.join('\n') + '\n')
console.log(JSON.stringify(counts, null, 1))

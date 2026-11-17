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

// ---------- Malaysia: Pos Malaysia post towns (AsyrafHussin/malaysia-postcodes, MIT) ----------
const MY_STATE_ID = { 'Wp Kuala Lumpur': 'my-kul', Johor: 'my-jhr', Kedah: 'my-kdh', Kelantan: 'my-ktn', Melaka: 'my-mlk', 'Negeri Sembilan': 'my-nsn', Pahang: 'my-phg', 'Pulau Pinang': 'my-png', Perak: 'my-prk', Perlis: 'my-pls', Sabah: 'my-sbh', Sarawak: 'my-swk', Selangor: 'my-sgr', Terengganu: 'my-trg', 'Wp Labuan': 'my-lbn', 'Wp Putrajaya': 'my-pjy' }
const myData = JSON.parse(src('my_postcodes_all.json')).state
const myNew = new Map() // id -> {name,state}
for (const st of myData) {
  const sid = MY_STATE_ID[st.name]
  if (!sid) throw new Error('unmapped MY state ' + st.name)
  const seen = new Set()
  for (const c of st.city) {
    const name = clean(c.name)
    if (seen.has(name.toLowerCase())) throw new Error('dup town in state ' + sid + ': ' + name)
    seen.add(name.toLowerCase())
    const id = `${sid}-${slugify(name)}`
    if (myNew.has(id)) throw new Error('dup MY id ' + id)
    myNew.set(id, { name, state: sid })
    addCity(id, name.replace(/'/g, "''"), sid, false)
  }
}
if (new Set(myData.map((s) => MY_STATE_ID[s.name])).size !== 16) throw new Error('dataset must cover 16 MY states')

// Legacy prod cities (input for the old->new mapping and the name fix-ups only)
const existing = [...readFileSync(path.join(here, 'my_cities_existing.sql'), 'utf8')
  .matchAll(/^INSERT INTO "cities" \("id","name","state_id"\) VALUES\('([^']*)','((?:[^']|'')*)','([^']*)'\);$/gm)]
  .map((m) => ({ id: m[1], name: m[2].replace(/''/g, "'"), state: m[3] }))
if (existing.length !== 612) throw new Error('expected 612 legacy MY cities, got ' + existing.length)

// Explicit aliases for spelling variants of the same town (legacy slug -> new id)
const MY_ALIAS = {
  'my-kdh-alor-star': 'my-kdh-alor-setar', 'my-ktn-kota-bahru': 'my-ktn-kota-bharu', 'my-sgr-kuala-kubu-bharu': 'my-sgr-kuala-kubu-baru',
  'my-sgr-port-klang': 'my-sgr-pelabuhan-klang', 'my-sgr-tanjung-karang': 'my-sgr-tanjong-karang', 'my-kul-kuala-kumpur': 'my-kul-kuala-lumpur',
  'my-prk-sri-iskandar': 'my-prk-bandar-seri-iskandar', 'my-prk-seri-iskandar': 'my-prk-bandar-seri-iskandar', 'my-prk-tanjung-malim': 'my-prk-tanjong-malim',
  'my-prk-pulau-pangkor': 'my-prk-pangkor', 'my-prk-pangkor-island': 'my-prk-pangkor', 'my-prk-tanjung-tualang': 'my-prk-tanjong-tualang',
  'my-prk-tanjung-piandang': 'my-prk-tanjong-piandang', 'my-prk-tanjung-rambutan': 'my-prk-tanjong-rambutan', 
  'my-prk-bagan-datuk': 'my-prk-bagan-datoh',  
  'my-mlk-tanjung-kling': 'my-mlk-tanjong-kling', 'my-nsn-tanjung-ipoh': 'my-nsn-tanjong-ipoh', 
  'my-trg-kuala-dungun': 'my-trg-dungun',  'my-trg-kemasik': 'my-trg-kemasek', 'my-trg-chukai': 'my-trg-cukai',
   'my-png-george-town': 'my-png-pulau-pinang', 'my-png-georgetown': 'my-png-pulau-pinang', 
  'my-png-tanjung-bungah': 'my-png-tanjong-bungah', 'my-jhr-pekan-nanas': 'my-jhr-pekan-nenas', 'my-jhr-simpang-renggam': 'my-jhr-simpang-rengam',
  'my-jhr-sri-gading': 'my-jhr-seri-gading',  'my-phg-bandar-tun-razak': 'my-phg-bandar-tun-abdul-razak',
  'my-phg-frasers-hill': 'my-phg-bukit-fraser', 'my-phg-fraser-s-hill': 'my-phg-bukit-fraser', 
  'my-sbh-nabawah': 'my-sbh-nabawan', 'my-sbh-kimanis-mandahan': 'none', 'my-sbh-kinarut': 'none', 'my-sbh-kundasang': 'none', 'my-sbh-telipok': 'none',
   'my-swk-asa-jaya': 'my-swk-asajaya', 'my-swk-sematan': 'none', 'my-kul-bukit-jalil': 'none',
  
}
Object.assign(MY_ALIAS, { 'my-png-air-itam': 'my-png-ayer-itam', 'my-mlk-bandaraya-melaka': 'my-mlk-melaka', 'my-mlk-melaka-city': 'my-mlk-melaka', 'my-png-usm': 'my-png-usm-pulau-pinang', 'my-png-bukit-bendera': 'my-png-penang-hill', 'my-kdh-changlun': 'my-kdh-changloon', 'my-sgr-puncak-alam': 'my-sgr-bandar-puncak-alam', 'my-prk-cenderiang': 'my-prk-chenderiang', 'my-prk-teronoh': 'my-prk-tronoh' })
const newIds = new Set(myNew.keys())
const noneIds = new Set()
function mapLegacy(e) {
  if (newIds.has(e.id)) return e.id
  if (MY_ALIAS[e.id] !== undefined) return MY_ALIAS[e.id] === 'none' ? 'none' : (newIds.has(MY_ALIAS[e.id]) ? MY_ALIAS[e.id] : 'none')
  // strip "XXX - " zone prefix, a trailing " District", a leading "Mukim "
  const stripped = e.name.replace(/^[A-Za-z]{2,4} - /, '').replace(/ District$/i, '').replace(/^Mukim /i, '')
  const id = `${e.state}-${slugify(stripped)}`
  if (newIds.has(id)) return id
  if (MY_ALIAS[id] && newIds.has(MY_ALIAS[id])) return MY_ALIAS[id]
  return 'none'
}
const legacyMap = existing.map((e) => ({ ...e, to: mapLegacy(e) })).sort((a, b) => (a.id < b.id ? -1 : 1))
const myMapped = legacyMap.filter((m) => m.to !== 'none').length
// Same id, different name: 006 fixes the name
const legacyById = new Map(existing.map((e) => [e.id, e]))
const nameFixes = [...myNew.entries()].filter(([id, c]) => legacyById.has(id) && legacyById.get(id).name !== c.name).sort((a, b) => (a[0] < b[0] ? -1 : 1))

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
  if (!idRe.test(id)) throw new Error('bad city id ' + id)
  if (!id.startsWith(c.state + '-')) throw new Error('city id prefix ' + id)
}
const cc = (country) => ({
  states: stateRows.filter(([, s]) => s.country === country).length,
  cities: cityRows.filter(([, c]) => (country === 'my' ? c.state.startsWith('my-') : states.get(c.state)?.country === country)).length,
})
for (const k of ['my', 'sg', 'bn', 'id']) counts[k] = cc(k)
counts.my.states = 16 // from 001
counts._detail = { myLegacy: 612, myLegacyMapped: myMapped, myLegacyNone: 612 - myMapped, myNameFixes: nameFixes.length, idKabupaten: kab, idKota: kota, bnMukims: bnRows.length, sgPlanningAreas: sg.length }

const myIds = [...myNew.keys()].sort()
const header = `-- 006_regions.sql: complete regions (states and cities) for MY, SG, BN, ID.
-- GENERATED by masjidsentral-db-schema/scripts/regions/generate.mjs from scripts/regions/sources/*. Do not edit by hand.
-- Inserts are INSERT OR IGNORE (safe to re-run). The only destructive statement removes legacy Malaysian cities that are
-- not in the new list AND are not referenced by any masjid, so it can never violate the masjids.city_id foreign key.
--
-- Sources (downloaded 2026-11-17, raw copies in scripts/regions/sources/):
--  ID: Kepmendagri No 300.2.2-2138 Tahun 2025 via github.com/cahyadsn/wilayah db/wilayah.sql (commit d68e8d5516f969d1905d0b2940f20034becb0db7, last edit 2026-02-13). 38 provinces, 514 kabupaten/kota.
--  SG: URA Master Plan 2019 Planning Area Boundary (No Sea), data.gov.sg dataset d_4765db0e87b9c86336792efe8a1f7a66 (updated 2025-12-05). 55 planning areas.
--  BN: Wikipedia "Mukims of Brunei" (en.wikipedia.org/wiki/Mukims_of_Brunei, 4 districts, 39 mukims, citing the Brunei Information Dept district lists) + Bandar Seri Begawan.
--  MY: Pos Malaysia post towns from github.com/AsyrafHussin/malaysia-postcodes all.json (MIT licence, commit 842ca633a72571d8b1cc7e445eefd536cb773f19, 2026-03-06). One city per (state, post town).
--
-- Counts: ${Object.entries(counts).filter(([k]) => k !== '_detail').map(([k, v]) => `${k}: ${v.states} states / ${v.cities} cities`).join('; ')}.
`
const lines = [header, '-- Malaysia: drop legacy cities that are not in the new list and are unreferenced']
lines.push('DELETE FROM cities', "WHERE state_id LIKE 'my-%'", '  AND NOT EXISTS (SELECT 1 FROM masjids m WHERE m.city_id = cities.id)', '  AND id NOT IN (')
lines.push(myIds.map((id) => `    ${q(id)}`).join(',\n'), '  );', '', '-- States')
for (const [id, s] of stateRows) {
  if (s.country === 'my') continue
  lines.push(`INSERT OR IGNORE INTO states (id, name, country_id) VALUES (${q(id)}, ${q(s.name)}, ${q(s.country)});`)
}
lines.push('', '-- Cities')
for (const [id, c] of cityRows) {
  // names are already SQL-escaped ('' form) at insertion
  lines.push(`INSERT OR IGNORE INTO cities (id, name, state_id) VALUES (${q(id)}, '${c.name}', ${q(c.state)});`)
}
lines.push('', '-- Malaysia: a row with the same id but a different name (legacy ALL-CAPS or typo) gets the clean name')
for (const [id, c] of [...myNew.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) lines.push(`UPDATE cities SET name = ${q(c.name)} WHERE id = ${q(id)} AND name <> ${q(c.name)};`)
writeFileSync(outFile, lines.join('\n') + '\n')

// Legacy MY id -> new id mapping (for PROGRESS_regions.md; consumers remap stored ids with it)
const md = ['| Legacy id | Legacy name | New id |', '|---|---|---|']
for (const m of legacyMap) md.push(`| \`${m.id}\` | ${m.name.replace(/\|/g, '\\|')} | ${m.to === 'none' ? 'none' : '`' + m.to + '`'} |`)
writeFileSync(path.join(here, 'my_legacy_mapping.md'), md.join('\n') + '\n')
console.log(JSON.stringify(counts, null, 1))

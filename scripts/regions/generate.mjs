#!/usr/bin/env node
// Deterministic generator for migrations/006_regions.sql.
// Reads ONLY the files under ./sources and ./my_cities_existing.sql as data (regex/JSON parsing, never executed).
// Usage: node scripts/regions/generate.mjs   (from masjidsentral-db-schema/) -> writes migrations/006_regions.sql
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
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
  if (cities.has(id)) throw new Error('dup city id ' + id)
  cities.set(id, { name, state, raw })
  return true
}

// ---------- Malaysia: Pos Malaysia post towns (AsyrafHussin/malaysia-postcodes, MIT) ----------
const MY_STATE_ID = { 'Wp Kuala Lumpur': 'my-kul', Johor: 'my-jhr', Kedah: 'my-kdh', Kelantan: 'my-ktn', Melaka: 'my-mlk', 'Negeri Sembilan': 'my-nsn', Pahang: 'my-phg', 'Pulau Pinang': 'my-png', Perak: 'my-prk', Perlis: 'my-pls', Sabah: 'my-sbh', Sarawak: 'my-swk', Selangor: 'my-sgr', Terengganu: 'my-trg', 'Wp Labuan': 'my-lbn', 'Wp Putrajaya': 'my-pjy' }
const myData = JSON.parse(src('my_postcodes_all.json')).state
const MY_NAME_OVERRIDE = { 'Usm Pulau Pinang': 'USM Pulau Pinang' }
// Dataset rows that are not separate towns: dropped, and mapped to the kept id
const MY_SKIP = { 'my-kdh-bandar-bahru': 'my-kdh-bandar-baharu', 'my-swk-pusat-mel-miri': 'my-swk-miri' }
const myNew = new Map() // id -> {name,state}
for (const st of myData) {
  const sid = MY_STATE_ID[st.name]
  if (!sid) throw new Error('unmapped MY state ' + st.name)
  const seen = new Set()
  for (const c of st.city) {
    const name = MY_NAME_OVERRIDE[clean(c.name)] || clean(c.name)
    if (seen.has(name.toLowerCase())) throw new Error('dup town in state ' + sid + ': ' + name)
    seen.add(name.toLowerCase())
    const id = `${sid}-${slugify(name)}`
    if (MY_SKIP[id]) continue
    if (myNew.has(id)) throw new Error('dup MY id ' + id)
    myNew.set(id, { name, state: sid })
    addCity(id, name, sid, false)
  }
}
if (new Set(myData.map((s) => MY_STATE_ID[s.name])).size !== 16) throw new Error('dataset must cover 16 MY states')

// Legacy prod cities (input for the old->new mapping and the name fix-ups only)
const existing = [...readFileSync(path.join(here, 'my_cities_existing.sql'), 'utf8')
  .matchAll(/^INSERT INTO "cities" \("id","name","state_id"\) VALUES\('([^']*)','((?:[^']|'')*)','([^']*)'\);$/gm)]
  .map((m) => ({ id: m[1], name: m[2].replace(/''/g, "'"), state: m[3] }))
if (existing.length !== 612) throw new Error('expected 612 legacy MY cities, got ' + existing.length)

// Explicit aliases for the legacy->new mapping table only (legacy id -> new id)
const MY_ALIAS = { ...MY_SKIP }
const alias = (to, ...froms) => { for (const f of froms) MY_ALIAS[f] = to }
alias('my-kdh-alor-setar', 'my-kdh-alor-star')
alias('my-ktn-kota-bharu', 'my-ktn-kota-bahru', 'my-ktn-kubang-kerian', 'my-ktn-pengkalan-chepa')
alias('my-sgr-kuala-kubu-baru', 'my-sgr-kuala-kubu-bharu')
alias('my-sgr-pelabuhan-klang', 'my-sgr-port-klang')
alias('my-sgr-tanjong-karang', 'my-sgr-tanjung-karang')
alias('my-sgr-sungai-ayer-tawar', 'my-sgr-sungai-air-tawar')
alias('my-sgr-bandar-puncak-alam', 'my-sgr-puncak-alam')
alias('my-kul-kuala-lumpur', 'my-kul-kuala-kumpur', 'my-kul-cheras', 'my-kul-kepong', 'my-kul-bukit-bintang', 'my-kul-datuk-keramat', 'my-kul-keramat', 'my-kul-wangsa-maju', 'my-kul-jinjang-utara', 'my-kul-wp-kuala-lumpur', 'my-kul-wilayah-persekutuan', ...[1, 2, 3, 4, 5, 6].map((n) => `my-kul-zon-${n}`))
alias('my-lbn-labuan', 'my-lbn-wp-labuan', 'my-lbn-wilayah-persekutuan-labuan')
alias('my-pjy-putrajaya', 'my-pjy-wilayah-persekutuan-putrajaya')
alias('my-mlk-melaka', 'my-mlk-malacca', 'my-mlk-bachang', 'my-mlk-bacang', 'my-mlk-batu-berendam', 'my-mlk-bukit-beruang', 'my-mlk-bukit-katil', 'my-mlk-klebang-besar', 'my-mlk-telok-mas', 'my-mlk-ayer-molek', 'my-mlk-melaka-tengah', 'my-mlk-bandaraya-melaka', 'my-mlk-melaka-city')
alias('my-mlk-tanjong-kling', 'my-mlk-tanjung-kling')
alias('my-jhr-johor-bahru', 'my-jhr-skudai', 'my-jhr-kempas', 'my-jhr-tampoi')
alias('my-jhr-pekan-nenas', 'my-jhr-pekan-nanas')
alias('my-jhr-simpang-rengam', 'my-jhr-simpang-renggam')
alias('my-jhr-seri-gading', 'my-jhr-sri-gading')
alias('my-kdh-langkawi', 'my-kdh-kuah')
alias('my-kdh-changloon', 'my-kdh-changlun')
alias('my-prk-bruas', 'my-prk-beruas')
alias('my-prk-trong', 'my-prk-terong')
alias('my-prk-tronoh', 'my-prk-teronoh')
alias('my-prk-chenderiang', 'my-prk-cenderiang')
alias('my-prk-simpang-ampat-semanggol', 'my-prk-simpang-empat-semanggol')
alias('my-prk-ipoh', 'my-prk-menglembu', 'my-prk-lahat', 'my-prk-bercham')
alias('my-prk-bandar-seri-iskandar', 'my-prk-sri-iskandar', 'my-prk-seri-iskandar')
alias('my-prk-tanjong-malim', 'my-prk-tanjung-malim')
alias('my-prk-pangkor', 'my-prk-pulau-pangkor', 'my-prk-pangkor-island')
alias('my-prk-tanjong-tualang', 'my-prk-tanjung-tualang')
alias('my-prk-tanjong-piandang', 'my-prk-tanjung-piandang')
alias('my-prk-tanjong-rambutan', 'my-prk-tanjung-rambutan')
alias('my-prk-bagan-datoh', 'my-prk-bagan-datuk')
alias('my-sbh-kota-kinabatangan', 'my-sbh-kinabatangan', 'my-sbh-san---kinabatangan')
alias('my-sbh-nabawan', 'my-sbh-nabawah')
alias('my-swk-kota-samarahan', 'my-swk-samarahan')
alias('my-swk-niah', 'my-swk-batu-niah')
alias('my-swk-asajaya', 'my-swk-asa-jaya')
alias('my-trg-cukai', 'my-trg-kemaman', 'my-trg-kuala-kemaman', 'my-trg-chukai')
alias('my-trg-dungun', 'my-trg-kuala-dungun')
alias('my-trg-kemasek', 'my-trg-kemasik')
alias('my-phg-kuala-lipis', 'my-phg-lipis')
alias('my-phg-tanah-rata', 'my-phg-cameron-highlands')
alias('my-phg-bandar-tun-abdul-razak', 'my-phg-bandar-tun-razak')
alias('my-phg-bukit-fraser', 'my-phg-frasers-hill', 'my-phg-fraser-s-hill')
alias('my-nsn-seremban', 'my-nsn-senawang', 'my-nsn-ampangan', 'my-nsn-sendayan')
alias('my-nsn-tanjong-ipoh', 'my-nsn-tanjung-ipoh')
alias('my-png-pulau-pinang', 'my-png-george-town', 'my-png-georgetown')
alias('my-png-ayer-itam', 'my-png-air-itam')
alias('my-png-tanjong-bungah', 'my-png-tanjung-bungah')
alias('my-png-usm-pulau-pinang', 'my-png-usm')
alias('my-png-penang-hill', 'my-png-bukit-bendera')
const newIds = new Set(myNew.keys())
for (const [from, to] of Object.entries(MY_ALIAS)) if (!newIds.has(to)) throw new Error(`alias target missing: ${from} -> ${to}`)
function mapLegacy(e) {
  if (newIds.has(e.id)) return e.id
  if (MY_ALIAS[e.id]) return MY_ALIAS[e.id]
  // strip "XXX - " zone prefix, a trailing " District", a leading "Mukim "
  const stripped = e.name.replace(/^[A-Za-z]{2,4} - /, '').replace(/ District$/i, '').replace(/^Mukim /i, '')
  const id = `${e.state}-${slugify(stripped)}`
  if (newIds.has(id)) return id
  if (MY_ALIAS[id]) return MY_ALIAS[id]
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
for (const n of sg) addCity(`sg-singapore-${slugify(titleCase(n), 'and')}`, titleCase(n), 'sg-singapore', false)

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
for (const r of bnRows) addCity(`${r.state}-${slugify(r.name)}`, r.name, r.state, false)
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
  addCity(`${sid}-${isKab ? 'kab' : 'kota'}-${slugify(core)}`, name, sid, false)
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
  lines.push(`INSERT OR IGNORE INTO cities (id, name, state_id) VALUES (${q(id)}, ${q(c.name)}, ${q(c.state)});`)
}
lines.push('', '-- Malaysia: a row with the same id but a different name (legacy ALL-CAPS or typo) gets the clean name')
for (const [id, c] of [...myNew.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) lines.push(`UPDATE cities SET name = ${q(c.name)} WHERE id = ${q(id)} AND name <> ${q(c.name)};`)
writeFileSync(outFile, lines.join('\n') + '\n')

// Legacy MY id -> new id mapping (for PROGRESS_regions.md; consumers remap stored ids with it)
const md = ['| Legacy id | Legacy name | New id |', '|---|---|---|']
for (const m of legacyMap) md.push(`| \`${m.id}\` | ${m.name.replace(/\|/g, '\\|')} | ${m.to === 'none' ? 'none' : '`' + m.to + '`'} |`)
writeFileSync(path.join(here, 'my_legacy_mapping.md'), md.join('\n') + '\n')
// Test fixture: the real 612 legacy rows, so the api test can run 006 over them (the worker runtime cannot read .sql files)
const fixtureDir = path.resolve(here, '../../../api/tests/fixtures')
if (existsSync(path.resolve(here, '../../../api/tests'))) {
  mkdirSync(fixtureDir, { recursive: true })
  const rows = existing.map((e) => `  [${JSON.stringify(e.id)}, ${JSON.stringify(e.name)}, ${JSON.stringify(e.state)}],`)
  writeFileSync(path.join(fixtureDir, 'legacy-my-cities.ts'), `// GENERATED by masjidsentral-db-schema/scripts/regions/generate.mjs from my_cities_existing.sql. Do not edit.\nexport const LEGACY_MY_CITIES: Array<[id: string, name: string, state_id: string]> = [\n${rows.join('\n')}\n]\n`)
}
console.log(JSON.stringify(counts, null, 1))

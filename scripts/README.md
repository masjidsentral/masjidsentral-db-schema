# Data Migration Scripts

Scripts for merging both apps' masjid data into MasjidDB.

Uses `ngeohash` (Node.js) to ensure geohash values are consistent with both apps.

---

## Setup

```bash
cd scripts
npm install
```

---

## Cloudflare Login

Both parties need Wrangler installed and authenticated before importing data.

```bash
# Install Wrangler globally (if not already installed)
npm install -g wrangler

# Login — opens browser, select the Masjidsentral Cloudflare account
wrangler login

# Verify you are on the correct account
wrangler whoami
```

> If you have multiple Cloudflare accounts, set the account explicitly:
> ```bash
> export CLOUDFLARE_ACCOUNT_ID=7e72c27f3de3f130ec221a937ac22557
> ```

---

## Full Workflow

### Step 1 — Partner (Qiyam): Add geohash

Run this on your CSV export if it does not have a `geohash` column.

**Required CSV columns:** `name`, `lat`, `lng`

```bash
node add_geohash.js your_export.csv your_export_with_geohash.csv
```

---

### Step 2 — Partner (Qiyam): Convert CSV to SQL

```bash
node import_to_d1.js your_export_with_geohash.csv qiyam_import.sql qiyam
```

> The third argument (`qiyam`) is written into the `source` column for every record.

Review `qiyam_import.sql` before running. Then import:

```bash
wrangler d1 execute masjidsentral --remote --file=qiyam_import.sql
```

---

### Step 3 — Jejak Masjid: Export existing DB for dedup reference

Export the current MasjidDB records (after partner insert) to a SQL dump, then convert to CSV:

```bash
wrangler d1 export masjidsentral --remote --table=masjids --no-schema --output=masjids_dump.sql
node sql_to_csv.js masjids_dump.sql existing_db.csv
```

> `wrangler d1 export` only supports SQL format — `sql_to_csv.js` handles the conversion.

---

### Step 4 — Jejak Masjid: Deduplicate

**Required CSV columns:** `name`, `lat`, `lng`, `geohash`
(Run `add_geohash.js` first if your export is missing the geohash column)

```bash
node deduplicate.js jejak_masjid_export.csv existing_db.csv
```

**Outputs:**

| File | Action |
|---|---|
| `new_records.csv` | Safe to insert — no match found |
| `needs_review.csv` | Ambiguous — review manually before inserting |

Review columns added to `needs_review.csv`:

| Column | Meaning |
|---|---|
| `_match_name` | Name of the matched record already in DB |
| `_match_lat/lng` | Coordinates of the matched record |
| `_distance_m` | Distance in metres between the two records |
| `_name_similarity` | Jaro-Winkler score (0–1, higher = more similar) |

---

### Step 5 — Jejak Masjid: Import clean records

```bash
node import_to_d1.js new_records.csv jejak_masjid_import.sql jejak_masjid
```

Review `jejak_masjid_import.sql`, then import:

```bash
wrangler d1 execute masjidsentral --remote --file=jejak_masjid_import.sql
```

---

## import_to_d1.js — CSV Column Reference

| Column | Required | Notes |
|---|---|---|
| `name` | Yes | Primary Malay name |
| `lat` | Yes | Latitude |
| `lng` | Yes | Longitude |
| `geohash` | Yes | Run `add_geohash.js` first |
| `state` | Yes | e.g. `Selangor`, `Kuala Lumpur`, `Johor` |
| `type` | No | `masjid`, `surau`, or `musolla` — defaults to `masjid` |
| `city` | No | City or town name |
| `country` | No | Defaults to `MY` |
| `address` | No | Street address |
| `description` | No | Short description |
| `jumaat_available` | No | `1` or `0` — defaults to `0` |
| `telephone` | No | |
| `email` | No | |
| `google_url` | No | Google Maps URL |
| `source` | No | Overridden by the third CLI argument |

---

## Deduplication Logic

| Condition | Result |
|---|---|
| Distance ≤ 100m **AND** name similarity ≥ 0.85 | Confident duplicate — skipped |
| Distance ≤ 100m **OR** name similarity ≥ 0.85 | Ambiguous → `needs_review.csv` |
| No match found | New record → `new_records.csv` |

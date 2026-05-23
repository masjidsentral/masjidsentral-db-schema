# Data Migration Scripts

Scripts for merging both apps' masjid data into MasjidDB.

Uses `ngeohash` (Node.js) to ensure geohash values are consistent with both apps.

## Setup

```bash
cd scripts
npm install
```

---

## Step 1 — Partner: add_geohash.js

Run this if your CSV export does not have a `geohash` column.

**Required CSV columns:** `name`, `lat`, `lng`

```bash
node add_geohash.js your_export.csv your_export_with_geohash.csv
```

Send the output CSV to Jejak Masjid for insertion into MasjidDB.

---

## Step 2 — Jejak Masjid: deduplicate.js

Run this AFTER partner data has been inserted into the DB.

**Required CSV columns:** `name`, `lat`, `lng`, `geohash`

```bash
node deduplicate.js jejak_masjid_export.csv existing_db.csv
```

**Outputs:**

| File | Action |
|---|---|
| `new_records.csv` | Safe to insert — no match found |
| `needs_review.csv` | Ambiguous — review manually before inserting |

**Review columns in `needs_review.csv`:**

| Column | Meaning |
|---|---|
| `_match_name` | Name of the matched record already in DB |
| `_match_lat/lng` | Coordinates of the matched record |
| `_distance_m` | Distance in metres between the two records |
| `_name_similarity` | Jaro-Winkler score (0–1, higher = more similar) |

---

## Deduplication Logic

| Condition | Result |
|---|---|
| Distance ≤ 100m **AND** name similarity ≥ 0.85 | Confident duplicate — skipped |
| Distance ≤ 100m **OR** name similarity ≥ 0.85 | Ambiguous → `needs_review.csv` |
| No match found | New record → `new_records.csv` |

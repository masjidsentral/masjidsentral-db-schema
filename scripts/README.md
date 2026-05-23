# Data Migration Scripts

Scripts for merging both apps' masjid data into MasjidDB.

## Setup

```bash
cd scripts
pip install -r requirements.txt
```

---

## Step 1 — Partner: add_geohash.py

Run this if your CSV export does not have a `geohash` column.

**Expected CSV columns (minimum):** `name`, `lat`, `lng`

```bash
python add_geohash.py your_export.csv your_export_with_geohash.csv
```

Share the output CSV so it can be inserted into MasjidDB first.

---

## Step 2 — Jejak Masjid: deduplicate.py

Run this AFTER partner data has been inserted into the DB.

**Required CSV columns:** `name`, `lat`, `lng`, `geohash`

```bash
# Export existing MasjidDB records to existing_db.csv first
# Then run:
python deduplicate.py jejak_masjid_export.csv existing_db.csv
```

**Outputs:**

| File | Action |
|---|---|
| `new_records.csv` | Safe to insert — no match found |
| `needs_review.csv` | Ambiguous — review before inserting |

**Review columns in `needs_review.csv`:**

| Column | Meaning |
|---|---|
| `_match_name` | Name of the matched record in DB |
| `_match_lat/lng` | Coordinates of the matched record |
| `_distance_m` | Distance in metres between the two |
| `_name_similarity` | Jaro-Winkler score (0–1, higher = more similar) |

---

## Deduplication Logic

| Condition | Result |
|---|---|
| Distance ≤ 100m **AND** name similarity ≥ 0.85 | Confident duplicate — skipped |
| Distance ≤ 100m **OR** name similarity ≥ 0.85 | Ambiguous → `needs_review.csv` |
| No match | New record → `new_records.csv` |

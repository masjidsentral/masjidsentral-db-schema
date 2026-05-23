#!/usr/bin/env python3
"""
deduplicate.py — Compare your masjid data against records already in MasjidDB.

Run this AFTER your partner has inserted their data into the DB.

Usage:
    python deduplicate.py your_data.csv existing_db.csv

Arguments:
    your_data.csv    Your masjid export (must have geohash column — run add_geohash.py first)
    existing_db.csv  Export from MasjidDB after partner's insert

Requirements:
    pip install -r requirements.txt

Outputs:
    new_records.csv     Safe to insert — no duplicates found
    needs_review.csv    Potential duplicates — review manually before inserting

How it works:
    1. For each record in your_data.csv, find candidates in existing_db.csv
       that share the same geohash prefix (fast proximity filter)
    2. For each candidate, compute:
       - Haversine distance (must be <= 100m)
       - Jaro-Winkler name similarity (must be >= 0.85)
    3. Both match   → confident duplicate, skip
       One matches  → ambiguous, goes to needs_review.csv
       No match     → new record, goes to new_records.csv
"""

import sys
import math
import pandas as pd
import pygeohash as gh
import jellyfish

GEOHASH_PREFIX_LEN = 5       # ~4.9km search box — generous for candidate fetch
DISTANCE_THRESHOLD_M = 100   # metres
NAME_SIMILARITY_THRESHOLD = 0.85


def haversine(lat1, lng1, lat2, lng2):
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def normalize_name(name: str) -> str:
    name = str(name).lower().strip()
    for prefix in ['masjid ', 'surau ', 'musolla ']:
        if name.startswith(prefix):
            name = name[len(prefix):].strip()
            break
    return name


def main():
    if len(sys.argv) != 3:
        print("Usage: python deduplicate.py your_data.csv existing_db.csv")
        sys.exit(1)

    your_df = pd.read_csv(sys.argv[1])
    existing_df = pd.read_csv(sys.argv[2])

    for df, label in [(your_df, 'your_data.csv'), (existing_df, 'existing_db.csv')]:
        for col in ['name', 'lat', 'lng', 'geohash']:
            if col not in df.columns:
                print(f"Error: {label} is missing column '{col}'.")
                print("       Run add_geohash.py first if geohash is missing.")
                sys.exit(1)

    new_records = []
    needs_review = []
    duplicate_count = 0

    for _, row in your_df.iterrows():
        prefix = str(row['geohash'])[:GEOHASH_PREFIX_LEN]
        candidates = existing_df[existing_df['geohash'].str.startswith(prefix)]

        if candidates.empty:
            new_records.append(row.to_dict())
            continue

        is_duplicate = False
        is_ambiguous = False

        for _, cand in candidates.iterrows():
            dist = haversine(float(row['lat']), float(row['lng']),
                             float(cand['lat']), float(cand['lng']))
            name_sim = jellyfish.jaro_winkler_similarity(
                normalize_name(row['name']),
                normalize_name(cand['name'])
            )

            close_enough = dist <= DISTANCE_THRESHOLD_M
            similar_name = name_sim >= NAME_SIMILARITY_THRESHOLD

            if close_enough and similar_name:
                is_duplicate = True
                break
            elif close_enough or similar_name:
                review = row.to_dict()
                review['_match_name'] = cand['name']
                review['_match_lat'] = cand['lat']
                review['_match_lng'] = cand['lng']
                review['_distance_m'] = round(dist, 1)
                review['_name_similarity'] = round(name_sim, 3)
                needs_review.append(review)
                is_ambiguous = True
                break

        if is_duplicate:
            duplicate_count += 1
        elif not is_ambiguous:
            new_records.append(row.to_dict())

    pd.DataFrame(new_records).to_csv('new_records.csv', index=False)
    pd.DataFrame(needs_review).to_csv('needs_review.csv', index=False)

    total = len(your_df)
    print(f"\nResults ({total} records processed):")
    print(f"  {len(new_records):>5}  new records     → new_records.csv  (safe to insert)")
    print(f"  {len(needs_review):>5}  needs review    → needs_review.csv (check manually)")
    print(f"  {duplicate_count:>5}  duplicates      → skipped")


if __name__ == '__main__':
    main()

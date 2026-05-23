#!/usr/bin/env python3
"""
add_geohash.py — Compute and append a geohash column to a masjid CSV.

Run this if your CSV has lat/lng columns but no geohash column.

Usage:
    python add_geohash.py input.csv output.csv

Requirements:
    pip install -r requirements.txt

Expected CSV columns (minimum):
    name, lat, lng

Output:
    Same CSV with an additional 'geohash' column (precision 7, ~76m x ~76m).
"""

import sys
import pandas as pd
import pygeohash as geohash

GEOHASH_PRECISION = 7  # ~76m x ~76m accuracy


def main():
    if len(sys.argv) != 3:
        print("Usage: python add_geohash.py input.csv output.csv")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    df = pd.read_csv(input_file)

    if 'lat' not in df.columns or 'lng' not in df.columns:
        print("Error: CSV must have 'lat' and 'lng' columns.")
        sys.exit(1)

    df['geohash'] = df.apply(
        lambda row: geohash.encode(float(row['lat']), float(row['lng']), precision=GEOHASH_PRECISION),
        axis=1
    )

    df.to_csv(output_file, index=False)
    print(f"Done. {len(df)} records written to {output_file}")


if __name__ == '__main__':
    main()

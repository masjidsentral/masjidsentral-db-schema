-- 005: duplicate review queue and the scan cursor (S4). Additive only: no existing table is touched.

-- Pairs the daily scan thinks are the same place (score >= 0.8 within 150 m). masjid_a < masjid_b, one row per pair.
-- status: pending (needs a person), merged (one was merged into the other), dismissed (not a duplicate, or the
-- other side of a pair was merged away). A dismissed pair is never re-queued (the UNIQUE row stays).
CREATE TABLE duplicate_candidates (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  masjid_a    INTEGER NOT NULL REFERENCES masjids(id),
  masjid_b    INTEGER NOT NULL REFERENCES masjids(id),
  score       REAL    NOT NULL,
  distance_m  INTEGER NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'merged', 'dismissed')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  resolved_at TEXT,
  CHECK (masjid_a < masjid_b),
  UNIQUE (masjid_a, masjid_b)
);
CREATE INDEX idx_duplicate_candidates_status ON duplicate_candidates(status, id);
CREATE INDEX idx_duplicate_candidates_b      ON duplicate_candidates(masjid_b);

-- One row (id = 1): the scan has covered every masjid whose (updated_at, id) is <= this cursor.
CREATE TABLE scan_state (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  last_updated_at TEXT    NOT NULL,
  last_id         INTEGER NOT NULL DEFAULT 0,
  last_run_at     TEXT
);
INSERT INTO scan_state (id, last_updated_at, last_id) VALUES (1, '', 0);

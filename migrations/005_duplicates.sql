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
  resolved_by TEXT,                            -- admin actor (opaque id) that dismissed or merged the pair
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
  last_run_at     TEXT,                         -- start time of the last run
  last_run_scanned INTEGER NOT NULL DEFAULT 0,  -- masjids fully processed in the last run
  last_run_queued  INTEGER NOT NULL DEFAULT 0,  -- pairs newly queued in the last run
  last_error      TEXT,                         -- 'running' while a run is in flight (stays if it is killed); the message of the last failed run; NULL after a clean run
  consecutive_failures INTEGER NOT NULL DEFAULT 0, -- runs started on the same cursor that did not advance it; reset when the cursor advances
  skipped_ids     TEXT    NOT NULL DEFAULT '[]' -- JSON list (newest 100) of masjid ids skipped as poisoned
);
INSERT INTO scan_state (id, last_updated_at, last_id) VALUES (1, '', 0);

-- Reference-data drift (S4 review M2). 001 HEAD seeds `mini-surau` and has no `musolla`; a database created from an
-- older 001 can differ. 004 has rebuilt `masjids` empty at this point, so nothing references `musolla`; the guard
-- keeps the DELETE safe anyway. Before migrating a real database, diff countries/states/cities/masjid_types
-- against 001 HEAD (PROGRESS_app-sync.md deploy checklist).
INSERT OR IGNORE INTO masjid_types (id, name, name_en) VALUES ('mini-surau', 'mini surau', 'Mini Surau');
DELETE FROM masjid_types WHERE id = 'musolla' AND NOT EXISTS (SELECT 1 FROM masjids WHERE type_id = 'musolla');

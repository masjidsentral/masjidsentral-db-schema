-- DESTRUCTIVE: empties all masjid data (owner-approved fresh rebuild 2026-11-14).
-- Owner only: take a D1 Time Travel bookmark before applying remotely.
--
-- Masjid Sentral — App sync schema (v1.1)
-- Migration: 004_app_sync.sql
--
-- Drops and recreates masjids, masjid_images, masjid_facilities, masjid_contacts,
-- masjid_reviews, masjid_events and masjid_event_images. Keeps countries, states, cities,
-- masjid_types and api_keys. Adds versioning, external ids, the facility catalogue, the change
-- log (feed + audit), idempotency keys and webhooks.
-- Timestamps are ISO 8601 UTC with a Z (contract section 1).

-- Children first (foreign keys).
DROP TABLE IF EXISTS masjid_event_images;
DROP TABLE IF EXISTS masjid_events;
DROP TABLE IF EXISTS masjid_reviews;
DROP TABLE IF EXISTS masjid_contacts;
DROP TABLE IF EXISTS masjid_facilities;
DROP TABLE IF EXISTS masjid_images;
DROP TABLE IF EXISTS masjids;

-- PROVISIONAL: seeded from Jejak Masjid's catalogue (backend develop, migration 0089, 29 codes, plus the
-- retired legacy code OKU_FRIENDLY, inactive). Malay labels are drafts. Final catalogue pending the
-- JM x Qiyam agreement (contract section 11).
CREATE TABLE facility_catalogue (
  code       TEXT PRIMARY KEY,
  label_en   TEXT NOT NULL,
  label_ms   TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

INSERT INTO facility_catalogue (code, label_en, label_ms, sort_order, active) VALUES
  ('OPEN_24H', 'Open 24 hours', 'Buka 24 jam', 0, 1),
  ('WOMEN_FRIENDLY_LAYOUT', 'Women friendly', 'Mesra wanita', 1, 1),
  ('PARKING_COMPOUND', 'Compound parking', 'Parkir dalam kawasan', 2, 1),
  ('PRAYER_FEMALE', 'Women''s prayer area', 'Ruang solat wanita', 3, 1),
  ('WUDHU_FEMALE', 'Women''s wudhu area', 'Tempat wuduk wanita', 4, 1),
  ('WHEELCHAIR_ACCESS', 'Wheelchair access', 'Akses kerusi roda', 5, 1),
  ('WUDHU_OKU', 'Accessible wudhu', 'Tempat wuduk OKU', 6, 1),
  ('TOILET_OKU', 'Accessible toilet', 'Tandas OKU', 7, 1),
  ('PRAYER_MALE', 'Men''s prayer hall', 'Dewan solat lelaki', 8, 1),
  ('PRAYER_AC', 'Air-conditioned hall', 'Dewan berhawa dingin', 9, 1),
  ('PARKING_STREET', 'Street parking', 'Parkir tepi jalan', 10, 1),
  ('KOLAH', 'Wudhu pool', 'Kolah wuduk', 11, 1),
  ('ZAKAT_COUNTER', 'Zakat counter', 'Kaunter zakat', 12, 1),
  ('WIFI', 'Wi-Fi', 'Wi-Fi', 13, 1),
  ('COMMUNITY_KITCHEN', 'Community kitchen / hall', 'Dapur / dewan komuniti', 15, 1),
  ('WUDHU_MALE', 'Men''s wudhu area', 'Tempat wuduk lelaki', 16, 1),
  ('TOILET_MALE', 'Men''s toilet', 'Tandas lelaki', 17, 1),
  ('TOILET_FEMALE', 'Women''s toilet', 'Tandas wanita', 18, 1),
  ('WATER_DISPENSER', 'Water dispenser', 'Dispenser air', 19, 1),
  ('PHONE_CHARGER', 'Phone charging', 'Pengecasan telefon', 20, 1),
  ('REST_AREA', 'Rest area', 'Kawasan rehat', 21, 1),
  ('WORKING_SPACE', 'Working space', 'Ruang bekerja', 22, 1),
  ('EVENT_SPACE', 'Event space', 'Ruang acara', 23, 1),
  ('FOODBANK', 'Food bank', 'Bank makanan', 24, 1),
  ('HOMESTAY', 'Homestay', 'Homestay', 25, 1),
  ('MASJID_SHOP', 'Masjid shop', 'Kedai masjid', 26, 1),
  ('CHILD_FRIENDLY', 'Children''s play area', 'Ruang bermain kanak-kanak', 27, 1),
  ('EV_CHARGER', 'EV charger', 'Pengecas EV', 28, 1),
  ('NEAR_TRAIN_STATION', 'Near a train station', 'Dekat stesen kereta api', 29, 1),
  ('OKU_FRIENDLY', 'Ramp for wheelchair available', 'Tanjakan kerusi roda tersedia', 100, 0);

CREATE TABLE masjids (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  version          INTEGER NOT NULL DEFAULT 1,
  name             TEXT NOT NULL,
  type_id          TEXT NOT NULL REFERENCES masjid_types(id),

  lat              REAL NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng              REAL NOT NULL CHECK (lng BETWEEN -180 AND 180),
  geohash          TEXT NOT NULL,

  city_id          TEXT REFERENCES cities(id),
  state_id         TEXT NOT NULL REFERENCES states(id),
  country_id       TEXT NOT NULL REFERENCES countries(id),

  address          TEXT,
  description      TEXT,

  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'deleted', 'merged')),
  deleted_at       TEXT,
  merged_into      INTEGER REFERENCES masjids(id) CHECK (merged_into IS NULL OR merged_into != id),

  jumaat_available INTEGER NOT NULL DEFAULT 0 CHECK (jumaat_available IN (0, 1)),
  telephone        TEXT,
  email            TEXT,
  google_url       TEXT,

  updated_by_app   TEXT,

  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

CREATE INDEX idx_masjids_geohash    ON masjids(geohash);
CREATE INDEX idx_masjids_lat_lng    ON masjids(lat, lng);
CREATE INDEX idx_masjids_city       ON masjids(city_id);
CREATE INDEX idx_masjids_state      ON masjids(state_id);
CREATE INDEX idx_masjids_country    ON masjids(country_id);
CREATE INDEX idx_masjids_status     ON masjids(status);
CREATE INDEX idx_masjids_type       ON masjids(type_id);
CREATE INDEX idx_masjids_updated_at ON masjids(updated_at);

CREATE TABLE masjid_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  masjid_id     INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,   -- full HTTPS URL hosted by the sending app
  is_thumbnail  INTEGER NOT NULL DEFAULT 0 CHECK (is_thumbnail IN (0, 1)),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_masjid_images_masjid ON masjid_images(masjid_id);

CREATE TABLE masjid_facilities (
  masjid_id INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
  code      TEXT NOT NULL REFERENCES facility_catalogue(code),
  available INTEGER NOT NULL CHECK (available IN (0, 1)),
  PRIMARY KEY (masjid_id, code)
);

CREATE TABLE masjid_contacts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  masjid_id INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
  type      TEXT NOT NULL CHECK (type IN ('facebook','instagram','twitter','youtube','whatsapp','tiktok','threads','website')),
  value     TEXT NOT NULL,
  UNIQUE (masjid_id, type)
);
CREATE INDEX idx_masjid_contacts_masjid ON masjid_contacts(masjid_id);

-- No endpoints for reviews in v1.1.
CREATE TABLE masjid_reviews (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  masjid_id      INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
  rating         INTEGER NOT NULL CHECK (rating >= 0 AND rating <= 5),
  message        TEXT,
  source_app     TEXT NOT NULL,
  source_user_id TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_masjid_reviews_masjid ON masjid_reviews(masjid_id);

CREATE TABLE masjid_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  version          INTEGER NOT NULL DEFAULT 1,
  masjid_id        INTEGER NOT NULL REFERENCES masjids(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  description      TEXT,
  category         TEXT NOT NULL DEFAULT 'lain',
  speaker          TEXT,
  start_at         TEXT NOT NULL,
  end_at           TEXT,
  timezone         TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  rrule            TEXT,
  status           TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active', 'cancelled', 'completed', 'deleted')),
  poster_url       TEXT,
  registration_url TEXT,
  source_app       TEXT NOT NULL,
  updated_by_app   TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_masjid_events_masjid_start ON masjid_events(masjid_id, start_at);
CREATE INDEX idx_masjid_events_updated_at   ON masjid_events(updated_at);

-- No unique on (masjid_id, app_id): a merge can leave two links from one app on a survivor.
-- One-to-one linking is enforced in the handler.
CREATE TABLE masjid_external_ids (
  app_id      TEXT NOT NULL,
  external_id TEXT NOT NULL,
  masjid_id   INTEGER NOT NULL REFERENCES masjids(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (app_id, external_id)
);
CREATE INDEX idx_masjid_external_ids_masjid ON masjid_external_ids(masjid_id, app_id);

CREATE TABLE event_external_ids (
  app_id      TEXT NOT NULL,
  external_id TEXT NOT NULL,
  event_id    INTEGER NOT NULL REFERENCES masjid_events(id),
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (app_id, external_id)
);
CREATE INDEX idx_event_external_ids_event ON event_external_ids(event_id, app_id);

-- Change log: the feed (GET /changes) and the audit log in one table. No pruning in v1.1.
-- No personal data: actor is an opaque app-local id (contract R8).
CREATE TABLE changes (
  seq            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity         TEXT NOT NULL CHECK (entity IN ('masjid', 'event')),
  entity_id      INTEGER NOT NULL,
  masjid_id      INTEGER,
  op             TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete', 'merge')),
  version        INTEGER NOT NULL,
  origin_app     TEXT NOT NULL,
  actor          TEXT NOT NULL,
  changed_fields TEXT NOT NULL DEFAULT '[]',   -- JSON array
  before_json    TEXT,                          -- previous full entity, null on create
  after_json     TEXT NOT NULL,                 -- full entity after the change
  occurred_at    TEXT NOT NULL
);
CREATE INDEX idx_changes_entity ON changes(entity, entity_id, version);
CREATE INDEX idx_changes_masjid ON changes(masjid_id);
CREATE INDEX idx_changes_occurred ON changes(occurred_at);

CREATE TABLE idempotency_keys (
  api_key_id      INTEGER NOT NULL,
  key             TEXT NOT NULL,
  request_hash    TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_json   TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  PRIMARY KEY (api_key_id, key)
);
CREATE INDEX idx_idempotency_created ON idempotency_keys(created_at);

CREATE TABLE webhook_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  api_key_id INTEGER NOT NULL REFERENCES api_keys(id),
  url        TEXT NOT NULL CHECK (url LIKE 'https://%'),
  secret     TEXT NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX idx_webhook_subscriptions_key ON webhook_subscriptions(api_key_id);

-- One row per subscription: a new change updates latest_seq and resets the row to pending (coalesces pings).
CREATE TABLE webhook_deliveries (
  subscription_id INTEGER PRIMARY KEY REFERENCES webhook_subscriptions(id),
  latest_seq      INTEGER NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'dropped')),
  last_error      TEXT,
  updated_at      TEXT NOT NULL
);
CREATE INDEX idx_webhook_deliveries_due ON webhook_deliveries(status, next_attempt_at);

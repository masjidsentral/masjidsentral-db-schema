-- Masjid Sentral — API Keys
-- Migration: 002_api_keys.sql

CREATE TABLE api_keys (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash   TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- Development test key: raw token = 'test-api-key-dev'
-- SHA-256('test-api-key-dev') = 08d55f7f36724e61a51e389109146c688f6d69f38658e861508b857a236d53b8
INSERT INTO api_keys (key_hash, name, is_active)
VALUES (
  '08d55f7f36724e61a51e389109146c688f6d69f38658e861508b857a236d53b8',
  'Development Test Key',
  1
);

-- Masjid Sentral — API key scopes and app identity
-- Migration: 003_api_key_scopes.sql
--
-- scopes: comma list drawn from read, write, webhook, admin.
-- app_id: the owning app (jejak_masjid, qiyam, ...). Required on a key to write.
-- revoked_at: ISO timestamp; a revoked key never authenticates.

ALTER TABLE api_keys ADD COLUMN app_id TEXT;
ALTER TABLE api_keys ADD COLUMN scopes TEXT NOT NULL DEFAULT 'read';
ALTER TABLE api_keys ADD COLUMN revoked_at TEXT;

-- The development key seeded by 002 (raw token 'test-api-key-dev') must not work anywhere real.
DELETE FROM api_keys
WHERE key_hash = '08d55f7f36724e61a51e389109146c688f6d69f38658e861508b857a236d53b8';

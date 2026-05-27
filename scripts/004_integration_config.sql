-- Migration 004: add service configuration columns to integrations
-- Run once: psql -U postgres -d mavoai -f scripts/004_integration_config.sql

ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS base_url        TEXT,
  ADD COLUMN IF NOT EXISTS webhook_url     TEXT,
  ADD COLUMN IF NOT EXISTS auth_type       TEXT NOT NULL DEFAULT 'bearer',
  ADD COLUMN IF NOT EXISTS auth_token      TEXT,
  ADD COLUMN IF NOT EXISTS description     TEXT,
  ADD COLUMN IF NOT EXISTS icon            TEXT,
  ADD COLUMN IF NOT EXISTS outbound_active BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.integrations.base_url        IS 'Base URL of the external service (used for connectivity ping)';
COMMENT ON COLUMN public.integrations.webhook_url     IS 'URL Cerebro calls when pushing events back to the service';
COMMENT ON COLUMN public.integrations.auth_type       IS 'Auth method for outbound calls: bearer | api_key | basic | none';
COMMENT ON COLUMN public.integrations.auth_token      IS 'Token/key used in outbound Authorization header';
COMMENT ON COLUMN public.integrations.description     IS 'Human-readable description shown in the platform card';
COMMENT ON COLUMN public.integrations.icon            IS 'Lucide icon name for display';
COMMENT ON COLUMN public.integrations.outbound_active IS 'Whether Cerebro actively pushes events to this service';

create extension if not exists pgcrypto;

create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  source_system text not null,
  name text not null,
  auth_mode text not null default 'bearer',
  auth_secret_hash text,
  is_active boolean not null default true,
  rate_limit_per_minute int not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists integrations_tenant_source_unique
  on public.integrations (tenant_id, source_system);

create table if not exists public.integration_runs (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid references public.integrations(id),
  tenant_id text not null,
  source_system text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  total_received int not null default 0,
  total_processed int not null default 0,
  total_failed int not null default 0,
  details jsonb
);

create table if not exists public.source_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  source_system text not null,
  source_entity_id text not null,
  ingestion_id text,
  payload_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1
);

create unique index if not exists source_records_unique_strict
  on public.source_records (tenant_id, source_system, source_entity_id);

create index if not exists source_records_hash_idx
  on public.source_records (tenant_id, source_system, payload_hash);

create table if not exists public.dedup_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null,
  dedup_key text not null,
  payload_hash text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists dedup_keys_unique
  on public.dedup_keys (tenant_id, dedup_key);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id text,
  source_system text,
  event_type text not null,
  severity text not null default 'info',
  trace_id text,
  message text,
  context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_tenant_idx
  on public.audit_events (tenant_id, created_at desc);


-- ============================================================
-- 007_api_keys.sql
-- Tabela de API Keys para acesso externo ao Mavo AI
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash           TEXT        NOT NULL UNIQUE,        -- SHA-256 do token (nunca armazenar em claro)
  key_prefix         TEXT        NOT NULL,               -- "mk_live_abc1..." (display apenas)
  tenant_id          TEXT        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,               -- "Integração n8n produção"
  scopes             TEXT[]      NOT NULL DEFAULT ARRAY['query','search'],
  rate_limit_per_min INT         NOT NULL DEFAULT 60,
  is_active          BOOLEAN     NOT NULL DEFAULT true,
  last_used_at       TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,                        -- NULL = não expira
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON public.api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx   ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_active_idx ON public.api_keys (tenant_id, is_active);

COMMENT ON TABLE  public.api_keys             IS 'API Keys para integração externa com o Mavo AI';
COMMENT ON COLUMN public.api_keys.key_hash    IS 'SHA-256 hex do token bruto — nunca armazenar o token em claro';
COMMENT ON COLUMN public.api_keys.key_prefix  IS 'Primeiros 16 chars do token para identificação visual';
COMMENT ON COLUMN public.api_keys.scopes      IS 'Permissões: query, search, ingest, curate';

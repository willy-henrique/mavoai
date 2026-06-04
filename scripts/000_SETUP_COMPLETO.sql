-- ============================================================
-- MAVO.AI — SETUP COMPLETO DO BANCO DE DADOS
-- Execute este arquivo UMA VEZ no pgAdmin (banco: mavoai)
-- Selecione tudo (Ctrl+A) e pressione F5
-- ============================================================
-- Este script é IDEMPOTENTE: pode rodar múltiplas vezes sem erro.
-- Todas as tabelas, funções e índices usam IF NOT EXISTS.
-- ============================================================

-- PASSO 1: Extensões
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- PASSO 2: Tabelas base (001 + 002 consolidados)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.categorias (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        TEXT        NOT NULL UNIQUE,
  descricao   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.atendimentos (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_externo          TEXT,
  canal                   TEXT,
  cliente                 TEXT        NOT NULL,
  tecnico                 TEXT        NOT NULL,
  data_atendimento        TIMESTAMPTZ DEFAULT NOW(),
  texto_original          TEXT        NOT NULL,
  resumo_problema         TEXT,
  resumo                  TEXT,
  categoria               TEXT,
  problema                TEXT,
  causa                   TEXT,
  solucao                 TEXT,
  -- vector(1024) = Jina jina-embeddings-v5-text-small
  -- Se alterar para OpenAI text-embedding-3-small use vector(1536)
  embedding               vector(1024),
  processado              BOOLEAN     DEFAULT FALSE,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  categoria_id            UUID        REFERENCES public.categorias(id),
  -- multi-tenancy (migration 006)
  tenant_id               TEXT        NOT NULL DEFAULT 'auge',
  -- curadoria (migration 009)
  tags                    TEXT[]      DEFAULT ARRAY[]::TEXT[],
  resolution_confirmed    BOOLEAN,
  resolution_confirmed_at TIMESTAMPTZ,
  resolution_source       TEXT
);

CREATE TABLE IF NOT EXISTS public.ingestao_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  origem      TEXT        NOT NULL,
  status      TEXT        NOT NULL,
  payload     JSONB,
  detalhes    JSONB,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PASSO 3: Tabelas de integração (003 + 004 consolidados)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.integrations (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            TEXT        NOT NULL,
  source_system        TEXT        NOT NULL,
  name                 TEXT        NOT NULL,
  auth_mode            TEXT        NOT NULL DEFAULT 'bearer',
  auth_secret_hash     TEXT,
  is_active            BOOLEAN     NOT NULL DEFAULT TRUE,
  rate_limit_per_minute INT        NOT NULL DEFAULT 120,
  -- colunas migration 004
  base_url             TEXT,
  webhook_url          TEXT,
  auth_type            TEXT        NOT NULL DEFAULT 'bearer',
  auth_token           TEXT,
  description          TEXT,
  icon                 TEXT,
  outbound_active      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS integrations_tenant_source_unique
  ON public.integrations (tenant_id, source_system);

CREATE TABLE IF NOT EXISTS public.integration_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id   UUID        REFERENCES public.integrations(id),
  tenant_id        TEXT        NOT NULL,
  source_system    TEXT        NOT NULL,
  status           TEXT        NOT NULL,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  total_received   INT         NOT NULL DEFAULT 0,
  total_processed  INT         NOT NULL DEFAULT 0,
  total_failed     INT         NOT NULL DEFAULT 0,
  details          JSONB
);

CREATE TABLE IF NOT EXISTS public.source_records (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        TEXT        NOT NULL,
  source_system    TEXT        NOT NULL,
  source_entity_id TEXT        NOT NULL,
  ingestion_id     TEXT,
  payload_hash     TEXT        NOT NULL,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  seen_count       INT         NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS source_records_unique_strict
  ON public.source_records (tenant_id, source_system, source_entity_id);

CREATE INDEX IF NOT EXISTS source_records_hash_idx
  ON public.source_records (tenant_id, source_system, payload_hash);

CREATE TABLE IF NOT EXISTS public.dedup_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    TEXT        NOT NULL,
  dedup_key    TEXT        NOT NULL,
  payload_hash TEXT        NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS dedup_keys_unique
  ON public.dedup_keys (tenant_id, dedup_key);

CREATE TABLE IF NOT EXISTS public.audit_events (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     TEXT,
  source_system TEXT,
  event_type    TEXT        NOT NULL,
  severity      TEXT        NOT NULL DEFAULT 'info',
  trace_id      TEXT,
  message       TEXT,
  context       JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_events_tenant_idx
  ON public.audit_events (tenant_id, created_at DESC);

-- ============================================================
-- PASSO 4: Organizations e multi-tenancy (migration 006)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id           TEXT        PRIMARY KEY,
  display_name TEXT        NOT NULL,
  product_name TEXT        NOT NULL,
  description  TEXT,
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant padrão: AUGE ERP
INSERT INTO public.organizations (id, display_name, product_name, description)
VALUES ('auge', 'AUGE ERP', 'AUGE ERP', 'Sistema de automação e gestão empresarial para varejo')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- PASSO 5: API Keys (migration 007)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_keys (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash            TEXT        NOT NULL UNIQUE,
  key_prefix          TEXT        NOT NULL,
  tenant_id           TEXT        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL,
  scopes              TEXT[]      NOT NULL DEFAULT ARRAY['query','search'],
  rate_limit_per_min  INT         NOT NULL DEFAULT 60,
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  last_used_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_tenant_idx ON public.api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx   ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_active_idx ON public.api_keys (tenant_id, is_active);

-- ============================================================
-- PASSO 6: Sessões conversacionais (migration 008)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.conversation_sessions (
  conversation_id  TEXT        NOT NULL,
  tenant_id        TEXT        NOT NULL,
  platform         TEXT        NOT NULL DEFAULT 'unknown',
  state            JSONB       NOT NULL DEFAULT '{}',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours',
  PRIMARY KEY (conversation_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx
  ON public.conversation_sessions (expires_at);
CREATE INDEX IF NOT EXISTS sessions_tenant_idx
  ON public.conversation_sessions (tenant_id, updated_at DESC);

-- ============================================================
-- PASSO 7: Feedback de resolução (migration 009)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.resolution_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   TEXT        NOT NULL,
  tenant_id         TEXT        NOT NULL,
  atendimento_id    UUID        REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  resolution_worked BOOLEAN,
  feedback_source   TEXT        NOT NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_tenant_idx
  ON public.resolution_feedback (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_conversation_idx
  ON public.resolution_feedback (conversation_id);

-- ============================================================
-- PASSO 8: Índices de performance
-- ============================================================

-- Busca vetorial (HNSW = melhor para inserts dinâmicos, sem necessidade de vacuum)
DROP INDEX IF EXISTS atendimentos_embedding_idx;
CREATE INDEX IF NOT EXISTS atendimentos_embedding_hnsw_idx
  ON public.atendimentos USING hnsw (embedding vector_cosine_ops);

-- Índices de tenant e busca textual
CREATE INDEX IF NOT EXISTS atendimentos_tenant_idx
  ON public.atendimentos (tenant_id);
CREATE INDEX IF NOT EXISTS atendimentos_canal_idx
  ON public.atendimentos (canal, tenant_id);
CREATE INDEX IF NOT EXISTS atendimentos_created_idx
  ON public.atendimentos (created_at DESC);
CREATE INDEX IF NOT EXISTS atendimentos_processado_idx
  ON public.atendimentos (processado, tenant_id);

-- Full-text search
CREATE INDEX IF NOT EXISTS atendimentos_fts_idx
  ON public.atendimentos USING gin(to_tsvector('portuguese', COALESCE(texto_original, '') || ' ' || COALESCE(problema, '')));

-- ============================================================
-- PASSO 9: Trigger updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_atendimentos_updated_at ON public.atendimentos;
CREATE TRIGGER update_atendimentos_updated_at
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- PASSO 10: Funções de busca semântica (tenant-aware)
-- ============================================================

-- Busca vetorial com filtro por tenant (NULL = global)
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_semanticos(
  query_embedding vector(1024),
  match_count     INT     DEFAULT 3,
  p_tenant_id     TEXT    DEFAULT NULL
)
RETURNS TABLE (id uuid, similaridade float, resumo_problema text, causa text, solucao text)
LANGUAGE SQL STABLE AS $$
  SELECT a.id,
    (1 - (a.embedding <=> query_embedding))::float AS similaridade,
    COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 300)) AS resumo_problema,
    a.causa,
    a.solucao
  FROM public.atendimentos a
  WHERE a.embedding IS NOT NULL
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
  ORDER BY a.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- Busca textual fallback com filtro por tenant
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_simples(
  query_text  TEXT,
  match_count INT  DEFAULT 5,
  p_tenant_id TEXT DEFAULT NULL
)
RETURNS TABLE (id uuid, resumo_problema text, causa text, solucao text, categoria text, texto_original text)
LANGUAGE SQL STABLE AS $$
  SELECT a.id,
    COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 200)) AS resumo_problema,
    a.causa,
    a.solucao,
    a.categoria,
    a.texto_original
  FROM public.atendimentos a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.texto_original ILIKE '%' || query_text || '%'
      OR a.problema    ILIKE '%' || query_text || '%'
      OR a.solucao     ILIKE '%' || query_text || '%'
      OR a.causa       ILIKE '%' || query_text || '%'
      OR a.categoria   ILIKE '%' || query_text || '%'
    )
  ORDER BY a.created_at DESC
  LIMIT GREATEST(match_count, 1);
$$;

-- ============================================================
-- PASSO 11: Categorias padrão
-- ============================================================

INSERT INTO public.categorias (nome, descricao) VALUES
  ('Fiscal',        'Problemas com NF-e, NFC-e, SPED, SEFAZ, certificado digital'),
  ('TEF',           'Problemas com Terminal de Pagamento, Stone, Rede, Cielo'),
  ('PDV',           'Problemas com frente de caixa, SuperPDV, cupom fiscal'),
  ('ERP',           'Problemas com módulos do ERP Auge'),
  ('Estoque',       'Problemas com contagem, entrada, saída de mercadorias'),
  ('Financeiro',    'Problemas com contas a pagar/receber, fluxo de caixa'),
  ('Hardware',      'Problemas com impressora, balança, leitor, computador'),
  ('Infraestrutura','Problemas com rede, servidor, backup, banco de dados'),
  ('Cadastro',      'Problemas com cadastro de clientes, produtos, fornecedores'),
  ('Integração',    'Problemas com integrações entre sistemas'),
  ('Outro',         'Demais problemas não categorizados')
ON CONFLICT (nome) DO NOTHING;

-- ============================================================
-- PASSO 12: Agent Configs & Training (migration 010)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agent_configs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       TEXT        NOT NULL,
  tenant_id      TEXT        NOT NULL DEFAULT 'default',
  enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
  system_prompt  TEXT,
  params         JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_configs_unique UNIQUE (agent_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS agent_configs_agent_idx  ON public.agent_configs (agent_id);
CREATE INDEX IF NOT EXISTS agent_configs_tenant_idx ON public.agent_configs (tenant_id);

DROP TRIGGER IF EXISTS update_agent_configs_updated_at ON public.agent_configs;
CREATE TRIGGER update_agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.agent_training_examples (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT        NOT NULL,
  tenant_id       TEXT        NOT NULL DEFAULT 'default',
  label           TEXT,
  input           TEXT        NOT NULL,
  expected_output TEXT,
  notes           TEXT,
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_training_agent_idx
  ON public.agent_training_examples (agent_id, tenant_id, active);

CREATE TABLE IF NOT EXISTS public.agent_test_runs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     TEXT        NOT NULL,
  tenant_id    TEXT        NOT NULL DEFAULT 'default',
  input        JSONB       NOT NULL,
  output       JSONB,
  latency_ms   INT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS agent_test_runs_agent_idx
  ON public.agent_test_runs (agent_id, tenant_id, created_at DESC);

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

SELECT
  '✅ Setup concluído!' AS status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') AS total_tabelas,
  (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public') AS total_indices,
  (SELECT COUNT(*) FROM pg_proc WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) AS total_funcoes,
  (SELECT COUNT(*) FROM public.organizations) AS organizations,
  (SELECT COUNT(*) FROM public.categorias) AS categorias;

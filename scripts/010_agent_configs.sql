-- ============================================================
-- MAVO.AI — MIGRATION 010: Agent Configs & Training Examples
-- Idempotente: pode rodar múltiplas vezes sem erro.
-- ============================================================

-- Tabela de configuração por agente + tenant
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id       TEXT        NOT NULL,
  tenant_id      TEXT        NOT NULL DEFAULT 'default',
  enabled        BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Override do system prompt. NULL = usa o padrão do código.
  system_prompt  TEXT,
  -- Parâmetros numéricos/booleanos específicos do agente (JSONB flexível)
  params         JSONB       NOT NULL DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agent_configs_unique UNIQUE (agent_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS agent_configs_agent_idx
  ON public.agent_configs (agent_id);
CREATE INDEX IF NOT EXISTS agent_configs_tenant_idx
  ON public.agent_configs (tenant_id);

-- Trigger updated_at
DROP TRIGGER IF EXISTS update_agent_configs_updated_at ON public.agent_configs;
CREATE TRIGGER update_agent_configs_updated_at
  BEFORE UPDATE ON public.agent_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Exemplos de treinamento por agente + tenant
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
CREATE INDEX IF NOT EXISTS agent_training_created_idx
  ON public.agent_training_examples (created_at DESC);

-- Logs de teste de agente (para rastreabilidade do playground)
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

-- ============================================================
-- 014_curation.sql
-- Módulo de Curadoria, Treinamento e Validação da IA
-- Base de conhecimento CURADA com workflow de governança:
--   rascunho → em_teste → publicado → arquivado
-- Separada de `atendimentos` (que mistura atendimento real + curadoria
-- automática) para ter um ciclo de vida e versionamento próprios.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.knowledge_items (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             TEXT         NOT NULL DEFAULT 'auge',

  -- Conteúdo (a "dobradinha": pergunta do cliente + resposta validada)
  pergunta              TEXT         NOT NULL,                 -- sintoma/pergunta do cliente
  intencao              TEXT,                                  -- intenção normalizada
  categoria             TEXT,
  tags                  TEXT[]       NOT NULL DEFAULT '{}',
  palavras_chave        TEXT[]       NOT NULL DEFAULT '{}',
  resposta_oficial      TEXT         NOT NULL DEFAULT '',
  resposta_alternativa  TEXT,
  exemplos              JSONB        NOT NULL DEFAULT '[]',    -- perguntas similares (variações)

  -- Governança
  confianca             NUMERIC(4,3) NOT NULL DEFAULT 0.800,  -- 0..1
  prioridade            INT          NOT NULL DEFAULT 0,
  status                TEXT         NOT NULL DEFAULT 'rascunho',
  versao                INT          NOT NULL DEFAULT 1,
  criador               TEXT,                                  -- quem capturou (ex.: 'tecnico', 'ai-curator', 'gerente')
  revisor               TEXT,                                  -- quem validou/publicou

  -- Rastreabilidade da origem
  origem_conversa_id    TEXT,
  origem_atendimento_id UUID,

  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_at          TIMESTAMPTZ,

  CONSTRAINT knowledge_items_status_chk
    CHECK (status IN ('rascunho', 'em_teste', 'publicado', 'arquivado'))
);

-- Coluna de embedding só se a extensão pgvector existir (ambientes sem vector continuam funcionando)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    ALTER TABLE public.knowledge_items ADD COLUMN IF NOT EXISTS embedding vector(1024);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS knowledge_items_tenant_status_idx
  ON public.knowledge_items (tenant_id, status);
CREATE INDEX IF NOT EXISTS knowledge_items_status_idx
  ON public.knowledge_items (status);
CREATE INDEX IF NOT EXISTS knowledge_items_created_idx
  ON public.knowledge_items (created_at DESC);

-- Histórico de versões (Fase de versionamento): snapshot do item a cada publicação.
CREATE TABLE IF NOT EXISTS public.knowledge_item_versions (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     UUID         NOT NULL REFERENCES public.knowledge_items(id) ON DELETE CASCADE,
  versao      INT          NOT NULL,
  snapshot    JSONB        NOT NULL,
  autor       TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS knowledge_item_versions_item_idx
  ON public.knowledge_item_versions (item_id, versao DESC);

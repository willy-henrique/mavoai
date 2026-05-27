-- ============================================================
-- 009_feedback_curator.sql
-- Colunas de curadoria IA + tabela de feedback de resolução
-- ============================================================

-- Novas colunas na tabela atendimentos
ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS tags                   TEXT[]      DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS resolution_confirmed   BOOLEAN,
  ADD COLUMN IF NOT EXISTS resolution_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_source      TEXT;
  -- resolution_source: 'autonomous_ai' | 'human' | 'api'

COMMENT ON COLUMN public.atendimentos.tags                    IS 'Tags semânticas geradas pela IA curadora';
COMMENT ON COLUMN public.atendimentos.resolution_confirmed    IS 'Resolução confirmada por feedback do cliente/atendente';
COMMENT ON COLUMN public.atendimentos.resolution_source       IS 'Quem confirmou: autonomous_ai | human | api';

-- Tabela de feedback de resolução
CREATE TABLE IF NOT EXISTS public.resolution_feedback (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   TEXT        NOT NULL,
  tenant_id         TEXT        NOT NULL,
  atendimento_id    UUID        REFERENCES public.atendimentos(id) ON DELETE SET NULL,
  resolution_worked BOOLEAN,
  feedback_source   TEXT        NOT NULL,   -- 'cliente' | 'atendente' | 'auto'
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_tenant_idx
  ON public.resolution_feedback (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS feedback_conversation_idx
  ON public.resolution_feedback (conversation_id);

COMMENT ON TABLE  public.resolution_feedback                        IS 'Feedback sobre eficácia das resoluções do Mavo AI';
COMMENT ON COLUMN public.resolution_feedback.feedback_source        IS 'Origem: cliente | atendente | auto';
COMMENT ON COLUMN public.resolution_feedback.resolution_worked      IS 'true = funcionou, false = não funcionou, null = sem avaliação';

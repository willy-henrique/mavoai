-- ============================================================
-- 016_knowledge_uso.sql
-- Estatísticas de uso do conhecimento curado (Fase 2+).
-- Toda vez que um knowledge_item PUBLICADO é usado numa resposta real
-- do RAG (lib/semantic-search.ts), incrementamos o contador aqui.
-- ============================================================

ALTER TABLE public.knowledge_items
  ADD COLUMN IF NOT EXISTS uso_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultimo_uso_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS knowledge_items_uso_idx
  ON public.knowledge_items (uso_count DESC);

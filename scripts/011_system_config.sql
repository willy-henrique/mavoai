-- ============================================================
-- 011_system_config.sql
-- Configurações de sistema editáveis via UI (modelos de IA)
-- DB tem precedência sobre env vars em runtime.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.system_config (
  key        TEXT        PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE  public.system_config       IS 'Configurações de runtime editáveis via UI — DB sobrepõe env vars';
COMMENT ON COLUMN public.system_config.key   IS 'Ex: ai.base_url, ai.chat_model, embedding.model';
COMMENT ON COLUMN public.system_config.value IS 'Valor em texto. Chaves de API ficam mascaradas na UI mas armazenadas em claro aqui';

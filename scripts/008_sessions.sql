-- ============================================================
-- 008_sessions.sql
-- Persistência de sessão conversacional entre mensagens
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

COMMENT ON TABLE  public.conversation_sessions                  IS 'Estado persistente de sessões conversacionais do orquestrador';
COMMENT ON COLUMN public.conversation_sessions.conversation_id  IS 'ID externo da conversa (ex: WhatsApp message thread)';
COMMENT ON COLUMN public.conversation_sessions.state            IS 'OrchestratorConversationState serializado como JSONB';
COMMENT ON COLUMN public.conversation_sessions.expires_at       IS 'Sessão expira após 24h de inatividade';

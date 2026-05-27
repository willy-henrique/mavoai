/**
 * lib/session-store.ts
 *
 * Persistência de estado conversacional entre mensagens do orquestrador.
 * Layer única: PostgreSQL (conversation_sessions).
 * Pattern de cleanup probabilístico: 1% das chamadas deleta sessões expiradas.
 */

import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"
import type { OrchestratorConversationState } from "@/lib/platform-orchestrator"

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SessionRow {
  conversation_id: string
  tenant_id: string
  platform: string
  state: OrchestratorConversationState
  updated_at: string
  expires_at: string
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Carrega o estado de uma sessão existente.
 * Retorna null se não existir ou se já estiver expirada.
 */
export async function loadSession(
  conversationId: string,
  tenantId: string,
): Promise<OrchestratorConversationState | null> {
  try {
    const result = await query(
      `SELECT state, expires_at
         FROM public.conversation_sessions
        WHERE conversation_id = $1
          AND tenant_id = $2
          AND expires_at > NOW()
        LIMIT 1`,
      [conversationId, tenantId],
    )

    if (result.rows.length === 0) return null

    const row = result.rows[0] as SessionRow
    return row.state
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn("session_load_error", { conversationId, tenantId, error: msg })
    return null  // falha silenciosa: orquestrador inicia sem estado
  }
}

/**
 * Salva ou atualiza o estado da sessão.
 * Renova expires_at para +24h a cada mensagem.
 */
export async function saveSession(
  conversationId: string,
  tenantId: string,
  platform: string,
  state: OrchestratorConversationState,
): Promise<void> {
  try {
    await query(
      `INSERT INTO public.conversation_sessions
         (conversation_id, tenant_id, platform, state, updated_at, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW() + INTERVAL '24 hours')
       ON CONFLICT (conversation_id, tenant_id) DO UPDATE
         SET state      = EXCLUDED.state,
             platform   = EXCLUDED.platform,
             updated_at = NOW(),
             expires_at = NOW() + INTERVAL '24 hours'`,
      [conversationId, tenantId, platform, JSON.stringify(state)],
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    // Não travar o request por falha de persistência de sessão
    logger.warn("session_save_error", { conversationId, tenantId, error: msg })
  }

  // Cleanup probabilístico: 1% das chamadas remove sessões expiradas
  if (Math.random() < 0.01) {
    cleanupExpiredSessions().catch(() => undefined)
  }
}

/**
 * Remove a sessão ao encerrar o atendimento (triage_completed = true).
 */
export async function deleteSession(
  conversationId: string,
  tenantId: string,
): Promise<void> {
  try {
    await query(
      `DELETE FROM public.conversation_sessions
        WHERE conversation_id = $1 AND tenant_id = $2`,
      [conversationId, tenantId],
    )
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn("session_delete_error", { conversationId, tenantId, error: msg })
  }
}

// ─── Interno ──────────────────────────────────────────────────────────────────

async function cleanupExpiredSessions(): Promise<void> {
  try {
    const result = await query(
      `DELETE FROM public.conversation_sessions WHERE expires_at < NOW()`,
    )
    const deleted = result.rowCount ?? 0
    if (deleted > 0) {
      logger.info("session_cleanup", { deleted })
    }
  } catch {
    // fire-and-forget — ignora falha silenciosamente
  }
}

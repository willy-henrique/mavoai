/**
 * Notificador de handoff para humano.
 *
 * Quando o orquestrador decide escalar para um atendente (triage_completed + summary),
 * faz um POST fire-and-forget para o webhook configurado na integração.
 * Se o webhook não estiver configurado ou outbound_active = false, não faz nada.
 */

import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"

export interface HandoffEvent {
  event: "agent_handoff"
  timestamp: string
  conversation_id: string
  platform: string
  queue_id: string | null
  cliente: { nome: string; telefone: string }
  summary: string
  reason: string
}

export async function notifyHandoff(params: {
  tenantId: string
  sourceSystem: string
  conversationId: string
  platform: string
  queueId: string | null
  cliente: { nome: string; telefone: string }
  summary: string
  reason: string
}): Promise<void> {
  let webhookUrl: string | null = null
  let authToken: string | null = null

  try {
    const result = await query(
      `SELECT webhook_url, auth_token, outbound_active
       FROM integrations
       WHERE tenant_id = $1
         AND source_system = $2
         AND is_active = true
       LIMIT 1`,
      [params.tenantId, params.sourceSystem],
    )
    const row = result.rows[0]
    if (!row?.outbound_active || !row?.webhook_url) return
    webhookUrl = String(row.webhook_url)
    authToken = row.auth_token ? String(row.auth_token) : null
  } catch (err) {
    // Integração não encontrada ou tabela ausente — silencioso
    logger.warn("handoff_notifier_lookup_failed", {
      tenantId: params.tenantId,
      sourceSystem: params.sourceSystem,
      error: err instanceof Error ? err.message : String(err),
    })
    return
  }

  const body: HandoffEvent = {
    event: "agent_handoff",
    timestamp: new Date().toISOString(),
    conversation_id: params.conversationId,
    platform: params.platform,
    queue_id: params.queueId,
    cliente: params.cliente,
    summary: params.summary,
    reason: params.reason,
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) {
      logger.warn("handoff_webhook_non2xx", {
        tenantId: params.tenantId,
        sourceSystem: params.sourceSystem,
        status: res.status,
        webhookUrl,
      })
    } else {
      logger.info("handoff_webhook_sent", {
        tenantId: params.tenantId,
        sourceSystem: params.sourceSystem,
        conversationId: params.conversationId,
        reason: params.reason,
      })
    }
  } catch (err) {
    logger.warn("handoff_webhook_error", {
      tenantId: params.tenantId,
      sourceSystem: params.sourceSystem,
      error: err instanceof Error ? err.message : String(err),
    })
  }
}

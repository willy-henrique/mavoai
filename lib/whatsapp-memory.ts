/**
 * lib/whatsapp-memory.ts
 *
 * Memória conversacional leve para o atendimento via WhatsApp (MTalk).
 * Reaproveita a tabela `conversation_sessions` (mesma do orquestrador), guardando
 * o histórico de turnos e o flag de handoff dentro do campo `state` (jsonb).
 *
 * Sem isso, cada mensagem chega "sem contexto" e a IA se reapresenta toda hora —
 * é a causa raiz do comportamento de bot. Com isso ela lembra a conversa.
 */

import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"

export type ChatTurn = { role: "user" | "assistant"; content: string }

export type WhatsAppConversa = {
  /** Últimos turnos da conversa (user/assistant), em ordem cronológica. */
  messages: ChatTurn[]
  /** true = já foi transferida para um atendente humano; o bot para de responder. */
  handoff: boolean
}

const TENANT = "default"
const PLATFORM = "whatsapp"
/** Mantém os últimos N turnos (~7 trocas) para não estourar o contexto. */
const MAX_TURNS = 14

const VAZIA: WhatsAppConversa = { messages: [], handoff: false }

/** Carrega o histórico + estado de handoff de um ticket. Falha silenciosa → conversa vazia. */
export async function carregarConversa(ticketId: string): Promise<WhatsAppConversa> {
  if (!ticketId) return { ...VAZIA }
  try {
    const r = await query(
      `SELECT state FROM public.conversation_sessions
        WHERE conversation_id = $1 AND tenant_id = $2 AND expires_at > NOW()
        LIMIT 1`,
      [ticketId, TENANT],
    )
    if (r.rows.length === 0) return { ...VAZIA }
    const s = r.rows[0].state as Partial<WhatsAppConversa> | null
    return {
      messages: Array.isArray(s?.messages) ? (s!.messages as ChatTurn[]) : [],
      handoff: !!s?.handoff,
    }
  } catch (e) {
    logger.warn("wa_memory_load_error", { ticketId, error: e instanceof Error ? e.message : String(e) })
    return { ...VAZIA }
  }
}

/** Salva (ou atualiza) o histórico + handoff do ticket. Renova expiração para 24h. */
export async function salvarConversa(ticketId: string, conversa: WhatsAppConversa): Promise<void> {
  if (!ticketId) return
  const enxuta: WhatsAppConversa = {
    messages: conversa.messages.slice(-MAX_TURNS),
    handoff: conversa.handoff,
  }
  try {
    await query(
      `INSERT INTO public.conversation_sessions
         (conversation_id, tenant_id, platform, state, updated_at, expires_at)
       VALUES ($1, $2, $3, $4::jsonb, NOW(), NOW() + INTERVAL '24 hours')
       ON CONFLICT (conversation_id, tenant_id) DO UPDATE
         SET state = EXCLUDED.state,
             platform = EXCLUDED.platform,
             updated_at = NOW(),
             expires_at = NOW() + INTERVAL '24 hours'`,
      [ticketId, TENANT, PLATFORM, JSON.stringify(enxuta)],
    )
  } catch (e) {
    logger.warn("wa_memory_save_error", { ticketId, error: e instanceof Error ? e.message : String(e) })
  }
}

/** Marca a conversa como transferida para humano (bot silencia nas próximas mensagens). */
export async function marcarHandoff(ticketId: string, conversa: WhatsAppConversa): Promise<void> {
  await salvarConversa(ticketId, { ...conversa, handoff: true })
}

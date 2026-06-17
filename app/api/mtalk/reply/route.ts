/**
 * POST /api/mtalk/reply
 *
 * Recebe dados do browser (que faz polling do MTalk com sessão própria):
 *   body: text/plain com JSON: { ticketId, contactNumber, message, contactName? }
 *
 * Cerebro:
 *  1. Chama IA (gerarRespostaAssistida)
 *  2. Envia resposta via API token (POST /backend/api/messages/send)
 *
 * Não precisa de JWT — o browser lê os tickets, o Cerebro só responde.
 */

import { comCabecalhoMavo, ehSaudacaoPura, gerarRespostaWhatsApp, pediuHumano } from "@/lib/assisted-response"
import { carregarConversa, salvarConversa, marcarHandoff } from "@/lib/whatsapp-memory"
import { notifyHandoff } from "@/lib/handoff-notifier"
import { getSecret } from "@/lib/secret-store"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

const MSG_HANDOFF = "Já estou te passando para um atendente, tá? Só um instante que alguém continua por aqui."

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Private-Network": "true",
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// Evita responder 2x a mesma mensagem (ticketId:messageId)
const replied = new Map<string, boolean>()

export async function POST(request: Request) {
  try {
    const raw = await request.text()
    let body: { ticketId?: number | string; contactNumber?: string; message?: string; messageId?: string | number; contactName?: string }

    try {
      body = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: "JSON inválido no body" }, { status: 400, headers: CORS })
    }

    const { ticketId: ticketIdRaw, contactNumber, message, messageId, contactName } = body
    const ticketId = ticketIdRaw ? String(ticketIdRaw) : undefined

    if (!ticketId || !contactNumber || !message?.trim()) {
      return NextResponse.json({ error: "ticketId, contactNumber e message são obrigatórios" }, { status: 400, headers: CORS })
    }

    // Deduplicação: não responde a mesma mensagem duas vezes
    const key = `${ticketId}:${messageId ?? message.substring(0, 30)}`
    if (replied.get(key)) {
      return NextResponse.json({ skipped: true, reason: "already_replied" }, { headers: CORS })
    }
    replied.set(key, true)

    // Limpa cache antigo (mantém só os últimos 200)
    if (replied.size > 200) {
      const firstKey = replied.keys().next().value
      if (firstKey) replied.delete(firstKey)
    }

    const mtalkBase = await getSecret("MTALK_BASE_URL")
    const sendToken = await getSecret("MTALK_API_TOKEN")

    if (!mtalkBase || !sendToken) {
      return NextResponse.json({ error: "MTALK_BASE_URL ou MTALK_API_TOKEN não configurados" }, { status: 500, headers: CORS })
    }

    // Memória da conversa (mesma do webhook) — evita reapresentação e dá contexto.
    const conversa = await carregarConversa(ticketId)
    if (conversa.handoff) {
      return NextResponse.json({ skipped: true, reason: "handoff" }, { headers: CORS })
    }

    // Gera resposta da IA (com memória + especialista do domínio) ou decide escalar.
    let resposta: string
    let escalou = false
    let dominio = "geral"
    try {
      if (pediuHumano(message)) {
        resposta = MSG_HANDOFF
        escalou = true
      } else {
        // Saudação pura abre atendimento NOVO → descarta histórico antigo do ticket.
        if (ehSaudacaoPura(message)) conversa.messages = []
        const r = await gerarRespostaWhatsApp(message, contactName, conversa.messages, "default")
        dominio = r.domain
        if (r.escalar) {
          resposta = MSG_HANDOFF
          escalou = true
        } else {
          resposta = r.resposta
        }
      }
    } catch (err) {
      logger.warn("mtalk_reply_ia_erro", { ticketId, error: String(err) })
      replied.delete(key) // permite tentar de novo
      return NextResponse.json({ error: "Erro na IA" }, { status: 500, headers: CORS })
    }

    // Envia via API token (funciona sem JWT)
    const sendResp = await fetch(`${mtalkBase}/backend/api/messages/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${sendToken}`,
      },
      body: JSON.stringify({ number: contactNumber, body: comCabecalhoMavo(resposta), saveOnTicket: true }),
    })

    if (!sendResp.ok) {
      const errText = await sendResp.text()
      logger.warn("mtalk_reply_send_erro", { ticketId, status: sendResp.status, body: errText.slice(0, 200) })
      replied.delete(key)
      return NextResponse.json({ error: `MTalk send falhou: ${sendResp.status}` }, { status: 502, headers: CORS })
    }

    // Persiste a memória só após o envio dar certo.
    if (escalou) {
      conversa.messages.push({ role: "user", content: message })
      await marcarHandoff(ticketId, conversa)
      notifyHandoff({
        tenantId: "default",
        sourceSystem: "mtalk",
        conversationId: ticketId,
        platform: "whatsapp",
        queueId: null,
        cliente: { nome: contactName ?? "", telefone: contactNumber },
        summary: `Cliente: ${contactName ?? contactNumber}. Última mensagem: "${message.slice(0, 280)}".`,
        reason: pediuHumano(message) ? "cliente_pediu_humano" : "ia_nao_resolveu",
      }).catch(() => undefined)
    } else {
      conversa.messages.push({ role: "user", content: message }, { role: "assistant", content: resposta })
      await salvarConversa(ticketId, conversa)
    }

    logger.info("mtalk_reply_ok", { ticketId, contact: contactName ?? contactNumber, dominio, escalou, len: resposta.length })
    return NextResponse.json({ ok: true, ticketId, contact: contactName, dominio }, { headers: CORS })

  } catch (err) {
    logger.warn("mtalk_reply_erro", { error: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS })
  }
}

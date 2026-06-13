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

import { gerarRespostaAssistida } from "@/lib/assisted-response"
import { getSecret } from "@/lib/secret-store"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

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

    // Gera resposta da IA
    let resposta: string
    try {
      resposta = await gerarRespostaAssistida(message)
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
      body: JSON.stringify({ number: contactNumber, body: resposta, saveOnTicket: true }),
    })

    if (!sendResp.ok) {
      const errText = await sendResp.text()
      logger.warn("mtalk_reply_send_erro", { ticketId, status: sendResp.status, body: errText.slice(0, 200) })
      replied.delete(key)
      return NextResponse.json({ error: `MTalk send falhou: ${sendResp.status}` }, { status: 502, headers: CORS })
    }

    logger.info("mtalk_reply_ok", { ticketId, contact: contactName ?? contactNumber, len: resposta.length })
    return NextResponse.json({ ok: true, ticketId, contact: contactName }, { headers: CORS })

  } catch (err) {
    logger.warn("mtalk_reply_erro", { error: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500, headers: CORS })
  }
}

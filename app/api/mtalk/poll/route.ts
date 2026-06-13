/**
 * GET  /api/mtalk/poll  — Polling: busca tickets pendentes fila 474, IA responde.
 * POST /api/mtalk/poll  — Recebe JWT fresco (fallback manual).
 *
 * Autenticação auto-renovável:
 *  1. Usa JWT em memória (cachedJWT)
 *  2. Quando expira (401), tenta: logout da sessão antiga → login → novo JWT
 *  3. Se login falha (ERR_MAX_ACTIVE_DESKTOP_SESSIONS), usa POST manual como fallback
 */

import { gerarRespostaWhatsApp } from "@/lib/assisted-response"
import type { ChatTurn } from "@/lib/whatsapp-memory"
import { getSecret } from "@/lib/secret-store"
import { logger } from "@/lib/logger"

const MSG_HANDOFF = "Já estou te passando para um atendente, tá? Só um instante que alguém continua por aqui."
import { NextResponse } from "next/server"

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, ngrok-skip-browser-warning",
  "Access-Control-Allow-Private-Network": "true", // permite browser em rede pública → localhost
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

const QUEUE_ID = 474
const MAX_AGE_MS = 10 * 60 * 1000

// Estado em memória
let cachedJWT: string = process.env.MTALK_JWT_TOKEN || ""
const respondedMessages = new Map<number, string | number>()

// ── Refresh JWT: logout sessão antiga → login novo ──────────────────────────
// jwtParaLogout: passa o JWT antigo (mesmo expirado) para liberar o slot no servidor
async function refreshJWT(mtalkBase: string, jwtParaLogout?: string): Promise<string | null> {
  const email = process.env.MTALK_ADMIN_EMAIL
  const password = process.env.MTALK_ADMIN_PASS
  if (!email || !password) return null

  // 1. Logout com JWT antigo (mesmo expirado — servidor valida assinatura, não expiry)
  const tokenLogout = jwtParaLogout || cachedJWT
  if (tokenLogout) {
    try {
      await fetch(`${mtalkBase}/backend/auth/logout`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${tokenLogout}`, "Content-Type": "application/json" },
      })
      logger.info("mtalk_poll_logout_ok")
    } catch { /* ignora — tenta login de qualquer forma */ }
    // Aguarda servidor processar o logout
    await new Promise(r => setTimeout(r, 800))
  }

  // 2. Login com credenciais admin
  try {
    const resp = await fetch(`${mtalkBase}/backend/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const data = await resp.json()

    if (data.token) {
      cachedJWT = data.token
      logger.info("mtalk_poll_jwt_refreshed")
      return data.token
    }

    logger.warn("mtalk_poll_login_falhou", { error: data.error })
    return null
  } catch (err) {
    logger.warn("mtalk_poll_login_erro", { error: String(err) })
    return null
  }
}

// ── POST: JWT manual do browser ──────────────────────────────────────────────
// Aceita: JSON { jwt }, text/plain (JWT direto), application/x-www-form-urlencoded (jwt=...)
export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || ""
    let jwt: string | null = null

    if (contentType.includes("application/json")) {
      const body = await request.json()
      jwt = body?.jwt ?? null
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const text = await request.text()
      jwt = new URLSearchParams(text).get("jwt")
    } else {
      // text/plain ou qualquer outro: corpo é o JWT diretamente
      const text = (await request.text()).trim()
      jwt = text.startsWith("eyJ") ? text : null // JWT começa com eyJ (base64 de {"alg...)
    }

    if (jwt) {
      cachedJWT = jwt
      logger.info("mtalk_poll_jwt_atualizado")
      return NextResponse.json({ ok: true }, { headers: CORS_HEADERS })
    }
    return NextResponse.json({ error: "jwt ausente" }, { status: 400, headers: CORS_HEADERS })
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400, headers: CORS_HEADERS })
  }
}

// ── GET: poll principal ──────────────────────────────────────────────────────
export async function GET() {
  const mtalkBase = await getSecret("MTALK_BASE_URL")
  const sendToken = await getSecret("MTALK_API_TOKEN")

  if (!mtalkBase) {
    return NextResponse.json({ error: "MTALK_BASE_URL não configurado" }, { status: 500, headers: CORS_HEADERS })
  }

  // Garantir JWT válido
  if (!cachedJWT) {
    const newJWT = await refreshJWT(mtalkBase)
    if (!newJWT) {
      return NextResponse.json(
        { error: "JWT_UNAVAILABLE", hint: "Login automático falhou. Configure MTALK_ADMIN_EMAIL e MTALK_ADMIN_PASS no .env.local" },
        { status: 401, headers: CORS_HEADERS }
      )
    }
  }

  // Buscar tickets (com auto-retry se JWT expirado)
  let tickets: MTalkTicket[]
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const resp = await fetch(
        `${mtalkBase}/backend/tickets?status=pending&queueId=${QUEUE_ID}&pageNumber=1`,
        { headers: { Authorization: `Bearer ${cachedJWT}` } }
      )

      if (resp.status === 401) {
        if (attempt === 0) {
          // Primeira tentativa falhou → logout com JWT antigo + novo login
          const oldJWT = cachedJWT // guardar antes de limpar
          cachedJWT = ""
          logger.info("mtalk_poll_jwt_expirado_tentando_refresh")
          const newJWT = await refreshJWT(mtalkBase, oldJWT)
          if (!newJWT) {
            return NextResponse.json(
              { error: "JWT_EXPIRED_REFRESH_FAILED", hint: "Não foi possível renovar o token. Verifique MTALK_ADMIN_EMAIL/PASS." },
              { status: 401, headers: CORS_HEADERS }
            )
          }
          continue // tentar de novo com novo JWT
        }
        return NextResponse.json(
          { error: "JWT_EXPIRED", hint: "Token expirou mesmo após refresh." },
          { status: 401, headers: CORS_HEADERS }
        )
      }

      const data = await resp.json()
      tickets = data.tickets || data.data || []
      break // sucesso
    } catch (err) {
      if (attempt === 1) {
        return NextResponse.json({ error: "Falha ao buscar tickets", detail: String(err) }, { status: 500, headers: CORS_HEADERS })
      }
    }
  }

  tickets = tickets! ?? []

  if (tickets.length === 0) {
    return NextResponse.json({ processed: 0, total: 0 }, { headers: CORS_HEADERS })
  }

  const agora = Date.now()
  const results: Array<{ ticketId: string | number; contact: string; status: string }> = []

  for (const ticket of tickets) {
    const ticketIdStr = String(ticket.id)
    const updatedAt = new Date(ticket.updatedAt || ticket.createdAt || 0).getTime()
    if (agora - updatedAt > MAX_AGE_MS) continue

    // Buscar mensagens
    let messages: MTalkMessage[] = []
    try {
      const msgsResp = await fetch(
        `${mtalkBase}/backend/messages?ticketId=${ticket.id}&pageNumber=1`,
        { headers: { Authorization: `Bearer ${cachedJWT}` } }
      )
      const msgsData = await msgsResp.json()
      messages = msgsData.messages || msgsData.records || msgsData.data || []
    } catch { continue }

    const sorted = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    const lastMsg = sorted[sorted.length - 1]

    if (!lastMsg || lastMsg.fromMe === true || !lastMsg.body?.trim()) continue

    const alreadyDone = respondedMessages.get(ticket.id)
    if (alreadyDone === lastMsg.id || alreadyDone === String(lastMsg.id)) continue

    // Histórico a partir da própria thread do MTalk (fonte da verdade) —
    // assim a IA tem contexto e não se reapresenta a cada mensagem.
    const historico: ChatTurn[] = sorted
      .slice(0, -1)
      .filter((m) => m.body?.trim())
      .map((m) => ({ role: m.fromMe ? ("assistant" as const) : ("user" as const), content: m.body!.trim() }))
      .slice(-14)

    // IA com memória + roteamento para o especialista do domínio
    let resposta: string
    try {
      const r = await gerarRespostaWhatsApp(lastMsg.body, ticket.contact?.name, historico, "default")
      resposta = r.escalar ? MSG_HANDOFF : r.resposta
    } catch (err) {
      logger.warn("mtalk_poll_ia_erro", { ticketId: ticketIdStr, error: String(err) })
      results.push({ ticketId: ticketIdStr, contact: ticket.contact?.name ?? "?", status: "ia_error" })
      continue
    }

    // Enviar
    const contactNumber = ticket.contact?.number || ""
    try {
      const sendResp = await fetch(`${mtalkBase}/backend/api/messages/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sendToken}` },
        body: JSON.stringify({ number: contactNumber, body: resposta, saveOnTicket: true }),
      })

      if (!sendResp.ok) {
        const errText = await sendResp.text()
        logger.warn("mtalk_poll_send_erro", { ticketId: ticketIdStr, status: sendResp.status, body: errText.slice(0, 200) })
        results.push({ ticketId: ticketIdStr, contact: ticket.contact?.name ?? "?", status: `send_${sendResp.status}` })
        continue
      }

      respondedMessages.set(ticket.id, lastMsg.id)
      logger.info("mtalk_poll_ok", { ticketId: ticketIdStr, contact: ticket.contact?.name, number: contactNumber })
      results.push({ ticketId: ticketIdStr, contact: ticket.contact?.name ?? "?", status: "replied" })
    } catch (err) {
      results.push({ ticketId: ticketIdStr, contact: ticket.contact?.name ?? "?", status: "send_error" })
      logger.warn("mtalk_poll_send_fetch_erro", { ticketId: ticketIdStr, error: String(err) })
    }
  }

  return NextResponse.json({
    processed: results.filter(r => r.status === "replied").length,
    total: tickets.length,
    results,
  }, { headers: CORS_HEADERS })
}

interface MTalkTicket {
  id: number; status: string; queueId: number
  updatedAt?: string; createdAt?: string; chatbot?: boolean
  contact?: { name?: string; number?: string }
}
interface MTalkMessage {
  id: string | number; body?: string; fromMe?: boolean; createdAt: string
}

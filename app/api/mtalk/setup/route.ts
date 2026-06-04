/**
 * GET /api/mtalk/setup
 * - Autentica no MTalk (server-side, sem CORS)
 * - Deleta queue options que causam menu indesejado
 * - Ativa chatbot em todos tickets pendentes da fila Mavo AI
 * Chamar uma vez ao iniciar o sistema
 */
import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"

const MTALK_BASE = process.env.MTALK_BASE_URL || "https://s11.mtalk.com.br"
const MTALK_EMAIL = process.env.MTALK_ADMIN_EMAIL || ""
const MTALK_PASS = process.env.MTALK_ADMIN_PASS || ""
const QUEUE_ID = 474

async function getMtalkJWT(): Promise<string> {
  const r = await fetch(`${MTALK_BASE}/backend/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: MTALK_EMAIL, password: MTALK_PASS }),
  })
  if (!r.ok) throw new Error(`Login falhou: ${r.status}`)
  const data = await r.json()
  return data.token
}

export async function GET() {
  try {
    const jwt = await getMtalkJWT()
    const headers = { "Authorization": `Bearer ${jwt}`, "Content-Type": "application/json" }

    // 1. Deletar queue options que mostram menu indesejado
    const optResp = await fetch(`${MTALK_BASE}/backend/queue-options?queueId=${QUEUE_ID}`, { headers })
    const options = await optResp.json().catch(() => [])
    const deleted: number[] = []
    for (const opt of (Array.isArray(options) ? options : [])) {
      const dr = await fetch(`${MTALK_BASE}/backend/queue-options/${opt.id}`, { method: "DELETE", headers })
      if (dr.ok) deleted.push(opt.id)
    }

    // 2. Ativar chatbot em todos tickets pendentes da fila Mavo AI
    const tResp = await fetch(`${MTALK_BASE}/backend/tickets?status=pending&pageNumber=1`, { headers })
    const tData = await tResp.json().catch(() => ({ tickets: [] }))
    const tickets = (tData.tickets || []) as Array<{ id: number; chatbot: boolean; queueId: number }>
    const toActivate = tickets.filter(t => t.queueId === QUEUE_ID && !t.chatbot)

    const activated: number[] = []
    for (const t of toActivate) {
      const ur = await fetch(`${MTALK_BASE}/backend/tickets/${t.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ chatbot: true }),
      })
      if (ur.ok) activated.push(t.id)
    }

    logger.info("mtalk_setup_ok", { deleted, activated })
    return NextResponse.json({ ok: true, deleted, activated, pending: tickets.length })
  } catch (err) {
    logger.error("mtalk_setup_erro", { error: String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

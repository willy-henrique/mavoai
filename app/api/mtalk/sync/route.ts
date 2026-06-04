/**
 * GET /api/mtalk/sync
 * Ativa chatbot em todos os tickets pendentes da fila Mavo AI no MTalk.
 * Chamado periodicamente pelo próprio servidor via after() ou por cron externo.
 */
import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"

export async function GET() {
  const mtalkBase = process.env.MTALK_BASE_URL
  const mtalkToken = process.env.MTALK_API_TOKEN
  const jwtSecret = process.env.MTALK_JWT_TOKEN

  if (!mtalkBase) {
    return NextResponse.json({ error: "MTALK_BASE_URL não configurado" }, { status: 500 })
  }

  try {
    // Busca tickets pendentes via JWT do admin (armazenado em env)
    const ticketsResp = await fetch(
      `${mtalkBase}/backend/tickets?status=pending&pageNumber=1`,
      {
        headers: {
          "Authorization": `Bearer ${jwtSecret}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!ticketsResp.ok) {
      return NextResponse.json({ error: "Falha ao buscar tickets", status: ticketsResp.status }, { status: 500 })
    }

    const data = await ticketsResp.json()
    const tickets: Array<{ id: number; chatbot: boolean; queueId: number }> = data.tickets || []

    // Filtra tickets da fila Mavo AI (474) que ainda não têm chatbot ativo
    const toActivate = tickets.filter(t => t.queueId === 474 && !t.chatbot)

    const results = await Promise.all(
      toActivate.map(async t => {
        const r = await fetch(`${mtalkBase}/backend/tickets/${t.id}`, {
          method: "PUT",
          headers: {
            "Authorization": `Bearer ${jwtSecret}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ chatbot: true }),
        })
        return { id: t.id, ok: r.ok }
      })
    )

    const ativados = results.filter(r => r.ok).length
    if (ativados > 0) {
      logger.info("mtalk_sync_chatbot", { ativados, total: toActivate.length })
    }

    return NextResponse.json({
      pendentes: tickets.length,
      ativados,
      ids: results.map(r => r.id),
    })
  } catch (err) {
    logger.warn("mtalk_sync_erro", { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

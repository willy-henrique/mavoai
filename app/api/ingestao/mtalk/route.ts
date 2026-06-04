import { adaptMtalkPayload } from "@/lib/integration-adapters"
import { gerarRespostaAssistida } from "@/lib/assisted-response"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"
import { after } from "next/server"

function extractContactNumber(raw: unknown): string | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  const contact = (r.contact ?? r.cliente ?? r.customer) as Record<string, unknown> | null
  const phone = contact?.number ?? contact?.phone_number ?? contact?.phoneNumber ??
    r.phone_number ?? r.phoneNumber ?? r.number
  if (!phone) return undefined
  return String(phone).replace(/[^0-9]/g, "")
}

export async function POST(request: Request) {
  let raw: unknown

  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "payload_invalido" }, { status: 400 })
  }

  const payload = adaptMtalkPayload(raw)
  if (!payload.ticket_id || !payload.cliente || !payload.mensagens) {
    return NextResponse.json(
      { error: "ticket_id, cliente e mensagens sao obrigatorios" },
      { status: 400 },
    )
  }

  const mensagem = payload.mensagens
  const contactNumber = extractContactNumber(raw)

  // Salva o atendimento em background (nao bloqueia a resposta)
  // Prepara headers/url antes do after() para nao depender do request consumido
  const authHeader = request.headers.get("authorization") || ""
  const baseUrl = process.env.INTERNAL_BASE_URL || new URL(request.url).origin

  after(async () => {
    try {
      const headers = new Headers()
      headers.set("Content-Type", "application/json")
      if (authHeader) headers.set("Authorization", authHeader)
      headers.set("X-Source-System", payload.metadata?.sourceSystem || "mtalk")
      headers.set("X-Source-Entity-Id", payload.metadata?.sourceEntityId || payload.ticket_id)
      headers.set("X-Tenant-Id", payload.metadata?.tenantId || "default")
      headers.set("X-Ingestion-Id", payload.metadata?.ingestionId || `ing-${Date.now()}`)

      await fetch(`${baseUrl}/api/ingestao/willtalk`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          ticket_id: payload.ticket_id,
          cliente: payload.cliente,
          canal: payload.canal || "whatsapp",
          mensagens: payload.mensagens,
          tecnico: payload.tecnico || "MTalk",
          data_evento: payload.data_evento || new Date().toISOString(),
          metadata: payload.metadata || {},
        }),
      })
    } catch (err) {
      logger.warn("mtalk_storage_erro", {
        ticket_id: payload.ticket_id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  })

  // Gera resposta da IA e envia de volta via MTalk API
  try {
    const resposta = await gerarRespostaAssistida(mensagem)
    logger.info("mtalk_resposta_gerada", { ticket_id: payload.ticket_id, length: resposta.length })

    // Envia resposta via MTalk API (metodo primario)
    if (contactNumber) {
      const mtalkBase = process.env.MTALK_BASE_URL
      const mtalkToken = process.env.MTALK_API_TOKEN
      if (mtalkBase && mtalkToken) {
        fetch(`${mtalkBase}/backend/api/messages/send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mtalkToken}`,
          },
          body: JSON.stringify({
            number: contactNumber,
            body: resposta,
            saveOnTicket: true,
          }),
        }).then(r => {
          if (!r.ok) r.text().then(t => logger.warn("mtalk_send_erro", { status: r.status, body: t.slice(0,200) }))
          else logger.info("mtalk_mensagem_enviada", { number: contactNumber })
        }).catch(err => logger.warn("mtalk_send_fetch_erro", { error: String(err) }))
      }
    } else {
      logger.warn("mtalk_sem_numero_contato", { ticket_id: payload.ticket_id })
    }

    // Retorna no HTTP response tambem (caso o driver leia)
    return NextResponse.json({
      messages: [{ type: "text", text: resposta }],
      text: resposta,
      message: resposta,
    })
  } catch (err) {
    logger.warn("mtalk_ia_erro", {
      ticket_id: payload.ticket_id,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json({
      messages: [{ type: "text", text: "Olá! Recebi sua mensagem e em breve um atendente entrará em contato." }],
      text: "Olá! Recebi sua mensagem e em breve um atendente entrará em contato.",
      message: "Olá! Recebi sua mensagem e em breve um atendente entrará em contato.",
    })
  }
}

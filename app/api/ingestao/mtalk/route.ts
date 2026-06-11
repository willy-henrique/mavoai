/**
 * POST /api/ingestao/mtalk
 *
 * Webhook do MTalk — recebe mensagem quando chatbot:true no ticket.
 *
 * Payload enviado pelo MTalk:
 * {
 *   "content": "mensagem do cliente",
 *   "type": "text",
 *   "token": "...",
 *   "mediaUrl": null,
 *   "metadata": {
 *     "ticketId": 123,
 *     "from": { "id": "5511...", "name": "João" },
 *     "backendUrl": "https://s11.mtalk.com.br"
 *   }
 * }
 *
 * Resposta esperada pelo MTalk (array):
 * [{ "type": "text", "content": "resposta da IA" }]
 *
 * O MTalk lê o body da resposta HTTP e envia como mensagem WhatsApp.
 * NÃO é necessário chamar a API de envio separadamente.
 */

import { gerarRespostaCliente } from "@/lib/assisted-response"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"
import { after } from "next/server"

// Formato de resposta que o MTalk espera
function mtalkResponse(texto: string) {
  return NextResponse.json([{ type: "text", content: texto }])
}

function mtalkError(texto: string) {
  return NextResponse.json([{ type: "text", content: texto }])
}

export async function POST(request: Request) {
  let raw: Record<string, unknown>

  try {
    raw = await request.json()
  } catch {
    return NextResponse.json([{ type: "text", content: "Erro ao processar sua mensagem." }], { status: 400 })
  }

  // Extrai campos do payload MTalk
  const metadata = (raw.metadata ?? {}) as Record<string, unknown>
  const from = (metadata.from ?? {}) as Record<string, unknown>

  const mensagem = String(raw.content ?? raw.text ?? "").trim()
  const ticketId = String(metadata.ticketId ?? raw.ticket_id ?? "")
  const contactName = String(from.name ?? raw.contactName ?? "cliente")
  const contactId = String(from.id ?? "")
  const messageType = String(raw.type ?? "text")

  // Loga o recebimento
  logger.info("mtalk_webhook_recebido", {
    ticketId,
    contactName,
    messageType,
    mensagemLen: mensagem.length,
  })

  // Ignora mensagens que não são texto (áudio, imagem — sem processamento IA por ora)
  if (messageType !== "text" || !mensagem) {
    logger.warn("mtalk_mensagem_nao_texto", { ticketId, messageType })
    return mtalkError("Desculpe, no momento só consigo processar mensagens de texto. Em breve um atendente te ajudará! 😊")
  }

  // Salva em background para RAG (não bloqueia a resposta)
  const baseUrl = process.env.INTERNAL_BASE_URL || new URL(request.url).origin
  const authHeader = request.headers.get("authorization") || ""

  after(async () => {
    try {
      await fetch(`${baseUrl}/api/ingestao/willtalk`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authHeader ? { "Authorization": authHeader } : {}),
          "X-Source-System": "mtalk",
          "X-Source-Entity-Id": ticketId,
          "X-Tenant-Id": "default",
          "X-Ingestion-Id": `ing-${Date.now()}`,
        },
        body: JSON.stringify({
          ticket_id: ticketId,
          cliente: contactName,
          canal: "whatsapp",
          mensagens: mensagem,
          tecnico: "MTalk Bot",
          data_evento: new Date().toISOString(),
          metadata: { ticketId, contactName, contactId },
        }),
      })
    } catch (err) {
      logger.warn("mtalk_storage_erro", { ticketId, error: String(err) })
    }
  })

  // Gera resposta da IA
  try {
    const resposta = await gerarRespostaCliente(mensagem, contactName !== "cliente" ? contactName : undefined)
    logger.info("mtalk_resposta_ok", { ticketId, contactName, len: resposta.length })

    // Retorna no formato que o MTalk lê e envia como WhatsApp
    return mtalkResponse(resposta)

  } catch (err) {
    logger.warn("mtalk_ia_erro", {
      ticketId,
      error: err instanceof Error ? err.message : String(err),
    })
    return mtalkError("Olá! Recebi sua mensagem. Em breve um atendente entrará em contato. 😊")
  }
}

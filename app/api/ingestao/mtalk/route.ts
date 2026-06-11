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

import { gerarRespostaCliente, SYSTEM_PROMPT_WHATSAPP } from "@/lib/assisted-response"
import { analisarImagemIA, transcreverAudioIA } from "@/lib/ai-provider"
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
  const mediaUrl = String(raw.mediaUrl ?? raw.media_url ?? "").trim()
  const ticketId = String(metadata.ticketId ?? raw.ticket_id ?? "")
  const contactName = String(from.name ?? raw.contactName ?? "cliente")
  const contactId = String(from.id ?? "")
  const messageType = String(raw.type ?? "text")
  const nomeParaIA = contactName !== "cliente" ? contactName : undefined

  logger.info("mtalk_webhook_recebido", { ticketId, contactName, messageType, mensagemLen: mensagem.length, temMedia: !!mediaUrl })

  // ── ÁUDIO: transcreve com Whisper e responde ──────────────────────────────
  if (messageType === "audio" || messageType === "voice") {
    if (!mediaUrl) return mtalkError("Não consegui acessar o áudio. Pode digitar sua mensagem? 🙏")
    try {
      logger.info("mtalk_audio_transcrevendo", { ticketId })
      const audioRes = await fetch(mediaUrl)
      if (!audioRes.ok) throw new Error(`download falhou: ${audioRes.status}`)
      const audioBuffer = await audioRes.arrayBuffer()
      const ext = mediaUrl.split(".").pop()?.split("?")[0] || "ogg"
      const transcript = await transcreverAudioIA(audioBuffer, `audio.${ext}`)
      logger.info("mtalk_audio_transcrito", { ticketId, len: transcript.length, preview: transcript.slice(0, 60) })

      const resposta = await gerarRespostaCliente(transcript, nomeParaIA)
      logger.info("mtalk_resposta_ok", { ticketId, tipo: "audio", len: resposta.length })
      return mtalkResponse(resposta)
    } catch (err) {
      logger.warn("mtalk_audio_erro", { ticketId, error: String(err) })
      return mtalkError("Ouvi um áudio, mas tive dificuldade em entendê-lo. Pode digitar o que precisa? 😊")
    }
  }

  // ── IMAGEM: analisa com visão do Llama 4 Scout ────────────────────────────
  if (messageType === "image") {
    if (!mediaUrl) return mtalkError("Não consegui acessar a imagem. Pode descrever o problema? 🙏")
    try {
      logger.info("mtalk_imagem_analisando", { ticketId })
      const resposta = await analisarImagemIA(mediaUrl, SYSTEM_PROMPT_WHATSAPP)
      logger.info("mtalk_resposta_ok", { ticketId, tipo: "image", len: resposta.length })
      return mtalkResponse(resposta)
    } catch (err) {
      logger.warn("mtalk_imagem_erro", { ticketId, error: String(err) })
      return mtalkError("Recebi a imagem, mas tive dificuldade em processá-la. Pode descrever o que aparece na tela? 😊")
    }
  }

  // ── TIPO NÃO SUPORTADO (vídeo, sticker, etc.) ────────────────────────────
  if (messageType !== "text") {
    logger.warn("mtalk_tipo_nao_suportado", { ticketId, messageType })
    return mtalkError("Recebi sua mensagem! No momento processo texto, áudio e imagem. Para outros tipos, um atendente entrará em contato. 😊")
  }

  if (!mensagem) return mtalkError("Não recebi nenhuma mensagem. Pode tentar novamente? 🙏")

  // ── TEXTO: fluxo normal com RAG ───────────────────────────────────────────
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

  try {
    const resposta = await gerarRespostaCliente(mensagem, nomeParaIA)
    logger.info("mtalk_resposta_ok", { ticketId, tipo: "text", contactName, len: resposta.length })
    return mtalkResponse(resposta)
  } catch (err) {
    logger.warn("mtalk_ia_erro", { ticketId, error: err instanceof Error ? err.message : String(err) })
    return mtalkError("Olá! Recebi sua mensagem. Em breve um atendente entrará em contato. 😊")
  }
}

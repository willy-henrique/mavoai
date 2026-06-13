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
 * Array vazio [] = não envia nada (usado após transferir para um humano).
 */

import {
  gerarRespostaWhatsApp,
  pediuHumano,
  SYSTEM_PROMPT_WHATSAPP,
} from "@/lib/assisted-response"
import { analisarImagemIA, transcreverAudioIA } from "@/lib/ai-provider"
import {
  carregarConversa,
  salvarConversa,
  marcarHandoff,
  type WhatsAppConversa,
} from "@/lib/whatsapp-memory"
import { notifyHandoff } from "@/lib/handoff-notifier"
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
// Não envia nada (bot em silêncio — humano assumiu)
function mtalkSilencio() {
  return NextResponse.json([])
}

const MSG_HANDOFF =
  "Já estou te conectando com um atendente, tá? Só um instante que alguém continua o atendimento por aqui."

export async function POST(request: Request) {
  let raw: Record<string, unknown>
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json([{ type: "text", content: "Erro ao processar sua mensagem." }], { status: 400 })
  }

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

  // Carrega a memória da conversa (histórico + estado de handoff)
  const conversa: WhatsAppConversa = await carregarConversa(ticketId)

  // Já transferido para um humano → bot fica em silêncio
  if (conversa.handoff) {
    logger.info("mtalk_em_handoff_silencio", { ticketId })
    return mtalkSilencio()
  }

  // Dispara a transferência para um atendente humano.
  async function transferirParaHumano(textoUsuario: string, motivo: string) {
    conversa.messages.push({ role: "user", content: textoUsuario })
    await marcarHandoff(ticketId, conversa)
    logger.info("mtalk_handoff", { ticketId, motivo })
    // Notifica o suporte (fire-and-forget; silencioso se não houver webhook configurado)
    notifyHandoff({
      tenantId: "default",
      sourceSystem: "mtalk",
      conversationId: ticketId,
      platform: "whatsapp",
      queueId: null,
      cliente: { nome: contactName, telefone: contactId },
      summary: `Cliente: ${contactName}. Última mensagem: "${textoUsuario.slice(0, 280)}".`,
      reason: motivo,
    }).catch(() => undefined)
    return mtalkResponse(MSG_HANDOFF)
  }

  // Conversa com memória: gera resposta, ou escala se a IA não resolver.
  async function responderComMemoria(textoUsuario: string) {
    // Pedido explícito de humano → transfere na hora
    if (pediuHumano(textoUsuario)) {
      return transferirParaHumano(textoUsuario, "cliente_pediu_humano")
    }
    const { resposta, escalar } = await gerarRespostaWhatsApp(textoUsuario, nomeParaIA, conversa.messages)
    if (escalar) {
      return transferirParaHumano(textoUsuario, "ia_nao_resolveu")
    }
    // Salva o turno (usuário + IA) na memória
    conversa.messages.push({ role: "user", content: textoUsuario })
    conversa.messages.push({ role: "assistant", content: resposta })
    await salvarConversa(ticketId, conversa)
    logger.info("mtalk_resposta_ok", { ticketId, contactName, len: resposta.length, turnos: conversa.messages.length })
    return mtalkResponse(resposta)
  }

  // ── ÁUDIO: transcreve com Whisper → entra no fluxo conversacional ─────────
  if (messageType === "audio" || messageType === "voice") {
    if (!mediaUrl) return mtalkError("Não consegui acessar o áudio. Pode digitar sua mensagem?")
    try {
      const audioRes = await fetch(mediaUrl)
      if (!audioRes.ok) throw new Error(`download falhou: ${audioRes.status}`)
      const audioBuffer = await audioRes.arrayBuffer()
      const ext = mediaUrl.split(".").pop()?.split("?")[0] || "ogg"
      const transcript = await transcreverAudioIA(audioBuffer, `audio.${ext}`)
      logger.info("mtalk_audio_transcrito", { ticketId, len: transcript.length })
      if (!transcript) return mtalkError("Ouvi seu áudio mas não consegui entender. Pode digitar o que precisa?")
      return await responderComMemoria(transcript)
    } catch (err) {
      logger.warn("mtalk_audio_erro", { ticketId, error: String(err) })
      return mtalkError("Ouvi um áudio, mas tive dificuldade em entendê-lo. Pode digitar o que precisa?")
    }
  }

  // ── IMAGEM: analisa com visão do Llama 4 Scout ───────────────────────────
  if (messageType === "image") {
    if (!mediaUrl) return mtalkError("Não consegui acessar a imagem. Pode descrever o problema?")
    try {
      const contexto =
        SYSTEM_PROMPT_WHATSAPP +
        (conversa.messages.length
          ? "\n\nVocê já está conversando com este cliente — não se reapresente, só comente o que vê na imagem e ajude."
          : "")
      const resposta = await analisarImagemIA(mediaUrl, contexto)
      conversa.messages.push({ role: "user", content: "[enviou uma imagem]" })
      conversa.messages.push({ role: "assistant", content: resposta })
      await salvarConversa(ticketId, conversa)
      logger.info("mtalk_resposta_ok", { ticketId, tipo: "image", len: resposta.length })
      return mtalkResponse(resposta)
    } catch (err) {
      logger.warn("mtalk_imagem_erro", { ticketId, error: String(err) })
      return mtalkError("Recebi a imagem, mas tive dificuldade em processá-la. Pode descrever o que aparece na tela?")
    }
  }

  // ── TIPO NÃO SUPORTADO (vídeo, sticker, etc.) ────────────────────────────
  if (messageType !== "text") {
    logger.warn("mtalk_tipo_nao_suportado", { ticketId, messageType })
    return mtalkError("Recebi sua mensagem! No momento processo texto, áudio e imagem. Para outros tipos, um atendente entrará em contato.")
  }

  if (!mensagem) return mtalkError("Não recebi nenhuma mensagem. Pode tentar novamente?")

  // ── TEXTO ────────────────────────────────────────────────────────────────
  // Persiste em background para o RAG (não bloqueia a resposta)
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
    return await responderComMemoria(mensagem)
  } catch (err) {
    logger.warn("mtalk_ia_erro", { ticketId, error: err instanceof Error ? err.message : String(err) })
    return mtalkError("Tive um probleminha aqui pra processar. Pode mandar de novo?")
  }
}

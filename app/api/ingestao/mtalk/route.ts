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
  comCabecalhoMavo,
  ehSaudacaoPura,
  gerarRespostaWhatsApp,
  pediuHumano,
  SYSTEM_PROMPT_WHATSAPP,
} from "@/lib/assisted-response"
import { analisarImagemIA, transcreverAudioIA } from "@/lib/ai-provider"
import { enviarRespostaParaMTalk } from "@/lib/mtalk-reply"
import {
  carregarConversa,
  salvarConversa,
  marcarHandoff,
  type WhatsAppConversa,
} from "@/lib/whatsapp-memory"
import { notifyHandoff } from "@/lib/handoff-notifier"
import { logger } from "@/lib/logger"
import { aguardarVagaEnvio, jitterHumano } from "@/lib/outbound-throttle"
import { NextResponse } from "next/server"
import { after } from "next/server"
import { createHash } from "node:crypto"

// Formato de resposta que o MTalk espera
function mtalkResponse(texto: string) {
  return NextResponse.json([{ type: "text", content: comCabecalhoMavo(texto) }])
}
function mtalkError(texto: string) {
  return NextResponse.json([{ type: "text", content: comCabecalhoMavo(texto) }])
}
// Não envia nada (bot em silêncio — humano assumiu)
function mtalkSilencio() {
  return NextResponse.json([])
}

// Várias variações da mesma mensagem de handoff — texto idêntico enviado a muitos
// números diferentes é a assinatura que os detectores de spam do WhatsApp reconhecem
// (causa confirmada da restrição de conta em 2026-06-30). Ver lib/outbound-throttle.ts.
const MSGS_HANDOFF = [
  "Já estou te conectando com um atendente, tá? Só um instante que alguém continua o atendimento por aqui.",
  "Vou te passar para um atendente agora, combinado? Só um instante que já continuam o papo por aqui.",
  "Beleza, já acionei um atendente pra te ajudar. Um minutinho só que alguém assume daqui.",
  "Tô te encaminhando pra um atendente humano agora, tá bom? É rapidinho.",
  "Combinado, um atendente já vai continuar contigo. Aguenta só um instante.",
]
function escolherMsgHandoff(): string {
  return MSGS_HANDOFF[Math.floor(Math.random() * MSGS_HANDOFF.length)]
}

// Dedupe de retry do webhook: se o MTalk reenviar o MESMO evento (ex.: timeout de rede
// do lado dele), não queremos gerar/enviar a resposta de novo — outra fonte de texto
// duplicado saindo para o cliente.
const DEDUPE_JANELA_MS = 15_000
function hashMensagem(msg: string): string {
  return createHash("sha1").update(msg.trim().toLowerCase()).digest("hex").slice(0, 16)
}

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

  // Transfere para um atendente humano — retorna o texto (sem empacotar em HTTP).
  async function transferirParaHumano(
    textoUsuario: string,
    motivo: string,
  ): Promise<{ texto: string }> {
    conversa.messages.push({ role: "user", content: textoUsuario })
    const texto = escolherMsgHandoff()
    conversa.ultimaRespostaTexto = texto
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
    return { texto }
  }

  // Núcleo: produz o TEXTO da resposta (memória + escalação). Separado do envio HTTP
  // para poder responder de forma síncrona OU assíncrona (ver caminho de texto).
  async function produzirResposta(textoUsuario: string): Promise<{ texto: string }> {
    // Pedido explícito de humano → transfere na hora
    if (pediuHumano(textoUsuario)) {
      return transferirParaHumano(textoUsuario, "cliente_pediu_humano")
    }
    // Saudação pura abre atendimento NOVO → descarta histórico antigo do ticket.
    if (ehSaudacaoPura(textoUsuario)) conversa.messages = []
    const { resposta, escalar } = await gerarRespostaWhatsApp(textoUsuario, nomeParaIA, conversa.messages)
    if (escalar) {
      return transferirParaHumano(textoUsuario, "ia_nao_resolveu")
    }
    // Salva o turno (usuário + IA) na memória
    conversa.messages.push({ role: "user", content: textoUsuario })
    conversa.messages.push({ role: "assistant", content: resposta })
    conversa.ultimaRespostaTexto = resposta
    await salvarConversa(ticketId, conversa)
    logger.info("mtalk_resposta_ok", { ticketId, contactName, len: resposta.length, turnos: conversa.messages.length })
    return { texto: resposta }
  }

  // Wrapper síncrono (usado pelos caminhos de áudio).
  async function responderComMemoria(textoUsuario: string) {
    const { texto } = await produzirResposta(textoUsuario)
    return mtalkResponse(texto)
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
      // Contexto da conversa para a visão NÃO responder no vácuo: passamos o
      // histórico recente + a legenda que o cliente mandou junto da imagem.
      const historicoRecente = conversa.messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Cliente" : "Mavo AI"}: ${m.content}`)
        .join("\n")
      const contexto =
        SYSTEM_PROMPT_WHATSAPP +
        (conversa.messages.length
          ? `\n\nVocê JÁ está no meio de uma conversa com este cliente — NÃO se reapresente, NÃO comece a resposta com "Mavo AI", e NÃO descreva a imagem de forma genérica. Interprete a imagem DENTRO do contexto da conversa abaixo e continue o raciocínio de onde parou.\n\n=== CONVERSA ATÉ AGORA ===\n${historicoRecente}`
          : "\n\nComente o que vê na imagem e ajude como suporte técnico.")
      const legenda = mensagem
        ? `O cliente enviou esta imagem com a legenda: "${mensagem}". Use a legenda E o contexto da conversa para entender o que ele quer e responda conectando a imagem ao que já estavam falando.`
        : "O cliente enviou esta imagem. Conecte o que aparece nela ao contexto da conversa e ajude — não descreva de forma genérica."
      const resposta = await analisarImagemIA(mediaUrl, contexto, legenda)
      conversa.messages.push({ role: "user", content: mensagem ? `[imagem] ${mensagem}` : "[enviou uma imagem]" })
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

  // Dedupe de retry do webhook: MESMO ticket + MESMO texto dentro de uma janela curta
  // = provavelmente o MTalk reenviando o evento (ex.: timeout de rede do lado dele).
  // MAS pode também ser o cliente repetindo a pergunta de verdade (impaciente, ou o
  // app dele reenviando) — por isso NUNCA respondemos com silêncio aqui: reenviamos a
  // ÚLTIMA resposta já dada. Bug real corrigido em 2026-07-01: a versão anterior usava
  // mtalkSilencio() e isso deixava o cliente sem NENHUMA resposta na repetição (parecia
  // a IA "travada" — ver conversation_sessions do ticket, turnos pararam de crescer).
  const msgHash = hashMensagem(mensagem)
  const agoraMs = Date.now()
  if (
    conversa.ultimaMsgHash === msgHash &&
    conversa.ultimaMsgEm &&
    agoraMs - conversa.ultimaMsgEm < DEDUPE_JANELA_MS &&
    conversa.ultimaRespostaTexto
  ) {
    logger.warn("mtalk_mensagem_duplicada_reenviada", { ticketId, msgHash })
    return mtalkResponse(conversa.ultimaRespostaTexto)
  }
  conversa.ultimaMsgHash = msgHash
  conversa.ultimaMsgEm = agoraMs

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

  // Garante resposta dentro do timeout do webhook MTalk. Se a IA demorar (ex.: rate
  // limit do Groq com retries de vários segundos), NÃO deixamos o cliente no vácuo:
  // liberamos o webhook e enviamos a resposta real de forma ASSÍNCRONA pela API do MTalk.
  // Essa é a causa do "a 2ª mensagem não responde, a próxima sim".
  const REPLY_TIMEOUT_MS = Number(process.env.MTALK_REPLY_TIMEOUT_MS) || 9000

  // `gen` nunca rejeita — em erro, vira uma mensagem amigável (em vez de 500/vácuo).
  const gen = produzirResposta(mensagem).catch((err) => {
    logger.warn("mtalk_ia_erro", { ticketId, error: err instanceof Error ? err.message : String(err) })
    return { texto: "Tive um probleminha aqui pra processar. Pode mandar de novo?" }
  })

  const corrida = await Promise.race([
    gen.then((r) => ({ pronto: true as const, texto: r.texto })),
    new Promise<{ pronto: false }>((resolve) => setTimeout(() => resolve({ pronto: false }), REPLY_TIMEOUT_MS)),
  ])

  if (corrida.pronto) {
    // Atraso curto: responder no exato milissegundo em que a mensagem chega é
    // outro sinal de robô que os detectores de spam do WhatsApp observam.
    await jitterHumano(300, 900)
    return mtalkResponse(corrida.texto)
  }

  // Demorou demais → libera o webhook (evita o vácuo) e entrega a resposta real depois.
  logger.warn("mtalk_reply_async", { ticketId })
  after(async () => {
    try {
      const { texto } = await gen
      // Pacing de saída: espera uma vaga na janela de envios/min + atraso humano,
      // pra não empilhar mensagens em rajada (assinatura de disparo em massa).
      await aguardarVagaEnvio("mtalk")
      await jitterHumano(600, 2000)
      await enviarRespostaParaMTalk({ number: contactId, content: comCabecalhoMavo(texto) })
      logger.info("mtalk_reply_async_enviado", { ticketId })
    } catch (e) {
      logger.warn("mtalk_reply_async_erro", { ticketId, error: e instanceof Error ? e.message : String(e) })
    }
  })
  return mtalkSilencio()
}

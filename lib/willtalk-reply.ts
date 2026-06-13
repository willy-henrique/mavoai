import { logger } from "@/lib/logger"
import { getSecret } from "@/lib/secret-store"

// ─── Modo direto (igual ao MTalk) ─────────────────────────────────────────────
// Se WILLTALK_API_URL + WILLTALK_API_TOKEN estiverem configurados,
// envia a resposta direto para a API WillTalk via número de telefone.
// Fallback: envia para WILLTALK_REPLY_WEBHOOK_URL (legado).

interface WillTalkDirectInput {
  number: string   // telefone, ex: "5511999999999"
  content: string
  saveOnTicket?: boolean
}

interface WillTalkWebhookInput {
  ticketId: string
  cliente: string
  canal: string
  resposta: string
}

export async function enviarRespostaParaWillTalk(
  input: WillTalkWebhookInput & { number?: string },
): Promise<void> {
  // Credenciais editáveis pelo painel (banco → env).
  const apiUrl   = await getSecret("WILLTALK_API_URL")
  const apiToken = await getSecret("WILLTALK_API_TOKEN")

  // Modo direto — mesmo padrão do MTalk
  if (apiUrl && apiToken && input.number) {
    return _enviarDireto({ number: input.number, content: input.resposta, saveOnTicket: true }, apiUrl, apiToken)
  }

  // Fallback: webhook legado
  return _enviarWebhook(input)
}

async function _enviarDireto(input: WillTalkDirectInput, apiUrl: string, apiToken: string): Promise<void> {
  const endpoint = `${apiUrl.replace(/\/$/, "")}/backend/api/messages/send`

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      number: input.number,
      body: input.content,
      saveOnTicket: input.saveOnTicket ?? true,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`WillTalk API error ${response.status}: ${body.slice(0, 300)}`)
  }

  logger.info("willtalk_reply_direto", { number: input.number })
}

async function _enviarWebhook(input: WillTalkWebhookInput): Promise<void> {
  const replyUrl   = process.env.WILLTALK_REPLY_WEBHOOK_URL
  const replyToken = process.env.WILLTALK_WEBHOOK_TOKEN

  if (!replyUrl) {
    logger.warn("willtalk_reply_sem_url", { ticketId: input.ticketId })
    return
  }

  const response = await fetch(replyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(replyToken ? { Authorization: `Bearer ${replyToken}` } : {}),
    },
    body: JSON.stringify({
      ticket_id:        input.ticketId,
      cliente:          input.cliente,
      canal:            input.canal,
      resposta_sugerida: input.resposta,
      origem:           "cerebro-operacional",
      data_evento:      new Date().toISOString(),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`WillTalk webhook error ${response.status}: ${errorBody.slice(0, 300)}`)
  }

  logger.info("willtalk_reply_webhook", { ticketId: input.ticketId })
}

export async function autoReplyHabilitado(): Promise<boolean> {
  // Habilitado se: flag explícita true, OU credenciais da API direta configuradas
  // (banco → env). O flag continua sendo lido do ambiente.
  if (process.env.WILLTALK_AUTO_REPLY_ENABLED === "true") return true
  const apiUrl   = await getSecret("WILLTALK_API_URL")
  const apiToken = await getSecret("WILLTALK_API_TOKEN")
  if (apiUrl && apiToken) return true
  return false
}

export async function willtalkReplyHabilitado(): Promise<boolean> {
  return autoReplyHabilitado()
}

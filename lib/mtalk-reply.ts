import { logger } from "@/lib/logger"
import { getSecret } from "@/lib/secret-store"

// MTalk API: POST https://s11.mtalk.com.br:443/backend/api/messages/send
// Auth: Authorization: Bearer <TOKEN>
// Body: { number, body, saveOnTicket }

interface MtalkReplyInput {
  number: string   // phone number, e.g. "5511999999999"
  content: string
  saveOnTicket?: boolean
}

export async function enviarRespostaParaMTalk(input: MtalkReplyInput): Promise<void> {
  // Credenciais editáveis pelo painel (banco → env).
  const baseUrl = await getSecret("MTALK_BASE_URL")
  const token = await getSecret("MTALK_API_TOKEN")

  if (!baseUrl || !token) {
    throw new Error("MTALK_BASE_URL e MTALK_API_TOKEN sao obrigatorios")
  }

  const url = `${baseUrl}/backend/api/messages/send`

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({
      number: input.number,
      body: input.content,
      saveOnTicket: input.saveOnTicket ?? true,
    }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`MTalk API error ${response.status}: ${body.slice(0, 300)}`)
  }

  logger.info("mtalk_reply_enviado", { number: input.number })
}

export async function mtalkReplyHabilitado(): Promise<boolean> {
  if (process.env.MTALK_AUTO_REPLY_ENABLED !== "true") return false
  const baseUrl = await getSecret("MTALK_BASE_URL")
  const token = await getSecret("MTALK_API_TOKEN")
  return !!(baseUrl && token)
}

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

/**
 * TRAVA DE SEGURANÇA (2026-07-01): envio real só acontece em produção.
 * Rodar stress test / dev local batendo no webhook fazia o caminho ASSÍNCRONO
 * chamar isto e disparar POSTs reais na API do MTalk do número de produção —
 * o volume dessas chamadas (mesmo retornando erro) restringiu a conta do WhatsApp
 * DUAS vezes. Em dev/local (NODE_ENV != production) o envio é PULADO e só logado.
 * Pra forçar envio fora de produção (raro), setar MTALK_ALLOW_SEND_IN_DEV=true.
 */
function envioRealPermitido(): boolean {
  if (process.env.NODE_ENV === "production") return true
  return process.env.MTALK_ALLOW_SEND_IN_DEV === "true"
}

export async function enviarRespostaParaMTalk(input: MtalkReplyInput): Promise<void> {
  if (!envioRealPermitido()) {
    logger.warn("mtalk_reply_bloqueado_dev", {
      number: input.number,
      motivo: "envio real desabilitado fora de producao (trava anti-restricao)",
    })
    return
  }

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

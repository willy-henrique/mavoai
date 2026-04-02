interface EnviarRespostaWillTalkInput {
  ticketId: string
  cliente: string
  canal: string
  resposta: string
}

export async function enviarRespostaParaWillTalk(
  input: EnviarRespostaWillTalkInput
): Promise<void> {
  const replyUrl = process.env.WILLTALK_REPLY_WEBHOOK_URL
  const replyToken = process.env.WILLTALK_WEBHOOK_TOKEN

  if (!replyUrl) {
    throw new Error("WILLTALK_REPLY_WEBHOOK_URL nao configurada")
  }

  const response = await fetch(replyUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(replyToken ? { Authorization: `Bearer ${replyToken}` } : {}),
    },
    body: JSON.stringify({
      ticket_id: input.ticketId,
      cliente: input.cliente,
      canal: input.canal,
      resposta_sugerida: input.resposta,
      origem: "cerebro-operacional",
      data_evento: new Date().toISOString(),
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(
      `Falha ao enviar resposta ao WillTalk: ${response.status} ${errorBody}`
    )
  }
}

export function autoReplyHabilitado(): boolean {
  return process.env.WILLTALK_AUTO_REPLY_ENABLED === "true"
}

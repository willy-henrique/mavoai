/**
 * lib/outbound-throttle.ts
 *
 * Pacing de mensagens de saída para o WhatsApp (MTalk). Texto idêntico enviado
 * em rajada, a velocidade de robô, para muitos números diferentes, é a
 * assinatura clássica que os detectores de spam/disparo em massa do WhatsApp
 * reconhecem — foi a causa da conta "Sua conta está restringida" (2026-06-30).
 * Isso NÃO substitui o fato de MTalk ser uma conexão não-oficial (risco
 * estrutural); só reduz o comportamento mais óbvio de bot.
 */

import { logger } from "@/lib/logger"

const janelaEnvios: number[] = [] // timestamps (ms) dos envios recentes, janela de 60s

function limiteMax(): number {
  return Number(process.env.MTALK_OUTBOUND_MAX_PER_MIN) || 20
}

/** Bloqueia até haver uma "vaga" na janela de 1 min antes de liberar o envio. */
export async function aguardarVagaEnvio(canal: string): Promise<void> {
  const max = limiteMax()
  for (;;) {
    const agora = Date.now()
    while (janelaEnvios.length && agora - janelaEnvios[0] > 60_000) janelaEnvios.shift()
    if (janelaEnvios.length < max) {
      janelaEnvios.push(agora)
      return
    }
    const espera = Math.min(60_000 - (agora - janelaEnvios[0]) + 50, 5000)
    logger.warn("outbound_throttle_aguardando", { canal, fila: janelaEnvios.length, esperaMs: espera })
    await new Promise((r) => setTimeout(r, espera))
  }
}

/** Pequeno atraso aleatório para não responder na velocidade exata de um robô. */
export function jitterHumano(minMs = 500, maxMs = 1600): Promise<void> {
  const ms = minMs + Math.random() * (maxMs - minMs)
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * lib/escalation-detector.ts
 *
 * Token e detector unificado de escalação para humano.
 * Todas as IAs do sistema (triagem, investigação, resolução, especialistas)
 * usam este token quando não têm certeza suficiente para responder.
 * O orquestrador detecta o token em qualquer ponto e escala imediatamente.
 */

/** Token que qualquer IA retorna quando não sabe com certeza. */
export const ESCALATION_TOKEN = "[ESCALAR_HUMANO]"

/** Bloco padrão adicionado a TODOS os system prompts do sistema. */
export const ANTI_HALLUCINATION_BLOCK = `
━━━ REGRA INVIOLÁVEL — QUANDO NÃO SOUBER ━━━
Se você não tiver informação suficiente, não tiver certeza do diagnóstico,
ou o problema for fora do contexto disponível:

Escreva APENAS: [ESCALAR_HUMANO]

Nada mais. Nem explicação, nem tentativa, nem "não sei".
Um técnico humano assumirá imediatamente.

QUANDO usar [ESCALAR_HUMANO]:
• Problema nunca visto antes e sem casos similares no contexto
• Código de erro desconhecido sem correspondência no conhecimento disponível
• Configuração de banco de dados, infraestrutura ou segurança de dados
• Cliente com situação fiscal urgente e crítica sem precedente no banco
• Qualquer dúvida sobre se a resposta está correta

NUNCA use [ESCALAR_HUMANO]:
• Quando o erro está claramente no contexto (playbooks, casos, conhecimento base)
• Apenas por precaução se o contexto disponível cobre o problema
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

/**
 * Verifica se o texto retornado pela IA é o sinal de escalação.
 * Tolerante a variações de formatação (espaços, quebras de linha, aspas).
 */
export function isEscalationSignal(text: string): boolean {
  const normalized = text.trim().replace(/^["'\s]+|["'\s]+$/g, "")
  return (
    normalized === ESCALATION_TOKEN ||
    normalized.startsWith(ESCALATION_TOKEN) ||
    normalized.includes(ESCALATION_TOKEN)
  )
}

/**
 * Retorna texto limpo se não for escalação, ou null se for.
 * Use no lugar de verificação manual.
 */
export function extractOrNull(text: string): string | null {
  return isEscalationSignal(text) ? null : text.trim()
}

import { gerarTextoIA } from "@/lib/ai-provider"
import { logger } from "@/lib/logger"

function stripMarkdown(text: string): string {
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/^[-*•]\s+/gm, "")
    .replace(/\n{2,}/g, " | ")
    .trim()
}

export type HandoffSummaryKind =
  | "investigation_success"
  | "investigation_client_unclear"
  | "investigation_exhausted_inbound"
  | "menu_exhausted"
  | "no_queues"
  // ── Fase de resolução autônoma ──────────────────────────────────────────
  | "resolution_success"
  | "resolution_exhausted"
  | "resolution_client_requested_human"

export type HandoffSummaryContext = {
  kind: HandoffSummaryKind
  queueName: string | null
  clienteNome: string
  clienteTelefone: string
  lastUserMessage: string
  imageAnalysis: string | null
  evalNivel?: string
  evalMotivoCurto?: string
  /** Rodadas com evidência adequada (investigation_success). */
  adequateRounds?: number
  /** Tentativas de resolução já feitas (fases de resolução). */
  resolutionAttempts?: number
  /** Texto acumulado do problema durante a investigação. */
  resolutionProblemText?: string
  /** Soluções já enviadas ao cliente (para o atendente entender o que foi tentado). */
  resolutionPrevSolutions?: string[]
}

const SYSTEM = `Você redige uma NOTA INTERNA para o atendente de suporte B2B (Brasil).

Regras:
- Português, tom neutro e profissional
- Não julgue o cliente
- Não invente fatos que não estejam no contexto
- Formato: 4 a 8 linhas curtas, cada uma com prefixo "• "
- Máximo 900 caracteres
- PROIBIDO: markdown, headers, títulos, emojis, listas com traço ou asterisco
- Use apenas texto simples com prefixo "• " por linha

Inclua quando disponível:
• Tipo de handoff e motivo
• Fila/demanda
• Resumo breve do problema (1-2 linhas, sem repetir toda a solução já tentada)
• Se houve resolução autônoma: número de tentativas e resultado sucinto
• 1 sugestão de próximo passo para o humano`

function buildResolutionSection(ctx: HandoffSummaryContext): string {
  if (!ctx.resolutionAttempts) return ""
  const lines: string[] = []
  lines.push(`• Tentativas de resolução autônoma: ${ctx.resolutionAttempts}`)
  if (ctx.resolutionProblemText?.trim()) {
    lines.push(`• Contexto técnico coletado: ${ctx.resolutionProblemText.trim().slice(0, 200)}`)
  }
  if (ctx.resolutionPrevSolutions?.length) {
    ctx.resolutionPrevSolutions.forEach((s, i) => {
      lines.push(`• Solução tentativa ${i + 1}: ${stripMarkdown(s).slice(0, 160)}`)
    })
  }
  return lines.join("\n")
}

function fallbackSummary(ctx: HandoffSummaryContext): string {
  const q = ctx.queueName || "(sem fila)"
  const base: string[] = [
    `• Tipo de handoff: ${ctx.kind}`,
    `• Fila / demanda: ${q}`,
    `• Cliente: ${ctx.clienteNome} (${ctx.clienteTelefone})`,
  ]
  const u = ctx.lastUserMessage.trim()
  if (u) {
    base.push(`• Última mensagem do cliente: ${u.slice(0, 320)}${u.length > 320 ? "…" : ""}`)
  }
  if (ctx.imageAnalysis?.trim()) {
    base.push(`• Leitura de imagem (IA): ${ctx.imageAnalysis.trim().slice(0, 300)}${ctx.imageAnalysis.length > 300 ? "…" : ""}`)
  }
  if (ctx.evalNivel) {
    base.push(`• Classificação do último turno: ${ctx.evalNivel}${ctx.evalMotivoCurto ? ` — ${ctx.evalMotivoCurto}` : ""}`)
  }
  if (ctx.adequateRounds != null) {
    base.push(`• Rodadas com evidência adequada (IA): ${ctx.adequateRounds}`)
  }
  const resSection = buildResolutionSection(ctx)
  if (resSection) base.push(resSection)

  // Sugestão de próximo passo baseada no kind
  const suggestions: Record<HandoffSummaryKind, string> = {
    investigation_success: "Revisar contexto coletado e iniciar diagnóstico técnico.",
    investigation_client_unclear: "Solicitar ao cliente o print/erro por texto e confirmar escopo.",
    investigation_exhausted_inbound: "Entrar em contato ativo pelo chat para coletar evidências.",
    menu_exhausted: "Identificar a demanda real e direcionar para a fila correta.",
    no_queues: "Configurar filas ativas no sistema antes de retomar o atendimento.",
    resolution_success: "Confirmar resolução com o cliente e registrar a solução no histórico.",
    resolution_exhausted: "Todas as soluções autônomas falharam. Conectar técnico especializado.",
    resolution_client_requested_human: "Cliente pediu atendimento humano. Assumir imediatamente.",
  }
  base.push(`• Ação sugerida: ${suggestions[ctx.kind] || "Abrir conversa e validar contexto."}`)
  return base.join("\n")
}

export async function buildAgentHandoffSummary(
  ctx: HandoffSummaryContext,
): Promise<string> {
  try {
    const sanitizedCtx = {
      ...ctx,
      resolutionPrevSolutions: ctx.resolutionPrevSolutions?.map((s) =>
        stripMarkdown(s).slice(0, 180),
      ),
    }
    const raw = await gerarTextoIA(
      SYSTEM,
      `Contexto (JSON):\n${JSON.stringify(sanitizedCtx, null, 2)}`,
    )
    const t = raw.trim().slice(0, 900)
    if (t.length >= 80) return t
  } catch (e) {
    logger.warn("agent_handoff_summary_ia_failed", {
      kind: ctx.kind,
      message: e instanceof Error ? e.message : String(e),
    })
  }
  return fallbackSummary(ctx)
}

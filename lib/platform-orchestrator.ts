import { buildAgentHandoffSummary } from "@/lib/handoff-agent-summary"
import { analyzeImageForSupport } from "@/lib/image-vision"
import { evaluateInvestigationTurn } from "@/lib/investigation-quality"
import { gerarTextoIA } from "@/lib/ai-provider"
import { isLikelyImagePayload } from "@/lib/vision-utils"
import {
  gerarSolucaoAutonoma,
  detectResolutionOutcome,
  buildResolutionSuccessReply,
  buildResolutionExhaustedReply,
  buildResolutionUnclearReply,
  MAX_AI_RESOLUTION_ATTEMPTS,
} from "@/lib/resolution-engine"

// ─── Constantes de controle ────────────────────────────────────────────────────

/** Rodadas de evidência adequada necessárias antes de tentar resolver. */
export const INVESTIGATION_REQUIRED_ADEQUATE_ROUNDS = 2

/** Sequência de respostas inadequadas/fora do tema que dispara handoff direto. */
export const INVESTIGATION_MAX_INADEQUATE_BEFORE_HANDOFF = 2

/** Limite de mensagens inbound totais sem evidência suficiente (evita loop). */
export const INVESTIGATION_MAX_INBOUND_WITHOUT_HANDOFF = 14

/** Tentativas inválidas no menu antes do handoff humano. */
export const MENU_MAX_INVALID_ATTEMPTS = 3

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type OrchestratorQueue = {
  id: string
  menu_option: number
  name: string
  default_sla_mins?: number
  is_active?: boolean
}

export type OrchestratorConversationState = {
  triage_completed: boolean

  /** Legado — mantido por compatibilidade. */
  menu_attempts: number

  queue_id: string | null
  menu_invalid_attempts?: number
  investigation_adequate_rounds?: number
  investigation_messages_seen?: number
  investigation_inadequate_streak?: number

  // ── Fase de resolução autônoma ──────────────────────────────────────────
  /** Indica que a IA está tentando resolver ativamente. */
  resolution_active?: boolean
  /** Quantas tentativas de solução já foram enviadas (0 = nenhuma). */
  resolution_attempts?: number
  /** Texto acumulado do problema durante a investigação. */
  resolution_problem_text?: string
  /** JSON serializado: string[] com as soluções já enviadas (para evitar repetição). */
  resolution_prev_solutions?: string
}

export type PlatformOrchestratorInput = {
  platform: string
  organization_id: string
  event_id: string
  conversation_id: string
  cliente: { nome: string; telefone: string }
  mensagem: string
  media_url?: string | null
  mime_type?: string | null
  business_hours_open: boolean
  conversation: OrchestratorConversationState
  queues: OrchestratorQueue[]
}

export type PlatformOrchestratorOutput = {
  reply_text: string
  triage_completed: boolean

  /** Legado — espelha investigation_adequate_rounds por compatibilidade. */
  menu_attempts: number

  queue_id: string | null
  reason: string
  agent_handoff_summary?: string | null

  // Persistência recomendada
  menu_invalid_attempts?: number
  investigation_adequate_rounds?: number
  investigation_inadequate_streak?: number

  // Fase de resolução autônoma
  resolution_active?: boolean
  resolution_attempts?: number
  resolution_problem_text?: string
  resolution_prev_solutions?: string
}

type InvestigationEvalResult = {
  nivel: "adequado" | "insuficiente" | "fora_do_tema"
  motivoCurto: string
  textoResposta: string
}

const WHATSAPP_REPLY_MAX_CHARS = 320
const BRAND_HEADER = "*Mavo AI*"

// ─── Utilitários ───────────────────────────────────────────────────────────────

function normalizeText(value: unknown): string {
  return String(value || "").trim()
}

function normalizeTextLower(value: unknown): string {
  return normalizeText(value).toLowerCase()
}

function hasMeaningfulFreeText(value: string): boolean {
  const text = normalizeText(value)
  if (text.length < 8) return false
  return /[a-zA-ZÀ-ÿ]/.test(text)
}

function buildOutOfHoursSuffix(open: boolean): string {
  if (open) return ""
  return "\n\nEstamos fora do horário comercial. Responderemos no próximo expediente."
}

function getGreetingByBrasiliaTime(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(date),
  )
  if (hour < 12) return "Bom dia"
  if (hour < 18) return "Boa tarde"
  return "Boa noite"
}

function buildDemandMenu(
  options: Array<{ menu_option: number; name: string }>,
  clienteNome?: string | null,
): string {
  const lines = options
    .sort((a, b) => a.menu_option - b.menu_option)
    .map((o) => `*${o.menu_option}* - ${o.name}`)
    .join("\n")
  const greeting = getGreetingByBrasiliaTime()
  const nome = normalizeText(clienteNome)
  const saudacao = nome ? `${greeting}, ${nome}!` : `${greeting}!`
  return (
    `${saudacao}\n` +
    "Atendimento Mavo AI.\n\n" +
    "Escolha uma opção pelo número:\n" +
    lines +
    "\n\nOu descreva seu problema em 1 frase e eu classifico automaticamente."
  )
}

function inferQueueIntent(queueName: string): "fiscal" | "banco" | "equipamento" | "sistema" {
  const q = normalizeTextLower(queueName)
  if (q.includes("fiscal") || q.includes("nota") || q.includes("nfe") || q.includes("nf-e") || q.includes("nfce") || q.includes("nfc-e") || q.includes("sefaz") || q.includes("sat")) return "fiscal"
  if (q.includes("banco") || q.includes("database") || q.includes("sql") || q.includes("postgres") || q.includes("firebird") || q.includes("conex") || q.includes("servidor")) return "banco"
  if (q.includes("impressora") || q.includes("balança") || q.includes("balanca") || q.includes("coletor") || q.includes("equipamento") || q.includes("terminal") || q.includes("leitor") || q.includes("scanner")) return "equipamento"
  return "sistema"
}

const TRIAGE_KEYWORDS_BY_INTENT: Record<ReturnType<typeof inferQueueIntent>, string[]> = {
  fiscal: [
    "auge",
    "auge erp",
    "nota",
    "nfe",
    "nf-e",
    "nfce",
    "nfc-e",
    "sefaz",
    "sat",
    "rejeicao",
    "rejeição",
    "fiscal",
    "danfe",
    "xml",
    "certificado",
    "contingencia",
    "contingência",
  ],
  banco: [
    "auge",
    "banco",
    "database",
    "sql",
    "postgres",
    "firebird",
    "servidor",
    "conexao",
    "conexão",
    "timeout",
    "acesso negado",
    "host",
    "porta",
  ],
  equipamento: [
    "auge",
    "impressora",
    "balanca",
    "balança",
    "scanner",
    "leitor",
    "coletor",
    "etiqueta",
    "gaveta",
    "terminal",
    "pinpad",
    "equipamento",
    "nao imprime",
    "não imprime",
  ],
  sistema: [
    "auge",
    "erp",
    "mavo",
    "módulo",
    "modulo",
    "sistema",
    "travou",
    "lento",
    "cadastro",
    "produto",
    "venda",
    "caixa",
    "login",
    "usuario",
    "usuário",
    "senha",
    "tela",
    "rotina",
    "erro",
  ],
}

function scoreQueueByFreeText(queue: OrchestratorQueue, inputText: string): number {
  const text = normalizeTextLower(inputText)
  if (!text) return 0

  const queueName = normalizeTextLower(queue.name)
  let score = 0

  if (queueName && text.includes(queueName)) score += 8

  const intent = inferQueueIntent(queue.name)
  const intentKeywords = TRIAGE_KEYWORDS_BY_INTENT[intent]
  for (const keyword of intentKeywords) {
    if (text.includes(keyword)) score += 2
  }

  const queueWords = queueName
    .split(/[^a-zA-ZÀ-ÿ0-9]+/g)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)
  for (const word of queueWords) {
    if (text.includes(word)) score += 1
  }

  return score
}

function inferQueueFromFreeText(
  queues: OrchestratorQueue[],
  inputText: string,
): { queueId: string | null; confidence: "high" | "low" } {
  if (!hasMeaningfulFreeText(inputText)) {
    return { queueId: null, confidence: "low" }
  }

  if (queues.length === 1) {
    return { queueId: String(queues[0].id), confidence: "high" }
  }

  const ranked = queues
    .map((q) => ({ queue: q, score: scoreQueueByFreeText(q, inputText) }))
    .sort((a, b) => b.score - a.score)

  const best = ranked[0]
  const second = ranked[1]
  if (!best || best.score < 3) return { queueId: null, confidence: "low" }
  if (second && best.score - second.score < 2) return { queueId: null, confidence: "low" }
  return { queueId: String(best.queue.id), confidence: "high" }
}

async function inferQueueFromAI(
  queues: OrchestratorQueue[],
  inputText: string,
): Promise<{ queueId: string | null; confidence: number }> {
  if (!hasMeaningfulFreeText(inputText) || queues.length === 0) {
    return { queueId: null, confidence: 0 }
  }
  if (queues.length === 1) {
    return { queueId: String(queues[0].id), confidence: 0.99 }
  }

  const options = queues.map((q) => ({ id: String(q.id), name: q.name }))
  const systemPrompt =
    "Você é classificador de fila de suporte técnico. " +
    "Contexto principal: atendimento de clientes do sistema AUGE ERP no Brasil. " +
    "Priorize sinais de módulos/rotinas do AUGE (cadastro, fiscal, vendas, financeiro, relatório, certificado, impressão fiscal, TEF/PIX). " +
    "Para fiscal, considere termos como NF-e, NFC-e, SAT, CFOP, CST, CSOSN, ICMS, PIS/COFINS, SEFAZ, SPED, XML e certificado digital. " +
    "Escolha apenas 1 fila com base no texto do cliente. " +
    "Responda somente JSON válido: {\"queue_id\":\"...|null\",\"confidence\":0.0}. " +
    "Se estiver ambíguo, retorne queue_id null. Não invente IDs."
  const userPrompt =
    `texto_cliente: ${inputText}\n` +
    `filas_disponiveis: ${JSON.stringify(options)}\n` +
    "Retorne só JSON."

  try {
    const raw = await gerarTextoIA(systemPrompt, userPrompt)
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return { queueId: null, confidence: 0 }
    const parsed = JSON.parse(match[0]) as { queue_id?: unknown; confidence?: unknown }
    const queueId = String(parsed.queue_id || "")
    const exists = options.some((o) => o.id === queueId)
    const confidenceNum = Math.max(0, Math.min(1, Number(parsed.confidence || 0)))
    if (!exists) return { queueId: null, confidence: confidenceNum }
    return { queueId, confidence: confidenceNum }
  } catch {
    return { queueId: null, confidence: 0 }
  }
}

function buildInvestigationPrompt(queueName: string): string {
  const intent = inferQueueIntent(queueName)
  const queueLower = normalizeTextLower(queueName)
  const isAuge = queueLower.includes("auge")
  const isAugeProductRegistration =
    queueLower.includes("auge") &&
    queueLower.includes("cadastro") &&
    queueLower.includes("produto")

  if (isAugeProductRegistration) {
    return (
      `Recebi sua demanda de *${queueName}*.\n\n` +
      "Para acelerar no AUGE, me envie apenas: " +
      "1) em qual etapa falha (incluir, confirmar/gravar, afterpost ou exclusão), " +
      "2) a mensagem exata do erro e " +
      "3) qual campo está envolvido (CEST, NCM/NMERCOSUL, EAN/CODIGO2, alíquota ou código do produto)."
    )
  }

  switch (intent) {
    case "fiscal":
      return (
        `Recebi sua demanda de *${queueName}*.\n\n` +
        `${isAuge ? "No AUGE, " : ""}me informe o que você estava fazendo, qual mensagem apareceu na tela e em qual etapa isso ocorreu. ` +
        "Se puder, envie o print completo do erro. Se não conseguir enviar imagem, descreva por texto o erro exato e em qual caixa ou terminal aconteceu."
      )
    case "banco":
      return (
        `Recebi sua demanda de *${queueName}*.\n\n` +
        `${isAuge ? "Para avançar no AUGE, " : "Para avançar, "}me informe qual mensagem aparece, se o problema ocorre ao abrir o sistema ou durante alguma rotina específica, e se afeta apenas uma máquina ou mais de uma. ` +
        "Se puder, envie um print da tela do erro."
      )
    case "equipamento":
      return (
        `Recebi sua demanda de *${queueName}*.\n\n` +
        "Me diga qual equipamento está com problema, o que ele está fazendo ou deixando de fazer, e se aparece alguma mensagem, luz ou código. " +
        "Se conseguir, envie uma foto do equipamento ou da tela/painel."
      )
    default:
      return (
        `Recebi sua demanda de *${queueName}*.\n\n` +
        `${isAuge ? "Para te ajudar no AUGE, " : "Para te ajudar melhor, "}me diga em qual tela ou rotina o problema acontece, o que aparece na tela e qual mensagem de erro você recebeu. ` +
        "Se conseguir, envie também um print. Se não puder, descreva por texto o comportamento."
      )
  }
}

function buildPostTriageClientAck(): string {
  return (
    "Recebemos sua mensagem.\n\n" +
    "Um atendente já pode visualizar o que foi enviado e responderá por aqui em breve.\n" +
    "Se for urgente, aguarde na conversa."
  )
}

function buildTriageNoQueues(): string {
  return (
    "Sua mensagem foi recebida e registrada.\n\n" +
    "No momento não há opções de atendimento automático.\n" +
    "Um atendente responderá em breve."
  )
}

function buildTriageHumanHandoff(): string {
  return (
    "Não conseguimos identificar sua solicitação com segurança.\n\n" +
    "Você será encaminhado(a) para um atendente humano, que continuará o atendimento por aqui.\n" +
    "Aguarde, por favor."
  )
}

function isClientReportingDifficulty(inputText: string): boolean {
  const t = normalizeTextLower(inputText)
  const hints = [
    "nao estou no computador", "não estou no computador",
    "nao tenho print", "não tenho print",
    "nao sei tirar print", "não sei tirar print",
    "nao consigo tirar print", "não consigo tirar print",
    "nao tenho foto", "não tenho foto",
    "nao sei informar", "não sei informar",
    "nao sei o erro", "não sei o erro",
    "to sem acesso", "tô sem acesso", "estou sem acesso", "sem acesso agora",
    "nao estou ai", "não estou aí",
    "nao consigo enviar imagem", "não consigo enviar imagem",
  ]
  return hints.some((h) => t.includes(h))
}

function buildQuickGuidance(inputText: string): string | null {
  const t = normalizeTextLower(inputText)
  const isAugeIssue =
    t.includes("auge") || t.includes("erp") || t.includes("cadastro de produto") || t.includes("cadastro produto")
  if (isAugeIssue) {
    return (
      "Validação rápida no AUGE: confirme empresa/filial ativa, usuário com permissão da rotina, campos obrigatórios preenchidos e mensagem literal do erro. " +
      "Se possível, valide também se ocorre em outra máquina/usuário."
    )
  }
  const isDatabaseIssue =
    t.includes("banco de dados") || t.includes("conexao com o banco") || t.includes("conexão com o banco") ||
    t.includes("conectar no banco") || t.includes("falha ao conectar") ||
    t.includes("erro de conexão") || t.includes("erro de conexao") ||
    t.includes("postgres") || t.includes("sql server") || t.includes("firebird")
  if (isDatabaseIssue) {
    return (
      "Antes do atendimento técnico, valide estes pontos rápidos: " +
      "1) confirme se o serviço do banco está ativo, " +
      "2) revise host, porta, usuário, senha e nome do banco, " +
      "3) teste o acesso por um cliente SQL, " +
      "4) verifique firewall, VPN e rede local."
    )
  }
  const isFiscalIssue =
    t.includes("fiscal") || t.includes("nota") || t.includes("nfe") || t.includes("nf-e") ||
    t.includes("nfce") || t.includes("nfc-e") || t.includes("sefaz") || t.includes("sat") ||
    t.includes("rejeição") || t.includes("rejeicao")
  if (isFiscalIssue) {
    return "Como validação inicial, confira a internet, data e hora do equipamento/servidor, validade do certificado digital e tente reproduzir novamente com a mensagem completa na tela."
  }
  return null
}

function buildFollowUpAfterAdequate(params: {
  body: string
  queueName: string
  adequateRounds: number
}): string {
  const { body, queueName, adequateRounds } = params
  const quick = buildQuickGuidance(body)
  if (quick) {
    if (adequateRounds + 1 >= INVESTIGATION_REQUIRED_ADEQUATE_ROUNDS) {
      return (
        `Entendi o cenário de *${queueName}*.\n\n${quick}\n\n` +
        "_Se o comportamento continuar, analisarei as soluções disponíveis para você._"
      )
    }
    return (
      `Entendi o cenário de *${queueName}*.\n\n${quick}\n\n` +
      "_Se puder, envie também a mensagem exata exibida ou um print da tela para complementar a análise._"
    )
  }
  if (adequateRounds + 1 >= INVESTIGATION_REQUIRED_ADEQUATE_ROUNDS) {
    return (
      `Entendi o contexto inicial da sua demanda de *${queueName}*.\n\n` +
      "As informações já ajudam. Se houver mais algum detalhe relevante — mensagem exata, nome da rotina/tela — pode enviar por aqui."
    )
  }
  return (
    `Entendi o contexto inicial da sua demanda de *${queueName}*.\n\n` +
    "Para complementar a análise, envie a mensagem exata exibida na tela, o nome da rotina/módulo ou um print completo, se estiver disponível."
  )
}

function getConversationCounters(conversation: OrchestratorConversationState) {
  const legacyMenuAttempts =
    typeof conversation.menu_attempts === "number" && Number.isFinite(conversation.menu_attempts)
      ? conversation.menu_attempts
      : 0

  const menuInvalidAttempts =
    typeof conversation.menu_invalid_attempts === "number" &&
    Number.isFinite(conversation.menu_invalid_attempts) &&
    conversation.menu_invalid_attempts >= 0
      ? conversation.menu_invalid_attempts
      : conversation.queue_id ? 0 : legacyMenuAttempts

  const investigationAdequateRounds =
    typeof conversation.investigation_adequate_rounds === "number" &&
    Number.isFinite(conversation.investigation_adequate_rounds) &&
    conversation.investigation_adequate_rounds >= 0
      ? conversation.investigation_adequate_rounds
      : conversation.queue_id ? legacyMenuAttempts : 0

  const investigationInadequateStreak =
    typeof conversation.investigation_inadequate_streak === "number" &&
    Number.isFinite(conversation.investigation_inadequate_streak) &&
    conversation.investigation_inadequate_streak >= 0
      ? conversation.investigation_inadequate_streak
      : 0

  const investigationMessagesSeen =
    typeof conversation.investigation_messages_seen === "number" &&
    Number.isFinite(conversation.investigation_messages_seen) &&
    conversation.investigation_messages_seen >= 0
      ? conversation.investigation_messages_seen
      : null

  const resolutionActive = Boolean(conversation.resolution_active)
  const resolutionAttempts =
    typeof conversation.resolution_attempts === "number" &&
    Number.isFinite(conversation.resolution_attempts) &&
    conversation.resolution_attempts >= 0
      ? conversation.resolution_attempts
      : 0
  const resolutionProblemText = normalizeText(conversation.resolution_problem_text)
  const resolutionPrevSolutions: string[] = (() => {
    try {
      const arr = JSON.parse(conversation.resolution_prev_solutions || "[]")
      return Array.isArray(arr) ? arr.map(String) : []
    } catch {
      return []
    }
  })()

  return {
    menuInvalidAttempts,
    investigationAdequateRounds,
    investigationInadequateStreak,
    investigationMessagesSeen,
    resolutionActive,
    resolutionAttempts,
    resolutionProblemText,
    resolutionPrevSolutions,
  }
}

function buildOutput(params: {
  reply_text: string
  triage_completed: boolean
  queue_id: string | null
  reason: string
  agent_handoff_summary?: string | null
  menu_invalid_attempts: number
  investigation_adequate_rounds: number
  investigation_inadequate_streak: number
  resolution_active?: boolean
  resolution_attempts?: number
  resolution_problem_text?: string
  resolution_prev_solutions?: string
}): PlatformOrchestratorOutput {
  const humanizedReply = humanizeOutboundReply(params.reply_text)
  const cleanReplyText = sanitizeOutboundReply(withBrandHeader(humanizedReply))
  return {
    reply_text: cleanReplyText,
    triage_completed: params.triage_completed,
    menu_attempts: params.investigation_adequate_rounds,
    queue_id: params.queue_id,
    reason: params.reason,
    agent_handoff_summary: params.agent_handoff_summary ?? null,
    menu_invalid_attempts: params.menu_invalid_attempts,
    investigation_adequate_rounds: params.investigation_adequate_rounds,
    investigation_inadequate_streak: params.investigation_inadequate_streak,
    resolution_active: params.resolution_active ?? false,
    resolution_attempts: params.resolution_attempts ?? 0,
    resolution_problem_text: params.resolution_problem_text ?? "",
    resolution_prev_solutions: params.resolution_prev_solutions ?? "[]",
  }
}

function withBrandHeader(text: string): string {
  const clean = String(text || "").trim()
  if (!clean) return BRAND_HEADER
  if (clean.toLowerCase().startsWith(BRAND_HEADER.toLowerCase())) return clean
  return `${BRAND_HEADER}\n${clean}`
}

function humanizeOutboundReply(raw: string): string {
  const text = String(raw || "").trim()
  if (!text) return text

  const replacements: Array<[RegExp, string]> = [
    [/^Nao consegui /i, "Desculpe, não consegui "],
    [/^Não consegui /i, "Desculpe, não consegui "],
    [/^Recebemos sua mensagem\./i, "Recebi sua mensagem e já iniciei a análise."],
    [/Aguarde, por favor\./i, "Por favor, aguarde enquanto direciono seu atendimento."],
    [/Fica tranquilo\(a\),?\s*/gi, ""],
  ]

  let out = text
  for (const [pattern, next] of replacements) {
    out = out.replace(pattern, next)
  }
  return out
}

function sanitizeOutboundReply(raw: string): string {
  const text = String(raw || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\s{2,}/g, " ")
    .trim()

  if (text.length <= WHATSAPP_REPLY_MAX_CHARS) return text

  const hardLimit = text.slice(0, WHATSAPP_REPLY_MAX_CHARS)
  const lastPunctuation = Math.max(
    hardLimit.lastIndexOf("."),
    hardLimit.lastIndexOf("!"),
    hardLimit.lastIndexOf("?"),
    hardLimit.lastIndexOf(":"),
  )
  if (lastPunctuation >= 120) {
    return hardLimit.slice(0, lastPunctuation + 1).trim()
  }
  const lastSpace = hardLimit.lastIndexOf(" ")
  if (lastSpace >= 120) {
    return `${hardLimit.slice(0, lastSpace).trim()}...`
  }
  return `${hardLimit.trim()}...`
}

/** Acumula texto do problema para uso na fase de resolução. */
function accumulateProblemText(existing: string, newText: string): string {
  if (!newText.trim()) return existing
  if (!existing.trim()) return newText.trim()
  return `${existing} | ${newText.trim()}`
}

// ─── Orquestrador principal ────────────────────────────────────────────────────

/**
 * Orquestrador multi-plataforma.
 * Fluxo: menu → triagem → investigação → resolução autônoma (3x) → handoff humano.
 */
export async function runPlatformOrchestrator(
  input: PlatformOrchestratorInput,
): Promise<PlatformOrchestratorOutput> {
  const qlist = input.queues.filter((q) => q.is_active !== false)
  const suffix = buildOutOfHoursSuffix(input.business_hours_open)
  const body = normalizeText(input.mensagem)
  const mediaUrl = input.media_url || null
  const mimeType = input.mime_type || null
  const triageCompleted = Boolean(input.conversation.triage_completed)
  const queueId = input.conversation.queue_id ? String(input.conversation.queue_id) : null

  const {
    menuInvalidAttempts,
    investigationAdequateRounds,
    investigationInadequateStreak,
    investigationMessagesSeen,
    resolutionActive,
    resolutionAttempts,
    resolutionProblemText,
    resolutionPrevSolutions,
  } = getConversationCounters(input.conversation)

  // ── Pós-triagem: ACK simples ──────────────────────────────────────────────
  if (triageCompleted) {
    return buildOutput({
      reply_text: buildPostTriageClientAck() + suffix,
      triage_completed: true,
      queue_id: queueId,
      reason: "post_triage_ack",
      menu_invalid_attempts: menuInvalidAttempts,
      investigation_adequate_rounds: investigationAdequateRounds,
      investigation_inadequate_streak: 0,
    })
  }

  // ── Fila já selecionada ───────────────────────────────────────────────────
  if (queueId) {
    const currentQueue = qlist.find((q) => String(q.id) === queueId)
    const queueName = currentQueue?.name || "Suporte"

    // ── FASE DE RESOLUÇÃO AUTÔNOMA ────────────────────────────────────────
    if (resolutionActive) {
      const outcome = detectResolutionOutcome(body)

      // Pedido explícito de humano → handoff imediato
      if (outcome === "needs_human") {
        const agent_handoff_summary = await buildAgentHandoffSummary({
          kind: "resolution_client_requested_human",
          queueName,
          clienteNome: input.cliente.nome,
          clienteTelefone: input.cliente.telefone,
          lastUserMessage: body,
          imageAnalysis: null,
          resolutionAttempts,
          resolutionProblemText,
        })
        return buildOutput({
          reply_text:
            `Claro. Estou transferindo seu atendimento de *${queueName}* para um técnico agora.\n\n` +
            "Todas as informações já foram registradas para agilizar o atendimento." + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: "resolution_client_requested_human",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
          resolution_active: false,
          resolution_attempts: resolutionAttempts,
        })
      }

      // Problema resolvido → fechar com sucesso
      if (outcome === "resolved") {
        const agent_handoff_summary = await buildAgentHandoffSummary({
          kind: "resolution_success",
          queueName,
          clienteNome: input.cliente.nome,
          clienteTelefone: input.cliente.telefone,
          lastUserMessage: body,
          imageAnalysis: null,
          resolutionAttempts,
          resolutionProblemText,
        })
        return buildOutput({
          reply_text: buildResolutionSuccessReply(input.cliente.nome) + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: "resolved_by_ai",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
          resolution_active: false,
          resolution_attempts: resolutionAttempts,
        })
      }

      // Não funcionou
      if (outcome === "failed") {
        const nextAttempt = resolutionAttempts + 1

        // Esgotou as 3 tentativas → handoff
        if (nextAttempt > MAX_AI_RESOLUTION_ATTEMPTS) {
          const agent_handoff_summary = await buildAgentHandoffSummary({
            kind: "resolution_exhausted",
            queueName,
            clienteNome: input.cliente.nome,
            clienteTelefone: input.cliente.telefone,
            lastUserMessage: body,
            imageAnalysis: null,
            resolutionAttempts,
            resolutionProblemText,
            resolutionPrevSolutions,
          })
          return buildOutput({
            reply_text: buildResolutionExhaustedReply(queueName) + suffix,
            triage_completed: true,
            queue_id: queueId,
            reason: "resolution_exhausted",
            agent_handoff_summary,
            menu_invalid_attempts: menuInvalidAttempts,
            investigation_adequate_rounds: investigationAdequateRounds,
            investigation_inadequate_streak: 0,
            resolution_active: false,
            resolution_attempts: resolutionAttempts,
          })
        }

        // Nova tentativa de solução
        const novaSolucao = await gerarSolucaoAutonoma({
          problemText: resolutionProblemText || body,
          queueName,
          attemptNumber: nextAttempt,
          previousSolutions: resolutionPrevSolutions,
        })
        const novaPrevSolutions = JSON.stringify([...resolutionPrevSolutions, novaSolucao.slice(0, 300)])

        return buildOutput({
          reply_text: novaSolucao + suffix,
          triage_completed: false,
          queue_id: queueId,
          reason: `resolution_attempt_${nextAttempt}`,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
          resolution_active: true,
          resolution_attempts: nextAttempt,
          resolution_problem_text: resolutionProblemText,
          resolution_prev_solutions: novaPrevSolutions,
        })
      }

      // Resposta ambígua (unclear) → pede confirmação sem gastar tentativa
      return buildOutput({
        reply_text: buildResolutionUnclearReply(resolutionAttempts, MAX_AI_RESOLUTION_ATTEMPTS) + suffix,
        triage_completed: false,
        queue_id: queueId,
        reason: "resolution_awaiting_confirmation",
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: investigationAdequateRounds,
        investigation_inadequate_streak: 0,
        resolution_active: true,
        resolution_attempts: resolutionAttempts,
        resolution_problem_text: resolutionProblemText,
        resolution_prev_solutions: JSON.stringify(resolutionPrevSolutions),
      })
    }

    // ── FASE DE INVESTIGAÇÃO ──────────────────────────────────────────────

    // Limite de mensagens sem evidência suficiente
    if (
      investigationMessagesSeen !== null &&
      investigationMessagesSeen >= INVESTIGATION_MAX_INBOUND_WITHOUT_HANDOFF &&
      investigationAdequateRounds < INVESTIGATION_REQUIRED_ADEQUATE_ROUNDS
    ) {
      const agent_handoff_summary = await buildAgentHandoffSummary({
        kind: "investigation_exhausted_inbound",
        queueName,
        clienteNome: input.cliente.nome,
        clienteTelefone: input.cliente.telefone,
        lastUserMessage: body,
        imageAnalysis: null,
      })
      return buildOutput({
        reply_text:
          `Recebemos várias mensagens, mas ainda sem evidências técnicas suficientes para *${queueName}*, ` +
          "como erro exibido na tela, print do sistema ou foto do equipamento. " +
          "Seu atendimento seguirá com o time responsável por essa fila." + suffix,
        triage_completed: true,
        queue_id: queueId,
        reason: "investigation_exhausted_no_evidence",
        agent_handoff_summary,
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: investigationAdequateRounds,
        investigation_inadequate_streak: 0,
      })
    }

    const bodyForPipeline =
      body || (isLikelyImagePayload(mediaUrl, mimeType) ? "[imagem sem legenda]" : "")

    // Acumula texto do problema para a fase de resolução posterior
    const updatedProblemText = accumulateProblemText(resolutionProblemText, bodyForPipeline)

    let vision: string | null = null
    if (mediaUrl && isLikelyImagePayload(mediaUrl, mimeType)) {
      vision = await analyzeImageForSupport({
        mediaUrl,
        mimeType,
        inboundBody: bodyForPipeline,
        demandCategory: queueName,
      })
    }

    const evalResult = (await evaluateInvestigationTurn({
      queueName,
      userText: body,
      imageAnalysis: vision,
    })) as InvestigationEvalResult

    // Evidência insuficiente / fora do tema
    if (evalResult.nivel !== "adequado") {
      const nextInadequateStreak = investigationInadequateStreak + 1
      const clientDifficulty = isClientReportingDifficulty(body)

      if (clientDifficulty || nextInadequateStreak >= INVESTIGATION_MAX_INADEQUATE_BEFORE_HANDOFF) {
        const agent_handoff_summary = await buildAgentHandoffSummary({
          kind: "investigation_client_unclear",
          queueName,
          clienteNome: input.cliente.nome,
          clienteTelefone: input.cliente.telefone,
          lastUserMessage: body,
          imageAnalysis: vision,
          evalNivel: evalResult.nivel,
          evalMotivoCurto: evalResult.motivoCurto,
        })
        const clientMsg = clientDifficulty
          ? `Entendi. Como você não consegue enviar todos os detalhes agora, seu atendimento seguirá com o time responsável pela fila *${queueName}*, que continuará por aqui.`
          : `Ainda não consegui fechar o contexto técnico da demanda de *${queueName}* com segurança. Seu atendimento seguirá com o time responsável, que dará continuidade por aqui.`
        return buildOutput({
          reply_text: clientMsg + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: clientDifficulty ? "investigation_client_difficulty" : "investigation_failed_clarification",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
        })
      }

      return buildOutput({
        reply_text: evalResult.textoResposta + suffix,
        triage_completed: false,
        queue_id: queueId,
        reason: evalResult.nivel === "fora_do_tema" ? "investigation_off_topic" : "investigation_insufficient_evidence",
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: investigationAdequateRounds,
        investigation_inadequate_streak: nextInadequateStreak,
        resolution_problem_text: updatedProblemText,
      })
    }

    // Evidência adequada
    const nextAdequateRounds = investigationAdequateRounds + 1

    // Completou investigação → ENTRA NA FASE DE RESOLUÇÃO AUTÔNOMA
    if (nextAdequateRounds >= INVESTIGATION_REQUIRED_ADEQUATE_ROUNDS) {
      const problemTextFinal = updatedProblemText || body

      const primeiraSolucao = await gerarSolucaoAutonoma({
        problemText: problemTextFinal,
        queueName,
        attemptNumber: 1,
        previousSolutions: [],
      })

      return buildOutput({
        reply_text: primeiraSolucao + suffix,
        triage_completed: false,
        queue_id: queueId,
        reason: "resolution_attempt_1",
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: nextAdequateRounds,
        investigation_inadequate_streak: 0,
        resolution_active: true,
        resolution_attempts: 1,
        resolution_problem_text: problemTextFinal,
        resolution_prev_solutions: JSON.stringify([primeiraSolucao.slice(0, 300)]),
      })
    }

    // Primeira rodada adequada — pede mais contexto para fortalecer a resolução
    const reply = vision
      ? `${vision}\n\n_Se puder, envie mais um detalhe objetivo, como a mensagem exata da tela, o nome da rotina ou outro print relacionado._`
      : buildFollowUpAfterAdequate({ body, queueName, adequateRounds: investigationAdequateRounds })

    return buildOutput({
      reply_text: reply + suffix,
      triage_completed: false,
      queue_id: queueId,
      reason: "investigation_round",
      menu_invalid_attempts: menuInvalidAttempts,
      investigation_adequate_rounds: nextAdequateRounds,
      investigation_inadequate_streak: 0,
      resolution_problem_text: updatedProblemText,
    })
  }

  // ── Sem filas disponíveis ─────────────────────────────────────────────────
  if (qlist.length === 0) {
    const agent_handoff_summary = await buildAgentHandoffSummary({
      kind: "no_queues",
      queueName: null,
      clienteNome: input.cliente.nome,
      clienteTelefone: input.cliente.telefone,
      lastUserMessage: body,
      imageAnalysis: null,
    })
    return buildOutput({
      reply_text: buildTriageNoQueues() + suffix,
      triage_completed: true,
      queue_id: null,
      reason: "no_queues",
      agent_handoff_summary,
      menu_invalid_attempts: menuInvalidAttempts,
      investigation_adequate_rounds: 0,
      investigation_inadequate_streak: 0,
    })
  }

  // ── Seleção de fila por número ────────────────────────────────────────────
  const selected = Number.parseInt(body, 10)
  const queue = qlist.find((q) => Number(q.menu_option) === selected)
  if (Number.isInteger(selected) && queue) {
    return buildOutput({
      reply_text: buildInvestigationPrompt(queue.name) + suffix,
      triage_completed: false,
      queue_id: String(queue.id),
      reason: "queue_selected",
      menu_invalid_attempts: 0,
      investigation_adequate_rounds: 0,
      investigation_inadequate_streak: 0,
    })
  }

  // ── Seleção automática por texto livre (sem exigir número) ───────────────
  const freeTextChoice = inferQueueFromFreeText(qlist, body)
  if (freeTextChoice.queueId) {
    const autoQueue = qlist.find((q) => String(q.id) === freeTextChoice.queueId)
    if (autoQueue) {
      return buildOutput({
        reply_text: buildInvestigationPrompt(autoQueue.name) + suffix,
        triage_completed: false,
        queue_id: String(autoQueue.id),
        reason: "queue_auto_classified",
        menu_invalid_attempts: 0,
        investigation_adequate_rounds: 0,
        investigation_inadequate_streak: 0,
      })
    }
  }
  const aiChoice = await inferQueueFromAI(qlist, body)
  if (aiChoice.queueId && aiChoice.confidence >= 0.65) {
    const aiQueue = qlist.find((q) => String(q.id) === aiChoice.queueId)
    if (aiQueue) {
      return buildOutput({
        reply_text: buildInvestigationPrompt(aiQueue.name) + suffix,
        triage_completed: false,
        queue_id: String(aiQueue.id),
        reason: "queue_auto_classified_ai",
        menu_invalid_attempts: 0,
        investigation_adequate_rounds: 0,
        investigation_inadequate_streak: 0,
      })
    }
  }

  // ── Sem classificação segura: pedir contexto mínimo (sem menu de opções) ─
  const messageHasIntent = hasMeaningfulFreeText(body)
  if (messageHasIntent) {
    return buildOutput({
      reply_text:
        "Não consegui classificar com segurança ainda. Me envie em 1 frase: o que estava fazendo + erro exato na tela." +
        suffix,
      triage_completed: false,
      queue_id: null,
      reason: "menu_needs_clarification",
      menu_invalid_attempts: menuInvalidAttempts,
      investigation_adequate_rounds: 0,
      investigation_inadequate_streak: 0,
    })
  }

  const greeting = getGreetingByBrasiliaTime()
  const nome = normalizeText(input.cliente.nome)
  const saudacao = nome ? `${greeting}, ${nome}!` : `${greeting}!`
  return buildOutput({
    reply_text:
      `${saudacao}\n` +
      "Para te direcionar com precisão, descreva em 1 frase o problema e, se tiver, o erro exato da tela." +
      suffix,
    triage_completed: false,
    queue_id: null,
    reason: "awaiting_problem_statement",
    menu_invalid_attempts: menuInvalidAttempts,
    investigation_adequate_rounds: 0,
    investigation_inadequate_streak: 0,
  })
}

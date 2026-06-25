import { buildAgentHandoffSummary } from "@/lib/handoff-agent-summary"
import { analyzeImageForSupport } from "@/lib/image-vision"
import {
  evaluateInvestigationTurn,
  gerarRespostaConversacional,
  gerarPrimerInvestigacao,
} from "@/lib/investigation-quality"
import { gerarTextoIARapido } from "@/lib/ai-provider"
import { isLikelyImagePayload } from "@/lib/vision-utils"
import {
  gerarSolucaoAutonoma,
  detectResolutionOutcome,
  buildResolutionSuccessReply,
  buildResolutionExhaustedReply,
  buildResolutionUnclearReply,
  getResolutionParams,
  isInsufficientContext,
} from "@/lib/resolution-engine"
import { isEscalationSignal } from "@/lib/escalation-detector"
import { getAgentParams } from "@/lib/agent-config"
import { listActiveOrgs, loadOrgConfig, type OrgConfig } from "@/lib/org-loader"

// ─── Constantes de controle (fallback estático) ────────────────────────────────
// Os valores reais são carregados em runtime via getOrchestratorParams().

/** Rodadas de evidência adequada necessárias antes de tentar resolver. */
export const INVESTIGATION_REQUIRED_ADEQUATE_ROUNDS = 1

/** Sequência de respostas inadequadas/fora do tema que dispara handoff direto. */
export const INVESTIGATION_MAX_INADEQUATE_BEFORE_HANDOFF = 2

/** Limite de mensagens inbound totais sem evidência suficiente (evita loop). */
export const INVESTIGATION_MAX_INBOUND_WITHOUT_HANDOFF = 14

/** Tentativas inválidas no menu antes do handoff humano. */
export const MENU_MAX_INVALID_ATTEMPTS = 3

/** Carrega parâmetros configuráveis do orquestrador para o tenant. */
async function getOrchestratorParams(tenantId = "default") {
  return getAgentParams("orchestrator", tenantId)
}

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
  /** Última resposta enviada pela IA — usado para evitar repetição de perguntas. */
  last_ai_reply?: string

  // ── Fase de seleção de empresa ──────────────────────────────────────────
  /** 'pending' = aguardando escolha; 'selected' = empresa escolhida. */
  company_selection_phase?: "pending" | "selected"
  /** tenant_id resolvido durante a seleção de empresa. */
  selected_tenant_id?: string | null
  /** Tentativas inválidas de seleção de empresa. */
  company_selection_invalid_attempts?: number
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
  /** Org config pré-carregada. null = org desconhecida, dispara seleção de empresa. */
  orgConfig?: OrgConfig | null
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
  last_ai_reply?: string

  // Fase de seleção de empresa
  company_selection_phase?: "pending" | "selected"
  selected_tenant_id?: string | null
  company_selection_invalid_attempts?: number
}

type InvestigationEvalResult = {
  nivel: "adequado" | "insuficiente" | "fora_do_tema" | "topico_alterado"
  motivoCurto: string
  textoResposta: string
}

const WHATSAPP_REPLY_MAX_CHARS = 4096
const BRAND_HEADER = "*Mavo AI*"

// ─── Utilitários ───────────────────────────────────────────────────────────────

/** Minimum chars in a free-text message to skip investigation and resolve directly. */
const FAST_PATH_MIN_CHARS = 35

/**
 * Returns true if the message contains technical support indicators.
 * Keeps non-technical messages (greetings, tests) from triggering investigation.
 */
function isTechnicalQuery(text: string): boolean {
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
  const signals = [
    "erro", "error", "problema", "falha", "nao funciona", "não funciona",
    "imprimindo", "imprime", "auge", "erp", "nota", "nfe", "nf-e", "nfce", "nfc-e", "fiscal",
    "sistema", "tela", "modulo", "rotina", "banco", "caixa", "venda",
    "impressora", "balanca", "leitor", "scanner", "tef", "pix", "boleto",
    "certificado", "sefaz", "xml", "produto", "estoque", "travou", "lento",
    "conexao", "driver", "instalar", "atualizar", "configurar", "acesso",
    "nao abre", "nao carrega", "nao entra", "nao gera", "nao emite",
    "nao imprime", "nao comunica", "sem comunicacao", "sem resposta",
    "parou", "caiu", "desconectou", "timeout", "senha", "login",
    "devolucao", "devolução", "troca", "gerar", "emitir", "cadastrar",
    "como faco", "como faço", "passo a passo", "tutorial", "procedimento",
    "sped", "speed", "efd", "ecf", "apuracao", "apuração", "livro fiscal",
    "registro de entradas", "registro de saidas", "registro de saídas",
    // fiscal ERP
    "rejeicao", "rejeitada", "rejeicoes", "ncm", "cfop", "cst", "csosn", "danfe",
    "danf-e", "carta de correcao", "cce", "contingencia", "sat fiscal",
    "nf entrada", "nf de entrada", "nota de entrada", "nota fiscal",
    "pis", "cofins", "icms", "ipi", "iss", "ie inscricao", "inscricao estadual",
    // tef / pagamentos
    "pinpad", "pin pad", "sitef", "clisitef", "cartao", "cartão", "adquirente",
    "cielo", "stone", "rede", "getnet", "voucher", "vale refeicao", "vale-refeicao",
    "transacao", "transação", "estorno", "cancelamento", "maquininha",
    // pdv / caixa
    "pdv", "ponto de venda", "cupom", "codigo de barras", "ean", "barras",
    "fechamento de caixa", "sangria", "suprimento", "crediario", "crediário",
    // estoque / compras
    "custo medio", "custo médio", "inventario", "inventário", "ressuprimento",
    "transferencia de estoque", "grade de produto", "variacao", "variação",
    "codigo de barras duplicado", "ean duplicado",
    // hardware
    "sat", "nobreak", "ups", "gaveta", "guilhotina", "touchscreen", "monitor touch",
    "etiqueta", "argox", "zebra", "cmos", "bios",
    // integração
    "concentrador", "sincronizacao", "sincronização", "webhook", "api",
    "marketplace", "certificado a3", "mdf-e", "mdfe", "ct-e", "cte",
    "replicacao", "replicação", "slot de replicacao",
  ]
  return signals.some((s) => t.includes(s))
}

/** Detecta quando o cliente pede explicitamente um passo a passo ou procedimento. */
function isDirectProcedureRequest(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  return [
    "passo a passo", "passo-a-passo",
    "como gerar", "como emitir", "como fazer", "como faco", "como eu faco", "como eu fazer",
    "como configurar", "como funciona", "como se faz", "como e feito", "como e para fazer",
    "me explica", "me ensina", "me mostra", "me fala como", "me diz como",
    "me passa o passo", "me passa o procedimento",
    "instrucao", "instrucoes", "tutorial", "procedimento",
    "qual o processo", "qual e o processo", "qual o caminho",
    "quero gerar", "quero emitir", "quero fazer", "quero saber como",
    "preciso gerar", "preciso emitir", "preciso fazer",
  ].some((p) => t.includes(p))
}

/**
 * Extracts the primary identifying terms from a queue name.
 * Used to penalise queues whose key term doesn't appear in the user message.
 */
function extractPrimaryQueueTerms(queueName: string): string[] {
  const stopWords = new Set([
    "de", "da", "do", "dos", "das", "e", "ou", "em", "no", "na",
    "suporte", "atendimento", "fila", "geral", "mgv", "mavo",
    "gestao", "gestão", "erp", "auge", "ti",
  ])
  return queueName
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !stopWords.has(w))
}

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

  // Penalise when the queue's primary identifying term is absent from the user text.
  // Prevents "Balança" queue from capturing "impressora" queries via shared intent keywords.
  const primaryTerms = extractPrimaryQueueTerms(queue.name)
  if (primaryTerms.length > 0) {
    const hasPrimaryTerm = primaryTerms.some((term) => text.includes(term))
    if (!hasPrimaryTerm) score -= 3
  }

  return Math.max(0, score)
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
    "Contexto principal: atendimento de clientes no Brasil. " +
    "Escolha apenas 1 fila com base no texto do cliente. " +
    "Responda somente JSON válido: {\"queue_id\":\"...|null\",\"confidence\":0.0}. " +
    "Se estiver ambíguo, retorne queue_id null. Não invente IDs."
  const userPrompt =
    `texto_cliente: ${inputText}\n` +
    `filas_disponiveis: ${JSON.stringify(options)}\n` +
    "Retorne só JSON."

  try {
    // Classificação de fila (JSON) → modelo rápido/barato.
    const raw = await gerarTextoIARapido(systemPrompt, userPrompt)
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

/**
 * Detecta quando o cliente está mudando de assunto explicitamente.
 * Ex: "na verdade é um erro no concentrador", "errei, é sobre TEF"
 */
function detectsTopicChange(text: string): boolean {
  const t = normalizeTextLower(text).normalize("NFD").replace(/\p{Diacritic}/gu, "")
  const patterns = [
    "na verdade", "mas na verdade", "na real",
    "era outro", "e outro", "outro problema",
    "me enganei", "me equivoquei", "errei",
    "esquece", "esquece isso", "esquece a",
    "nao era isso", "nao e isso", "nao e esse",
    "o problema e no", "o erro e no", "e sobre",
    "mudou o problema", "e no concentrador", "e no tef",
    "e no fiscal", "e no pdv", "e no estoque",
    "e no sistema", "e em outro", "e em outro modulo",
  ]
  return patterns.some((p) => t.includes(p))
}

/**
 * Remove conteúdo citado/copiado de mensagens do WhatsApp.
 * Mensagens citadas aparecem após "> " ou são textos copiados que começam com identificador de outra pessoa.
 */
function stripForwardedContent(text: string): string {
  if (!text) return text
  const lines = text.split("\n")
  // Remove linhas que começam com ">" (citação WhatsApp)
  const filtered = lines.filter((l) => !l.trim().startsWith(">"))
  const result = filtered.join("\n").trim()
  // Se removeu mais de 60% do texto, provavelmente era mensagem copiada completa — usa original
  return result.length > text.length * 0.4 ? result : text
}

/** Detecta quando o cliente está frustrado com a resposta da IA ou pedindo mais informação. */
function isClientFrustrated(inputText: string): boolean {
  const t = normalizeTextLower(inputText).normalize("NFD").replace(/\p{Diacritic}/gu, "")
  const signals = [
    "pouca informacao", "informacao incompleta", "incompleto", "ta incompleto",
    "cortou", "cortou a mensagem", "nao entendi", "nao ficou claro", "mal explicado",
    "nao deu para entender", "resposta curta", "pouca coisa", "so isso",
    "isso nao ajuda", "nao ajudou", "nao era isso", "nao e isso",
    "ta errado", "errou", "errada", "errado", "nao serve",
    "nao adiantou", "sem sentido", "nao faz sentido",
    "isso nao resolve", "nao resolveu nada",
    "ta dando pouca", "dando pouca", "muito pouco", "pouco demais",
    "nao ta certo", "que resposta e essa", "que resposta essa",
    "nao gostei", "pessimo", "horrivel", "otimo nao", "que isso",
    "que isso mano", "que isso cara",
  ]
  return signals.some((s) => t.includes(s))
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
  const { body } = params
  const quick = buildQuickGuidance(body)
  if (quick) return quick
  return "Entendido. Qual mensagem de erro aparece na tela?"
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
  const lastAiReply = normalizeText(conversation.last_ai_reply)

  const companySelectionPhase = conversation.company_selection_phase ?? null
  const selectedTenantId = conversation.selected_tenant_id ?? null
  const companySelectionInvalidAttempts =
    typeof conversation.company_selection_invalid_attempts === "number" &&
    Number.isFinite(conversation.company_selection_invalid_attempts)
      ? conversation.company_selection_invalid_attempts
      : 0

  return {
    menuInvalidAttempts,
    investigationAdequateRounds,
    investigationInadequateStreak,
    investigationMessagesSeen,
    resolutionActive,
    resolutionAttempts,
    resolutionProblemText,
    resolutionPrevSolutions,
    lastAiReply,
    companySelectionPhase,
    selectedTenantId,
    companySelectionInvalidAttempts,
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
  company_selection_phase?: "pending" | "selected"
  selected_tenant_id?: string | null
  company_selection_invalid_attempts?: number
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
    last_ai_reply: cleanReplyText,
    company_selection_phase: params.company_selection_phase,
    selected_tenant_id: params.selected_tenant_id ?? null,
    company_selection_invalid_attempts: params.company_selection_invalid_attempts ?? 0,
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
    .trim()

  if (text.length <= WHATSAPP_REPLY_MAX_CHARS) return text

  // Acima do limite: corta em parágrafo completo para não truncar passos no meio
  const hardLimit = text.slice(0, WHATSAPP_REPLY_MAX_CHARS)
  const lastNewline = hardLimit.lastIndexOf("\n\n")
  if (lastNewline >= 200) return hardLimit.slice(0, lastNewline).trim()
  const lastPunct = Math.max(hardLimit.lastIndexOf("."), hardLimit.lastIndexOf("!"), hardLimit.lastIndexOf("?"))
  if (lastPunct >= 200) return hardLimit.slice(0, lastPunct + 1).trim()
  return hardLimit.trim()
}

/** Acumula texto do problema para uso na fase de resolução. */
function accumulateProblemText(existing: string, newText: string): string {
  if (!newText.trim()) return existing
  if (!existing.trim()) return newText.trim()
  return `${existing} | ${newText.trim()}`
}

// ─── Fast-path helper ─────────────────────────────────────────────────────────

/**
 * When a queue is auto-classified from a message that already describes the
 * problem clearly (long enough + technical content), skip the investigation
 * prompt and go directly to resolution attempt 1.
 *
 * Returns the output to send, or null to fall back to buildInvestigationPrompt.
 */
async function tryFastPath(params: {
  body: string
  queue: OrchestratorQueue
  baseReason: string
  suffix: string
  menuInvalidAttempts: number
  tenantId?: string
  orgConfig?: OrgConfig | null
}): Promise<PlatformOrchestratorOutput | null> {
  const { body, queue, baseReason, suffix, menuInvalidAttempts, tenantId, orgConfig } = params
  const isProcedure = isDirectProcedureRequest(body)
  if (!isProcedure && (body.length < FAST_PATH_MIN_CHARS || !isTechnicalQuery(body))) return null

  let primeiraSolucao: string
  try {
    primeiraSolucao = await gerarSolucaoAutonoma({
      problemText: body,
      queueName: queue.name,
      attemptNumber: 1,
      previousSolutions: [],
      tenantId,
      orgConfig,
    })
  } catch {
    return null // IA indisponível — cai para investigação normal
  }

  // Sem contexto suficiente → não arrisca alucinação, cai para investigação
  if (isInsufficientContext(primeiraSolucao)) return null

  return buildOutput({
    reply_text: primeiraSolucao + suffix,
    triage_completed: false,
    queue_id: String(queue.id),
    reason: `${baseReason}_fast_resolution`,
    menu_invalid_attempts: menuInvalidAttempts,
    investigation_adequate_rounds: 1,
    investigation_inadequate_streak: 0,
    resolution_active: true,
    resolution_attempts: 1,
    resolution_problem_text: body,
    resolution_prev_solutions: JSON.stringify([primeiraSolucao.slice(0, 300)]),
  })
}

// ─── Orquestrador principal ────────────────────────────────────────────────────

/**
 * Orquestrador multi-plataforma.
 * Fluxo: menu → triagem → investigação → resolução autônoma (3x) → handoff humano.
 */
export async function runPlatformOrchestrator(
  input: PlatformOrchestratorInput,
): Promise<PlatformOrchestratorOutput> {
  // Carrega parâmetros configuráveis (banco ou defaults) — fail-safe
  const tenantForConfig = input.organization_id ?? "default"
  const [orchParams, resolutionParams] = await Promise.all([
    getOrchestratorParams(tenantForConfig),
    getResolutionParams(tenantForConfig),
  ])

  // Usa parâmetros configuráveis (sobrescrevem as constantes estáticas)
  const CFG_FAST_PATH_MIN_CHARS           = orchParams.fast_path_min_chars
  const CFG_INVEST_REQUIRED_ROUNDS        = orchParams.investigation_required_adequate_rounds
  const CFG_INVEST_MAX_INADEQUATE         = orchParams.investigation_max_inadequate_before_handoff
  const CFG_INVEST_MAX_INBOUND            = orchParams.investigation_max_inbound_without_handoff
  const CFG_MENU_MAX_INVALID              = orchParams.menu_max_invalid_attempts
  const CFG_MAX_AI_RESOLUTION_ATTEMPTS    = resolutionParams.max_attempts

  const qlist = input.queues.filter((q) => q.is_active !== false)
  const suffix = buildOutOfHoursSuffix(input.business_hours_open)
  // Filtra conteúdo copiado/citado do WhatsApp antes de processar
  const body = stripForwardedContent(normalizeText(input.mensagem))
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
    lastAiReply,
    companySelectionPhase,
    selectedTenantId,
    companySelectionInvalidAttempts,
  } = getConversationCounters(input.conversation)

  // ── Resolve tenantId e orgConfig efetivos ────────────────────────────────
  let resolvedOrgConfig: OrgConfig | null = input.orgConfig ?? null
  let resolvedTenantId: string =
    selectedTenantId ?? resolvedOrgConfig?.id ?? input.organization_id ?? "auge"

  // ── Fase de seleção de empresa ────────────────────────────────────────────
  // Dispara quando não há orgConfig conhecida E a empresa ainda não foi selecionada
  if (!resolvedOrgConfig && !selectedTenantId) {
    const orgs = await listActiveOrgs()

    if (orgs.length === 0) {
      return buildOutput({
        reply_text: "Nenhuma empresa configurada no sistema. Contate o administrador.",
        triage_completed: true,
        queue_id: null,
        reason: "no_orgs_configured",
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: investigationAdequateRounds,
        investigation_inadequate_streak: 0,
      })
    }

    if (orgs.length === 1) {
      // Auto-seleciona sem perguntar
      resolvedOrgConfig = orgs[0]
      resolvedTenantId = orgs[0].id
      // Continua o fluxo normal com a org auto-selecionada
    } else if (companySelectionPhase === "pending") {
      // Tenta fazer o match da resposta do usuário com uma empresa
      const bodyNorm = body.trim()
      const num = Number.parseInt(bodyNorm, 10)
      const matchedByNumber = Number.isInteger(num) && num >= 1 && num <= orgs.length
        ? orgs[num - 1]
        : null
      const matchedByName = !matchedByNumber
        ? orgs.find((o) =>
            bodyNorm.toLowerCase().includes(o.display_name.toLowerCase()) ||
            bodyNorm.toLowerCase().includes(o.id.toLowerCase()),
          )
        : null
      const matched = matchedByNumber ?? matchedByName

      if (matched) {
        resolvedOrgConfig = matched
        resolvedTenantId = matched.id
        // Carrega do banco para garantir frescor (e popular o cache)
        const freshConfig = await loadOrgConfig(matched.id)
        if (freshConfig) resolvedOrgConfig = freshConfig
        // Continua o fluxo normal com a empresa selecionada
      } else {
        // Seleção inválida
        const nextInvalidAttempts = companySelectionInvalidAttempts + 1
        if (nextInvalidAttempts >= 3) {
          return buildOutput({
            reply_text: "Não consegui identificar sua empresa. Um atendente continuará por aqui.",
            triage_completed: true,
            queue_id: null,
            reason: "company_selection_failed",
            menu_invalid_attempts: menuInvalidAttempts,
            investigation_adequate_rounds: 0,
            investigation_inadequate_streak: 0,
            company_selection_phase: "pending",
            company_selection_invalid_attempts: nextInvalidAttempts,
          })
        }
        const lista = orgs.map((o, i) => `${i + 1}. ${o.display_name}`).join("\n")
        return buildOutput({
          reply_text: `Não entendi. Digite o número da sua empresa:\n\n${lista}`,
          triage_completed: false,
          queue_id: null,
          reason: "company_selection_invalid_attempt",
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: 0,
          investigation_inadequate_streak: 0,
          company_selection_phase: "pending",
          company_selection_invalid_attempts: nextInvalidAttempts,
        })
      }
    } else {
      // Primeira mensagem sem empresa definida — apresenta lista
      const greeting = getGreetingByBrasiliaTime()
      const nome = normalizeText(input.cliente.nome)
      const saudacao = nome ? `${greeting}, ${nome}!` : `${greeting}!`
      const lista = orgs.map((o, i) => `${i + 1}. ${o.display_name}`).join("\n")
      return buildOutput({
        reply_text: `${saudacao}\n\nPara te ajudar melhor, informe o número da sua empresa:\n\n${lista}\n\nDigite apenas o número.`,
        triage_completed: false,
        queue_id: null,
        reason: "company_selection_presented",
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: 0,
        investigation_inadequate_streak: 0,
        company_selection_phase: "pending",
        company_selection_invalid_attempts: 0,
      })
    }
  }

  const persistedOrgState = {
    company_selection_phase: (resolvedOrgConfig ? "selected" : undefined) as "selected" | undefined,
    // Sempre persiste o tenant resolvido — inclusive "auge" — para não repetir a seleção.
    selected_tenant_id: resolvedOrgConfig ? resolvedTenantId : null,
    company_selection_invalid_attempts: companySelectionInvalidAttempts,
  }

  // ── Pós-triagem ───────────────────────────────────────────────────────────
  if (triageCompleted) {
    // Se o cliente faz uma nova pergunta técnica ou pede passo a passo após o handoff,
    // responde diretamente em vez de repetir o ACK de atendente.
    if (queueId && (isDirectProcedureRequest(body) || (isTechnicalQuery(body) && body.length >= CFG_FAST_PATH_MIN_CHARS))) {
      const currentQueue = qlist.find((q) => String(q.id) === queueId)
      if (currentQueue) {
        try {
          const resposta = await gerarSolucaoAutonoma({
            problemText: body,
            queueName: currentQueue.name,
            attemptNumber: 1,
            previousSolutions: [],
            tenantId: resolvedTenantId,
            orgConfig: resolvedOrgConfig,
          })
          // Sem contexto → cai para ACK de atendente humano
          if (isInsufficientContext(resposta)) throw new Error("insufficient_context")
          return buildOutput({
            reply_text: resposta + suffix,
            triage_completed: true,
            queue_id: queueId,
            reason: "post_triage_followup_answered",
            menu_invalid_attempts: menuInvalidAttempts,
            investigation_adequate_rounds: investigationAdequateRounds,
            investigation_inadequate_streak: 0,
            ...persistedOrgState,
          })
        } catch {
          // IA indisponível — cai para ACK
        }
      }
    }

    // ACK de handoff — evita repetir se já foi enviado antes
    const ackAlreadySent = lastAiReply.length > 10 && lastAiReply.includes("atendente")
    return buildOutput({
      reply_text: (ackAlreadySent
        ? "Um atendente responderá em breve." + suffix
        : buildPostTriageClientAck() + suffix),
      triage_completed: true,
      queue_id: queueId,
      reason: "post_triage_ack",
      menu_invalid_attempts: menuInvalidAttempts,
      investigation_adequate_rounds: investigationAdequateRounds,
      investigation_inadequate_streak: 0,
      ...persistedOrgState,
    })
  }

  // ── Fila já selecionada ───────────────────────────────────────────────────
  if (queueId) {
    const currentQueue = qlist.find((q) => String(q.id) === queueId)
    const queueName = currentQueue?.name || "Suporte"

    // ── FASE DE RESOLUÇÃO AUTÔNOMA ────────────────────────────────────────
    if (resolutionActive) {
      const outcome = detectResolutionOutcome(body)

      // Frustração com a resposta da IA → escalada imediata sem gastar tentativa
      if (isClientFrustrated(body) && outcome !== "resolved") {
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
            `Entendido. Vou passar agora para um técnico especializado continuar seu atendimento de *${queueName}*. ` +
            "Todas as informações já foram registradas." + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: "resolution_client_frustrated",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
          resolution_active: false,
          resolution_attempts: resolutionAttempts,
        })
      }

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
        if (nextAttempt > CFG_MAX_AI_RESOLUTION_ATTEMPTS) {
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
          tenantId: resolvedTenantId,
          orgConfig: resolvedOrgConfig,
        })

        // Sem contexto suficiente → escala para humano em vez de alucinar
        if (isInsufficientContext(novaSolucao)) {
          const agent_handoff_summary = await buildAgentHandoffSummary({
            kind: "resolution_exhausted",
            queueName,
            clienteNome: input.cliente.nome,
            clienteTelefone: input.cliente.telefone,
            lastUserMessage: body,
            imageAnalysis: null,
            resolutionAttempts: nextAttempt,
            resolutionProblemText: resolutionProblemText || body,
            resolutionPrevSolutions,
          })
          return buildOutput({
            reply_text: buildResolutionExhaustedReply(queueName) + suffix,
            triage_completed: true,
            queue_id: queueId,
            reason: "resolution_insufficient_context",
            agent_handoff_summary,
            menu_invalid_attempts: menuInvalidAttempts,
            investigation_adequate_rounds: investigationAdequateRounds,
            investigation_inadequate_streak: 0,
            resolution_active: false,
            resolution_attempts: nextAttempt,
          })
        }

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
        reply_text: buildResolutionUnclearReply(resolutionAttempts, CFG_MAX_AI_RESOLUTION_ATTEMPTS) + suffix,
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

    // ── RESOLUÇÃO ANTECIPADA — cliente resolveu sozinho durante a investigação ──
    // Detecta antes do eval para não perguntar por evidência quando o chamado já foi encerrado.
    if (!resolutionActive) {
      const earlyOutcome = detectResolutionOutcome(body)
      if (earlyOutcome === "resolved") {
        const agent_handoff_summary = await buildAgentHandoffSummary({
          kind: "resolution_success",
          queueName,
          clienteNome: input.cliente.nome,
          clienteTelefone: input.cliente.telefone,
          lastUserMessage: body,
          imageAnalysis: null,
          resolutionAttempts: 0,
          resolutionProblemText: resolutionProblemText || body,
        })
        return buildOutput({
          reply_text: buildResolutionSuccessReply(input.cliente.nome) + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: "resolved_by_client_self_service",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
          resolution_active: false,
          resolution_attempts: 0,
          ...persistedOrgState,
        })
      }
      if (earlyOutcome === "needs_human") {
        const agent_handoff_summary = await buildAgentHandoffSummary({
          kind: "resolution_client_requested_human",
          queueName,
          clienteNome: input.cliente.nome,
          clienteTelefone: input.cliente.telefone,
          lastUserMessage: body,
          imageAnalysis: null,
          resolutionAttempts: 0,
          resolutionProblemText: resolutionProblemText || body,
        })
        return buildOutput({
          reply_text:
            `Claro. Estou transferindo seu atendimento de *${queueName}* para um técnico agora.\n\n` +
            "Todas as informações já foram registradas para agilizar o atendimento." + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: "investigation_client_requested_human",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
          resolution_active: false,
          resolution_attempts: 0,
          ...persistedOrgState,
        })
      }
    }

    // ── FASE DE INVESTIGAÇÃO ──────────────────────────────────────────────

    // ── Detecção de troca de assunto ─────────────────────────────────────
    // Funciona em QUALQUER fase da investigação (não só na primeira rodada)
    if (detectsTopicChange(body)) {
      const newChoice = inferQueueFromFreeText(qlist, body)
      const newAiChoice = newChoice.queueId
        ? null
        : await inferQueueFromAI(qlist, body).catch(() => null)

      const newQueueId = newChoice.queueId ?? newAiChoice?.queueId ?? null
      const newQueue = newQueueId ? qlist.find((q) => String(q.id) === newQueueId) : null

      if (newQueue && newQueue.id !== currentQueue?.id) {
        // Troca de assunto confirmada para uma fila diferente
        const primerMudanca = await gerarPrimerInvestigacao({ queueName: newQueue.name, mensagemOriginal: body, clienteNome: input.cliente.nome })
        return buildOutput({
          reply_text: primerMudanca + suffix,
          triage_completed: false,
          queue_id: String(newQueue.id),
          reason: "topic_changed_retriage",
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: 0,
          investigation_inadequate_streak: 0,
          resolution_problem_text: "",
          ...persistedOrgState,
        })
      }

      // Mesmo assunto mas o cliente está corrigindo o relato — reseta contadores
      return buildOutput({
        reply_text: `Entendido. Sobre o problema no *${queueName}* — me diz o que aparece na tela ou descreve o erro exato.`,
        triage_completed: false,
        queue_id: queueId,
        reason: "topic_clarified",
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: 0,
        investigation_inadequate_streak: 0,
        resolution_problem_text: body,
        ...persistedOrgState,
      })
    }

    // Limite de mensagens sem evidência suficiente
    if (
      investigationMessagesSeen !== null &&
      investigationMessagesSeen >= CFG_INVEST_MAX_INBOUND &&
      investigationAdequateRounds < CFG_INVEST_REQUIRED_ROUNDS
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
      previousContext: updatedProblemText || undefined,
      lastAiQuestion: lastAiReply || undefined,
      inadequateStreak: investigationInadequateStreak,
    })) as InvestigationEvalResult

    // Troca de assunto detectada pelo avaliador LLM → re-triagem
    if (evalResult.nivel === "topico_alterado") {
      const newChoice = inferQueueFromFreeText(qlist, body)
      const newAiChoice = newChoice.queueId
        ? null
        : await inferQueueFromAI(qlist, body).catch(() => null)
      const newQueueId = newChoice.queueId ?? newAiChoice?.queueId ?? null
      const newQueue = newQueueId ? qlist.find((q) => String(q.id) === newQueueId) : null

      if (newQueue && String(newQueue.id) !== queueId) {
        return buildOutput({
          reply_text: buildInvestigationPrompt(newQueue.name) + suffix,
          triage_completed: false,
          queue_id: String(newQueue.id),
          reason: "topic_changed_via_evaluator",
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: 0,
          investigation_inadequate_streak: 0,
          resolution_problem_text: "",
          ...persistedOrgState,
        })
      }
      // Mesmo assunto mas cliente corrigiu — usa textoResposta do avaliador
      return buildOutput({
        reply_text: evalResult.textoResposta + suffix,
        triage_completed: false,
        queue_id: queueId,
        reason: "topic_clarified_via_evaluator",
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: 0,
        investigation_inadequate_streak: 0,
        resolution_problem_text: body,
        ...persistedOrgState,
      })
    }

    // Evidência insuficiente / fora do tema
    if (evalResult.nivel !== "adequado") {
      const nextInadequateStreak = investigationInadequateStreak + 1
      const clientDifficulty = isClientReportingDifficulty(body)
      const clientFrustrated = isClientFrustrated(body)

      if (clientDifficulty || clientFrustrated || nextInadequateStreak >= CFG_INVEST_MAX_INADEQUATE) {
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
        let clientMsg: string
        if (clientFrustrated) {
          clientMsg = `Entendido. Vou encaminhar seu atendimento agora para um técnico que poderá te ajudar melhor com *${queueName}*. Em breve alguém dará continuidade por aqui.`
        } else if (clientDifficulty) {
          clientMsg = `Entendido. Como você não tem acesso às informações agora, um técnico responsável pela fila *${queueName}* continuará por aqui em breve.`
        } else {
          clientMsg = `Ainda não consegui mapear o problema com precisão. Vou encaminhar para um técnico especializado em *${queueName}* dar continuidade por aqui.`
        }
        return buildOutput({
          reply_text: clientMsg + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: clientFrustrated ? "investigation_client_frustrated" : clientDifficulty ? "investigation_client_difficulty" : "investigation_failed_clarification",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: 0,
        })
      }

      const respostaInsuficiente = await gerarRespostaConversacional({
        nivel: evalResult.nivel,
        queueName,
        userText: body,
        imageAnalysis: vision,
        previousContext: updatedProblemText,
        lastAiQuestion: lastAiReply,
        clienteNome: input.cliente.nome,
        inadequateStreak: nextInadequateStreak - 1,
        isClientFrustrated: false,
        isClientDifficulty: false,
      })

      // IA declarou que não sabe → escala para humano imediatamente
      if (isEscalationSignal(respostaInsuficiente)) {
        const agent_handoff_summary = await buildAgentHandoffSummary({
          kind: "investigation_client_unclear",
          queueName,
          clienteNome: input.cliente.nome,
          clienteTelefone: input.cliente.telefone,
          lastUserMessage: body,
          imageAnalysis: vision,
        })
        return buildOutput({
          reply_text: `Vou encaminhar seu atendimento de *${queueName}* para um técnico especializado agora.` + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: "investigation_escalated_no_knowledge",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: investigationAdequateRounds,
          investigation_inadequate_streak: nextInadequateStreak,
          resolution_active: false,
        })
      }

      return buildOutput({
        reply_text: respostaInsuficiente + suffix,
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
    if (nextAdequateRounds >= CFG_INVEST_REQUIRED_ROUNDS) {
      const problemTextFinal = updatedProblemText || body

      const primeiraSolucao = await gerarSolucaoAutonoma({
        problemText: problemTextFinal,
        queueName,
        attemptNumber: 1,
        previousSolutions: [],
        tenantId: resolvedTenantId,
        orgConfig: resolvedOrgConfig,
      })

      // Sem contexto suficiente → escala para humano, não alucina
      if (isInsufficientContext(primeiraSolucao)) {
        const agent_handoff_summary = await buildAgentHandoffSummary({
          kind: "resolution_exhausted",
          queueName,
          clienteNome: input.cliente.nome,
          clienteTelefone: input.cliente.telefone,
          lastUserMessage: body,
          imageAnalysis: null,
          resolutionAttempts: 1,
          resolutionProblemText: problemTextFinal,
          resolutionPrevSolutions: [],
        })
        return buildOutput({
          reply_text: buildResolutionExhaustedReply(queueName) + suffix,
          triage_completed: true,
          queue_id: queueId,
          reason: "resolution_insufficient_context",
          agent_handoff_summary,
          menu_invalid_attempts: menuInvalidAttempts,
          investigation_adequate_rounds: nextAdequateRounds,
          investigation_inadequate_streak: 0,
          resolution_active: false,
          resolution_attempts: 1,
        })
      }

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

    // Primeira rodada adequada — pede mais contexto para completar o diagnóstico
    const replyAdequado = await gerarRespostaConversacional({
      nivel: "adequado",
      queueName,
      userText: body,
      imageAnalysis: vision,
      previousContext: updatedProblemText,
      lastAiQuestion: lastAiReply,
      clienteNome: input.cliente.nome,
      inadequateStreak: 0,
      isClientFrustrated: false,
      isClientDifficulty: false,
    })

    // IA declarou que não sabe → escala em vez de inventar
    if (isEscalationSignal(replyAdequado)) {
      const agent_handoff_summary = await buildAgentHandoffSummary({
        kind: "investigation_client_unclear",
        queueName,
        clienteNome: input.cliente.nome,
        clienteTelefone: input.cliente.telefone,
        lastUserMessage: body,
        imageAnalysis: vision,
      })
      return buildOutput({
        reply_text: `Vou encaminhar seu atendimento de *${queueName}* para um técnico especializado agora.` + suffix,
        triage_completed: true,
        queue_id: queueId,
        reason: "investigation_escalated_no_knowledge",
        agent_handoff_summary,
        menu_invalid_attempts: menuInvalidAttempts,
        investigation_adequate_rounds: nextAdequateRounds,
        investigation_inadequate_streak: 0,
        resolution_active: false,
      })
    }

    return buildOutput({
      reply_text: replyAdequado + suffix,
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
    const primer = await gerarPrimerInvestigacao({
      queueName: queue.name,
      mensagemOriginal: body,
      clienteNome: input.cliente.nome,
    })
    return buildOutput({
      reply_text: primer + suffix,
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
      const fastPath = await tryFastPath({
        body,
        queue: autoQueue,
        baseReason: "queue_auto_classified",
        suffix,
        menuInvalidAttempts: 0,
        tenantId: resolvedTenantId,
        orgConfig: resolvedOrgConfig,
      })
      if (fastPath) return fastPath
      const primer = await gerarPrimerInvestigacao({
        queueName: autoQueue.name,
        mensagemOriginal: body,
        clienteNome: input.cliente.nome,
      })
      return buildOutput({
        reply_text: primer + suffix,
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
      const fastPath = await tryFastPath({
        body,
        queue: aiQueue,
        baseReason: "queue_auto_classified_ai",
        suffix,
        menuInvalidAttempts: 0,
        tenantId: resolvedTenantId,
        orgConfig: resolvedOrgConfig,
      })
      if (fastPath) return fastPath
      const primer = await gerarPrimerInvestigacao({
        queueName: aiQueue.name,
        mensagemOriginal: body,
        clienteNome: input.cliente.nome,
      })
      return buildOutput({
        reply_text: primer + suffix,
        triage_completed: false,
        queue_id: String(aiQueue.id),
        reason: "queue_auto_classified_ai",
        menu_invalid_attempts: 0,
        investigation_adequate_rounds: 0,
        investigation_inadequate_streak: 0,
      })
    }
  }

  // ── Sem classificação segura ──────────────────────────────────────────────
  const messageHasIntent = hasMeaningfulFreeText(body)
  if (messageHasIntent && isTechnicalQuery(body)) {
    // Has technical content but couldn't map to a queue — ask for 1 more detail
    return buildOutput({
      reply_text:
        "Recebi sua mensagem. Para direcionar com precisão, me informe em 1 frase: qual sistema ou equipamento e o que está acontecendo exatamente." +
        suffix,
      triage_completed: false,
      queue_id: null,
      reason: "menu_needs_clarification",
      menu_invalid_attempts: menuInvalidAttempts,
      investigation_adequate_rounds: 0,
      investigation_inadequate_streak: 0,
    })
  }

  // Non-technical or very short message → welcoming ask
  const greeting = getGreetingByBrasiliaTime()
  const nome = normalizeText(input.cliente.nome)
  const saudacao = nome ? `${greeting}, ${nome}!` : `${greeting}!`
  return buildOutput({
    reply_text:
      `${saudacao}\n` +
      "Sou a Mavo AI. Me descreva o problema que está enfrentando e vou te ajudar a resolver." +
      suffix,
    triage_completed: false,
    queue_id: null,
    reason: "awaiting_problem_statement",
    menu_invalid_attempts: menuInvalidAttempts,
    investigation_adequate_rounds: 0,
    investigation_inadequate_streak: 0,
  })
}

import { GROQ_GPT_OSS_120B, GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"
import { getSystemConfig } from "@/lib/system-config-store"
import { detectProvider } from "@/lib/provider-presets"

/** Padrão do produto: Groq (OpenAI-compatible). */
const DEFAULT_CHAT_BASE_URL = "https://api.groq.com/openai/v1"
const DEFAULT_CHAT_MODEL = GROQ_GPT_OSS_120B
const DEFAULT_CURATOR_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct"
const DEFAULT_EMBEDDING_BASE_URL = "https://api.openai.com/v1"
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
const DEFAULT_EMBEDDING_DIMENSIONS = 1024
const CHAT_MAX_RETRIES = 4
/** Timeout padrão por tentativa (ms) */
const CALL_TIMEOUT_MS = 9_000
/** Timeout estendido para reasoning models (gpt-oss-120b pensa antes de responder) */
const CALL_TIMEOUT_MS_REASONING = 45_000

/** Modelos que usam reasoning interno — precisam de parâmetros diferentes */
const REASONING_MODELS = new Set([
  "openai/gpt-oss-120b",
  "openai/o1",
  "openai/o3",
  "openai/o3-mini",
  "openai/o4-mini",
])

function isReasoningModel(model: string): boolean {
  return REASONING_MODELS.has(model)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function parseGroqRetrySeconds(errorBody: string): number | null {
  try {
    const parsed = JSON.parse(errorBody) as { error?: { message?: string } }
    const msg = String(parsed?.error?.message || errorBody)
    const m = /try again in ([\d.]+)\s*s/i.exec(msg)
    if (m) { const sec = Number.parseFloat(m[1]); return Number.isFinite(sec) ? sec : null }
  } catch {
    const m = /try again in ([\d.]+)\s*s/i.exec(errorBody)
    if (m) { const sec = Number.parseFloat(m[1]); return Number.isFinite(sec) ? sec : null }
  }
  return null
}

function getGroqApiKey(): string {
  return process.env.AI_API_KEY || process.env.GROQ_API_KEY || process.env.GROK_API_KEY || ""
}

/**
 * Resolve a API key correta para um dado base_url.
 * Prioridade: env var do provider → AI_API_KEY global.
 */
function resolveApiKeyForUrl(baseUrl: string): string {
  const provider = detectProvider(baseUrl)
  if (provider) {
    const key = process.env[provider.env_key]
    if (key) return key
  }
  return getGroqApiKey()
}

// DB > env var > default hardcoded
async function getChatConfig() {
  const baseUrl = await getSystemConfig("ai.base_url", process.env.AI_BASE_URL || DEFAULT_CHAT_BASE_URL) ?? DEFAULT_CHAT_BASE_URL
  const explicitModel = await getSystemConfig("ai.chat_model", process.env.AI_CHAT_MODEL?.trim())
  const model = explicitModel || (baseUrl.includes("groq.com") ? GROQ_GPT_OSS_120B : DEFAULT_CHAT_MODEL)
  const apiKey = await getSystemConfig("ai.api_key", getGroqApiKey()) ?? ""
  return { baseUrl, apiKey, model }
}

async function getCuratorConfig() {
  const baseUrl = await getSystemConfig("ai.base_url", process.env.AI_BASE_URL || DEFAULT_CHAT_BASE_URL) ?? DEFAULT_CHAT_BASE_URL
  const model = await getSystemConfig("ai.curator_model", process.env.AI_CURATOR_MODEL?.trim() || DEFAULT_CURATOR_MODEL) ?? DEFAULT_CURATOR_MODEL
  const apiKey = await getSystemConfig("ai.api_key", getGroqApiKey()) ?? ""
  return { baseUrl, apiKey, model }
}

async function getEmbeddingConfig() {
  let apiKey = await getSystemConfig("embedding.api_key", process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || "") ?? ""
  if (apiKey.startsWith("gsk_")) apiKey = ""
  const rawDims = await getSystemConfig("embedding.dimensions", process.env.AI_EMBEDDING_DIMENSIONS)
  return {
    baseUrl: await getSystemConfig("embedding.base_url", process.env.EMBEDDING_BASE_URL || DEFAULT_EMBEDDING_BASE_URL) ?? DEFAULT_EMBEDDING_BASE_URL,
    apiKey,
    model: await getSystemConfig("embedding.model", process.env.AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL) ?? DEFAULT_EMBEDDING_MODEL,
    dimensions: rawDims ? Number(rawDims) : DEFAULT_EMBEDDING_DIMENSIONS,
    defaultTask: process.env.AI_EMBEDDING_TASK || undefined,
  }
}

// ─── Chamada de baixo nível ───────────────────────────────────────────────────

/**
 * Executa uma chamada OpenAI-compatible com retry em 429.
 * Cobre: Groq, Google Gemini, OpenRouter e qualquer proxy compatível.
 */
async function callOpenAICompatible(
  baseUrl: string,
  apiKey: string,
  model: string,
  system: string,
  prompt: string,
  temperature = 0.2,
): Promise<string> {
  const reasoning = isReasoningModel(model)
  const timeoutMs = reasoning ? CALL_TIMEOUT_MS_REASONING : CALL_TIMEOUT_MS
  let lastErrorBody = ""
  for (let attempt = 0; attempt < CHAT_MAX_RETRIES; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      // Reasoning models: temperatura fixa em 1, sem system prompt separado,
      // max_completion_tokens alto para o reasoning ter espaço de pensar
      const body = reasoning
        ? {
            model,
            messages: [
              { role: "user", content: `${system}\n\n${prompt}` },
            ],
            temperature: 1,
            max_completion_tokens: 4096,
          }
        : {
            model,
            messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
            temperature,
            max_tokens: 4096,
          }
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
      // Timeout ou erro de rede → lança para o caller tratar fallback
      throw new Error(`Erro de conexao com provider [${model}]: ${msg}`)
    } finally {
      clearTimeout(timeoutId)
    }
    if (response.ok) {
      const data = await response.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text || typeof text !== "string") throw new Error("Resposta de chat invalida")
      return text
    }
    lastErrorBody = await response.text()
    if (response.status === 429 && attempt < CHAT_MAX_RETRIES - 1) {
      const sec = parseGroqRetrySeconds(lastErrorBody)
      await sleep(sec != null ? Math.min(Math.ceil(sec * 1000) + 400, 90_000) : Math.min(2500 * 2 ** attempt, 30_000))
      continue
    }
    throw new Error(`Erro no chat IA [${model}]: ${response.status} ${lastErrorBody}`)
  }
  throw new Error(`Erro no chat IA apos retentativas [${model}]: ${lastErrorBody}`)
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Gera texto usando o modelo de chat rápido global (Llama 4 Scout via Groq).
 * Usar para: triagem, diálogo, respostas em tempo real.
 */
export async function gerarTextoIA(system: string, prompt: string): Promise<string> {
  const config = await getChatConfig()
  if (!config.apiKey) throw new Error("AI_API_KEY ou GROQ_API_KEY nao configurada")
  return callOpenAICompatible(config.baseUrl, config.apiKey, config.model, system, prompt, 0.2)
}

/**
 * Gera texto usando o modelo e provider configurados no agente especialista.
 * Suporta Groq, Google Gemini, Anthropic Claude e qualquer OpenAI-compatible.
 * Fallback automático para o modelo global se o agente não tiver override.
 */
export async function gerarTextoIAComAgente(
  agent: { model_base_url?: string | null; model_name?: string | null },
  system: string,
  prompt: string,
): Promise<string> {
  const agentBaseUrl = agent.model_base_url?.trim() || null
  const agentModel   = agent.model_name?.trim()    || null

  // Sem override → usa modelo global
  if (!agentBaseUrl && !agentModel) return gerarTextoIA(system, prompt)

  const globalConfig = await getChatConfig()
  const baseUrl = agentBaseUrl ?? globalConfig.baseUrl
  const model   = agentModel   ?? globalConfig.model
  const apiKey  = resolveApiKeyForUrl(baseUrl) || globalConfig.apiKey

  if (!apiKey) throw new Error(`API key nao encontrada para provider: ${baseUrl}`)

  return callOpenAICompatible(baseUrl, apiKey, model, system, prompt, 0.2)
}

/**
 * Gera texto usando o modelo de curadoria (Llama 4 Maverick — GRATUITO via Groq).
 * Usar para: extração de JSON estruturado, curadoria pós-atendimento.
 */
export async function gerarTextoIACurador(system: string, prompt: string): Promise<string> {
  const config = await getCuratorConfig()
  if (!config.apiKey) throw new Error("AI_API_KEY ou GROQ_API_KEY nao configurada")
  try {
    return await callOpenAICompatible(config.baseUrl, config.apiKey, config.model, system, prompt, 0.1)
  } catch {
    return gerarTextoIA(system, prompt)
  }
}

/**
 * Gera embedding via API compatível com OpenAI (OpenAI, Jina AI, Voyage, etc).
 * @param task  "retrieval.query" para buscas, "retrieval.passage" para indexação (Jina/Matryoshka).
 *              Omitir para OpenAI (parâmetro é ignorado).
 */
export async function gerarEmbeddingIA(texto: string, task?: string): Promise<number[]> {
  const config = await getEmbeddingConfig()

  if (!config.apiKey) {
    throw new Error(
      "EMBEDDING_API_KEY ou OPENAI_API_KEY obrigatoria para embeddings (nao use AI_API_KEY/groq gsk_)",
    )
  }

  const resolvedTask = task || config.defaultTask
  // input como array (compatível com Jina e OpenAI)
  const body: Record<string, unknown> = {
    model: config.model,
    input: [texto],
  }
  if (resolvedTask) body.task = resolvedTask
  if (resolvedTask) body.normalized = true

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Erro ao gerar embedding: ${response.status} ${errorBody}`)
  }

  const data = await response.json()
  const embedding = data?.data?.[0]?.embedding
  if (!Array.isArray(embedding)) {
    throw new Error("Embedding invalido no provider")
  }

  return embedding
}

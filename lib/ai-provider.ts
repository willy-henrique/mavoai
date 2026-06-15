import { GROQ_GPT_OSS_120B, GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"
import { getSystemConfig } from "@/lib/system-config-store"
import { getSecret } from "@/lib/secret-store"
import { detectProvider, PROVIDER_PRESETS, DEFAULT_FALLBACKS, type FallbackEntry } from "@/lib/provider-presets"
import { logger } from "@/lib/logger"

/** Padrão do produto: Groq (OpenAI-compatible). */
const DEFAULT_CHAT_BASE_URL = "https://api.groq.com/openai/v1"
const DEFAULT_CHAT_MODEL = GROQ_GPT_OSS_120B
const DEFAULT_CURATOR_MODEL = "llama-3.3-70b-versatile"
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
 * Prioridade: segredo do provider (banco → env) → AI_API_KEY global.
 * Ex.: OpenRouter e Google podem ser editados pelo painel (secret-store).
 */
async function resolveApiKeyForUrl(baseUrl: string): Promise<string> {
  const provider = detectProvider(baseUrl)
  if (provider) {
    const key = await getSecret(provider.env_key)
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
  maxRetries = CHAT_MAX_RETRIES,
): Promise<string> {
  const reasoning = isReasoningModel(model)
  const timeoutMs = reasoning ? CALL_TIMEOUT_MS_REASONING : CALL_TIMEOUT_MS
  let lastErrorBody = ""
  for (let attempt = 0; attempt < maxRetries; attempt++) {
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
    if (response.status === 429 && attempt < maxRetries - 1) {
      const sec = parseGroqRetrySeconds(lastErrorBody)
      // Limite longo (ex.: cota diária) → não adianta esperar; falha rápido p/ o fallback assumir.
      if (sec != null && sec > 8) break
      await sleep(sec != null ? Math.min(Math.ceil(sec * 1000) + 400, 8_000) : Math.min(2500 * 2 ** attempt, 8_000))
      continue
    }
    throw new Error(`Erro no chat IA [${model}]: ${response.status} ${lastErrorBody}`)
  }
  throw new Error(`Erro no chat IA apos retentativas [${model}]: ${lastErrorBody}`)
}

/**
 * Variante da chamada de chat que aceita um array de mensagens (multi-turno).
 * Usado pelo atendimento conversacional (WhatsApp) que precisa de histórico.
 */
async function callChatMessages(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  temperature = 0.3,
  maxRetries = CHAT_MAX_RETRIES,
): Promise<string> {
  const reasoning = isReasoningModel(model)
  const timeoutMs = reasoning ? CALL_TIMEOUT_MS_REASONING : CALL_TIMEOUT_MS

  // Modelos de reasoning não aceitam role "system" separado: dobra o system no 1º user.
  let finalMessages = messages
  if (reasoning) {
    const sys = messages.find((m) => m.role === "system")?.content ?? ""
    const rest = messages.filter((m) => m.role !== "system")
    finalMessages = sys
      ? [{ role: "user" as const, content: sys }, ...rest]
      : rest
  }

  let lastErrorBody = ""
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
    let response: Response
    try {
      const body = reasoning
        ? { model, messages: finalMessages, temperature: 1, max_completion_tokens: 4096 }
        : { model, messages: finalMessages, temperature, max_tokens: 1024 }
      response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      clearTimeout(timeoutId)
      const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
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
    if (response.status === 429 && attempt < maxRetries - 1) {
      const sec = parseGroqRetrySeconds(lastErrorBody)
      // Limite longo (ex.: cota diária) → não adianta esperar; falha rápido p/ o fallback assumir.
      if (sec != null && sec > 8) break
      await sleep(sec != null ? Math.min(Math.ceil(sec * 1000) + 400, 8_000) : Math.min(2500 * 2 ** attempt, 8_000))
      continue
    }
    throw new Error(`Erro no chat IA [${model}]: ${response.status} ${lastErrorBody}`)
  }
  throw new Error(`Erro no chat IA apos retentativas [${model}]: ${lastErrorBody}`)
}

// ─── Fallback de provedor (resiliência a rate limit / 429) ─────────────────────

function isRateLimit(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e)
  return /\b429\b|rate.?limit|rate_limit/i.test(m)
}

/**
 * Provedores alternativos (grátis, cotas separadas) para quando o primário
 * estoura o limite. Lê as chaves via secret-store (banco → env), então o usuário
 * gerencia no painel (aba Tokens). Não inclui o próprio provedor primário.
 */
async function getFallbackProviders(primaryBaseUrl: string, primaryModel: string) {
  let primaryHost = ""
  try { primaryHost = new URL(primaryBaseUrl).hostname } catch { /* ignore */ }

  // Cadeia configurada pelo painel (system_config "ai.fallbacks"), ou o padrão.
  let entries: FallbackEntry[] = []
  const raw = await getSystemConfig("ai.fallbacks")
  if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) entries = p } catch { /* json inválido */ } }
  if (entries.length === 0) entries = DEFAULT_FALLBACKS

  const out: Array<{ baseUrl: string; model: string; apiKey: string; label: string }> = []
  for (const e of entries) {
    const preset = PROVIDER_PRESETS.find((p) => p.id === e.provider)
    if (!preset || !e.model) continue
    const baseUrl = preset.base_url.replace(/\/$/, "")
    let host = ""
    try { host = new URL(baseUrl).hostname } catch { /* ignore */ }
    // Pula apenas se for EXATAMENTE o mesmo provedor+modelo do primário
    // (Groq → outro modelo Groq é válido: cota diária é por modelo).
    if (host === primaryHost && e.model === primaryModel) continue
    let apiKey = await getSecret(preset.env_key)
    if (!apiKey && preset.id === "groq") apiKey = getGroqApiKey()
    if (!apiKey) continue
    out.push({ baseUrl, model: e.model, apiKey, label: `${e.provider}/${e.model}` })
  }
  return out
}

/** Chat multi-turno com fallback automático quando o primário está no limite. */
async function chatMessagesComFallback(
  primary: { baseUrl: string; apiKey: string; model: string },
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  temperature: number,
): Promise<string> {
  try {
    return await callChatMessages(primary.baseUrl, primary.apiKey, primary.model, messages, temperature)
  } catch (e) {
    if (!isRateLimit(e)) throw e
    for (const f of await getFallbackProviders(primary.baseUrl, primary.model)) {
      try {
        logger.warn("ia_fallback", { de: primary.model, para: f.label })
        return await callChatMessages(f.baseUrl, f.apiKey, f.model, messages, temperature, 1)
      } catch (e2) {
        logger.warn("ia_fallback_falhou", { provedor: f.label, erro: (e2 instanceof Error ? e2.message : String(e2)).slice(0, 120) })
      }
    }
    throw e // primário e todas as reservas indisponíveis
  }
}

/** Single-shot (system+prompt) com fallback automático em rate limit. */
async function textoComFallback(
  primary: { baseUrl: string; apiKey: string; model: string },
  system: string,
  prompt: string,
  temperature: number,
): Promise<string> {
  try {
    return await callOpenAICompatible(primary.baseUrl, primary.apiKey, primary.model, system, prompt, temperature)
  } catch (e) {
    if (!isRateLimit(e)) throw e
    for (const f of await getFallbackProviders(primary.baseUrl, primary.model)) {
      try {
        logger.warn("ia_fallback", { de: primary.model, para: f.label })
        return await callOpenAICompatible(f.baseUrl, f.apiKey, f.model, system, prompt, temperature, 1)
      } catch (e2) {
        logger.warn("ia_fallback_falhou", { provedor: f.label, erro: (e2 instanceof Error ? e2.message : String(e2)).slice(0, 120) })
      }
    }
    throw e
  }
}

// ─── API pública ───────────────────────────────────────────────────────────────

/**
 * Gera texto usando o modelo de chat global (com fallback de provedor em 429).
 * Usar para: triagem, diálogo, respostas em tempo real.
 */
export async function gerarTextoIA(system: string, prompt: string): Promise<string> {
  const config = await getChatConfig()
  if (!config.apiKey) throw new Error("AI_API_KEY ou GROQ_API_KEY nao configurada")
  return textoComFallback({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model }, system, prompt, 0.2)
}

/**
 * Gera resposta conversacional com histórico (multi-turno).
 * O `system` define a personalidade; `historico` traz os turnos anteriores;
 * `mensagemAtual` é a nova mensagem do usuário.
 */
export async function gerarTextoIAConversa(
  system: string,
  historico: Array<{ role: "user" | "assistant"; content: string }>,
  mensagemAtual: string,
): Promise<string> {
  const config = await getChatConfig()
  if (!config.apiKey) throw new Error("AI_API_KEY ou GROQ_API_KEY nao configurada")
  const messages = [
    { role: "system" as const, content: system },
    ...historico,
    { role: "user" as const, content: mensagemAtual },
  ]
  return chatMessagesComFallback({ baseUrl: config.baseUrl, apiKey: config.apiKey, model: config.model }, messages, 0.35)
}

/**
 * Conversa multi-turno (com histórico) usando o modelo do AGENTE especialista.
 * Sem override no agente → cai no modelo global de conversa.
 * Usado pelo atendimento do WhatsApp quando o roteador aciona um especialista.
 */
export async function gerarTextoIAConversaComAgente(
  agent: { model_base_url?: string | null; model_name?: string | null } | null,
  system: string,
  historico: Array<{ role: "user" | "assistant"; content: string }>,
  mensagemAtual: string,
): Promise<string> {
  const agentBaseUrl = agent?.model_base_url?.trim() || null
  const agentModel   = agent?.model_name?.trim() || null

  // Sem override → usa o caminho global (mesmo modelo de conversa).
  if (!agentBaseUrl && !agentModel) {
    return gerarTextoIAConversa(system, historico, mensagemAtual)
  }

  const globalConfig = await getChatConfig()
  const baseUrl = agentBaseUrl ?? globalConfig.baseUrl
  const model   = agentModel   ?? globalConfig.model
  const apiKey  = (await resolveApiKeyForUrl(baseUrl)) || globalConfig.apiKey
  if (!apiKey) throw new Error(`API key nao encontrada para provider: ${baseUrl}`)

  const messages = [
    { role: "system" as const, content: system },
    ...historico,
    { role: "user" as const, content: mensagemAtual },
  ]
  return chatMessagesComFallback({ baseUrl, apiKey, model }, messages, 0.35)
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
  const apiKey  = (await resolveApiKeyForUrl(baseUrl)) || globalConfig.apiKey

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

// Modelo de visão fixo — Llama 4 Scout é multimodal no Groq
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct"
// Modelo de transcrição de áudio — Whisper turbo no Groq
const AUDIO_MODEL = "whisper-large-v3-turbo"

/**
 * Analisa uma imagem (screenshot de sistema, erro na tela, etc.) e gera uma
 * resposta de suporte baseada no que é visível. Usa Llama 4 Scout vision via Groq.
 */
export async function analisarImagemIA(imageUrl: string, system: string): Promise<string> {
  const groqKey = getGroqApiKey()
  if (!groqKey) throw new Error("GROQ_API_KEY nao configurada para visao")

  // Baixa a imagem e converte para base64 (evita problemas de URL privada)
  const imgRes = await fetch(imageUrl)
  if (!imgRes.ok) throw new Error(`Falha ao baixar imagem: ${imgRes.status}`)
  const contentType = imgRes.headers.get("content-type") || "image/jpeg"
  const buffer = await imgRes.arrayBuffer()
  const base64 = Buffer.from(buffer).toString("base64")
  const dataUrl = `data:${contentType};base64,${base64}`

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groqKey}` },
    body: JSON.stringify({
      model: VISION_MODEL,
      messages: [
        { role: "system", content: system },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: dataUrl } },
            { type: "text", text: "O cliente enviou esta imagem. Analise o que está na tela e responda como suporte técnico." },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: 1024,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Erro na visao IA: ${response.status} ${err.slice(0, 200)}`)
  }
  const data = await response.json()
  const text = data?.choices?.[0]?.message?.content
  if (!text) throw new Error("Resposta de visao vazia")
  return text
}

/**
 * Transcreve um áudio (WhatsApp PTT ou arquivo) usando Whisper via Groq.
 * Retorna o texto transcrito em português.
 */
export async function transcreverAudioIA(audioBuffer: ArrayBuffer, filename: string): Promise<string> {
  const groqKey = getGroqApiKey()
  if (!groqKey) throw new Error("GROQ_API_KEY nao configurada para transcricao")

  const form = new FormData()
  form.append("file", new Blob([audioBuffer]), filename)
  form.append("model", AUDIO_MODEL)
  form.append("language", "pt")
  form.append("response_format", "text")

  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}` },
    body: form,
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Erro na transcricao de audio: ${response.status} ${err.slice(0, 200)}`)
  }
  const transcript = await response.text()
  return transcript.trim()
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

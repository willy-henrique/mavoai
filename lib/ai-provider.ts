import { GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"

/** Padrão do produto: Groq (OpenAI-compatible). xAI permanece suportado via AI_BASE_URL. */
const DEFAULT_CHAT_BASE_URL = "https://api.groq.com/openai/v1"
// BUG CORRIGIDO: era "grok-2-latest" (modelo inexistente). Usa Llama 4 Scout via GROQ_LLAMA4_SCOUT_INSTRUCT.
const DEFAULT_CHAT_MODEL = GROQ_LLAMA4_SCOUT_INSTRUCT

// Modelo para curadoria: mais inteligente para extrair JSON estruturado.
// Usa a MESMA API key do Groq — 100% gratuito.
// Llama 4 Maverick: contexto maior (128k), melhor raciocínio que Scout.
const DEFAULT_CURATOR_MODEL = "meta-llama/llama-4-maverick-17b-128e-instruct"

const DEFAULT_EMBEDDING_BASE_URL = "https://api.openai.com/v1"
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
// Dimensão padrão de embedding — deve coincidir com o schema do banco (vector(1024) Jina)
const DEFAULT_EMBEDDING_DIMENSIONS = 1024

const CHAT_MAX_RETRIES = 4

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** Segundos sugeridos pelo Groq em "Please try again in 15.2s" */
function parseGroqRetrySeconds(errorBody: string): number | null {
  try {
    const parsed = JSON.parse(errorBody) as { error?: { message?: string } }
    const msg = String(parsed?.error?.message || errorBody)
    const m = /try again in ([\d.]+)\s*s/i.exec(msg)
    if (m) {
      const sec = Number.parseFloat(m[1])
      return Number.isFinite(sec) ? sec : null
    }
  } catch {
    const m = /try again in ([\d.]+)\s*s/i.exec(errorBody)
    if (m) {
      const sec = Number.parseFloat(m[1])
      return Number.isFinite(sec) ? sec : null
    }
  }
  return null
}

function getGroqApiKey(): string {
  return (
    process.env.AI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GROK_API_KEY ||
    ""
  )
}

function getChatConfig() {
  const baseUrl = process.env.AI_BASE_URL || DEFAULT_CHAT_BASE_URL
  const explicitModel = process.env.AI_CHAT_MODEL?.trim()
  const model =
    explicitModel ||
    (baseUrl.includes("groq.com") ? GROQ_LLAMA4_SCOUT_INSTRUCT : DEFAULT_CHAT_MODEL)
  return {
    baseUrl,
    apiKey: getGroqApiKey(),
    model,
  }
}

/**
 * Config para curadoria: modelo mais inteligente, mesma chave Groq (gratuita).
 * Usar AI_CURATOR_MODEL para sobrescrever. Fallback: Llama 4 Maverick.
 * Llama 4 Maverick tem contexto de 128k tokens — ideal para transcrições longas.
 */
function getCuratorConfig() {
  const baseUrl = process.env.AI_BASE_URL || DEFAULT_CHAT_BASE_URL
  const model = process.env.AI_CURATOR_MODEL?.trim() || DEFAULT_CURATOR_MODEL
  return {
    baseUrl,
    apiKey: getGroqApiKey(),
    model,
  }
}

function getEmbeddingConfig() {
  let apiKey =
    process.env.EMBEDDING_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  if (apiKey.startsWith("gsk_")) {
    apiKey = ""
  }
  const rawDims = process.env.AI_EMBEDDING_DIMENSIONS
  return {
    baseUrl: process.env.EMBEDDING_BASE_URL || DEFAULT_EMBEDDING_BASE_URL,
    apiKey,
    model: process.env.AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    dimensions: rawDims ? Number(rawDims) : DEFAULT_EMBEDDING_DIMENSIONS,
    // task para modelos Jina/Matryoshka (ignorado por OpenAI)
    defaultTask: process.env.AI_EMBEDDING_TASK || undefined,
  }
}

/**
 * Gera texto usando o modelo de chat rápido (Llama 4 Scout).
 * Usar para: triagem, diálogo com o usuário, respostas em tempo real.
 */
export async function gerarTextoIA(
  system: string,
  prompt: string
): Promise<string> {
  const config = getChatConfig()

  if (!config.apiKey) {
    throw new Error("AI_API_KEY ou GROQ_API_KEY nao configurada")
  }

  let lastErrorBody = ""

  for (let attempt = 0; attempt < CHAT_MAX_RETRIES; attempt += 1) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text || typeof text !== "string") {
        throw new Error("Resposta de chat invalida")
      }
      return text
    }

    lastErrorBody = await response.text()

    if (response.status === 429 && attempt < CHAT_MAX_RETRIES - 1) {
      const sec = parseGroqRetrySeconds(lastErrorBody)
      const waitMs = sec != null
        ? Math.min(Math.ceil(sec * 1000) + 400, 90_000)
        : Math.min(2500 * 2 ** attempt, 30_000)
      await sleep(waitMs)
      continue
    }

    throw new Error(`Erro no chat IA: ${response.status} ${lastErrorBody}`)
  }

  throw new Error(`Erro no chat IA apos retentativas: ${lastErrorBody}`)
}

/**
 * Gera texto usando o modelo de curadoria (Llama 4 Maverick — GRATUITO via Groq).
 * Usar para: extração de JSON estruturado, curadoria pós-atendimento, análise.
 * Llama 4 Maverick tem contexto 128k e melhor raciocínio que Scout para tarefas analíticas.
 * Mesma chave Groq — sem custo adicional.
 */
export async function gerarTextoIACurador(
  system: string,
  prompt: string
): Promise<string> {
  const config = getCuratorConfig()

  if (!config.apiKey) {
    throw new Error("AI_API_KEY ou GROQ_API_KEY nao configurada")
  }

  let lastErrorBody = ""

  for (let attempt = 0; attempt < CHAT_MAX_RETRIES; attempt += 1) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0.1, // mais determinístico para extração JSON
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const text = data?.choices?.[0]?.message?.content
      if (!text || typeof text !== "string") {
        throw new Error("Resposta de curadoria invalida")
      }
      return text
    }

    lastErrorBody = await response.text()

    if (response.status === 429 && attempt < CHAT_MAX_RETRIES - 1) {
      const sec = parseGroqRetrySeconds(lastErrorBody)
      const waitMs = sec != null
        ? Math.min(Math.ceil(sec * 1000) + 400, 90_000)
        : Math.min(2500 * 2 ** attempt, 30_000)
      await sleep(waitMs)
      continue
    }

    // Se o modelo de curadoria falhar, tenta com o modelo de chat como fallback
    if (attempt === CHAT_MAX_RETRIES - 1) {
      return gerarTextoIA(system, prompt)
    }

    throw new Error(`Erro na curadoria IA: ${response.status} ${lastErrorBody}`)
  }

  throw new Error(`Erro na curadoria IA apos retentativas: ${lastErrorBody}`)
}

/**
 * Gera embedding via API compatível com OpenAI (OpenAI, Jina AI, Voyage, etc).
 * @param task  "retrieval.query" para buscas, "retrieval.passage" para indexação (Jina/Matryoshka).
 *              Omitir para OpenAI (parâmetro é ignorado).
 */
export async function gerarEmbeddingIA(texto: string, task?: string): Promise<number[]> {
  const config = getEmbeddingConfig()

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

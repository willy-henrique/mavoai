import { GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"

/** Padrão do produto: Groq (OpenAI-compatible). xAI permanece suportado via AI_BASE_URL. */
const DEFAULT_CHAT_BASE_URL = "https://api.groq.com/openai/v1"
const DEFAULT_CHAT_MODEL = "grok-2-latest"
const DEFAULT_EMBEDDING_BASE_URL = "https://api.openai.com/v1"
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"

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

function getChatConfig() {
  const baseUrl = process.env.AI_BASE_URL || DEFAULT_CHAT_BASE_URL
  const explicitModel = process.env.AI_CHAT_MODEL?.trim()
  const model =
    explicitModel ||
    (baseUrl.includes("groq.com") ? GROQ_LLAMA4_SCOUT_INSTRUCT : DEFAULT_CHAT_MODEL)
  return {
    baseUrl,
    apiKey:
      process.env.AI_API_KEY ||
      process.env.GROQ_API_KEY ||
      process.env.GROK_API_KEY ||
      "",
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
  return {
    baseUrl: process.env.EMBEDDING_BASE_URL || DEFAULT_EMBEDDING_BASE_URL,
    apiKey,
    model: process.env.AI_EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
  }
}

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

export async function gerarEmbeddingIA(texto: string): Promise<number[]> {
  const config = getEmbeddingConfig()

  if (!config.apiKey) {
    throw new Error(
      "EMBEDDING_API_KEY ou OPENAI_API_KEY obrigatoria para embeddings OpenAI (nao use AI_API_KEY/groq gsk_)",
    )
  }

  const response = await fetch(`${config.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      input: texto,
    }),
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

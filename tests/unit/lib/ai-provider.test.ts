import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { gerarTextoIA, gerarEmbeddingIA } from "@/lib/ai-provider"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

function makeOkResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
    text: async () => "",
  }
}

function makeErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  }
}

describe("gerarTextoIA", () => {
  beforeEach(() => {
    process.env.AI_API_KEY = "test-api-key"
    process.env.AI_BASE_URL = "https://api.x.ai/v1"
    process.env.AI_CHAT_MODEL = "grok-2-latest"
    mockFetch.mockClear()
  })

  afterEach(() => {
    delete process.env.AI_API_KEY
    delete process.env.AI_BASE_URL
    delete process.env.AI_CHAT_MODEL
  })

  it("retorna texto da resposta em chamada bem-sucedida", async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse("Resposta da IA"))
    const result = await gerarTextoIA("system prompt", "user prompt")
    expect(result).toBe("Resposta da IA")
  })

  it("lança erro quando API_KEY não está configurada", async () => {
    delete process.env.AI_API_KEY
    await expect(gerarTextoIA("system", "user")).rejects.toThrow("AI_API_KEY")
  })

  it("faz retry em 429 com backoff", async () => {
    const retryBody = JSON.stringify({ error: { message: "Please try again in 1.5s" } })
    mockFetch
      .mockResolvedValueOnce(makeErrorResponse(429, retryBody))
      .mockResolvedValueOnce(makeOkResponse("Resposta após retry"))

    const result = await gerarTextoIA("system", "user")
    expect(result).toBe("Resposta após retry")
    expect(mockFetch).toHaveBeenCalledTimes(2)
  }, 15000)

  it("lança erro após esgotar todas as retentativas em 429", async () => {
    const retryBody = JSON.stringify({ error: { message: "rate limited" } })
    mockFetch.mockResolvedValue(makeErrorResponse(429, retryBody))

    await expect(gerarTextoIA("system", "user")).rejects.toThrow()
    expect(mockFetch).toHaveBeenCalledTimes(4) // CHAT_MAX_RETRIES = 4
  }, 60000)

  it("lança erro imediato em erros não-429", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(500, "Internal Server Error"))
    await expect(gerarTextoIA("system", "user")).rejects.toThrow("500")
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })
})

describe("gerarEmbeddingIA", () => {
  beforeEach(() => {
    process.env.EMBEDDING_API_KEY = "sk-valid-openai-key"
    process.env.EMBEDDING_BASE_URL = "https://api.openai.com/v1"
    process.env.AI_EMBEDDING_MODEL = "text-embedding-3-small"
    mockFetch.mockClear()
  })

  afterEach(() => {
    delete process.env.EMBEDDING_API_KEY
    delete process.env.EMBEDDING_BASE_URL
    delete process.env.AI_EMBEDDING_MODEL
  })

  it("retorna array de números do embedding", async () => {
    const fakeEmbedding = Array(1536).fill(0.01)
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: fakeEmbedding }] }),
    })

    const result = await gerarEmbeddingIA("texto para embeddar")
    expect(result).toHaveLength(1536)
    expect(result[0]).toBe(0.01)
  })

  it("rejeita chaves gsk_ (Groq não suporta embeddings)", async () => {
    process.env.EMBEDDING_API_KEY = "gsk_minha-chave-groq"
    await expect(gerarEmbeddingIA("texto")).rejects.toThrow("EMBEDDING_API_KEY")
  })

  it("lança erro quando EMBEDDING_API_KEY não está configurada", async () => {
    delete process.env.EMBEDDING_API_KEY
    await expect(gerarEmbeddingIA("texto")).rejects.toThrow("EMBEDDING_API_KEY")
  })

  it("lança erro quando a API retorna status de erro", async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse(401, "Invalid API Key"))
    await expect(gerarEmbeddingIA("texto")).rejects.toThrow("401")
  })
})

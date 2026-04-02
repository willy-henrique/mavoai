import { describe, it, expect, vi, beforeEach } from "vitest"
import { CerebroClient } from "../src/client"
import {
  CerebroAuthError,
  CerebroDuplicateError,
  CerebroIAIndisponivel,
  CerebroRateLimitError,
  CerebroTimeoutError,
  CerebroValidationError,
} from "../src/errors"

const mockFetch = vi.fn()
vi.stubGlobal("fetch", mockFetch)

function ok(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response
}

function err(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
  } as unknown as Response
}

const cfg = { baseUrl: "http://localhost:3000", token: "tk-test-123" }

describe("CerebroClient constructor", () => {
  it("lança CerebroValidationError se baseUrl ausente", () => {
    expect(() => new CerebroClient({ baseUrl: "", token: "tk" })).toThrow(CerebroValidationError)
  })

  it("lança CerebroValidationError se token ausente", () => {
    expect(() => new CerebroClient({ baseUrl: "http://localhost:3000", token: "" })).toThrow(CerebroValidationError)
  })

  it("remove barra final da baseUrl", () => {
    const client = new CerebroClient({ baseUrl: "http://localhost:3000/", token: "tk" })
    // Verifica via chamada que não gera URL duplicada
    mockFetch.mockResolvedValueOnce(ok({ status: "healthy", supabase: true, groq: true, embedding: true, integrations: { configured: 0, active: 0 }, timestamp: "" }))
    return client.health().then(() => {
      expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/health", expect.any(Object))
    })
  })
})

describe("CerebroClient.health()", () => {
  beforeEach(() => mockFetch.mockClear())

  it("retorna HealthStatus em resposta ok", async () => {
    const payload = { status: "healthy", supabase: true, groq: true, embedding: true, integrations: { configured: 2, active: 1 }, timestamp: "2026-04-01T00:00:00Z" }
    mockFetch.mockResolvedValueOnce(ok(payload))

    const client = new CerebroClient(cfg)
    const result = await client.health()

    expect(result.status).toBe("healthy")
    expect(result.supabase).toBe(true)
    expect(result.embedding).toBe(true)
  })

  it("inclui Authorization header em todas as chamadas", async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: "healthy", supabase: true, groq: true, embedding: true, integrations: { configured: 0, active: 0 }, timestamp: "" }))

    const client = new CerebroClient(cfg)
    await client.health()

    const callArgs = mockFetch.mock.calls[0][1]
    expect(callArgs.headers.Authorization).toBe("Bearer tk-test-123")
  })

  it("lança CerebroAuthError em 401", async () => {
    mockFetch.mockResolvedValueOnce(err(401, { error: "unauthorized" }))
    const client = new CerebroClient(cfg)
    await expect(client.health()).rejects.toThrow(CerebroAuthError)
  })
})

describe("CerebroClient.ingest()", () => {
  beforeEach(() => mockFetch.mockClear())

  it("retorna atendimento_id em sucesso", async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: "ok", atendimento_id: "uuid-abc-123" }))

    const client = new CerebroClient(cfg)
    const result = await client.ingest({
      ticket_id: "TKT-001",
      cliente: "Empresa Teste",
      mensagens: "Impressora não imprime.",
    })

    expect(result.atendimento_id).toBe("uuid-abc-123")
    expect(result.status).toBe("ok")
  })

  it("adiciona metadata automaticamente quando não fornecida", async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: "ok", atendimento_id: "uuid-xyz" }))

    const client = new CerebroClient({ ...cfg, tenantId: "meu-tenant", sourceSystem: "meu-erp" })
    await client.ingest({ ticket_id: "TKT-002", cliente: "Teste", mensagens: "Problema." })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.metadata.tenantId).toBe("meu-tenant")
    expect(body.metadata.sourceSystem).toBe("meu-erp")
    expect(body.metadata.ingestionId).toMatch(/^sdk-/)
  })

  it("lança CerebroDuplicateError quando status é duplicate_ignored", async () => {
    mockFetch.mockResolvedValueOnce(ok({ status: "duplicate_ignored", dedupKey: "meu-dedup-key" }))

    const client = new CerebroClient(cfg)
    const error = await client.ingest({ ticket_id: "TKT-DUP", cliente: "Dup", mensagens: "Dup." }).catch((e) => e)

    expect(error).toBeInstanceOf(CerebroDuplicateError)
    expect(error.dedupKey).toBe("meu-dedup-key")
  })

  it("lança CerebroValidationError em 400", async () => {
    mockFetch.mockResolvedValueOnce(err(400, { error: "ticket_id, cliente e mensagens sao obrigatorios" }))
    const client = new CerebroClient(cfg)
    await expect(client.ingest({ ticket_id: "", cliente: "", mensagens: "" })).rejects.toThrow(CerebroValidationError)
  })

  it("lança CerebroRateLimitError em 429", async () => {
    mockFetch.mockResolvedValueOnce(err(429, { error: "rate_limit_exceeded" }))
    const client = new CerebroClient(cfg)
    await expect(
      client.ingest({ ticket_id: "TKT-RL", cliente: "Teste", mensagens: "Mensagem." })
    ).rejects.toThrow(CerebroRateLimitError)
  })
})

describe("CerebroClient.search()", () => {
  beforeEach(() => mockFetch.mockClear())

  it("retorna resultados da busca semântica", async () => {
    const payload = {
      resultados: [
        { id: "1", similaridade: 0.91, resumo_problema: "Impressora sem papel", causa: "Sem papel", solucao: "Colocar papel", estrategia: "vetorial" }
      ],
      tipo_busca: "semantica"
    }
    mockFetch.mockResolvedValueOnce(ok(payload))

    const client = new CerebroClient(cfg)
    const result = await client.search("impressora sem papel")

    expect(result.tipo_busca).toBe("semantica")
    expect(result.resultados).toHaveLength(1)
    expect(result.resultados[0].similaridade).toBe(0.91)
  })

  it("lança CerebroValidationError se texto vazio", async () => {
    const client = new CerebroClient(cfg)
    await expect(client.search("")).rejects.toThrow(CerebroValidationError)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("envia limite correto no body", async () => {
    mockFetch.mockResolvedValueOnce(ok({ resultados: [], tipo_busca: "textual" }))
    const client = new CerebroClient(cfg)
    await client.search("problema de rede", 5)

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.limite).toBe(5)
  })
})

describe("CerebroClient.query()", () => {
  beforeEach(() => mockFetch.mockClear())

  it("retorna resposta com confiança e casos", async () => {
    const payload = {
      resposta: "Diagnóstico: Driver corrompido. Passos: 1) Reinstalar driver...",
      confianca: "alta",
      audience: "atendente",
      casos: [{ id: "1", resumo_problema: "Impressora", similaridade: 0.91, estrategia: "vetorial" }]
    }
    mockFetch.mockResolvedValueOnce(ok(payload))

    const client = new CerebroClient(cfg)
    const result = await client.query("impressora não imprime cupom")

    expect(result.confianca).toBe("alta")
    expect(result.resposta.length).toBeGreaterThan(10)
    expect(result.casos).toHaveLength(1)
  })

  it("usa audience='atendente' por padrão", async () => {
    mockFetch.mockResolvedValueOnce(ok({ resposta: "R", confianca: "media", audience: "atendente", casos: [] }))
    const client = new CerebroClient(cfg)
    await client.query("problema")

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.audience).toBe("atendente")
  })

  it("passa audience='cliente' corretamente", async () => {
    mockFetch.mockResolvedValueOnce(ok({ resposta: "R", confianca: "baixa", audience: "cliente", casos: [] }))
    const client = new CerebroClient(cfg)
    await client.query("problema do cliente", "cliente")

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.audience).toBe("cliente")
  })

  it("lança CerebroIAIndisponivel em 503", async () => {
    mockFetch.mockResolvedValueOnce(err(503, { error: "ia_nao_configurada" }))
    const client = new CerebroClient(cfg)
    await expect(client.query("problema")).rejects.toThrow(CerebroIAIndisponivel)
  })

  it("lança CerebroValidationError se texto vazio", async () => {
    const client = new CerebroClient(cfg)
    await expect(client.query("  ")).rejects.toThrow(CerebroValidationError)
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe("CerebroClient — Timeout", () => {
  it("lança CerebroTimeoutError quando fetch é abortado por timeout", async () => {
    const abortError = new Error("AbortError")
    abortError.name = "AbortError"
    mockFetch.mockRejectedValueOnce(abortError)

    const client = new CerebroClient({ ...cfg, timeout: 100 })
    await expect(client.health()).rejects.toThrow(CerebroTimeoutError)
  })
})

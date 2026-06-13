import { describe, it, expect, vi, afterEach } from "vitest"
import { validateIntegrationHeaders, enforceRateLimit, registerDedupKey } from "@/lib/integration-guard"

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/ingestao", {
    method: "POST",
    headers,
  })
}

describe("validateIntegrationHeaders", async () => {
  afterEach(() => {
    delete process.env.INTEGRATION_AUTH_REQUIRED
    delete process.env.CEREBRO_INGEST_TOKEN
  })

  it("retorna ok quando autenticação está desabilitada", async () => {
    process.env.INTEGRATION_AUTH_REQUIRED = "false"
    const req = makeRequest()
    const result = await validateIntegrationHeaders(req)
    expect(result.ok).toBe(true)
  })

  it("usa defaults quando headers opcionais estão ausentes", async () => {
    process.env.INTEGRATION_AUTH_REQUIRED = "false"
    const req = makeRequest()
    const result = await validateIntegrationHeaders(req)
    if (!result.ok) throw new Error("deveria ser ok")
    expect(result.tenantId).toBe("default")
    expect(result.sourceSystem).toBe("willtalk")
  })

  it("retorna 401 quando autenticação está habilitada e Bearer está ausente", async () => {
    process.env.INTEGRATION_AUTH_REQUIRED = "true"
    process.env.CEREBRO_INGEST_TOKEN = "meu-token-secreto"
    const req = makeRequest()
    const result = await validateIntegrationHeaders(req)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("deveria ser erro")
    expect(result.status).toBe(401)
  })

  it("retorna 401 quando token está errado", async () => {
    process.env.INTEGRATION_AUTH_REQUIRED = "true"
    process.env.CEREBRO_INGEST_TOKEN = "token-correto"
    const req = makeRequest({ Authorization: "Bearer token-errado" })
    const result = await validateIntegrationHeaders(req)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("deveria ser erro")
    expect(result.status).toBe(401)
  })

  it("retorna ok quando token está correto", async () => {
    process.env.INTEGRATION_AUTH_REQUIRED = "true"
    process.env.CEREBRO_INGEST_TOKEN = "token-valido-123"
    const req = makeRequest({
      Authorization: "Bearer token-valido-123",
      "X-Tenant-Id": "empresa-abc",
      "X-Source-System": "erp-x",
    })
    const result = await validateIntegrationHeaders(req)
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error("deveria ser ok")
    expect(result.tenantId).toBe("empresa-abc")
    expect(result.sourceSystem).toBe("erp-x")
  })

  it("lê headers case-insensitive", async () => {
    process.env.INTEGRATION_AUTH_REQUIRED = "false"
    const req = makeRequest({ "x-tenant-id": "tenant-lower" })
    const result = await validateIntegrationHeaders(req)
    if (!result.ok) throw new Error("deveria ser ok")
    expect(result.tenantId).toBe("tenant-lower")
  })
})

describe("enforceRateLimit", async () => {
  afterEach(() => {
    delete process.env.INTEGRATION_RATE_LIMIT_PER_MIN
  })

  it("permite requisições dentro do limite", async () => {
    process.env.INTEGRATION_RATE_LIMIT_PER_MIN = "5"
    for (let i = 0; i < 5; i++) {
      const result = await enforceRateLimit("tenant-rate-test", `src-${Date.now()}-${i}`)
      expect(result.ok).toBe(true)
    }
  })

  it("bloqueia quando limite é excedido", async () => {
    process.env.INTEGRATION_RATE_LIMIT_PER_MIN = "3"
    const tenant = `tenant-limit-${Date.now()}`
    const src = `src-limit-${Date.now()}`

    for (let i = 0; i < 3; i++) {
      await enforceRateLimit(tenant, src)
    }

    const result = await enforceRateLimit(tenant, src)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("deveria ser bloqueado")
    expect(result.status).toBe(429)
  })
})

describe("registerDedupKey", async () => {
  it("retorna duplicated=false na primeira inserção", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    }
    const result = await registerDedupKey(supabase as any, "tenant1", "key1", "hash1")
    expect(result.duplicated).toBe(false)
  })

  it("retorna duplicated=true quando erro de unicidade (23505)", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { code: "23505", message: "duplicate key" } }),
      }),
    }
    const result = await registerDedupKey(supabase as any, "tenant1", "key-dup", "hash-dup")
    expect(result.duplicated).toBe(true)
  })

  it("retorna duplicated=true quando mensagem contém 'duplicate'", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { code: "XX000", message: "duplicate entry found" } }),
      }),
    }
    const result = await registerDedupKey(supabase as any, "tenant1", "key-msg", "hash-msg")
    expect(result.duplicated).toBe(true)
  })

  it("ignora erro de tabela ausente (dedup_keys não existe)", async () => {
    const supabase = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { message: 'relation "dedup_keys" does not exist' } }),
      }),
    }
    const result = await registerDedupKey(supabase as any, "tenant1", "key-no-table", "hash-no-table")
    expect(result.duplicated).toBe(false)
  })
})

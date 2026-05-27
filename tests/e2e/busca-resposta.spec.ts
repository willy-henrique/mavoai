import { test, expect } from "@playwright/test"

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
const TOKEN = process.env.CEREBRO_INGEST_TOKEN || ""

function authHeaders(): Record<string, string> {
  return TOKEN
    ? { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }
    : { "Content-Type": "application/json" }
}

test.describe("Busca semântica e resposta assistida E2E", () => {
  test("GET /api/health retorna status e checks", async ({ request }) => {
    const res = await request.get(`${BASE}/api/health`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(["healthy", "degraded", "unhealthy"]).toContain(body.status)
    expect(typeof body.supabase).toBe("boolean")
    expect(typeof body.groq).toBe("boolean")
    expect(typeof body.embedding).toBe("boolean")
  })

  test("POST /api/busca-semantica retorna resultados e tipo de busca", async ({ request }) => {
    const res = await request.post(`${BASE}/api/busca-semantica`, {
      headers: authHeaders(),
      data: { texto: "impressora não imprime cupom fiscal" },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.resultados)).toBe(true)
    expect(["semantica", "textual"]).toContain(body.tipo_busca)
  })

  test("POST /api/busca-semantica sem texto retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/busca-semantica`, {
      headers: authHeaders(),
      data: {},
    })
    expect(res.status()).toBe(400)
  })

  test("POST /api/resposta-assistida retorna resposta não vazia", async ({ request }) => {
    const res = await request.post(`${BASE}/api/resposta-assistida`, {
      headers: authHeaders(),
      data: { texto: "computador não liga após queda de energia" },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.resposta_sugerida).toBe("string")
    expect(body.resposta_sugerida.length).toBeGreaterThan(50)
  })

  test("POST /api/resposta-assistida?debug=true retorna cases_utilizados", async ({ request }) => {
    const res = await request.post(`${BASE}/api/resposta-assistida?debug=true`, {
      headers: authHeaders(),
      data: { texto: "sem acesso à internet na filial" },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty("cases_utilizados")
    expect(Array.isArray(body.cases_utilizados)).toBe(true)
  })

  test("POST /api/resposta-assistida com audience=cliente retorna resposta", async ({ request }) => {
    const res = await request.post(`${BASE}/api/resposta-assistida`, {
      headers: authHeaders(),
      data: {
        texto: "impressora não funciona",
        audience: "cliente",
      },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(typeof body.resposta_sugerida).toBe("string")
    expect(body.resposta_sugerida.length).toBeGreaterThan(30)
  })
})

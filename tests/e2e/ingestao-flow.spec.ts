import { test, expect } from "@playwright/test"

const BASE = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
const TOKEN = process.env.CEREBRO_INGEST_TOKEN || ""

function authHeaders() {
  return TOKEN
    ? { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` }
    : { "Content-Type": "application/json" }
}

test.describe("Fluxo de ingestão E2E", () => {
  test("POST /api/ingestao/willtalk cria atendimento e processa com IA", async ({ request }) => {
    const ticketId = `E2E-${Date.now()}`

    const res = await request.post(`${BASE}/api/ingestao/willtalk`, {
      headers: authHeaders(),
      data: {
        ticket_id: ticketId,
        cliente: "Cliente E2E Test",
        canal: "whatsapp",
        mensagens: "Impressora térmica não imprime cupom fiscal após reinicialização do servidor.",
        tecnico: "e2e-runner",
        data_evento: new Date().toISOString(),
        metadata: {
          sourceSystem: "e2e-test",
          sourceEntityId: ticketId,
          tenantId: "e2e-tenant",
          ingestionId: `ing-${ticketId}`,
        },
      },
    })

    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("ok")
    expect(body.atendimento_id).toBeTruthy()

    // Aguarda processamento assíncrono
    await new Promise((r) => setTimeout(r, 8000))

    // Verifica métricas atualizadas
    const metricas = await request.get(`${BASE}/api/metricas`)
    expect(metricas.status()).toBe(200)
    const dados = await metricas.json()
    expect(dados.total).toBeGreaterThan(0)
  })

  test("POST duplicado retorna 409 duplicate_ignored", async ({ request }) => {
    const ticketId = `DEDUP-E2E-${Date.now()}`
    const payload = {
      ticket_id: ticketId,
      cliente: "Cliente Dedup",
      canal: "api",
      mensagens: "Problema de rede no escritório central.",
      metadata: {
        sourceSystem: "dedup-e2e",
        sourceEntityId: ticketId,
        tenantId: "dedup-tenant",
        ingestionId: `ing-dedup-${ticketId}`,
      },
    }

    const first = await request.post(`${BASE}/api/ingestao/willtalk`, {
      headers: authHeaders(),
      data: payload,
    })
    expect(first.status()).toBe(200)

    const second = await request.post(`${BASE}/api/ingestao/willtalk`, {
      headers: authHeaders(),
      data: payload,
    })
    expect(second.status()).toBe(409)
    const body = await second.json()
    expect(body.status).toBe("duplicate_ignored")
  })

  test("POST sem campos obrigatórios retorna 400", async ({ request }) => {
    const res = await request.post(`${BASE}/api/ingestao/willtalk`, {
      headers: authHeaders(),
      data: {
        ticket_id: "INCOMPLETO",
        // falta cliente e mensagens
      },
    })
    expect(res.status()).toBe(400)
  })
})

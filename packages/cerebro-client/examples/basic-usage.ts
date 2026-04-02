/**
 * Exemplo de uso do @cerebro/client
 *
 * Instale copiando a pasta packages/cerebro-client para seu projeto
 * e importe de "./cerebro-client/src/index"
 *
 * Execução: npx tsx examples/basic-usage.ts
 */

import { CerebroClient, CerebroDuplicateError, CerebroRateLimitError } from "../src/index"

const client = new CerebroClient({
  baseUrl: process.env.CEREBRO_BASE_URL || "http://localhost:3000",
  token: process.env.CEREBRO_INGEST_TOKEN || "seu-token-aqui",
  tenantId: "minha-empresa",
  sourceSystem: "meu-erp",
})

async function main() {
  // ── 1. Health Check ───────────────────────────────────────────────────
  console.log("\n[1] Verificando saúde do Cérebro...")
  const health = await client.health()
  console.log(`   Status: ${health.status}`)
  console.log(`   Supabase: ${health.supabase} | IA: ${health.groq} | Embedding: ${health.embedding}`)

  if (health.status === "unhealthy") {
    console.error("   ❌ Cérebro está unhealthy. Configure as chaves no .env.local.")
    process.exit(1)
  }

  // ── 2. Ingerir um Ticket ──────────────────────────────────────────────
  console.log("\n[2] Ingerindo ticket de suporte...")
  try {
    const resultado = await client.ingest({
      ticket_id: `ERP-${Date.now()}`,
      cliente: "Empresa Modelo LTDA",
      canal: "erp",
      mensagens: "Impressora térmica da loja não imprime cupom fiscal após atualização do sistema.",
      tecnico: "Suporte N1",
    })
    console.log(`   ✓ Atendimento criado: ${resultado.atendimento_id}`)
  } catch (err) {
    if (err instanceof CerebroDuplicateError) {
      console.log(`   ⚠ Duplicata ignorada (dedup_key: ${err.dedupKey})`)
    } else {
      throw err
    }
  }

  // ── 3. Busca Semântica ────────────────────────────────────────────────
  console.log("\n[3] Buscando casos similares...")
  const busca = await client.search("impressora não imprime cupom fiscal")
  console.log(`   Tipo: ${busca.tipo_busca} | Resultados: ${busca.resultados.length}`)
  busca.resultados.forEach((r, i) => {
    console.log(`   [${i + 1}] ${r.resumo_problema.slice(0, 60)} (sim: ${r.similaridade.toFixed(2)})`)
  })

  // ── 4. Query Unificada (busca + IA) ──────────────────────────────────
  console.log("\n[4] Gerando resposta assistida por IA...")
  try {
    const query = await client.query(
      "Impressora térmica não imprime cupom após atualização do Windows",
      "atendente"
    )
    console.log(`   Confiança: ${query.confianca}`)
    console.log(`   Casos utilizados: ${query.casos.length}`)
    console.log(`\n   Resposta gerada:\n${"-".repeat(60)}`)
    console.log(query.resposta)
    console.log("-".repeat(60))
  } catch (err) {
    if (err instanceof CerebroRateLimitError) {
      console.warn(`   ⚠ Rate limit atingido. Aguardar ${err.retryAfterMs / 1000}s`)
    } else {
      throw err
    }
  }

  // ── 5. Exemplo para audiência do cliente ─────────────────────────────
  console.log("\n[5] Gerando resposta simplificada para o cliente...")
  const queryCliente = await client.query(
    "minha impressora parou de funcionar",
    "cliente"
  )
  console.log(`   Confiança: ${queryCliente.confianca}`)
  console.log(`   Resposta (primeiros 200 chars): ${queryCliente.resposta.slice(0, 200)}...`)
}

main().catch((err) => {
  console.error("\n❌ Erro:", err.message)
  process.exit(1)
})

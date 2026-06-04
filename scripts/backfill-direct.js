/**
 * Gera embeddings diretamente via Jina AI para todos os atendimentos
 * processados que ainda não têm vetor — sem depender de NEXT_PUBLIC_BASE_URL.
 */
require("dotenv").config({ path: require("path").resolve(__dirname, "..", ".env.local") })

const { Pool } = require("pg")

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const JINA_KEY = process.env.EMBEDDING_API_KEY
const JINA_BASE = process.env.EMBEDDING_BASE_URL || "https://api.jina.ai/v1"
const MODEL = process.env.AI_EMBEDDING_MODEL || "jina-embeddings-v5-text-small"
const DIMS = parseInt(process.env.AI_EMBEDDING_DIMENSIONS || "1024", 10)

async function gerarEmbedding(texto) {
  const res = await fetch(`${JINA_BASE}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${JINA_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      input: [texto.slice(0, 8000)],
      task: "retrieval.passage",
      normalized: true,
    }),
  })
  if (!res.ok) throw new Error(`Jina ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.data[0].embedding
}

async function main() {
  const { rows } = await pool.query(
    `SELECT id, texto_original, resumo_problema, problema, solucao
     FROM atendimentos
     WHERE processado = true AND embedding IS NULL
     ORDER BY created_at ASC`
  )

  console.log(`Encontrados ${rows.length} atendimento(s) sem embedding. Gerando...`)
  let ok = 0, fail = 0

  for (const row of rows) {
    const texto = [row.problema, row.resumo_problema, row.solucao, row.texto_original]
      .filter(Boolean)
      .join("\n")
      .slice(0, 8000)

    try {
      const emb = await gerarEmbedding(texto)
      const vector = `[${emb.join(",")}]`
      await pool.query(
        "UPDATE atendimentos SET embedding = $1::vector WHERE id = $2",
        [vector, row.id]
      )
      ok++
      process.stdout.write(`  ✓ ${row.id.slice(0, 8)} — ${(row.resumo_problema || row.problema || "").slice(0, 50)}\n`)
    } catch (e) {
      fail++
      process.stdout.write(`  ✗ ${row.id.slice(0, 8)} — ${e.message.slice(0, 80)}\n`)
    }

    // Respeita rate limit Jina
    await new Promise((r) => setTimeout(r, 300))
  }

  console.log(`\nConcluído: ${ok} OK, ${fail} falha(s).`)
  await pool.end()
}

main().catch((e) => { console.error(e); pool.end() })

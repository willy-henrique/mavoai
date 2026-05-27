/**
 * backfill-embeddings.mjs
 *
 * Gera embeddings Jina para todos os registros do banco que ainda não têm vetor.
 * Seguro para reexecutar: pula registros que já têm embedding.
 *
 * Uso:
 *   node scripts/backfill-embeddings.mjs           → processa tudo
 *   node scripts/backfill-embeddings.mjs --dry-run → só conta, não salva
 *   node scripts/backfill-embeddings.mjs --limit 50 → processa até 50 por vez
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local")
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
    if (k && !process.env[k]) process.env[k] = v
  }
}
loadEnv()

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run")
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit"))
const BATCH_LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1] || process.argv[process.argv.indexOf("--limit") + 1] || 999999) : 999999

const DB_URL = process.env.DATABASE_URL
const EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY
const EMBEDDING_BASE = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
const DELAY_MS = 300 // delay entre chamadas (evitar rate limit)

// ─── Cores ────────────────────────────────────────────────────────────────────

const bold  = (s) => `\x1b[1m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow= (s) => `\x1b[33m${s}\x1b[0m`
const red   = (s) => `\x1b[31m${s}\x1b[0m`
const dim   = (s) => `\x1b[2m${s}\x1b[0m`

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

function progress(current, total, label) {
  const pct = Math.round((current / total) * 100)
  const filled = Math.round(pct / 5)
  const bar = "█".repeat(filled) + "░".repeat(20 - filled)
  process.stdout.write(`\r  [${bar}] ${pct}% (${current}/${total}) ${dim(String(label).slice(0, 35))}   `)
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function gerarEmbedding(texto) {
  if (!EMBEDDING_KEY) return null

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${EMBEDDING_BASE}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${EMBEDDING_KEY}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: [texto.slice(0, 8000)],
          task: "retrieval.passage",
          normalized: true,
        }),
      })

      if (!res.ok) {
        const err = await res.text()
        if (res.status === 429) { await sleep(8000 * (attempt + 1)); continue }
        throw new Error(`${res.status}: ${err.slice(0, 150)}`)
      }

      const data = await res.json()
      const emb = data?.data?.[0]?.embedding
      return Array.isArray(emb) ? emb : null
    } catch (e) {
      if (attempt === 2) throw e
      await sleep(2000)
    }
  }
  return null
}

// ─── Texto para embedding ────────────────────────────────────────────────────

function buildTextoParaEmbedding(row) {
  // Combina campos mais ricos para gerar um embedding representativo
  return [
    row.resumo_problema || "",
    row.problema || "",
    row.solucao || "",
    row.causa || "",
    (row.texto_original || "").slice(0, 1000),
  ]
    .filter(Boolean)
    .join(" | ")
    .trim()
    .slice(0, 6000)
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\n🔗 Backfill de Embeddings — Mavo AI"))
  console.log(dim("─".repeat(50)))

  if (!DB_URL) { console.log(red("✗ DATABASE_URL não configurada")); process.exit(1) }
  if (!EMBEDDING_KEY) { console.log(red("✗ EMBEDDING_API_KEY não configurada")); process.exit(1) }

  if (DRY_RUN) console.log(yellow("🔍 DRY-RUN — nenhum dado será salvo."))
  console.log(dim(`Modelo: ${EMBEDDING_MODEL} | Base: ${EMBEDDING_BASE}`))

  const { default: pg } = await import("pg")
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()

  // Conta registros sem embedding
  const countRes = await client.query(
    `SELECT COUNT(*)::int AS total FROM atendimentos WHERE embedding IS NULL`
  )
  const total = countRes.rows[0].total
  const toProcess = Math.min(total, BATCH_LIMIT)

  console.log(dim(`\nRegistros sem embedding: ${total}`))
  if (total === 0) {
    console.log(green("✅ Todos os registros já têm embedding!"))
    await client.end()
    return
  }
  console.log(dim(`Processando: ${toProcess}${toProcess < total ? ` (limitado por --limit)` : ""}\n`))

  if (DRY_RUN) {
    // Mostra amostra do que será processado
    const sample = await client.query(
      `SELECT id, cliente, LEFT(COALESCE(resumo_problema, problema, texto_original), 80) AS preview
       FROM atendimentos WHERE embedding IS NULL LIMIT 5`
    )
    sample.rows.forEach((r) => console.log(dim(`  · ${r.id.slice(0, 8)} | ${r.cliente} | ${r.preview}...`)))
    await client.end()
    return
  }

  // Busca registros sem embedding em batches
  const rows = (await client.query(
    `SELECT id, cliente, resumo_problema, problema, solucao, causa, texto_original
     FROM atendimentos
     WHERE embedding IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [toProcess]
  )).rows

  let ok = 0, erros = 0, vazios = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    progress(i + 1, rows.length, row.resumo_problema || row.problema || row.cliente)

    const texto = buildTextoParaEmbedding(row)
    if (!texto || texto.length < 20) {
      vazios++
      continue
    }

    try {
      const embedding = await gerarEmbedding(texto)
      if (!embedding) { vazios++; continue }

      const vector = `[${embedding.join(",")}]`
      await client.query(
        `UPDATE atendimentos SET embedding = $1::vector WHERE id = $2`,
        [vector, row.id]
      )
      ok++
    } catch (e) {
      erros++
      process.stdout.write("\n")
      console.log(red(`  ✗ ${row.id.slice(0, 8)}: ${e.message?.slice(0, 80)}`))
    }

    await sleep(DELAY_MS)
  }

  await client.end()

  process.stdout.write("\n")
  console.log(bold("\n─── Resultado ────────────────────────────────────"))
  console.log(green(`  ✓ ${ok} embeddings gerados e salvos`))
  if (vazios > 0) console.log(yellow(`  ⚠ ${vazios} registros sem texto suficiente (pulados)`))
  if (erros > 0)  console.log(red(`  ✗ ${erros} erros`))

  // Conferência final
  const afterRes = await (async () => {
    const c2 = new pg.Client({ connectionString: DB_URL })
    await c2.connect()
    const r = await c2.query(`SELECT COUNT(*)::int AS sem FROM atendimentos WHERE embedding IS NULL`)
    await c2.end()
    return r.rows[0].sem
  })()

  console.log(dim(`\n  Registros ainda sem embedding: ${afterRes}`))
  if (afterRes === 0) console.log(green("\n✅ Base 100% com busca semântica!\n"))
  else console.log(yellow(`\n  Execute novamente para processar o restante.\n`))
}

main().catch((e) => {
  console.error(red(`\n✗ Erro fatal: ${e.message}`))
  process.exit(1)
})

/**
 * import-pdf-knowledge.mjs
 *
 * Importa PDFs do AUGE para a base de conhecimento semântica.
 * Cada seção do PDF vira um registro em `atendimentos` com embedding vetorial.
 *
 * Uso:
 *   node scripts/import-pdf-knowledge.mjs <pasta_ou_arquivo.pdf> [--dry-run]
 *
 * Exemplos:
 *   node scripts/import-pdf-knowledge.mjs ./docs/auge/
 *   node scripts/import-pdf-knowledge.mjs ./docs/auge/manual-sped.pdf
 *   node scripts/import-pdf-knowledge.mjs ./docs/auge/ --dry-run
 *
 * Variáveis necessárias no .env.local:
 *   DATABASE_URL         → conexão PostgreSQL
 *   OPENAI_API_KEY       → geração de embeddings (text-embedding-3-small)
 *   AI_API_KEY           → Groq para geração de resumos (opcional — sem isso pula resumo AI)
 */

import fs from "fs"
import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"

// ─── Setup ────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Carrega .env.local
function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local")
  if (!fs.existsSync(envPath)) {
    console.warn("⚠  .env.local não encontrado — usando variáveis de ambiente do sistema.")
    return
  }
  const lines = fs.readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx < 0) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key && !process.env[key]) process.env[key] = val
  }
}
loadEnv()

// ─── Configuração ─────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run")
// slice(2) pula o executável do node e o caminho do script
const TARGET = process.argv.slice(2).find((a) => !a.startsWith("--"))

const _tenantIdx = process.argv.indexOf("--tenant-id")
const TENANT_ID = _tenantIdx !== -1 ? process.argv[_tenantIdx + 1] : "auge"
console.log(`  tenant-id : ${TENANT_ID}`)

const DB_URL = process.env.DATABASE_URL
// Embedding: OpenAI ou qualquer API compatível (Jina, Voyage, etc). Groq não oferece embeddings.
const EMBEDDING_KEY = process.env.OPENAI_API_KEY || process.env.EMBEDDING_API_KEY
const GROQ_KEY = process.env.AI_API_KEY || process.env.GROQ_API_KEY
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
const EMBEDDING_BASE = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
// Dimensão do vetor — deve coincidir com o schema do banco (vector(1536))
const EMBEDDING_DIMS = process.env.AI_EMBEDDING_DIMENSIONS ? Number(process.env.AI_EMBEDDING_DIMENSIONS) : 1536
// task para Jina/Matryoshka; ignorado pelo OpenAI
const EMBEDDING_TASK = process.env.AI_EMBEDDING_TASK || "retrieval.passage"
const CHAT_BASE = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1"
const CHAT_MODEL = process.env.AI_CHAT_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct"

const CHUNK_MIN_CHARS = 200   // ignora chunks muito pequenos
const CHUNK_MAX_CHARS = 1200  // limite por chunk (para caber no embedding)
const DELAY_MS = 800          // delay entre chamadas de API (evitar rate limit)

// ─── Utilitários ──────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function bold(s) { return `\x1b[1m${s}\x1b[0m` }
function green(s) { return `\x1b[32m${s}\x1b[0m` }
function yellow(s) { return `\x1b[33m${s}\x1b[0m` }
function red(s) { return `\x1b[31m${s}\x1b[0m` }
function dim(s) { return `\x1b[2m${s}\x1b[0m` }

function progress(current, total, label) {
  const pct = Math.round((current / total) * 100)
  const filled = Math.round(pct / 5)
  const bar = "█".repeat(filled) + "░".repeat(20 - filled)
  process.stdout.write(`\r  [${bar}] ${pct}% ${dim(label.slice(0, 40))}    `)
}

// ─── PDF → texto ──────────────────────────────────────────────────────────────

async function extractTextFromPdf(filePath) {
  const pdfParse = require("pdf-parse")
  const buffer = fs.readFileSync(filePath)
  const data = await pdfParse(buffer)
  return data.text || ""
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text) {
  // Limpa o texto
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  // Divide em parágrafos
  const paragraphs = clean.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)

  const chunks = []
  let current = ""

  for (const para of paragraphs) {
    // Se o parágrafo sozinho é maior que o limite, divide por linhas
    if (para.length > CHUNK_MAX_CHARS) {
      if (current.length >= CHUNK_MIN_CHARS) {
        chunks.push(current.trim())
        current = ""
      }
      // Divide parágrafo longo por frases
      const sentences = para.split(/(?<=[.!?])\s+/)
      for (const sentence of sentences) {
        if ((current + " " + sentence).length > CHUNK_MAX_CHARS && current.length >= CHUNK_MIN_CHARS) {
          chunks.push(current.trim())
          current = sentence
        } else {
          current = current ? current + " " + sentence : sentence
        }
      }
      continue
    }

    // Acumula parágrafos até o limite
    if ((current + "\n\n" + para).length > CHUNK_MAX_CHARS && current.length >= CHUNK_MIN_CHARS) {
      chunks.push(current.trim())
      current = para
    } else {
      current = current ? current + "\n\n" + para : para
    }
  }

  if (current.trim().length >= CHUNK_MIN_CHARS) {
    chunks.push(current.trim())
  }

  return chunks
}

// ─── API: Embedding ───────────────────────────────────────────────────────────

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
          input: [texto.slice(0, 8000)],  // Jina requer array
          task: EMBEDDING_TASK,
          normalized: true,
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        if (res.status === 429) {
          await sleep(5000 * (attempt + 1))
          continue
        }
        throw new Error(`Embedding API ${res.status}: ${err.slice(0, 200)}`)
      }
      const data = await res.json()
      return data?.data?.[0]?.embedding ?? null
    } catch (e) {
      if (attempt === 2) throw e
      await sleep(2000)
    }
  }
  return null
}

// ─── API: Resumo via IA ───────────────────────────────────────────────────────

async function gerarResumo(chunk, nomeArquivo) {
  if (!GROQ_KEY) {
    // Sem chave AI: usa as primeiras 150 chars como resumo
    return chunk.slice(0, 150).replace(/\n/g, " ").trim()
  }

  const system = `Você é um indexador de base de conhecimento técnica do sistema AUGE ERP.
Dado um trecho de manual, responda APENAS um JSON com:
{"topico": "em 1 frase curta: qual processo ou problema este trecho ensina/resolve", "resumo": "em 1-2 frases: o que o técnico encontrará aqui"}
Sem markdown, sem texto fora do JSON.`

  const user = `Arquivo: ${nomeArquivo}
Trecho:
${chunk.slice(0, 800)}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${CHAT_BASE}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_KEY}`,
        },
        body: JSON.stringify({
          model: CHAT_MODEL,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          temperature: 0.1,
          max_tokens: 200,
        }),
      })
      if (!res.ok) {
        if (res.status === 429) { await sleep(8000); continue }
        break
      }
      const data = await res.json()
      const raw = data?.choices?.[0]?.message?.content || ""
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const parsed = JSON.parse(match[0])
        return `${parsed.topico || ""} — ${parsed.resumo || ""}`.slice(0, 300)
      }
    } catch {
      // Se falhar, usa o início do chunk
    }
  }
  return chunk.slice(0, 150).replace(/\n/g, " ").trim()
}

// ─── Banco de Dados ───────────────────────────────────────────────────────────

let pgClient = null

async function getDb() {
  if (pgClient) return pgClient
  const { default: pg } = await import("pg")
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()
  pgClient = client
  return client
}

async function salvarChunk({ resumo_problema, texto_original, solucao, embedding, nomeArquivo, chunkIndex }) {
  const db = await getDb()
  const vector = embedding ? `[${embedding.join(",")}]` : null

  await db.query(
    `INSERT INTO public.atendimentos
       (cliente, tecnico, canal, texto_original, resumo_problema,
        problema, causa, solucao, embedding, processado, ticket_externo, tenant_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8,
             $9::text::vector, true, $10, $11)
     ON CONFLICT DO NOTHING`,
    [
      "DOCS",
      "import_pdf",
      "pdf",
      texto_original,
      resumo_problema,
      `${nomeArquivo} — parte ${chunkIndex + 1}`,
      null,
      texto_original,
      vector,
      `pdf:${nomeArquivo}:${chunkIndex}`,
      TENANT_ID,
    ]
  )
}

// ─── Processamento de um PDF ──────────────────────────────────────────────────

async function processarPdf(filePath) {
  const nomeArquivo = path.basename(filePath, ".pdf")
  console.log(`\n${bold("📄 " + nomeArquivo)}`)

  let texto
  try {
    texto = await extractTextFromPdf(filePath)
  } catch (e) {
    console.log(red(`  ✗ Erro ao ler PDF: ${e.message}`))
    return { arquivo: nomeArquivo, chunks: 0, erros: 1 }
  }

  if (!texto || texto.trim().length < 100) {
    console.log(yellow("  ⚠  Texto extraído vazio ou muito curto — PDF pode ser escaneado (imagem)."))
    console.log(yellow("     Use um OCR (ex: Adobe Acrobat) para converter para PDF com texto."))
    return { arquivo: nomeArquivo, chunks: 0, erros: 0 }
  }

  const chunks = chunkText(texto)
  console.log(dim(`  ${chunks.length} chunks gerados · ${texto.length} chars extraídos`))

  if (DRY_RUN) {
    console.log(yellow("  [DRY-RUN] Nenhum dado salvo."))
    chunks.slice(0, 2).forEach((c, i) => {
      console.log(dim(`  Chunk ${i + 1}: ${c.slice(0, 120).replace(/\n/g, " ")}...`))
    })
    return { arquivo: nomeArquivo, chunks: chunks.length, erros: 0 }
  }

  let salvos = 0
  let erros = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    progress(i + 1, chunks.length, chunk.slice(0, 50))

    try {
      const [resumo, embedding] = await Promise.all([
        gerarResumo(chunk, nomeArquivo),
        gerarEmbedding(chunk),
      ])

      await salvarChunk({
        resumo_problema: resumo,
        texto_original: chunk,
        solucao: chunk,
        embedding,
        nomeArquivo,
        chunkIndex: i,
      })

      salvos++
    } catch (e) {
      erros++
      console.log(`\n  ${red("✗")} Chunk ${i + 1}: ${e.message?.slice(0, 80)}`)
    }

    await sleep(DELAY_MS)
  }

  process.stdout.write("\n")
  console.log(
    salvos > 0
      ? green(`  ✓ ${salvos} chunks salvos`) + (erros > 0 ? red(` · ${erros} erros`) : "")
      : red(`  ✗ Nenhum chunk salvo (${erros} erros)`)
  )

  return { arquivo: nomeArquivo, chunks: salvos, erros }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\n🧠 Importador de PDFs — Base de Conhecimento Mavo AI"))
  console.log(dim("─".repeat(55)))

  if (!TARGET) {
    console.log(red("Uso: node scripts/import-pdf-knowledge.mjs <pasta_ou_arquivo.pdf> [--dry-run]"))
    process.exit(1)
  }

  if (!DB_URL) {
    console.log(red("✗ DATABASE_URL não configurada no .env.local"))
    process.exit(1)
  }

  if (!EMBEDDING_KEY) {
    console.log(yellow("⚠  EMBEDDING_API_KEY não configurada — embeddings desativados."))
    console.log(dim("   Busca textual ainda funciona. Para busca semântica, configure EMBEDDING_API_KEY com OpenAI, Jina AI, Voyage, etc."))
  }
  if (!GROQ_KEY) {
    console.log(yellow("⚠  AI_API_KEY não encontrada — resumos AI desativados (usa início do texto)."))
  }
  if (DRY_RUN) {
    console.log(yellow("🔍 MODO DRY-RUN — nenhum dado será salvo no banco."))
  }

  // Coleta arquivos PDF
  let arquivos = []
  const targetPath = path.resolve(TARGET)

  if (!fs.existsSync(targetPath)) {
    console.log(red(`✗ Caminho não encontrado: ${targetPath}`))
    process.exit(1)
  }

  const stat = fs.statSync(targetPath)
  if (stat.isDirectory()) {
    const all = fs.readdirSync(targetPath)
    arquivos = all
      .filter((f) => f.toLowerCase().endsWith(".pdf"))
      .map((f) => path.join(targetPath, f))
  } else if (targetPath.toLowerCase().endsWith(".pdf")) {
    arquivos = [targetPath]
  } else {
    console.log(red("✗ Informe um arquivo .pdf ou uma pasta contendo PDFs."))
    process.exit(1)
  }

  if (arquivos.length === 0) {
    console.log(yellow("⚠  Nenhum arquivo PDF encontrado no caminho informado."))
    process.exit(0)
  }

  console.log(dim(`\nArquivos encontrados: ${arquivos.length}`))
  arquivos.forEach((f) => console.log(dim("  · " + path.basename(f))))

  // Processa cada PDF
  const resultados = []
  for (const arquivo of arquivos) {
    const resultado = await processarPdf(arquivo)
    resultados.push(resultado)
  }

  // Fecha conexão
  if (pgClient) await pgClient.end()

  // Resumo final
  console.log(bold("\n─── Resumo ───────────────────────────────────────────"))
  let totalChunks = 0
  let totalErros = 0
  for (const r of resultados) {
    const status = r.erros > 0 ? yellow("⚠") : green("✓")
    console.log(`  ${status} ${r.arquivo}: ${r.chunks} chunks${r.erros > 0 ? ` (${r.erros} erros)` : ""}`)
    totalChunks += r.chunks
    totalErros += r.erros
  }
  console.log(bold(`\n  Total: ${totalChunks} chunks importados · ${totalErros} erros`))

  if (totalChunks > 0) {
    console.log(green("\n✅ Base de conhecimento atualizada!"))
    console.log(dim("   A IA já vai usar esses dados nas próximas consultas."))
  }
  console.log()
}

main().catch((e) => {
  console.error(red(`\n✗ Erro fatal: ${e.message}`))
  process.exit(1)
})

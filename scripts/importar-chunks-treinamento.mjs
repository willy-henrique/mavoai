/**
 * importar-chunks-treinamento.mjs
 *
 * Divide o documento Treinamento_IA_Suporte_Auge.md em chunks semânticos
 * por subseção (### e ##) e importa como atendimentos na tabela atendimentos
 * com embeddings vetoriais para enriquecer a busca semântica.
 *
 * Uso:
 *   node scripts/importar-chunks-treinamento.mjs <caminho-do-arquivo>
 *   node scripts/importar-chunks-treinamento.mjs --dry-run <caminho>
 *
 * Exemplo:
 *   node scripts/importar-chunks-treinamento.mjs "C:\Users\marco\Downloads\Treinamento_IA_Suporte_Auge.md"
 *
 * Idempotente: verifica existência por resumo_problema + canal antes de inserir.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  for (const fname of [".env.local", ".env"]) {
    const p = path.join(__dirname, "..", fname)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const eq = t.indexOf("=")
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
      if (k && !process.env[k]) process.env[k] = v
    }
    break
  }
}
loadEnv()

// ─── Cores ────────────────────────────────────────────────────────────────────

const bold   = (s) => `\x1b[1m${s}\x1b[0m`
const green  = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const red    = (s) => `\x1b[31m${s}\x1b[0m`
const dim    = (s) => `\x1b[2m${s}\x1b[0m`
const cyan   = (s) => `\x1b[36m${s}\x1b[0m`

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run")
const _tenantArgIdx = process.argv.indexOf("--tenant-id")
const TENANT_ID = _tenantArgIdx !== -1 ? process.argv[_tenantArgIdx + 1] : "auge"
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:1@localhost:5433/mavoai"
const EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY
const EMBEDDING_BASE = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
const DELAY_MS = 600
const MAX_CHUNK_CHARS = 3200 // ~800 tokens

// Arquivo fonte: pegar do argumento ou caminho padrão
const fileArg = process.argv.find((a) => a.endsWith(".md") || a.endsWith(".txt"))
const DEFAULT_DOC_PATH = path.join(__dirname, "..", "docs", "Treinamento_IA_Suporte_Auge.md")
const DOC_PATH = fileArg || DEFAULT_DOC_PATH

// ─── Mapeamento de seções para categorias ─────────────────────────────────────

const SECTION_CATEGORY_MAP = {
  "1.": "Geral",
  "2.": "Geral",
  "3.": "Geral",
  "4.": "Geral",
  "5.": "Cadastros",
  "5.1": "Cadastros",
  "5.2": "Cadastros",
  "5.3": "Cadastros",
  "5.4": "Cadastros",
  "5.5": "Permissões",
  "6.": "Perfil de Movimento",
  "7.": "Vendas",
  "7.1": "Vendas",
  "7.2": "Vendas",
  "7.3": "Fiscal",
  "7.4": "Vendas",
  "7.5": "Relatórios",
  "8.": "Compras",
  "8.1": "Compras",
  "8.2": "Compras",
  "8.3": "Compras",
  "9.": "Estoque",
  "9.1": "Estoque",
  "9.2": "Estoque",
  "9.3": "Estoque",
  "9.4": "Estoque",
  "10.": "Financeiro",
  "10.1": "Financeiro",
  "10.2": "Financeiro",
  "10.3": "Financeiro",
  "10.4": "Financeiro",
  "10.5": "Financeiro",
  "10.6": "Financeiro",
  "11.": "Fiscal",
  "11.1": "Fiscal",
  "11.2": "Fiscal",
  "11.3": "Fiscal",
  "11.4": "Fiscal",
  "12.": "Fiscal",
  "12.1": "Fiscal",
  "12.2": "Fiscal",
  "12.3": "Fiscal",
  "12.4": "Fiscal",
  "12.5": "Fiscal",
  "12.6": "Fiscal",
  "13.": "Reforma Tributária",
  "14.": "Relatórios",
  "15.": "Diagnósticos",
  "16.": "Geral",
  "17.": "Geral",
  "18.": "Geral",
  "19.": "Geral",
  "20.": "Geral",
}

function categoriaParaSecao(titulo) {
  const m = titulo.match(/^(\d+\.\d+|\d+\.)/)
  if (!m) return "Geral"
  const num = m[1]
  return SECTION_CATEGORY_MAP[num] || "Geral"
}

// ─── Chunking do documento ────────────────────────────────────────────────────

/**
 * Divide o markdown em chunks por ### e ## com limite de caracteres.
 * Cada chunk recebe título, conteúdo, e categoria inferida.
 */
function chunkMarkdown(content) {
  const lines = content.split("\n")
  const chunks = []
  let currentTitle = ""
  let currentLines = []
  let parentSection = ""

  function flush() {
    if (!currentTitle || currentLines.join("\n").trim().length < 50) return

    const body = currentLines.join("\n").trim()
    const sectionNum = currentTitle.match(/(\d+\.\d+|\d+\.)/)?.[1] || ""
    const categoria = categoriaParaSecao(currentTitle)

    // Divide chunks muito longos em partes
    if (body.length > MAX_CHUNK_CHARS) {
      const parts = splitLongChunk(body, currentTitle)
      for (let i = 0; i < parts.length; i++) {
        const suffix = parts.length > 1 ? ` (parte ${i + 1}/${parts.length})` : ""
        const titulo = `${currentTitle}${suffix}`
        chunks.push({
          titulo,
          conteudo: parts[i],
          categoria,
          texto_original: `[${titulo}]\n\n${parts[i]}`,
        })
      }
    } else {
      chunks.push({
        titulo: currentTitle,
        conteudo: body,
        categoria,
        texto_original: `[${currentTitle}]\n\n${body}`,
      })
    }
  }

  for (const line of lines) {
    // Detecta cabeçalhos ## ou ###
    const h3Match = line.match(/^### (.+)/)
    const h2Match = line.match(/^## (.+)/)

    if (h3Match || h2Match) {
      flush()
      currentLines = []
      const rawTitle = (h3Match || h2Match)[1].trim()

      if (h2Match) {
        parentSection = rawTitle
        currentTitle = rawTitle
      } else {
        currentTitle = rawTitle
      }
    } else {
      // Ignora separadores horizontais isolados
      if (line.trim() !== "---") {
        currentLines.push(line)
      }
    }
  }
  flush()

  return chunks
}

function splitLongChunk(body, title) {
  const paragraphs = body.split(/\n{2,}/)
  const parts = []
  let current = []
  let currentLen = 0

  for (const para of paragraphs) {
    if (currentLen + para.length > MAX_CHUNK_CHARS && current.length > 0) {
      parts.push(current.join("\n\n"))
      current = []
      currentLen = 0
    }
    current.push(para)
    currentLen += para.length + 2
  }
  if (current.length > 0) parts.push(current.join("\n\n"))
  return parts
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
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        if (res.status === 429 && attempt < 2) {
          await sleep(3000 * (attempt + 1))
          continue
        }
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
      const data = await res.json()
      return data?.data?.[0]?.embedding ?? null
    } catch (err) {
      if (attempt === 2) throw err
      await sleep(2000)
    }
  }
  return null
}

// ─── Banco ────────────────────────────────────────────────────────────────────

let pgPool = null

async function getPg() {
  if (pgPool) return pgPool
  const pgMod = await import("pg")
  // Suporta tanto `default.Pool` (CJS interop) quanto `Pool` direto
  const PgClass = pgMod.default?.Pool ?? pgMod.Pool ?? pgMod.default
  if (!PgClass) throw new Error("Não foi possível importar Pool do módulo pg")
  pgPool = new PgClass({ connectionString: DB_URL, max: 3, connectionTimeoutMillis: 5000 })
  return pgPool
}

async function dbQuery(sql, params = []) {
  const pool = await getPg()
  const client = await pool.connect()
  try {
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}

function errMsg(err) {
  if (!err) return "erro desconhecido"
  if (typeof err === "string") return err
  return err.message || err.code || String(err) || "erro sem mensagem"
}

async function jaExiste(titulo) {
  const res = await dbQuery(
    "SELECT id FROM atendimentos WHERE canal = 'documentacao' AND resumo_problema = $1 AND tenant_id = $2 LIMIT 1",
    [titulo, TENANT_ID]
  )
  return res.rows.length > 0
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\n=== Importar Chunks de Treinamento ===\n"))
  console.log(`  tenant-id : ${cyan(TENANT_ID)}`)
  if (DRY_RUN) console.log(yellow("  [DRY RUN] nenhum dado será gravado"))

  if (!fs.existsSync(DOC_PATH)) {
    console.error(red(`Arquivo não encontrado: ${DOC_PATH}`))
    console.error(dim(`  Passe o caminho como argumento: node scripts/importar-chunks-treinamento.mjs "caminho/para/arquivo.md"`))
    process.exit(1)
  }

  console.log(dim(`  Fonte: ${DOC_PATH}`))
  const maskedUrl = DB_URL.replace(/:([^:@]{1,40})@/, ":***@")
  console.log(dim(`  DB   : ${maskedUrl}`))
  if (DRY_RUN) console.log(yellow("  [DRY-RUN] Nenhum dado será gravado.\n"))
  if (!EMBEDDING_KEY) console.log(yellow("  [AVISO] Sem chave de embedding — registros sem vetor.\n"))

  // Testa conexão antes de processar
  if (!DRY_RUN) {
    try {
      await dbQuery("SELECT 1")
      console.log(green("  Banco   : conectado\n"))
    } catch (err) {
      console.error(red(`\n  FALHA NA CONEXÃO: ${errMsg(err)}`))
      console.error(dim(`  Verifique DATABASE_URL no .env.local ou .env`))
      console.error(dim(`  URL tentada: ${maskedUrl}`))
      process.exit(1)
    }
  }

  const content = fs.readFileSync(DOC_PATH, "utf-8")
  const chunks = chunkMarkdown(content)

  console.log(cyan(`  Total de chunks gerados: ${chunks.length}\n`))
  console.log(dim("  Prévia dos chunks:"))
  chunks.forEach((c, i) => {
    console.log(dim(`    [${i + 1}] ${c.titulo.slice(0, 70)} (${c.conteudo.length} chars) [${c.categoria}]`))
  })
  console.log("")

  let inseridos = 0
  let pulados = 0
  let erros = 0

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]
    const label = chunk.titulo.slice(0, 55)
    process.stdout.write(`  [${String(i + 1).padStart(2)}/${chunks.length}] ${dim(label.padEnd(55))}`)

    try {
      if (!DRY_RUN) {
        const existe = await jaExiste(chunk.titulo)
        if (existe) {
          process.stdout.write(yellow(" pulado\n"))
          pulados++
          continue
        }

        process.stdout.write(" embed...")
        const embedding = await gerarEmbedding(chunk.texto_original)
        process.stdout.write(embedding ? "" : yellow("(sem key)"))

        const baseParams = [
          "Documentação",
          "documentacao",
          "IA Treinamento",
          new Date(),
          chunk.texto_original,
          chunk.titulo,
          chunk.titulo,
          chunk.conteudo.slice(0, 2000),
          chunk.categoria,
          true,
          TENANT_ID,
        ]

        if (embedding) {
          // Insere com embedding (cast ::vector só quando há valor)
          await dbQuery(
            `INSERT INTO atendimentos
               (cliente, canal, tecnico, data_atendimento, texto_original,
                resumo_problema, problema, solucao, categoria,
                embedding, processado, tenant_id, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
                     $10::vector, $11, $12, NOW(), NOW())`,
            [...baseParams.slice(0, 9), `[${embedding.join(",")}]`, baseParams[9], baseParams[10]]
          )
        } else {
          // Insere sem embedding (sem cast, NULL nativo)
          await dbQuery(
            `INSERT INTO atendimentos
               (cliente, canal, tecnico, data_atendimento, texto_original,
                resumo_problema, problema, solucao, categoria,
                processado, tenant_id, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW(), NOW())`,
            baseParams
          )
        }
        process.stdout.write(green(" ok\n"))
        await sleep(DELAY_MS)
      } else {
        process.stdout.write(dim(" (dry-run)\n"))
      }
      inseridos++
    } catch (err) {
      process.stdout.write(red(` ERRO: ${errMsg(err).slice(0, 100)}\n`))
      if (process.env.VERBOSE) console.error(err)
      erros++
    }
  }

  console.log(bold("\n─────────────────────────────────"))
  console.log(`  Inseridos : ${green(String(inseridos))}`)
  console.log(`  Pulados   : ${yellow(String(pulados))} (já existiam)`)
  console.log(`  Erros     : ${erros > 0 ? red(String(erros)) : dim("0")}`)
  console.log("")

  if (!DRY_RUN && pgPool) await pgPool.end().catch(() => {})
  process.exit(erros > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(red("\nErro fatal:"), err)
  process.exit(1)
})

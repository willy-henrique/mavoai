/**
 * import-google-drive.mjs
 *
 * Importa Google Docs de uma pasta do Drive para a base de conhecimento.
 * Usa Service Account — sem OAuth interativo, sem dependências extras.
 *
 * Uso:
 *   node scripts/import-google-drive.mjs --folder <FOLDER_ID> --label <LABEL> [--tenant-id <TENANT>] [--dry-run]
 *
 * Exemplos:
 *   node scripts/import-google-drive.mjs --folder 1MJ-a1suL8gu... --label TillitPDV
 *   node scripts/import-google-drive.mjs --folder 1MJ-a1suL8gu... --label TillitPDV --dry-run
 */

import fs from "fs"
import path from "path"
import { createSign } from "crypto"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// ─── Env ──────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
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

// ─── Args ─────────────────────────────────────────────────────────────────────

function arg(name) {
  const idx = process.argv.indexOf(`--${name}`)
  return idx !== -1 ? process.argv[idx + 1] : null
}

const FOLDER_ID  = arg("folder")
const LABEL      = arg("label") || "Google Drive"
const TENANT_ID  = arg("tenant-id") || "auge"
const DRY_RUN    = process.argv.includes("--dry-run")

const SA_PATH    = process.env.GOOGLE_SERVICE_ACCOUNT_PATH
                || path.join(__dirname, "..", "mavo-ai-knowledge-06224458b0f3.json")
const API_KEY    = process.env.GOOGLE_API_KEY
const DB_URL     = process.env.DATABASE_URL
const EMBED_KEY  = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY
const EMBED_BASE = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
const EMBED_MOD  = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
const EMBED_TASK = process.env.AI_EMBEDDING_TASK  || "retrieval.passage"
const GROQ_KEY   = process.env.AI_API_KEY || process.env.GROQ_API_KEY
const CHAT_BASE  = process.env.AI_BASE_URL || "https://api.groq.com/openai/v1"
const CHAT_MOD   = process.env.AI_CHAT_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct"

const CHUNK_MIN  = 200
const CHUNK_MAX  = 1200
const DELAY_MS   = 600

// ─── Cores ────────────────────────────────────────────────────────────────────

const bold   = (s) => `\x1b[1m${s}\x1b[0m`
const green  = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const red    = (s) => `\x1b[31m${s}\x1b[0m`
const dim    = (s) => `\x1b[2m${s}\x1b[0m`
const sleep  = (ms) => new Promise((r) => setTimeout(r, ms))

function progress(cur, total, label) {
  const pct    = Math.round((cur / total) * 100)
  const filled = Math.round(pct / 5)
  const bar    = "█".repeat(filled) + "░".repeat(20 - filled)
  process.stdout.write(`\r  [${bar}] ${pct}% ${dim(label.slice(0, 40))}    `)
}

// ─── Google Auth ──────────────────────────────────────────────────────────────

function buildJWT(creds) {
  const header  = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url")
  const now     = Math.floor(Date.now() / 1000)
  const payload = Buffer.from(JSON.stringify({
    iss  : creds.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud  : "https://oauth2.googleapis.com/token",
    exp  : now + 3600,
    iat  : now,
  })).toString("base64url")
  const data = `${header}.${payload}`
  const sign = createSign("RSA-SHA256")
  sign.update(data)
  return `${data}.${sign.sign(creds.private_key, "base64url")}`
}

async function getAccessToken(creds) {
  const jwt = buildJWT(creds)
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method : "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body   : new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion : jwt,
    }),
  })
  const data = await res.json()
  if (!data.access_token) throw new Error(`Auth falhou: ${JSON.stringify(data)}`)
  return data.access_token
}

// ─── Drive API ────────────────────────────────────────────────────────────────

function driveHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}` }
    : {}
}

function driveKeyParam(token) {
  return token ? "" : `&key=${API_KEY}`
}

async function listarDocs(folderId, token) {
  const docs = []

  async function listarPasta(id) {
    let pageToken = null
    do {
      const params = new URLSearchParams({
        q        : `'${id}' in parents and trashed=false`,
        fields   : "nextPageToken,files(id,name,mimeType)",
        pageSize : "100",
      })
      if (pageToken) params.set("pageToken", pageToken)
      if (!token) params.set("key", API_KEY)

      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: driveHeaders(token),
      })
      if (!res.ok) throw new Error(`Drive list ${res.status}: ${await res.text()}`)
      const data = await res.json()

      const TIPOS_SUPORTADOS = new Set([
        "application/vnd.google-apps.document",
        "text/markdown",
        "text/plain",
        "text/x-markdown",
      ])

      for (const file of data.files || []) {
        if (file.mimeType === "application/vnd.google-apps.folder") {
          await listarPasta(file.id)
        } else if (TIPOS_SUPORTADOS.has(file.mimeType)) {
          docs.push(file)
        }
      }

      pageToken = data.nextPageToken || null
    } while (pageToken)
  }

  await listarPasta(folderId)
  return docs
}

async function exportarTexto(doc, token) {
  const headers = driveHeaders(token)

  if (doc.mimeType === "application/vnd.google-apps.document") {
    // Google Doc nativo → export como texto
    const keyParam = token ? "" : `&key=${API_KEY}`
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${doc.id}/export?mimeType=text%2Fplain${keyParam}`,
      { headers }
    )
    if (!res.ok) throw new Error(`Export ${res.status}: ${await res.text()}`)
    return res.text()
  } else {
    // Arquivo de texto/markdown → download direto
    const keyParam = token ? "" : `?key=${API_KEY}`
    const sep = keyParam ? "&" : "?"
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${doc.id}${keyParam}${keyParam ? "&" : "?"}alt=media`,
      { headers }
    )
    if (!res.ok) throw new Error(`Download ${res.status}: ${await res.text()}`)
    return res.text()
  }
}

// ─── Chunking ─────────────────────────────────────────────────────────────────

function chunkText(text) {
  const clean = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  const paragraphs = clean.split(/\n\n+/).map((p) => p.trim()).filter(Boolean)
  const chunks = []
  let current = ""

  for (const para of paragraphs) {
    if (para.length > CHUNK_MAX) {
      if (current.length >= CHUNK_MIN) { chunks.push(current.trim()); current = "" }
      const sentences = para.split(/(?<=[.!?])\s+/)
      for (const s of sentences) {
        if ((current + " " + s).length > CHUNK_MAX && current.length >= CHUNK_MIN) {
          chunks.push(current.trim()); current = s
        } else {
          current = current ? current + " " + s : s
        }
      }
      continue
    }
    if ((current + "\n\n" + para).length > CHUNK_MAX && current.length >= CHUNK_MIN) {
      chunks.push(current.trim()); current = para
    } else {
      current = current ? current + "\n\n" + para : para
    }
  }
  if (current.trim().length >= CHUNK_MIN) chunks.push(current.trim())
  return chunks
}

// ─── Embedding ────────────────────────────────────────────────────────────────

async function gerarEmbedding(texto) {
  if (!EMBED_KEY) return null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${EMBED_BASE}/embeddings`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMBED_KEY}` },
        body   : JSON.stringify({ model: EMBED_MOD, input: [texto.slice(0, 8000)], task: EMBED_TASK, normalized: true }),
      })
      if (res.status === 429) { await sleep(5000 * (attempt + 1)); continue }
      if (!res.ok) break
      const data = await res.json()
      return data?.data?.[0]?.embedding ?? null
    } catch { if (attempt === 2) return null; await sleep(2000) }
  }
  return null
}

// ─── Resumo via IA ────────────────────────────────────────────────────────────

async function gerarResumo(chunk, docName) {
  if (!GROQ_KEY) return chunk.slice(0, 150).replace(/\n/g, " ").trim()

  const system = `Você indexa documentação técnica de ERP.
Responda APENAS JSON: {"topico": "1 frase curta", "resumo": "1-2 frases"}. Sem markdown.`
  const user = `Documento: ${docName}\nTrecho:\n${chunk.slice(0, 800)}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${CHAT_BASE}/chat/completions`, {
        method : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${GROQ_KEY}` },
        body   : JSON.stringify({
          model: CHAT_MOD, temperature: 0.1, max_tokens: 200,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
        }),
      })
      if (res.status === 429) { await sleep(8000); continue }
      if (!res.ok) break
      const data  = await res.json()
      const raw   = data?.choices?.[0]?.message?.content || ""
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        const p = JSON.parse(match[0])
        return `${p.topico || ""} — ${p.resumo || ""}`.slice(0, 300)
      }
    } catch { /* usa fallback */ }
  }
  return chunk.slice(0, 150).replace(/\n/g, " ").trim()
}

// ─── Banco ────────────────────────────────────────────────────────────────────

let pgClient = null
async function getDb() {
  if (pgClient) return pgClient
  const { default: pg } = await import("pg")
  const client = new pg.Client({ connectionString: DB_URL })
  await client.connect()
  pgClient = client
  return client
}

async function salvarChunk({ resumo, texto, embedding, docName, label, idx }) {
  const db     = await getDb()
  const vector = embedding ? `[${embedding.join(",")}]` : null
  const ticket = `gdocs:${label}:${docName}:${idx}`

  const existing = await db.query(
    "SELECT id FROM atendimentos WHERE ticket_externo = $1 LIMIT 1",
    [ticket]
  )
  if (existing.rows.length > 0) return false

  if (vector) {
    await db.query(
      `INSERT INTO public.atendimentos
         (cliente, tecnico, canal, texto_original, resumo_problema, problema, causa,
          solucao, embedding, processado, ticket_externo, tenant_id, categoria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::text::vector,true,$10,$11,$12)`,
      ["DOCS", "import_gdrive", "documentacao", texto, resumo,
       `${docName} — parte ${idx + 1}`, null, texto, vector, ticket, TENANT_ID, label]
    )
  } else {
    await db.query(
      `INSERT INTO public.atendimentos
         (cliente, tecnico, canal, texto_original, resumo_problema, problema, causa,
          solucao, processado, ticket_externo, tenant_id, categoria)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10,$11)`,
      ["DOCS", "import_gdrive", "documentacao", texto, resumo,
       `${docName} — parte ${idx + 1}`, null, texto, ticket, TENANT_ID, label]
    )
  }
  return true
}

// ─── Processar um Doc ─────────────────────────────────────────────────────────

async function processarDoc(doc, token) {
  let texto
  try {
    texto = await exportarTexto(doc, token)
  } catch (e) {
    console.log(red(`  ✗ Export falhou: ${e.message?.slice(0, 80)}`))
    return { salvos: 0, pulados: 0, erros: 1 }
  }

  if (!texto || texto.trim().length < 100) {
    console.log(yellow("  ⚠  Doc vazio ou muito curto — pulando."))
    return { salvos: 0, pulados: 1, erros: 0 }
  }

  const chunks = chunkText(texto)
  console.log(dim(`  ${chunks.length} chunks · ${texto.length} chars`))

  if (DRY_RUN) {
    console.log(yellow("  [DRY-RUN] Nada salvo."))
    return { salvos: chunks.length, pulados: 0, erros: 0 }
  }

  let salvos = 0, pulados = 0, erros = 0

  for (let i = 0; i < chunks.length; i++) {
    progress(i + 1, chunks.length, chunks[i].slice(0, 50))
    try {
      const [resumo, embedding] = await Promise.all([
        gerarResumo(chunks[i], doc.name),
        gerarEmbedding(chunks[i]),
      ])
      const novo = await salvarChunk({ resumo, texto: chunks[i], embedding, docName: doc.name, label: LABEL, idx: i })
      novo ? salvos++ : pulados++
    } catch (e) {
      erros++
      console.log(`\n  ${red("✗")} chunk ${i + 1}: ${e.message?.slice(0, 80)}`)
    }
    await sleep(DELAY_MS)
  }

  process.stdout.write("\n")
  const parts = []
  if (salvos)  parts.push(green(`${salvos} salvos`))
  if (pulados) parts.push(dim(`${pulados} já existiam`))
  if (erros)   parts.push(red(`${erros} erros`))
  console.log("  " + parts.join(" · "))

  return { salvos, pulados, erros }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\n📚 Importador Google Drive → Mavo AI Knowledge"))
  console.log(dim("─".repeat(52)))

  if (!FOLDER_ID) {
    console.log(red("Uso: node scripts/import-google-drive.mjs --folder <ID> --label <LABEL>"))
    process.exit(1)
  }
  if (!DB_URL) { console.log(red("✗ DATABASE_URL não configurada")); process.exit(1) }
  if (!API_KEY && !fs.existsSync(SA_PATH)) {
    console.log(red("✗ Configure GOOGLE_API_KEY no .env.local"))
    process.exit(1)
  }

  if (!EMBED_KEY) console.log(yellow("⚠  Sem EMBEDDING_API_KEY — embeddings desativados."))
  if (!GROQ_KEY)  console.log(yellow("⚠  Sem AI_API_KEY — resumos AI desativados."))
  if (DRY_RUN)    console.log(yellow("🔍 DRY-RUN — nenhum dado será salvo."))

  console.log(dim(`\n  Pasta  : ${FOLDER_ID}`))
  console.log(dim(`  Label  : ${LABEL}`))
  console.log(dim(`  Tenant : ${TENANT_ID}`))
  console.log(dim(`  Auth   : ${API_KEY ? "API Key" : "Service Account"}`))

  // Auth — service account tem prioridade (acessa subpastas), API key é fallback
  let token = null
  if (fs.existsSync(SA_PATH)) {
    process.stdout.write("\n🔑 Autenticando no Google (service account)...")
    const creds = JSON.parse(fs.readFileSync(SA_PATH, "utf-8"))
    try {
      token = await getAccessToken(creds)
      console.log(green(" OK"))
    } catch (e) {
      console.log(red(` FALHOU: ${e.message}`))
      process.exit(1)
    }
  } else {
    console.log(dim("\n🔑 Usando API Key"))
  }

  // Lista Docs
  process.stdout.write("📂 Listando documentos...")
  let docs
  try {
    docs = await listarDocs(FOLDER_ID, token)
    console.log(green(` ${docs.length} docs encontrados`))
  } catch (e) {
    console.log(red(` FALHOU: ${e.message}`))
    process.exit(1)
  }

  if (docs.length === 0) {
    console.log(yellow("\n⚠  Nenhum Google Doc encontrado na pasta."))
    console.log(dim("  Verifique se a pasta foi compartilhada com a service account."))
    process.exit(0)
  }

  docs.forEach((d) => console.log(dim(`  · ${d.name}`)))

  // Processa cada doc
  let totalSalvos = 0, totalPulados = 0, totalErros = 0

  for (const doc of docs) {
    console.log(`\n${bold("📄 " + doc.name)}`)
    const r = await processarDoc(doc, token)
    totalSalvos  += r.salvos
    totalPulados += r.pulados
    totalErros   += r.erros
  }

  if (pgClient) await pgClient.end()

  // Resumo
  console.log(bold("\n─── Resumo ───────────────────────────────────────────"))
  console.log(`  Docs processados : ${docs.length}`)
  console.log(green(`  Chunks salvos   : ${totalSalvos}`))
  if (totalPulados) console.log(dim(`  Já existiam     : ${totalPulados}`))
  if (totalErros)   console.log(red(`  Erros           : ${totalErros}`))

  if (totalSalvos > 0) {
    console.log(green("\n✅ Base de conhecimento atualizada!"))
    console.log(dim("   A IA já usa esses dados nas próximas consultas.\n"))
  }
}

main().catch((e) => {
  console.error(red(`\n✗ Erro fatal: ${e.message}`))
  process.exit(1)
})

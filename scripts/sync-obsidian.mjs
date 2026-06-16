/**
 * scripts/sync-obsidian.mjs
 *
 * Sincroniza o vault do Obsidian (segundo cérebro) para o RAG do Mavo AI.
 * Lê as notas pelo plugin "Local REST API" do Obsidian e indexa cada .md no
 * /api/knowledge/text do Mavo (chunk + embedding + pgvector).
 *
 * Roda de uma máquina que ALCANCE o Obsidian (mesma Radmin VPN da VM) — o
 * servidor do Render NÃO alcança a VPN.
 *
 * Uso:
 *   node scripts/sync-obsidian.mjs            # sincroniza tudo
 *   node scripts/sync-obsidian.mjs --dry-run  # só lista as notas, não indexa
 *   node scripts/sync-obsidian.mjs --limit 5  # processa só as 5 primeiras
 *
 * Env (.env.local):
 *   OBSIDIAN_API_URL   (ex: http://26.x.x.x:27123)
 *   OBSIDIAN_API_TOKEN (pode vir com ou sem o prefixo "Bearer ")
 *   MAVO_BASE          (opcional; default http://localhost:3000)
 *   CEREBRO_INTERNAL_TOKEN (para passar pelo login que protege /api/knowledge)
 */
import { readFileSync, existsSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.join(__dirname, "..", ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    if (k && !process.env[k]) process.env[k] = v
  }
}

const DRY = process.argv.includes("--dry-run")
const limIdx = process.argv.indexOf("--limit")
const LIMIT = limIdx !== -1 ? Number(process.argv[limIdx + 1]) : Infinity

const OBS_URL = (process.env.OBSIDIAN_API_URL || "").replace(/\/$/, "")
const OBS_TOKEN_RAW = process.env.OBSIDIAN_API_TOKEN || ""
const OBS_TOKEN = OBS_TOKEN_RAW.replace(/^Bearer\s+/i, "")
const MAVO_BASE = (process.env.MAVO_BASE || "http://localhost:3000").replace(/\/$/, "")
const MAVO_TOKEN = process.env.CEREBRO_INTERNAL_TOKEN || ""
const TENANT = "auge"

if (!OBS_URL || OBS_URL.includes("26.X.X.X")) {
  console.error("❌ OBSIDIAN_API_URL não configurada (ainda está no placeholder). Edite o .env.local com o IP real da VPN.")
  process.exit(1)
}
if (!OBS_TOKEN) {
  console.error("❌ OBSIDIAN_API_TOKEN não configurada.")
  process.exit(1)
}

const obsHeaders = { Authorization: `Bearer ${OBS_TOKEN}` }

async function obsList(dir = "") {
  const r = await fetch(`${OBS_URL}/vault/${dir}`, { headers: obsHeaders })
  if (!r.ok) throw new Error(`list /vault/${dir} -> ${r.status} ${(await r.text()).slice(0, 120)}`)
  const j = await r.json()
  return Array.isArray(j.files) ? j.files : []
}

/** Lista recursiva de todos os arquivos .md (caminhos relativos ao vault). */
async function listAllMd(dir = "", acc = []) {
  const items = await obsList(dir)
  for (const it of items) {
    const full = dir + it
    if (it.endsWith("/")) {
      await listAllMd(full, acc)
    } else if (it.toLowerCase().endsWith(".md")) {
      acc.push(full)
    }
  }
  return acc
}

async function obsContent(filePath) {
  const r = await fetch(`${OBS_URL}/vault/${encodeURI(filePath)}`, {
    headers: { ...obsHeaders, Accept: "text/markdown" },
  })
  if (!r.ok) throw new Error(`get ${filePath} -> ${r.status}`)
  return r.text()
}

async function indexar(title, text, category) {
  const r = await fetch(`${MAVO_BASE}/api/knowledge/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(MAVO_TOKEN ? { Authorization: `Bearer ${MAVO_TOKEN}` } : {}) },
    body: JSON.stringify({ title, text, tenant_id: TENANT, category }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`mavo ${r.status}: ${JSON.stringify(j).slice(0, 120)}`)
  return j
}

async function run() {
  console.log(`🔌 Obsidian: ${OBS_URL}  →  Mavo: ${MAVO_BASE}`)
  console.log("📚 Listando notas do vault...")
  const files = (await listAllMd()).slice(0, LIMIT)
  console.log(`   ${files.length} nota(s) .md encontrada(s).\n`)

  let ins = 0, skip = 0, err = 0
  for (const f of files) {
    const titulo = f.replace(/\.md$/i, "")
    const categoria = f.includes("/") ? f.split("/")[0] : "Obsidian"
    try {
      if (DRY) { console.log(`  • [dry] ${titulo}  (cat: ${categoria})`); continue }
      const text = await obsContent(f)
      if (!text || text.trim().length < 40) { console.log(`  • ${titulo} — pulado (vazio)`); skip++; continue }
      const res = await indexar(titulo, text, categoria)
      ins += res.inserted ?? 0; skip += res.skipped ?? 0
      console.log(`  ✅ ${titulo} — ${res.inserted} trecho(s), ${res.skipped} já existiam`)
    } catch (e) {
      err++
      console.log(`  ❌ ${titulo} — ${e.message}`)
    }
  }
  console.log(`\n📊 Total: ${ins} trechos indexados, ${skip} pulados, ${err} erros.`)
}

run().catch((e) => { console.error("\n❌ Erro:", e.message); process.exit(1) })

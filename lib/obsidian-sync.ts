/**
 * lib/obsidian-sync.ts
 *
 * Sincroniza o vault do Obsidian (plugin "Local REST API") para o RAG do Mavo.
 * Roda no servidor — só funciona de uma instância do Mavo que ALCANCE o Obsidian
 * (mesma rede/Radmin VPN). O Render (nuvem) não alcança a VPN; rode do Mavo local.
 *
 * Config (painel → system_config / secret-store, com fallback p/ env):
 *   obsidian.api_url      | secret OBSIDIAN_API_TOKEN | obsidian.category
 *
 * Cada etapa é registrada em ingestao_logs (origem='obsidian') → aba Logs.
 */
import { ingestText } from "@/lib/knowledge-ingest"
import { getSecret } from "@/lib/secret-store"
import { getSystemConfig } from "@/lib/system-config-store"
import { query } from "@/lib/database/postgres-client-no-vector"

const TENANT = "auge"

async function obsConfig() {
  const url = ((await getSystemConfig("obsidian.api_url")) || process.env.OBSIDIAN_API_URL || "").replace(/\/$/, "")
  const tokenRaw = (await getSecret("OBSIDIAN_API_TOKEN")) || ""
  const token = tokenRaw.replace(/^Bearer\s+/i, "").trim()
  const category = (await getSystemConfig("obsidian.category")) || "Obsidian"
  return { url, token, category }
}

async function log(status: string, detalhes: Record<string, unknown>) {
  try {
    await query(
      "INSERT INTO ingestao_logs (origem, status, payload, detalhes) VALUES ('obsidian', $1, $2::jsonb, $3::jsonb)",
      [status, JSON.stringify({}), JSON.stringify(detalhes)],
    )
  } catch { /* tabela ausente — ignora */ }
}

export interface SyncResult {
  ok: boolean
  error?: string
  notas?: number
  inseridos?: number
  pulados?: number
  erros?: number
  dryRun?: boolean
  amostra?: string[]
}

export async function syncObsidian(opts: { dryRun?: boolean; limit?: number } = {}): Promise<SyncResult> {
  const { dryRun = false, limit = Infinity } = opts
  const { url, token, category } = await obsConfig()

  if (!url || !token) {
    await log("obsidian_erro", { motivo: "URL ou token do Obsidian não configurados no painel" })
    return { ok: false, error: "URL ou token não configurados" }
  }

  const headers = { Authorization: `Bearer ${token}` }
  const listFiles = async (dir = ""): Promise<string[]> => {
    const r = await fetch(`${url}/vault/${dir}`, { headers, signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error(`list /vault/${dir} -> ${r.status}`)
    const j = await r.json()
    return Array.isArray(j.files) ? j.files : []
  }
  const allMd = async (dir = "", acc: string[] = []): Promise<string[]> => {
    for (const it of await listFiles(dir)) {
      const full = dir + it
      if (it.endsWith("/")) await allMd(full, acc)
      else if (it.toLowerCase().endsWith(".md")) acc.push(full)
    }
    return acc
  }

  let files: string[]
  try {
    files = (await allMd()).slice(0, limit)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await log("obsidian_erro", { motivo: `não alcancei o Obsidian (${url}): ${msg}. Verifique Radmin VPN + firewall + plugin ligado.` })
    return { ok: false, error: msg }
  }

  await log("obsidian_inicio", { notas_encontradas: files.length, dry_run: dryRun, url })

  if (dryRun) {
    return { ok: true, notas: files.length, dryRun: true, amostra: files.slice(0, 50) }
  }

  let inseridos = 0, pulados = 0, erros = 0
  for (const f of files) {
    const titulo = f.replace(/\.md$/i, "")
    const cat = f.includes("/") ? f.split("/")[0] : category
    try {
      const r = await fetch(`${url}/vault/${encodeURI(f)}`, { headers: { ...headers, Accept: "text/markdown" }, signal: AbortSignal.timeout(8000) })
      if (!r.ok) throw new Error(`get -> ${r.status}`)
      const text = await r.text()
      if (!text || text.trim().length < 40) { pulados++; await log("obsidian_pulado", { nota: titulo, motivo: "vazio" }); continue }
      const res = await ingestText({ title: titulo, text, tenantId: TENANT, category: cat })
      inseridos += res.inserted; pulados += res.skipped
      await log(res.inserted > 0 ? "sucesso" : "obsidian_pulado", { nota: titulo, inseridos: res.inserted, pulados: res.skipped, categoria: cat })
    } catch (e) {
      erros++
      await log("obsidian_erro", { nota: titulo, motivo: (e instanceof Error ? e.message : String(e)).slice(0, 200) })
    }
  }

  await log("obsidian_fim", { notas: files.length, indexados: inseridos, pulados, erros })
  return { ok: true, notas: files.length, inseridos, pulados, erros }
}

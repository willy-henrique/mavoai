/**
 * lib/knowledge-ingest.ts
 *
 * Núcleo reutilizável de ingestão de texto no RAG: quebra em chunks, gera
 * embedding (Jina via ai-provider) e grava em `atendimentos` (canal
 * 'documentacao', dedupe por título). Usado pela aba "Treinar" e pelo sync do
 * Obsidian. Sem embedding (falha/sem chave) → grava só texto (fallback textual).
 */
import { query } from "@/lib/database/postgres-client-no-vector"
import { sanitizePII } from "@/lib/pii-sanitizer"
import { gerarEmbeddingIA } from "@/lib/ai-provider"

const MAX_CHUNK_CHARS = 3200

function chunk(title: string, body: string) {
  const paragraphs = body.split(/\n{2,}/).filter((p) => p.trim().length > 0)
  const chunks: Array<{ titulo: string; conteudo: string; texto_original: string }> = []
  let buf: string[] = []
  let bufLen = 0
  let idx = 0

  function flush() {
    const text = buf.join("\n\n").trim()
    if (text.length < 10) return
    idx++
    const titulo = idx === 1 && chunks.length === 0 ? title : `${title} (parte ${idx})`
    chunks.push({ titulo, conteudo: text, texto_original: `[${titulo}]\n\n${text}` })
    buf = []
    bufLen = 0
  }

  for (const para of paragraphs) {
    if (bufLen + para.length > MAX_CHUNK_CHARS && buf.length > 0) flush()
    buf.push(para)
    bufLen += para.length + 2
  }
  flush()
  return chunks
}

export interface IngestResult {
  inserted: number
  skipped: number
  errors: number
  total_chunks: number
}

export async function ingestText(opts: {
  title: string
  text: string
  tenantId?: string
  category?: string
}): Promise<IngestResult> {
  const tenantId = opts.tenantId || "auge"
  const category = opts.category || "Importado"
  const chunks = chunk(opts.title.trim(), sanitizePII(opts.text.trim()))

  let inserted = 0
  let skipped = 0
  let errors = 0

  for (const ch of chunks) {
    try {
      const exists = await query(
        "SELECT id FROM atendimentos WHERE canal = 'documentacao' AND resumo_problema = $1 AND tenant_id = $2 LIMIT 1",
        [ch.titulo, tenantId],
      )
      if (exists.rows.length > 0) { skipped++; continue }

      let embedding: number[] | null = null
      try { embedding = await gerarEmbeddingIA(ch.texto_original, "retrieval.passage") } catch { embedding = null }

      if (embedding) {
        await query(
          `INSERT INTO atendimentos
             (cliente, canal, tecnico, data_atendimento, texto_original,
              resumo_problema, problema, solucao, categoria,
              embedding, processado, tenant_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,NOW(),NOW())`,
          ["Obsidian", "documentacao", "Sistema", new Date(), ch.texto_original,
           ch.titulo, ch.titulo, ch.conteudo.slice(0, 2000), category,
           `[${embedding.join(",")}]`, true, tenantId],
        )
      } else {
        await query(
          `INSERT INTO atendimentos
             (cliente, canal, tecnico, data_atendimento, texto_original,
              resumo_problema, problema, solucao, categoria,
              processado, tenant_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
          ["Obsidian", "documentacao", "Sistema", new Date(), ch.texto_original,
           ch.titulo, ch.titulo, ch.conteudo.slice(0, 2000), category, true, tenantId],
        )
      }
      inserted++
    } catch {
      errors++
    }
  }

  return { inserted, skipped, errors, total_chunks: chunks.length }
}

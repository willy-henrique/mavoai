import { query } from "@/lib/database/postgres-client-no-vector"
import { sanitizePII } from "@/lib/pii-sanitizer"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY
const EMBEDDING_BASE = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
const MAX_CHUNK_CHARS = 3200

// ─── Chunking ─────────────────────────────────────────────────────────────────

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

// ─── Embedding ────────────────────────────────────────────────────────────────

async function gerarEmbedding(texto: string): Promise<number[] | null> {
  if (!EMBEDDING_KEY) return null
  try {
    const res = await fetch(`${EMBEDDING_BASE}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${EMBEDDING_KEY}` },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: [texto.slice(0, 8000)] }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.data?.[0]?.embedding ?? null
  } catch {
    return null
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const { title, text, tenant_id, category } = body as Record<string, string>

  if (!title?.trim()) return NextResponse.json({ error: "title_required" }, { status: 400 })
  if (!text?.trim()) return NextResponse.json({ error: "text_required" }, { status: 400 })

  const tenantId = tenant_id || "auge"
  const cat = category || "Importado"
  // Sanitiza PII antes de chunkar e indexar
  const chunks = chunk(title.trim(), sanitizePII(text.trim()))

  let inserted = 0
  let skipped = 0
  let errors = 0
  const insertedChunks: { titulo: string; preview: string; vectorized: boolean }[] = []

  for (const ch of chunks) {
    try {
      const exists = await query(
        "SELECT id FROM atendimentos WHERE canal = 'documentacao' AND resumo_problema = $1 AND tenant_id = $2 LIMIT 1",
        [ch.titulo, tenantId],
      )
      if (exists.rows.length > 0) { skipped++; continue }

      const embedding = await gerarEmbedding(ch.texto_original)

      if (embedding) {
        await query(
          `INSERT INTO atendimentos
             (cliente, canal, tecnico, data_atendimento, texto_original,
              resumo_problema, problema, solucao, categoria,
              embedding, processado, tenant_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,NOW(),NOW())`,
          [
            "Manual", "documentacao", "Sistema", new Date(),
            ch.texto_original, ch.titulo, ch.titulo,
            ch.conteudo.slice(0, 2000), cat,
            `[${embedding.join(",")}]`, true, tenantId,
          ],
        )
      } else {
        await query(
          `INSERT INTO atendimentos
             (cliente, canal, tecnico, data_atendimento, texto_original,
              resumo_problema, problema, solucao, categoria,
              processado, tenant_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())`,
          [
            "Manual", "documentacao", "Sistema", new Date(),
            ch.texto_original, ch.titulo, ch.titulo,
            ch.conteudo.slice(0, 2000), cat,
            true, tenantId,
          ],
        )
      }
      inserted++
      insertedChunks.push({
        titulo: ch.titulo,
        preview: ch.conteudo.slice(0, 260),
        vectorized: Boolean(embedding),
      })
    } catch {
      errors++
    }
  }

  return NextResponse.json({ inserted, skipped, errors, total_chunks: chunks.length, chunks: insertedChunks })
}

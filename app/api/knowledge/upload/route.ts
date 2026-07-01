import { query } from "@/lib/database/postgres-client-no-vector"
import { chunkPorExtensao, extrairTextoDeArquivo } from "@/lib/document-chunker"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY
const EMBEDDING_BASE = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"

// ─── Embedding ────────────────────────────────────────────────────────────────

async function gerarEmbedding(texto: string): Promise<number[] | null> {
  if (!EMBEDDING_KEY) return null
  try {
    const res = await fetch(`${EMBEDDING_BASE}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${EMBEDDING_KEY}`,
      },
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
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  const tenantId = (formData.get("tenant_id") as string | null) || "auge"
  const category = (formData.get("category") as string | null) || "Importado"

  if (!file) return NextResponse.json({ error: "file_required" }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const fileName = file.name
  const source = fileName.replace(/\.[^.]+$/, "")

  let text = ""
  try {
    text = await extrairTextoDeArquivo(fileName, buffer)
  } catch (e) {
    return NextResponse.json({ error: `parse_failed: ${e instanceof Error ? e.message : String(e)}` }, { status: 422 })
  }

  const chunks = chunkPorExtensao(fileName, text, source)

  if (chunks.length === 0) {
    return NextResponse.json({ error: "no_content_extracted", total_chunks: 0, inserted: 0, skipped: 0, errors: 0 }, { status: 422 })
  }

  let inserted = 0
  let skipped = 0
  let errors = 0
  const insertedChunks: { titulo: string; preview: string; vectorized: boolean }[] = []

  for (const chunk of chunks) {
    try {
      const exists = await query(
        "SELECT id FROM atendimentos WHERE canal = 'documentacao' AND resumo_problema = $1 AND tenant_id = $2 LIMIT 1",
        [chunk.titulo, tenantId],
      )
      if (exists.rows.length > 0) { skipped++; continue }

      const embedding = await gerarEmbedding(chunk.texto_original)

      if (embedding) {
        await query(
          `INSERT INTO atendimentos
             (cliente, canal, tecnico, data_atendimento, texto_original,
              resumo_problema, problema, solucao, categoria,
              embedding, processado, tenant_id, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::vector,$11,$12,NOW(),NOW())`,
          [
            "Upload UI", "documentacao", "Sistema", new Date(),
            chunk.texto_original, chunk.titulo, chunk.titulo,
            chunk.conteudo.slice(0, 2000), category,
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
            "Upload UI", "documentacao", "Sistema", new Date(),
            chunk.texto_original, chunk.titulo, chunk.titulo,
            chunk.conteudo.slice(0, 2000), category,
            true, tenantId,
          ],
        )
      }
      inserted++
      insertedChunks.push({
        titulo: chunk.titulo,
        preview: chunk.conteudo.slice(0, 260),
        vectorized: Boolean(embedding),
      })
    } catch {
      errors++
    }
  }

  return NextResponse.json({ inserted, skipped, errors, total_chunks: chunks.length, chunks: insertedChunks })
}

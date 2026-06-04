/**
 * POST /api/embeddings
 *
 * Gera embedding vetorial para um texto.
 * Usado por scripts internos e ferramentas de debug.
 *
 * Body:  { texto: string, task?: "retrieval.query" | "retrieval.passage" }
 * Response: { embedding: number[], model: string, dimensions: number }
 */

import { NextResponse } from "next/server"
import { gerarEmbeddingIA } from "@/lib/ai-provider"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (!raw.trim()) return NextResponse.json({ error: "body_vazio" }, { status: 400 })
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "json_invalido" }, { status: 400 })
  }

  const texto = typeof body.texto === "string" ? body.texto.trim() : ""
  const task  = typeof body.task  === "string" ? body.task  : "retrieval.query"

  if (!texto) return NextResponse.json({ error: "texto_obrigatorio" }, { status: 400 })
  if (texto.length > 8000) return NextResponse.json({ error: "texto_muito_longo" }, { status: 400 })

  try {
    const embedding = await gerarEmbeddingIA(texto, task)
    return NextResponse.json({
      embedding,
      dimensions: embedding.length,
      model: process.env.AI_EMBEDDING_MODEL || "jina-embeddings-v5-text-small",
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("EMBEDDING_API_KEY") || msg.includes("OPENAI_API_KEY")) {
      return NextResponse.json({ error: "embedding_nao_configurado" }, { status: 503 })
    }
    console.error("embeddings error:", msg)
    return NextResponse.json({ error: "embedding_falhou" }, { status: 500 })
  }
}

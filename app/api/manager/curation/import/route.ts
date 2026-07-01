/**
 * POST /api/manager/curation/import
 *
 * Importa um documento (PDF, DOCX, MD ou TXT), quebra em seções e cria cada
 * seção como um RASCUNHO em knowledge_items — ao contrário do upload antigo
 * (app/api/knowledge/upload), que grava direto em `atendimentos` sem revisão.
 * Aqui o gerente ainda decide o que publicar (Revisão/Sandbox), igual à dobradinha.
 */
import { NextResponse } from "next/server"
import { chunkPorExtensao, extrairTextoDeArquivo } from "@/lib/document-chunker"
import { createKnowledgeItem, listKnowledgeItems } from "@/lib/knowledge-curation"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const EXTENSOES_ACEITAS = [".pdf", ".docx", ".md", ".markdown", ".txt"]

export async function POST(request: Request) {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  const tenantId = (formData.get("tenant_id") as string | null) || "auge"
  const categoria = (formData.get("category") as string | null) || null

  if (!file) return NextResponse.json({ error: "file_required" }, { status: 400 })

  const fileName = file.name
  const extensaoValida = EXTENSOES_ACEITAS.some((ext) => fileName.toLowerCase().endsWith(ext))
  if (!extensaoValida) {
    return NextResponse.json(
      { error: "tipo_nao_suportado", detail: `Aceito apenas: ${EXTENSOES_ACEITAS.join(", ")}` },
      { status: 415 },
    )
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const source = fileName.replace(/\.[^.]+$/, "")

  let text = ""
  try {
    text = await extrairTextoDeArquivo(fileName, buffer)
  } catch (e) {
    return NextResponse.json(
      { error: "parse_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 422 },
    )
  }

  const chunks = chunkPorExtensao(fileName, text, source)
  if (chunks.length === 0) {
    return NextResponse.json({ error: "no_content_extracted", total_chunks: 0, inserted: 0, skipped: 0 }, { status: 422 })
  }

  // Dedupe: não recria rascunho pra uma seção já importada antes (mesmo título de pergunta + tenant).
  const existentes = await listKnowledgeItems({ tenantId, status: "todos", limit: 100 })
  const perguntasExistentes = new Set(existentes.data.map((i) => i.pergunta))

  let inserted = 0
  let skipped = 0
  let errors = 0
  const criados: Array<{ id: string; pergunta: string }> = []

  for (const chunk of chunks) {
    if (perguntasExistentes.has(chunk.titulo)) {
      skipped++
      continue
    }
    try {
      const item = await createKnowledgeItem({
        tenant_id: tenantId,
        pergunta: chunk.titulo,
        categoria,
        resposta_oficial: chunk.conteudo,
        status: "rascunho",
        criador: "documento",
        origem_conversa_id: `arquivo:${fileName}`,
      })
      criados.push({ id: item.id, pergunta: item.pergunta })
      inserted++
    } catch (e) {
      errors++
      logger.warn("curadoria_import_chunk_falhou", { fileName, titulo: chunk.titulo, error: e instanceof Error ? e.message : String(e) })
    }
  }

  logger.info("curadoria_import_concluido", { fileName, tenantId, total_chunks: chunks.length, inserted, skipped, errors })

  return NextResponse.json({ arquivo: fileName, total_chunks: chunks.length, inserted, skipped, errors, criados })
}

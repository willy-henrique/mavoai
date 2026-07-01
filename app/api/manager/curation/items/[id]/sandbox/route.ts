import { NextResponse } from "next/server"
import { z } from "zod"
import { getKnowledgeItem } from "@/lib/knowledge-curation"
import { simularPublicacao } from "@/lib/knowledge-sandbox"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  pergunta: z.string().max(2000).optional(),
})

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  let json: unknown = {}
  try {
    json = await request.json()
  } catch {
    // corpo vazio é válido (usa a pergunta do próprio item)
  }
  const parsed = bodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 })
  }

  const item = await getKnowledgeItem(id)
  if (!item) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 })

  try {
    const resultado = await simularPublicacao(item, parsed.data.pergunta)
    return NextResponse.json({ data: resultado })
  } catch (e) {
    return NextResponse.json(
      { error: "sandbox_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { ADMIN_COOKIE, getSession } from "@/lib/admin-auth"
import {
  deleteKnowledgeItem,
  getKnowledgeItem,
  transitionStatus,
  updateKnowledgeItem,
  KNOWLEDGE_STATUSES,
  type KnowledgeStatus,
} from "@/lib/knowledge-curation"

export const dynamic = "force-dynamic"

async function autorAtual(): Promise<string> {
  try {
    const c = await cookies()
    const s = await getSession(c.get(ADMIN_COOKIE)?.value)
    return s?.role ?? "gerente"
  } catch {
    return "gerente"
  }
}

const patchSchema = z.object({
  // transição de status (publicar/arquivar/voltar pra rascunho/em teste)
  status: z.enum(KNOWLEDGE_STATUSES as [string, ...string[]]).optional(),
  // edição de conteúdo
  pergunta: z.string().min(3).optional(),
  intencao: z.string().nullable().optional(),
  categoria: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  palavras_chave: z.array(z.string()).optional(),
  resposta_oficial: z.string().optional(),
  resposta_alternativa: z.string().nullable().optional(),
  exemplos: z.array(z.string()).optional(),
  confianca: z.number().min(0).max(1).optional(),
  prioridade: z.number().int().optional(),
})

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const item = await getKnowledgeItem(id)
  if (!item) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 })
  return NextResponse.json({ data: item })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 })
  }

  const autor = await autorAtual()
  const { status, ...content } = parsed.data

  try {
    // 1) aplica edição de conteúdo, se houver
    if (Object.keys(content).length > 0) {
      const updated = await updateKnowledgeItem(id, { ...content, revisor: autor })
      if (!updated) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 })
    }
    // 2) aplica transição de status, se houver
    if (status) {
      const moved = await transitionStatus(id, status as KnowledgeStatus, autor)
      if (!moved) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 })
      return NextResponse.json({ data: moved })
    }
    const item = await getKnowledgeItem(id)
    return NextResponse.json({ data: item })
  } catch (e) {
    return NextResponse.json(
      { error: "update_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const ok = await deleteKnowledgeItem(id)
    if (!ok) return NextResponse.json({ error: "nao_encontrado" }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: "delete_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

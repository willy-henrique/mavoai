import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { z } from "zod"
import { ADMIN_COOKIE, getSession } from "@/lib/admin-auth"
import {
  createKnowledgeItem,
  gerarRascunhoDeConversa,
  listKnowledgeItems,
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

// ─── GET: lista itens (filtro por status/busca, paginação) ──────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get("status") || "todos"
  const status = (KNOWLEDGE_STATUSES as string[]).includes(statusParam)
    ? (statusParam as KnowledgeStatus)
    : "todos"

  const result = await listKnowledgeItems({
    tenantId: searchParams.get("tenant_id") || undefined,
    status,
    busca: searchParams.get("busca") || undefined,
    limit: Number(searchParams.get("limit")) || 20,
    offset: Number(searchParams.get("offset")) || 0,
  })
  return NextResponse.json(result)
}

// ─── POST: cria conhecimento (manual) ou gera rascunho da "dobradinha" ──────────
const dobradinhaSchema = z.object({
  modo: z.literal("dobradinha"),
  tenant_id: z.string().optional(),
  perguntaCliente: z.string().min(3),
  solucaoTecnico: z.string().min(3),
  transcricao: z.string().optional(),
  conversationId: z.string().optional(),
  atendimentoId: z.string().optional(),
})

const manualSchema = z.object({
  modo: z.literal("manual").optional(),
  tenant_id: z.string().optional(),
  pergunta: z.string().min(3),
  resposta_oficial: z.string().min(1),
  intencao: z.string().optional().nullable(),
  categoria: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  palavras_chave: z.array(z.string()).optional(),
  resposta_alternativa: z.string().optional().nullable(),
  exemplos: z.array(z.string()).optional(),
  confianca: z.number().min(0).max(1).optional(),
  prioridade: z.number().int().optional(),
})

export async function POST(request: Request) {
  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const autor = await autorAtual()

  // Dobradinha: pergunta do cliente + solução do técnico → rascunho enriquecido
  if ((json as { modo?: string })?.modo === "dobradinha") {
    const parsed = dobradinhaSchema.safeParse(json)
    if (!parsed.success) {
      return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 })
    }
    try {
      const item = await gerarRascunhoDeConversa({
        tenantId: parsed.data.tenant_id,
        perguntaCliente: parsed.data.perguntaCliente,
        solucaoTecnico: parsed.data.solucaoTecnico,
        transcricao: parsed.data.transcricao,
        conversationId: parsed.data.conversationId,
        atendimentoId: parsed.data.atendimentoId,
        criador: autor,
      })
      return NextResponse.json({ data: item }, { status: 201 })
    } catch (e) {
      return NextResponse.json(
        { error: "create_failed", detail: e instanceof Error ? e.message : String(e) },
        { status: 500 },
      )
    }
  }

  // Manual
  const parsed = manualSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: "validation_error", details: parsed.error.flatten() }, { status: 400 })
  }
  try {
    const item = await createKnowledgeItem({ ...parsed.data, status: "rascunho", criador: autor })
    return NextResponse.json({ data: item }, { status: 201 })
  } catch (e) {
    return NextResponse.json(
      { error: "create_failed", detail: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

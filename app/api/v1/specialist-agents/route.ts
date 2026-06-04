/**
 * GET  /api/v1/specialist-agents?tenant_id=X  → lista todos
 * POST /api/v1/specialist-agents               → cria/atualiza (upsert por domain)
 * Auth: CEREBRO_INTERNAL_TOKEN
 */

import { NextResponse } from "next/server"
import { loadAllSpecialistAgents, upsertSpecialistAgent } from "@/lib/specialist-agent-store"

export const dynamic = "force-dynamic"

function isAdmin(req: Request): boolean {
  const auth = req.headers.get("Authorization") || ""
  const token = process.env.CEREBRO_INTERNAL_TOKEN || ""
  return !!token && auth === `Bearer ${token}`
}

export async function GET(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const tenantId = new URL(req.url).searchParams.get("tenant_id") ?? "auge"
  const agents = await loadAllSpecialistAgents(tenantId)
  return NextResponse.json({ agents, total: agents.length })
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }

  const tenantId  = typeof body.tenant_id  === "string" ? body.tenant_id  : "auge"
  const domain    = typeof body.domain     === "string" ? body.domain.trim()    : ""
  const name      = typeof body.name       === "string" ? body.name.trim()      : ""
  if (!domain) return NextResponse.json({ error: "domain_required" }, { status: 400 })
  if (!name)   return NextResponse.json({ error: "name_required" },   { status: 400 })

  const agent = await upsertSpecialistAgent({
    tenant_id    : tenantId,
    domain,
    name,
    description  : typeof body.description    === "string" ? body.description    : null,
    system_prompt: typeof body.system_prompt  === "string" ? body.system_prompt  : "",
    keywords     : Array.isArray(body.keywords) ? (body.keywords as string[]).filter(Boolean) : [],
    model_base_url: typeof body.model_base_url === "string" ? body.model_base_url || null : null,
    model_name   : typeof body.model_name     === "string" ? body.model_name     || null : null,
    priority     : typeof body.priority       === "number" ? body.priority       : 0,
    is_active    : body.is_active !== false,
  })
  return NextResponse.json(agent, { status: 201 })
}

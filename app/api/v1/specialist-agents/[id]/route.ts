/**
 * GET    /api/v1/specialist-agents/:id
 * PATCH  /api/v1/specialist-agents/:id
 * DELETE /api/v1/specialist-agents/:id
 */

import { NextResponse } from "next/server"
import {
  loadAllSpecialistAgents,
  updateSpecialistAgentById,
  deleteSpecialistAgentById,
} from "@/lib/specialist-agent-store"

export const dynamic = "force-dynamic"

function isAdmin(req: Request): boolean {
  const auth = req.headers.get("Authorization") || ""
  const token = process.env.CEREBRO_INTERNAL_TOKEN || ""
  return !!token && auth === `Bearer ${token}`
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id } = await params
  const tenantId = new URL(req.url).searchParams.get("tenant_id") ?? "auge"
  const all = await loadAllSpecialistAgents(tenantId)
  const agent = all.find((a) => a.id === id)
  if (!agent) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json(agent)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id } = await params
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }) }
  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id : "auge"

  const updated = await updateSpecialistAgentById(id, tenantId, {
    name         : typeof body.name          === "string"  ? body.name          : undefined,
    description  : typeof body.description   === "string"  ? body.description   : undefined,
    system_prompt: typeof body.system_prompt === "string"  ? body.system_prompt : undefined,
    keywords     : Array.isArray(body.keywords) ? (body.keywords as string[]) : undefined,
    model_base_url: typeof body.model_base_url === "string" ? body.model_base_url || null : undefined,
    model_name   : typeof body.model_name    === "string"  ? body.model_name || null : undefined,
    priority     : typeof body.priority      === "number"  ? body.priority     : undefined,
    is_active    : typeof body.is_active     === "boolean" ? body.is_active    : undefined,
  })

  if (!updated) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isAdmin(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id } = await params
  const tenantId = new URL(req.url).searchParams.get("tenant_id") ?? "auge"
  const ok = await deleteSpecialistAgentById(id, tenantId)
  if (!ok) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}

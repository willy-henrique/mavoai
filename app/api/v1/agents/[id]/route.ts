/**
 * GET  /api/v1/agents/:id         → retorna config atual + defaults
 * PUT  /api/v1/agents/:id         → atualiza enabled, system_prompt, params (PATCH semântico)
 * POST /api/v1/agents/:id/reset   → restaura defaults (apaga o registro do banco)
 *
 * Auth: CEREBRO_INTERNAL_TOKEN (Bearer).
 */

import { NextResponse } from "next/server"
import {
  AGENT_IDS,
  AGENT_DEFAULTS,
  loadAgentConfig,
  saveAgentConfig,
  invalidateAgentConfigCache,
  type AgentId,
} from "@/lib/agent-config"
import { query } from "@/lib/database/postgres-client-no-vector"

export const dynamic = "force-dynamic"

function isAdminAuth(req: Request): boolean {
  const auth = req.headers.get("Authorization") || ""
  const expected = process.env.CEREBRO_INTERNAL_TOKEN || ""
  return !!expected && auth === `Bearer ${expected}`
}

function isValidAgentId(id: string): id is AgentId {
  return (AGENT_IDS as readonly string[]).includes(id)
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminAuth(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await params
  if (!isValidAgentId(id)) return NextResponse.json({ error: "agent_not_found" }, { status: 404 })

  const url = new URL(request.url)
  const tenantId = url.searchParams.get("tenant_id") ?? "default"

  const cfg = await loadAgentConfig(id, tenantId)

  return NextResponse.json({
    agent_id: id,
    tenant_id: tenantId,
    enabled: cfg.enabled,
    system_prompt: cfg.system_prompt,
    params: cfg.params,
    defaults: AGENT_DEFAULTS[id],
    updated_at: cfg.updated_at,
  })
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminAuth(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await params
  if (!isValidAgentId(id)) return NextResponse.json({ error: "agent_not_found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const url = new URL(request.url)
  const tenantId = (body.tenant_id as string | undefined) ?? url.searchParams.get("tenant_id") ?? "default"

  const patch: Parameters<typeof saveAgentConfig>[2] = {}

  if (typeof body.enabled === "boolean") patch.enabled = body.enabled
  if ("system_prompt" in body) {
    patch.system_prompt =
      body.system_prompt === null || body.system_prompt === ""
        ? null
        : String(body.system_prompt)
  }
  if (body.params !== null && typeof body.params === "object") {
    patch.params = body.params as Record<string, unknown>
  }

  await saveAgentConfig(id, tenantId, patch)

  const updated = await loadAgentConfig(id, tenantId)

  return NextResponse.json({
    ok: true,
    agent_id: id,
    tenant_id: tenantId,
    enabled: updated.enabled,
    system_prompt: updated.system_prompt,
    params: updated.params,
    updated_at: updated.updated_at,
  })
}

// ─── DELETE — restaura defaults (remove da tabela) ────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminAuth(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await params
  if (!isValidAgentId(id)) return NextResponse.json({ error: "agent_not_found" }, { status: 404 })

  const url = new URL(request.url)
  const tenantId = url.searchParams.get("tenant_id") ?? "default"

  await query(
    `DELETE FROM public.agent_configs WHERE agent_id = $1 AND tenant_id = $2`,
    [id, tenantId],
  )
  invalidateAgentConfigCache(id, tenantId)

  return NextResponse.json({ ok: true, message: "Configuração restaurada para os defaults.", agent_id: id })
}

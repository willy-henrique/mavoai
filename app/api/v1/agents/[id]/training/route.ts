/**
 * GET  /api/v1/agents/:id/training  → lista exemplos de treinamento
 * POST /api/v1/agents/:id/training  → adiciona exemplo
 *
 * Auth: CEREBRO_INTERNAL_TOKEN (Bearer).
 */

import { NextResponse } from "next/server"
import { AGENT_IDS, type AgentId } from "@/lib/agent-config"
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
  const includeInactive = url.searchParams.get("include_inactive") === "true"

  const result = await query(
    `SELECT id, label, input, expected_output, notes, active, created_at
     FROM public.agent_training_examples
     WHERE agent_id = $1 AND tenant_id = $2
       AND ($3 OR active = true)
     ORDER BY created_at DESC
     LIMIT 200`,
    [id, tenantId, includeInactive],
  )

  return NextResponse.json({
    agent_id: id,
    tenant_id: tenantId,
    examples: result.rows,
    total: result.rows.length,
  })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(
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

  const tenantId = (body.tenant_id as string | undefined) ?? "default"
  const input = String(body.input ?? "").trim()
  if (!input) return NextResponse.json({ error: "input_required" }, { status: 400 })

  const result = await query(
    `INSERT INTO public.agent_training_examples
       (agent_id, tenant_id, label, input, expected_output, notes, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, label, input, expected_output, notes, active, created_at`,
    [
      id,
      tenantId,
      body.label ? String(body.label) : null,
      input,
      body.expected_output ? String(body.expected_output) : null,
      body.notes ? String(body.notes) : null,
      true,
    ],
  )

  return NextResponse.json({ ok: true, example: result.rows[0] }, { status: 201 })
}

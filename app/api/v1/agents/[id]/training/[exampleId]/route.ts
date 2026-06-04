/**
 * GET    /api/v1/agents/:id/training/:exampleId  → detalhe do exemplo
 * PUT    /api/v1/agents/:id/training/:exampleId  → edita o exemplo
 * DELETE /api/v1/agents/:id/training/:exampleId  → desativa (soft-delete)
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
  { params }: { params: Promise<{ id: string; exampleId: string }> },
) {
  if (!isAdminAuth(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id, exampleId } = await params
  if (!isValidAgentId(id)) return NextResponse.json({ error: "agent_not_found" }, { status: 404 })

  const result = await query(
    `SELECT * FROM public.agent_training_examples WHERE id = $1 AND agent_id = $2`,
    [exampleId, id],
  )
  if (!result.rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json(result.rows[0])
}

// ─── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; exampleId: string }> },
) {
  if (!isAdminAuth(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id, exampleId } = await params
  if (!isValidAgentId(id)) return NextResponse.json({ error: "agent_not_found" }, { status: 404 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const result = await query(
    `UPDATE public.agent_training_examples
     SET label           = COALESCE($3, label),
         input           = COALESCE($4, input),
         expected_output = COALESCE($5, expected_output),
         notes           = COALESCE($6, notes),
         active          = COALESCE($7, active)
     WHERE id = $1 AND agent_id = $2
     RETURNING *`,
    [
      exampleId,
      id,
      body.label ?? null,
      body.input ?? null,
      body.expected_output ?? null,
      body.notes ?? null,
      body.active ?? null,
    ],
  )

  if (!result.rows[0]) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json({ ok: true, example: result.rows[0] })
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; exampleId: string }> },
) {
  if (!isAdminAuth(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { id, exampleId } = await params
  if (!isValidAgentId(id)) return NextResponse.json({ error: "agent_not_found" }, { status: 404 })

  await query(
    `UPDATE public.agent_training_examples SET active = false WHERE id = $1 AND agent_id = $2`,
    [exampleId, id],
  )
  return NextResponse.json({ ok: true, message: "Exemplo desativado." })
}

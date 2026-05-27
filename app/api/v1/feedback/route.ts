/**
 * POST /api/v1/feedback
 *
 * Registra feedback sobre a eficácia de uma resolução.
 * Autenticado por API Key (scope: query ou curate — qualquer scope).
 *
 * Body:    { conversation_id, resolution_worked, feedback_source, [atendimento_id], [notes] }
 * Headers: Authorization: Bearer mk_live_...
 * Response: { ok, id }
 */

import { NextResponse } from "next/server"
import { validateApiKey, checkApiKeyRateLimit } from "@/lib/api-key-auth"
import { query } from "@/lib/database/postgres-client-no-vector"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // Auth — qualquer scope válido pode enviar feedback
  const auth = await validateApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  if (!checkApiKeyRateLimit(auth.keyId, 60)) {
    return NextResponse.json({ error: "rate_limit_exceeded" }, { status: 429 })
  }

  // Body
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const conversationId   = typeof body.conversation_id   === "string"  ? body.conversation_id.trim()   : ""
  const feedbackSource   = typeof body.feedback_source   === "string"  ? body.feedback_source.trim()   : "api"
  const resolutionWorked = typeof body.resolution_worked === "boolean"  ? body.resolution_worked        : null
  const atendimentoId    = typeof body.atendimento_id    === "string"  ? body.atendimento_id.trim()    : null
  const notes            = typeof body.notes             === "string"  ? body.notes.trim().slice(0, 2000) : null

  if (!conversationId) return NextResponse.json({ error: "conversation_id_required" }, { status: 400 })

  const validSources = ["cliente", "atendente", "auto", "api"]
  const source = validSources.includes(feedbackSource) ? feedbackSource : "api"

  try {
    const result = await query(
      `INSERT INTO public.resolution_feedback
         (conversation_id, tenant_id, atendimento_id, resolution_worked, feedback_source, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [conversationId, auth.tenantId, atendimentoId, resolutionWorked, source, notes],
    )

    const id = result.rows[0]?.id

    // Se resolution_worked = false, marca o atendimento para revisão humana
    if (resolutionWorked === false && atendimentoId) {
      query(
        `UPDATE public.atendimentos
            SET resolution_confirmed = false,
                resolution_source    = 'human'
          WHERE id = $1 AND tenant_id = $2`,
        [atendimentoId, auth.tenantId],
      ).catch(() => {})
    } else if (resolutionWorked === true && atendimentoId) {
      query(
        `UPDATE public.atendimentos
            SET resolution_confirmed    = true,
                resolution_confirmed_at = NOW(),
                resolution_source       = $3
          WHERE id = $1 AND tenant_id = $2`,
        [atendimentoId, auth.tenantId, source],
      ).catch(() => {})
    }

    return NextResponse.json({ ok: true, id }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("v1/feedback error:", msg)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

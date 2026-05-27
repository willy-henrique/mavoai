/**
 * POST /api/v1/curator
 *
 * Curadoria automática de conversa encerrada.
 * Autenticado por API Key (scope: curate).
 *
 * Body:    { conversation_id, raw_text, [tenant_id] }
 * Headers: Authorization: Bearer mk_live_...
 * Response: CuratedCase + recurrence_alert
 */

import { NextResponse } from "next/server"
import { validateApiKey, hasScope, checkApiKeyRateLimit } from "@/lib/api-key-auth"
import { curarConversa } from "@/lib/ai-curator"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // Auth
  const auth = await validateApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasScope(auth.scopes, "curate")) {
    return NextResponse.json({ error: "scope_not_allowed", required: "curate" }, { status: 403 })
  }

  // Rate limit conservador: curadoria é custosa (LLM + embedding)
  if (!checkApiKeyRateLimit(auth.keyId, 10)) {
    return NextResponse.json({ error: "rate_limit_exceeded" }, { status: 429 })
  }

  // Body
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const conversationId = typeof body.conversation_id === "string" ? body.conversation_id.trim() : ""
  const rawText        = typeof body.raw_text        === "string" ? body.raw_text.trim()        : ""

  if (!conversationId) return NextResponse.json({ error: "conversation_id_required" }, { status: 400 })
  if (!rawText)        return NextResponse.json({ error: "raw_text_required" },        { status: 400 })
  if (rawText.length > 50_000) return NextResponse.json({ error: "raw_text_too_long" }, { status: 400 })

  // Tenant: usa o da API Key (ignorar body.tenant_id por segurança)
  const tenantId = auth.tenantId

  try {
    const curated = await curarConversa(rawText, tenantId, conversationId)

    return NextResponse.json({
      ok              : true,
      id              : curated.id,
      resumo_problema : curated.resumo_problema,
      causa           : curated.causa,
      solucao         : curated.solucao,
      categoria       : curated.categoria,
      tags            : curated.tags,
      dominio         : curated.dominio,
      recurrence_alert: curated.recurrence_alert,
      tenant_id       : curated.tenant_id,
    }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("429") || msg.includes("rate_limit")) {
      return NextResponse.json({ error: "rate_limit_ia" }, { status: 429 })
    }
    if (msg.includes("AI_API_KEY") || msg.includes("EMBEDDING_API_KEY")) {
      return NextResponse.json({ error: "ia_nao_configurada" }, { status: 503 })
    }
    console.error("v1/curator error:", msg)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

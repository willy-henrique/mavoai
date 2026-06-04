/**
 * POST /api/v1/ingest
 *
 * Endpoint público de ingestão de conhecimento.
 * Autenticado por API Key (scope: ingest).
 * Tenant é extraído automaticamente da API Key.
 *
 * Body:    { title: string, text: string, category?: string }
 * Headers: Authorization: Bearer mk_live_...
 * Response: { inserted, skipped, errors, total_chunks }
 */

import { NextResponse } from "next/server"
import { validateApiKey, hasScope, checkApiKeyRateLimit } from "@/lib/api-key-auth"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // Auth
  const auth = await validateApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasScope(auth.scopes, "ingest")) {
    return NextResponse.json({ error: "scope_not_allowed", required: "ingest" }, { status: 403 })
  }

  // Rate limit (mais conservador para ingestão)
  if (!checkApiKeyRateLimit(auth.keyId, 20)) {
    return NextResponse.json({ error: "rate_limit_exceeded" }, { status: 429 })
  }

  // Body
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const title    = typeof body.title    === "string" ? body.title.trim()    : ""
  const text     = typeof body.text     === "string" ? body.text.trim()     : ""
  const category = typeof body.category === "string" ? body.category.trim() : "Importado"

  if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 })
  if (!text)  return NextResponse.json({ error: "text_required" },  { status: 400 })

  // Delega para o endpoint interno /api/knowledge/text, injetando o tenant da API Key
  try {
    const internalUrl = `${process.env.INTERNAL_BASE_URL || "http://localhost:3000"}/api/knowledge/text`
    const resp = await fetch(internalUrl, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ title, text, tenant_id: auth.tenantId, category }),
    })

    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("v1/ingest error:", msg)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

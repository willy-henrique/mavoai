/**
 * POST /api/v1/search
 *
 * Endpoint público de busca semântica.
 * Autenticado por API Key (scope: search).
 * Busca é tenant-scoped automaticamente pela key.
 *
 * Body:    { texto: string, limite?: number }
 * Headers: Authorization: Bearer mk_live_...
 * Response: { resultados[], total, tenant_id, estrategia }
 */

import { NextResponse } from "next/server"
import { validateApiKey, hasScope, checkApiKeyRateLimit } from "@/lib/api-key-auth"
import { buscarSemantica } from "@/lib/semantic-search"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // Auth
  const auth = await validateApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasScope(auth.scopes, "search")) {
    return NextResponse.json({ error: "scope_not_allowed", required: "search" }, { status: 403 })
  }

  // Rate limit
  if (!checkApiKeyRateLimit(auth.keyId, 120)) {
    return NextResponse.json({ error: "rate_limit_exceeded" }, { status: 429 })
  }

  // Body
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const texto: string = typeof body?.texto  === "string" ? body.texto.trim() : ""
  const limite: number = typeof body?.limite === "number" ? Math.min(body.limite, 10) : 5

  if (!texto) return NextResponse.json({ error: "texto_required" }, { status: 400 })
  if (texto.length > 5000) return NextResponse.json({ error: "texto_too_long" }, { status: 400 })

  try {
    const resultados = await buscarSemantica(texto, limite, auth.tenantId)

    return NextResponse.json({
      resultados: resultados.map((r) => ({
        id              : r.id,
        resumo_problema : r.resumo_problema,
        causa           : r.causa,
        solucao         : r.solucao,
        similaridade    : r.similaridade,
        estrategia      : r.estrategia ?? "vetorial",
      })),
      total     : resultados.length,
      tenant_id : auth.tenantId,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("v1/search error:", msg)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

/**
 * POST /api/v1/query
 *
 * Endpoint público de query semântica + resposta IA.
 * Autenticado por API Key (scope: query).
 * Mesma lógica de /api/query/v1, sem duplicação.
 *
 * Body:    { texto: string, audience?: "atendente" | "cliente" }
 * Headers: Authorization: Bearer mk_live_...
 * Response: { resposta, confianca, audience, casos[] }
 */

import { NextResponse } from "next/server"
import { validateApiKey, hasScope, checkApiKeyRateLimit } from "@/lib/api-key-auth"
import { gerarRespostaAssistidaComContexto } from "@/lib/assisted-response"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // Auth
  const auth = await validateApiKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasScope(auth.scopes, "query")) {
    return NextResponse.json({ error: "scope_not_allowed", required: "query" }, { status: 403 })
  }

  // Rate limit por key
  if (!checkApiKeyRateLimit(auth.keyId, 60)) {
    return NextResponse.json({ error: "rate_limit_exceeded" }, { status: 429 })
  }

  // Body
  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const texto: string = typeof body?.texto === "string" ? body.texto.trim() : ""
  const audience: "atendente" | "cliente" =
    body?.audience === "cliente" ? "cliente" : "atendente"

  if (!texto) return NextResponse.json({ error: "texto_required" }, { status: 400 })
  if (texto.length > 10000) return NextResponse.json({ error: "texto_too_long" }, { status: 400 })

  try {
    const result = await gerarRespostaAssistidaComContexto(texto, audience)

    return NextResponse.json({
      resposta  : result.resposta,
      confianca : result.confianca,
      audience,
      tenant_id : auth.tenantId,
      casos     : result.casos.map((c) => ({
        id              : c.id,
        resumo_problema : c.resumo_problema,
        similaridade    : c.similaridade,
        estrategia      : (c as { estrategia?: string }).estrategia ?? "vetorial",
      })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("429") || msg.includes("rate_limit")) {
      return NextResponse.json({ error: "rate_limit_ia" }, { status: 429 })
    }
    if (msg.includes("AI_API_KEY") || msg.includes("EMBEDDING_API_KEY")) {
      return NextResponse.json({ error: "ia_nao_configurada" }, { status: 503 })
    }
    console.error("v1/query error:", msg)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

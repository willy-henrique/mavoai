import { gerarRespostaAssistidaComContexto } from "@/lib/assisted-response"
import {
  enforceRateLimit,
  validateIntegrationHeaders,
} from "@/lib/integration-guard"
import { NextResponse } from "next/server"

/**
 * POST /api/query/v1
 *
 * Endpoint unificado para consumo externo (n8n, chatbots, ERPs).
 * Combina busca semântica + resposta assistida em uma única chamada.
 *
 * Body: { "texto": "...", "audience": "atendente" | "cliente" }
 * Response: { "resposta": "...", "confianca": "alta"|"media"|"baixa", "casos": [...] }
 */
export async function POST(request: Request) {
  try {
    const auth = validateIntegrationHeaders(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const rate = await enforceRateLimit(auth.tenantId, auth.sourceSystem)
    if (!rate.ok) {
      return NextResponse.json({ error: rate.error }, { status: rate.status })
    }

    const body = await request.json()
    const texto: string = typeof body?.texto === "string" ? body.texto.trim() : ""
    const audience: "atendente" | "cliente" =
      body?.audience === "cliente" ? "cliente" : "atendente"

    if (!texto) {
      return NextResponse.json(
        { error: "Campo texto e obrigatorio" },
        { status: 400 }
      )
    }

    if (texto.length > 10000) {
      return NextResponse.json(
        { error: "Campo texto excede o limite de 10000 caracteres" },
        { status: 400 }
      )
    }

    const result = await gerarRespostaAssistidaComContexto(texto, audience)

    return NextResponse.json({
      resposta: result.resposta,
      confianca: result.confianca,
      audience,
      casos: result.casos.map((c) => ({
        id: c.id,
        resumo_problema: c.resumo_problema,
        similaridade: c.similaridade,
        estrategia: (c as { estrategia?: string }).estrategia ?? "vetorial",
      })),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)

    if (msg.includes("429") || msg.includes("rate_limit")) {
      return NextResponse.json(
        { error: "rate_limit_ia", mensagem: "Provedor IA atingiu limite. Tente em 15-30s." },
        { status: 429 }
      )
    }

    if (msg.includes("AI_API_KEY") || msg.includes("EMBEDDING_API_KEY")) {
      return NextResponse.json(
        { error: "ia_nao_configurada", mensagem: msg.slice(0, 200) },
        { status: 503 }
      )
    }

    console.error("Erro em /api/query/v1:", msg)
    return NextResponse.json(
      { error: "Erro interno", detalhe: msg.slice(0, 400) },
      { status: 500 }
    )
  }
}

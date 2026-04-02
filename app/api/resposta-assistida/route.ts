import { createClient } from "@/lib/supabase/server"
import { gerarRespostaAssistidaComContexto } from "@/lib/assisted-response"
import { buscarSemantica } from "@/lib/semantic-search"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

function formatCaughtError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message: unknown }).message
    if (typeof m === "string") return m
  }
  try {
    return JSON.stringify(error).slice(0, 500)
  } catch {
    return String(error)
  }
}

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const debug = searchParams.get("debug") === "true"
    const { texto, audience } = await request.json()

    if (!texto || typeof texto !== "string" || !texto.trim()) {
      return NextResponse.json(
        { error: "Campo texto e obrigatorio" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const audienceMode = audience === "cliente" ? "cliente" : "atendente"
    const result = await gerarRespostaAssistidaComContexto(supabase, texto, audienceMode)

    const baseResponse: Record<string, unknown> = {
      resposta_sugerida: result.resposta,
      audience: audienceMode,
      confianca: result.confianca,
    }

    if (debug) {
      const casos = result.casos.length > 0 ? result.casos : await buscarSemantica(supabase, texto, 3)
      baseResponse.casos_utilizados = casos.map((c: any) => ({
        id: c.id,
        estrategia: c.estrategia || (c.similaridade > 0 ? "vetorial" : "textual"),
        similaridade: c.similaridade,
        score_lexical: c.score_lexical ?? null,
      }))
    }

    return NextResponse.json(baseResponse)
  } catch (error) {
    logger.error("resposta_assistida_erro", {
      error: msg.slice(0, 400),
    })
    const msg = formatCaughtError(error)
    if (msg.includes("429") || msg.includes("rate_limit")) {
      return NextResponse.json(
        {
          error: "limite_de_taxa_ia",
          mensagem:
            "Groq (ou outro provedor) atingiu limite de tokens por minuto. Aguarde ~15–30s e tente de novo, ou reduza chamadas paralelas.",
        },
        { status: 429 },
      )
    }
    if (msg.includes("AI_API_KEY") || msg.includes("GROK_API_KEY")) {
      return NextResponse.json(
        { error: "ia_nao_configurada", mensagem: msg },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: "Erro ao gerar resposta assistida", detalhe: msg.slice(0, 400) },
      { status: 500 },
    )
  }
}

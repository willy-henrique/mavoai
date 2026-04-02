import { createClient } from "@/lib/supabase/server"
import { buscarSemantica } from "@/lib/semantic-search"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const { texto } = await request.json()

    if (!texto || typeof texto !== "string" || !texto.trim()) {
      return NextResponse.json(
        { error: "Campo texto e obrigatorio" },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const resultados = await buscarSemantica(supabase, texto, 3)

    const usouVetorial =
      resultados.length > 0 && (resultados[0].estrategia === "vetorial" || resultados[0].similaridade > 0)
    const explicabilidade = resultados.map((r) => ({
      id: r.id,
      estrategia: r.estrategia || (r.similaridade > 0 ? "vetorial" : "textual"),
      similaridade: Number(r.similaridade || 0),
      score_lexical: r.score_lexical ?? null,
    }))

    return NextResponse.json({
      resultados,
      tipo_busca: usouVetorial ? "semantica" : "textual",
      explicabilidade,
    })
  } catch (error) {
    console.error("Erro na busca semantica:", error)
    return NextResponse.json(
      { error: "Erro ao executar busca semantica" },
      { status: 500 }
    )
  }
}

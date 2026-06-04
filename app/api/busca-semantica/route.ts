import { buscarSemantica } from "@/lib/semantic-search"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  // Lê o body de forma segura — evita 500 em caso de JSON malformado
  let body: Record<string, unknown>
  try {
    const raw = await request.text()
    if (!raw.trim()) {
      return NextResponse.json({ error: "body_vazio" }, { status: 400 })
    }
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: "json_invalido" }, { status: 400 })
  }

  const texto = typeof body.texto === "string" ? body.texto.trim() : ""
  const limite = typeof body.limite === "number" ? Math.min(body.limite, 10) : 3

  if (!texto) {
    return NextResponse.json({ error: "texto_obrigatorio" }, { status: 400 })
  }

  try {
    const resultados = await buscarSemantica(texto, limite)

    const usouVetorial =
      resultados.length > 0 &&
      (resultados[0].estrategia === "vetorial" || resultados[0].similaridade > 0)

    return NextResponse.json({
      resultados,
      tipo_busca: usouVetorial ? "semantica" : "textual",
      explicabilidade: resultados.map((r) => ({
        id: r.id,
        estrategia: r.estrategia || (r.similaridade > 0 ? "vetorial" : "textual"),
        similaridade: Number(r.similaridade || 0),
        score_lexical: r.score_lexical ?? null,
      })),
    })
  } catch (error) {
    console.error("busca-semantica error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "busca_falhou" }, { status: 500 })
  }
}

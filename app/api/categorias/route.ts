import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("categorias")
    .select("*")
    .order("nome")

  if (error) {
    console.error("Erro ao buscar categorias:", error)
    return NextResponse.json(
      { error: "Erro ao buscar categorias" },
      { status: 500 }
    )
  }

  return NextResponse.json({ data })
}

export async function POST(request: Request) {
  try {
    const { nome, descricao } = await request.json()

    if (!nome) {
      return NextResponse.json(
        { error: "Nome e obrigatorio" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("categorias")
      .insert({ nome, descricao })
      .select()
      .single()

    if (error) {
      console.error("Erro ao criar categoria:", error)
      return NextResponse.json(
        { error: "Erro ao criar categoria" },
        { status: 500 }
      )
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

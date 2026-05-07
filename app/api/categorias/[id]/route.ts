import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { nome, descricao } = body

    if (!nome) {
      return NextResponse.json({ error: "Nome e obrigatorio" }, { status: 400 })
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("categorias")
      .update({ nome, descricao })
      .eq("id", id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: "Erro ao atualizar categoria" }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const { error } = await supabase.from("categorias").delete().eq("id", id)

    if (error) {
      return NextResponse.json({ error: "Erro ao deletar categoria" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

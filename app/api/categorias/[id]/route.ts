import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { nome, descricao } = await request.json()

    if (!nome) {
      return NextResponse.json({ error: "Nome e obrigatorio" }, { status: 400 })
    }

    const result = await query(
      "UPDATE categorias SET nome = $1, descricao = $2 WHERE id = $3 RETURNING *",
      [nome, descricao, id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Categoria não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ data: result.rows[0] })
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
    await query("DELETE FROM categorias WHERE id = $1", [id])
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const result = await query("SELECT * FROM categorias ORDER BY nome")
    return NextResponse.json({ data: result.rows })
  } catch (error) {
    console.error("Erro ao buscar categorias:", error)
    return NextResponse.json({ error: "Erro ao buscar categorias" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { nome, descricao } = await request.json()

    if (!nome) {
      return NextResponse.json({ error: "Nome e obrigatorio" }, { status: 400 })
    }

    const result = await query(
      "INSERT INTO categorias (nome, descricao) VALUES ($1, $2) RETURNING *",
      [nome, descricao]
    )

    return NextResponse.json({ data: result.rows[0] })
  } catch (error) {
    console.error("Erro ao criar categoria:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}

import { query } from "@/lib/database/postgres-client-no-vector"
import { embeddingParaVector, gerarEmbedding } from "@/lib/embeddings"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tecnico = searchParams.get("tecnico")
  const categoria = searchParams.get("categoria")
  const dataInicio = searchParams.get("dataInicio")
  const dataFim = searchParams.get("dataFim")
  const busca = searchParams.get("busca")
  const limit = parseInt(searchParams.get("limit") || "50")
  const offset = parseInt(searchParams.get("offset") || "0")

  try {
    const where: string[] = []
    const params: unknown[] = []

    if (tecnico) {
      params.push(`%${tecnico}%`)
      where.push(`a.tecnico ILIKE $${params.length}`)
    }
    if (categoria) {
      params.push(categoria)
      where.push(`a.categoria_id = $${params.length}::uuid`)
    }
    if (dataInicio) {
      params.push(dataInicio)
      where.push(`a.data_atendimento >= $${params.length}::timestamptz`)
    }
    if (dataFim) {
      params.push(dataFim)
      where.push(`a.data_atendimento <= $${params.length}::timestamptz`)
    }
    if (busca) {
      params.push(`%${busca}%`)
      const p = `$${params.length}`
      where.push(`(
        a.texto_original ILIKE ${p}
        OR a.problema ILIKE ${p}
        OR a.solucao ILIKE ${p}
        OR a.resumo ILIKE ${p}
      )`)
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
    const countResult = await query(
      `SELECT COUNT(*)::int AS total
       FROM atendimentos a
       ${whereSql}`,
      params
    )
    const total = Number(countResult.rows[0]?.total || 0)

    params.push(limit, offset)
    const dataResult = await query(
      `SELECT
         a.*,
         c.id AS categorias_id,
         c.nome AS categorias_nome
       FROM atendimentos a
       LEFT JOIN categorias c ON c.id = a.categoria_id
       ${whereSql}
       ORDER BY a.data_atendimento DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )

    const data = dataResult.rows.map((row: any) => ({
      ...row,
      categorias: row.categorias_id
        ? { id: row.categorias_id, nome: row.categorias_nome }
        : undefined,
    }))

    return NextResponse.json({ data, total })
  } catch (error) {
    console.error("Erro ao buscar atendimentos:", error)
    return NextResponse.json(
      { error: "Erro ao buscar atendimentos" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      cliente,
      tecnico,
      texto_original,
      data_atendimento,
      ticket_externo,
      canal,
    } = body

    if (!cliente || !tecnico || !texto_original) {
      return NextResponse.json(
        { error: "Cliente, tecnico e texto_original sao obrigatorios" },
        { status: 400 }
      )
    }

    let vector: string | null = null
    try {
      const embedding = await gerarEmbedding(texto_original)
      vector = embeddingParaVector(embedding)
    } catch (embeddingError) {
      console.warn("Embedding nao gerado no cadastro:", embeddingError)
    }

    const created = await query(
      `INSERT INTO atendimentos (
        cliente, tecnico, ticket_externo, canal, texto_original,
        resumo_problema, embedding, data_atendimento
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        cliente,
        tecnico,
        ticket_externo || null,
        canal || null,
        texto_original,
        texto_original,
        vector ? Buffer.from(vector, "utf8") : null,
        data_atendimento || new Date().toISOString(),
      ]
    )

    return NextResponse.json({ data: created.rows[0] })
  } catch (error) {
    console.error("Erro:", error)
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

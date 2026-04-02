import { createClient } from "@/lib/supabase/server"
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

  const supabase = await createClient()

  let query = supabase
    .from("atendimentos")
    .select("*, categorias(id, nome)", { count: "exact" })
    .order("data_atendimento", { ascending: false })
    .range(offset, offset + limit - 1)

  if (tecnico) {
    query = query.ilike("tecnico", `%${tecnico}%`)
  }

  if (categoria) {
    query = query.eq("categoria_id", categoria)
  }

  if (dataInicio) {
    query = query.gte("data_atendimento", dataInicio)
  }

  if (dataFim) {
    query = query.lte("data_atendimento", dataFim)
  }

  if (busca) {
    query = query.or(
      `texto_original.ilike.%${busca}%,problema.ilike.%${busca}%,solucao.ilike.%${busca}%,resumo.ilike.%${busca}%`
    )
  }

  const { data, error, count } = await query

  if (error) {
    console.error("Erro ao buscar atendimentos:", error)
    return NextResponse.json(
      { error: "Erro ao buscar atendimentos" },
      { status: 500 }
    )
  }

  return NextResponse.json({ data, total: count })
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

    const supabase = await createClient()

    let vector: string | null = null
    try {
      const embedding = await gerarEmbedding(texto_original)
      vector = embeddingParaVector(embedding)
    } catch (embeddingError) {
      console.warn("Embedding nao gerado no cadastro:", embeddingError)
    }

    let { data, error } = await supabase
      .from("atendimentos")
      .insert({
        cliente,
        tecnico,
        ticket_externo: ticket_externo || null,
        canal: canal || null,
        texto_original,
        resumo_problema: texto_original,
        embedding: vector || undefined,
        data_atendimento: data_atendimento || new Date().toISOString(),
      })
      .select()
      .single()

    // Fallback para schema antigo sem resumo_problema.
    if (error) {
      const fallback = await supabase
        .from("atendimentos")
        .insert({
          cliente,
          tecnico,
          ticket_externo: ticket_externo || null,
          canal: canal || null,
          texto_original,
          embedding: vector || undefined,
          data_atendimento: data_atendimento || new Date().toISOString(),
        })
        .select()
        .single()

      data = fallback.data
      error = fallback.error
    }

    if (error) {
      console.error("Erro ao criar atendimento:", error)
      return NextResponse.json(
        { error: "Erro ao criar atendimento" },
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

import { gerarTextoIA } from "@/lib/ai-provider"
import { embeddingParaVector, gerarEmbedding } from "@/lib/embeddings"
import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

const SYSTEM_PROMPT = `Voce e um analista de suporte tecnico especializado em extrair informacoes estruturadas de relatos de atendimento.

Dado um texto de atendimento, extraia as seguintes informacoes em formato JSON:

{
  "resumo": "Resumo conciso do atendimento em 1-2 frases",
  "problema": "Descricao clara do problema relatado",
  "causa": "Causa raiz identificada do problema",
  "solucao": "Solucao aplicada para resolver o problema",
  "categoria": "Uma das categorias: Hardware, Software, Rede, Acesso, Email, Impressora, Outro"
}

Regras:
- Seja objetivo e direto
- Use linguagem tecnica quando apropriado
- Se alguma informacao nao estiver clara no texto, infira com base no contexto
- A categoria deve ser exatamente uma das listadas
- Responda APENAS com o JSON, sem texto adicional`

export async function POST(request: Request) {
  let atendimentoId: string | null = null
  try {
    const internalToken = request.headers.get("X-Internal-Token")
    if (process.env.CEREBRO_INTERNAL_TOKEN && internalToken !== process.env.CEREBRO_INTERNAL_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { id, texto_original } = await request.json()
    atendimentoId = id || null

    if (!id || !texto_original) {
      return NextResponse.json(
        { error: "ID e texto_original sao obrigatorios" },
        { status: 400 }
      )
    }

    const text = await gerarTextoIA(SYSTEM_PROMPT, texto_original)

    let parsed
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      } else {
        throw new Error("JSON nao encontrado na resposta")
      }
    } catch {
      return NextResponse.json(
        { error: "Erro ao processar resposta da IA" },
        { status: 500 }
      )
    }

    const categorias = await query(
      "SELECT id, nome FROM categorias WHERE nome = $1 LIMIT 1",
      [parsed.categoria]
    )

    let vector: string | null = null
    try {
      const textoEmbedding = [parsed.problema, texto_original, parsed.solucao]
        .filter(Boolean)
        .join("\n")
      const embedding = await gerarEmbedding(textoEmbedding)
      vector = embeddingParaVector(embedding)
    } catch (embeddingError) {
      logger.warn("embedding_nao_gerado", {
        atendimentoId: id,
        error: embeddingError instanceof Error ? embeddingError.message : String(embeddingError),
      })
    }

    const data = await query(
      `UPDATE atendimentos
       SET resumo = $1,
           resumo_problema = $2,
           problema = $3,
           causa = $4,
           solucao = $5,
           categoria = $6,
           categoria_id = $7,
           embedding = $8,
           processado = TRUE
       WHERE id = $9
       RETURNING *`,
      [
        parsed.resumo,
        parsed.resumo || parsed.problema,
        parsed.problema,
        parsed.causa,
        parsed.solucao,
        parsed.categoria,
        categorias.rows[0]?.id || null,
        vector ? Buffer.from(vector, "utf8") : null,
        id,
      ]
    )

    logger.info("atendimento_processado", { atendimentoId: id })
    return NextResponse.json({ data: data.rows[0] || null, processed: parsed })
  } catch (error) {
    logger.error("processamento_erro_critico", {
      atendimentoId: atendimentoId ?? undefined,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

import { createClient } from "@/lib/supabase/server"
import { gerarTextoIA } from "@/lib/ai-provider"
import { embeddingParaVector, gerarEmbedding } from "@/lib/embeddings"
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
  try {
    const internalToken = request.headers.get("X-Internal-Token")
    if (process.env.CEREBRO_INTERNAL_TOKEN && internalToken !== process.env.CEREBRO_INTERNAL_TOKEN) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    const { id, texto_original } = await request.json()

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

    const supabase = await createClient()

    const { data: categorias } = await supabase
      .from("categorias")
      .select("id, nome")
      .eq("nome", parsed.categoria)
      .single()

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

    let { data, error } = await supabase
      .from("atendimentos")
      .update({
        resumo: parsed.resumo,
        resumo_problema: parsed.resumo || parsed.problema,
        problema: parsed.problema,
        causa: parsed.causa,
        solucao: parsed.solucao,
        categoria: parsed.categoria,
        categoria_id: categorias?.id || null,
        embedding: vector || undefined,
        processado: true,
      })
      .eq("id", id)
      .select()
      .single()

    // Fallback para schema antigo sem as colunas novas.
    if (error) {
      const fallback = await supabase
        .from("atendimentos")
        .update({
          resumo: parsed.resumo,
          problema: parsed.problema,
          causa: parsed.causa,
          solucao: parsed.solucao,
          categoria_id: categorias?.id || null,
          embedding: vector || undefined,
          processado: true,
        })
        .eq("id", id)
        .select()
        .single()

      data = fallback.data
      error = fallback.error
    }

    if (error) {
      logger.error("atendimento_update_failed", {
        atendimentoId: id,
        error: error.message,
      })
      return NextResponse.json(
        { error: "Erro ao salvar atendimento processado" },
        { status: 500 }
      )
    }

    logger.info("atendimento_processado", { atendimentoId: id })
    return NextResponse.json({ data, processed: parsed })
  } catch (error) {
    logger.error("processamento_erro_critico", {
      atendimentoId: id,
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: "Erro interno do servidor" },
      { status: 500 }
    )
  }
}

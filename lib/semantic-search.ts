import { gerarEmbedding, embeddingParaVector } from "@/lib/embeddings"
import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"

export interface ResultadoSemantico {
  id: string
  similaridade: number
  resumo_problema: string
  causa: string | null
  solucao: string | null
  estrategia?: "vetorial" | "textual"
  score_lexical?: number
}

function normalizarTermosBusca(texto: string): string[] {
  const unique = new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3),
  )
  return Array.from(unique).slice(0, 8)
}

function montarFiltroIlike(termos: string[]) {
  if (termos.length === 0) return ""
  const campos = ["texto_original", "problema", "solucao", "resumo", "resumo_problema"]
  const filtros: string[] = []
  for (const t of termos) {
    for (const c of campos) {
      filtros.push(`${c}.ilike.%${t}%`)
    }
  }
  return filtros.join(",")
}

function calcularScoreLexical(textoBase: string, termos: string[]) {
  if (!textoBase || termos.length === 0) return 0
  const base = textoBase
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
  let matches = 0
  for (const t of termos) {
    if (base.includes(t)) matches += 1
  }
  return matches / termos.length
}

export async function buscarSemantica(
  texto: string,
  limite = 3
): Promise<ResultadoSemantico[]> {
  try {
    const embedding = await gerarEmbedding(texto)
    const vector = embeddingParaVector(embedding)
    const result = await query(
      "SELECT * FROM buscar_atendimentos_semanticos($1::text, $2::int)",
      [vector, limite]
    )

    if (Array.isArray(result.rows)) {
      return result.rows.map((row: any) => ({
        id: row.id,
        similaridade: Number(row.similaridade ?? 0),
        resumo_problema: row.resumo_problema || "",
        causa: row.causa ?? null,
        solucao: row.solucao ?? null,
        estrategia: "vetorial",
        score_lexical: undefined,
      }))
    }
  } catch (error) {
    logger.warn("busca_vetorial_indisponivel", {
      endpoint: "buscarSemantica",
      error: error instanceof Error ? error.message : String(error),
    })
  }

  const termos = normalizarTermosBusca(texto)
  const filtro = montarFiltroIlike(termos) // mantido para futura observabilidade
  let fallbackData: any[] = []

  if (filtro || termos.length > 0) {
    const result = await query(
      `SELECT id, resumo, resumo_problema, problema, causa, solucao, texto_original
       FROM buscar_atendimentos_simples($1, $2)`,
      [termos.join(" "), limite]
    )
    fallbackData = result.rows || []
  }

  // Se não houver casos processados úteis, volta para texto bruto para não zerar resposta.
  if (!fallbackData || fallbackData.length === 0) {
    const raw = await query(
      `SELECT id, resumo, resumo_problema, problema, causa, solucao, texto_original
       FROM atendimentos
       ORDER BY updated_at DESC
       LIMIT $1`,
      [limite]
    )
    fallbackData = raw.rows || []
  }

  const ranked = (fallbackData || [])
    .map((row: any) => {
      const resumoProblema =
        row.resumo_problema || row.problema || row.resumo || row.texto_original || ""
      const base = [row.problema, row.resumo, row.solucao, row.texto_original]
        .filter(Boolean)
        .join(" ")
      const scoreLexical = calcularScoreLexical(base, termos)
      return {
        id: row.id,
        similaridade: 0,
        resumo_problema: resumoProblema,
        causa: row.causa ?? null,
        solucao: row.solucao ?? null,
        estrategia: "textual" as const,
        score_lexical: scoreLexical,
      }
    })
    .sort((a, b) => (b.score_lexical || 0) - (a.score_lexical || 0))
    .slice(0, limite)

  return ranked
}

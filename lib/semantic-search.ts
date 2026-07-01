import { gerarEmbedding, embeddingParaVector } from "@/lib/embeddings"
import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"

export interface ResultadoSemantico {
  id: string
  similaridade: number
  resumo_problema: string
  causa: string | null
  solucao: string | null
  estrategia?: "vetorial" | "textual" | "curado"
  score_lexical?: number
}

/**
 * Conteúdo validado pelo Gerente de Curadoria (knowledge_items, status='publicado')
 * ganha um pequeno reforço no score — é conhecimento revisado por humano, não um
 * caso histórico bruto. O reforço é proporcional à confiança que o gerente marcou.
 */
const CURADO_BOOST_MAX = 0.08

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

/**
 * Detecta casos auto-curados SEM solução real (ex.: "Não aplicada", "Não foi
 * possível determinar a solução"). Eles poluem o RAG: têm boa similaridade mas
 * não ensinam nada — e fazem a IA achar que não há solução. Descartamos do contexto.
 */
function solucaoInutil(s: string | null): boolean {
  if (!s) return true
  const t = s.trim().toLowerCase()
  if (t.length < 15) return true
  return /n[aã]o\s+(aplic|foi\s+poss[ií]vel|detalh|informad|identific|h[aá]\s+solu|consta)/.test(t)
}

/**
 * Estatística de uso do conhecimento curado (Fase 2+ da Curadoria): toda vez que um
 * knowledge_item PUBLICADO entra de fato numa resposta real, incrementa o contador —
 * é o que alimenta o card "mais usados" no Dashboard do gerente. Fire-and-forget:
 * não atrasa a resposta ao cliente nem derruba o RAG se o UPDATE falhar.
 */
function registrarUsoKnowledge(resultados: ResultadoSemantico[]): void {
  const ids = resultados.filter((r) => r.estrategia === "curado").map((r) => r.id)
  if (ids.length === 0) return
  query(
    `UPDATE public.knowledge_items SET uso_count = uso_count + 1, ultimo_uso_at = NOW() WHERE id = ANY($1::uuid[])`,
    [ids],
  ).catch((e) => {
    logger.warn("knowledge_uso_registro_falhou", { error: e instanceof Error ? e.message : String(e) })
  })
}

export async function buscarSemantica(
  texto: string,
  limite = 3,
  tenantId?: string
): Promise<ResultadoSemantico[]> {
  try {
    const embedding = await gerarEmbedding(texto)
    const vector = embeddingParaVector(embedding)
    // Busca mais do que o necessário para poder descartar casos sem solução útil.
    const overfetch = Math.min(Math.max(limite * 4, 12), 40)
    const [result, curadoResult] = await Promise.all([
      query(
        "SELECT * FROM buscar_atendimentos_semanticos($1::vector, $2::int, $3::text)",
        [vector, overfetch, tenantId ?? null]
      ),
      query(
        "SELECT * FROM buscar_knowledge_semantico($1::vector, $2::int, $3::text)",
        [vector, Math.min(limite * 2, 10), tenantId ?? null]
      ).catch((e) => {
        // Função/tabela pode não existir ainda (migration 015 não rodada) — degrada normalmente.
        logger.warn("busca_knowledge_indisponivel", { error: e instanceof Error ? e.message : String(e) })
        return { rows: [] as any[] }
      }),
    ])

    if (Array.isArray(result.rows)) {
      const termos = normalizarTermosBusca(texto)
      const mapped = result.rows
        .map((row: any) => {
          const base = [row.resumo_problema, row.problema, row.causa, row.solucao]
            .filter(Boolean).join(" ")
          const scoreLex = calcularScoreLexical(base, termos)
          const scoreVet = Number(row.similaridade ?? 0)
          // Score híbrido: 70% vetorial + 30% lexical — favorece semântica mas não ignora keywords exatas
          const scoreHibrid = scoreVet * 0.7 + scoreLex * 0.3
          return {
            id: row.id,
            similaridade: scoreHibrid,
            resumo_problema: row.resumo_problema || "",
            causa: row.causa ?? null,
            solucao: row.solucao ?? null,
            estrategia: "vetorial" as const,
            score_lexical: scoreLex,
          }
        })

      const curados = (curadoResult.rows || []).map((row: any) => {
        const base = [row.resumo_problema, row.causa, row.solucao].filter(Boolean).join(" ")
        const scoreLex = calcularScoreLexical(base, termos)
        const scoreVet = Number(row.similaridade ?? 0)
        const scoreHibrid = scoreVet * 0.7 + scoreLex * 0.3
        const boost = CURADO_BOOST_MAX * Number(row.confianca ?? 0.8)
        return {
          id: row.id,
          similaridade: Math.min(1, scoreHibrid + boost),
          resumo_problema: row.resumo_problema || "",
          causa: row.causa ?? null,
          solucao: row.solucao ?? null,
          estrategia: "curado" as const,
          score_lexical: scoreLex,
        }
      })

      const combinado = [...mapped, ...curados].sort((a, b) => b.similaridade - a.similaridade)

      // Prioriza casos COM solução real; só cai nos vazios se não sobrar nada.
      const uteis = combinado.filter((r) => !solucaoInutil(r.solucao))
      const finalResult = (uteis.length > 0 ? uteis : combinado).slice(0, limite)
      registrarUsoKnowledge(finalResult)
      return finalResult
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

  try {
    if (filtro || termos.length > 0) {
      const result = await query(
        `SELECT id, resumo, resumo_problema, problema, causa, solucao, texto_original
         FROM buscar_atendimentos_simples($1, $2, $3::text)`,
        [termos.join(" "), limite, tenantId ?? null]
      )
      fallbackData = result.rows || []
    }

    // Se não houver casos processados úteis, volta para texto bruto para não zerar resposta.
    if (!fallbackData || fallbackData.length === 0) {
      const raw = await query(
        `SELECT id, resumo, resumo_problema, problema, causa, solucao, texto_original
         FROM atendimentos
         WHERE ($1::text IS NULL OR tenant_id = $1::text)
         ORDER BY updated_at DESC
         LIMIT $2`,
        [tenantId ?? null, limite]
      )
      fallbackData = raw.rows || []
    }
  } catch {
    // Postgres offline — IA responde sem contexto RAG
    return []
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

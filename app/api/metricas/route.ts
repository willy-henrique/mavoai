import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

export async function GET() {
  const now = new Date().toISOString()

  try {
    const [totais, porCategoria, porTecnico, porDia, ultimasIngestoes, auditErrors] = await Promise.all([
      query(
        `SELECT
          COUNT(*)::int AS total_atendimentos,
          COUNT(*) FILTER (WHERE processado = true)::int AS processados,
          COUNT(*) FILTER (WHERE processado = false)::int AS pendentes,
          COUNT(*) FILTER (WHERE processado = true AND embedding IS NOT NULL)::int AS com_embedding,
          COUNT(*) FILTER (
            WHERE processado = false
              AND created_at < NOW() - INTERVAL '5 minutes'
          )::int AS pendentes_acumulados
        FROM atendimentos`
      ),
      query(
        `SELECT COALESCE(categoria, 'Sem categoria') AS nome, COUNT(*)::int AS total
         FROM atendimentos
         WHERE processado = true
         GROUP BY 1
         ORDER BY total DESC`
      ),
      query(
        `SELECT tecnico AS nome, COUNT(*)::int AS total
         FROM atendimentos
         GROUP BY tecnico
         ORDER BY total DESC
         LIMIT 10`
      ),
      query(
        `SELECT TO_CHAR(data_atendimento::date, 'DD/MM/YYYY') AS data, COUNT(*)::int AS total
         FROM atendimentos
         WHERE data_atendimento >= NOW() - INTERVAL '7 days'
         GROUP BY data_atendimento::date
         ORDER BY data_atendimento::date ASC`
      ),
      query(
        `SELECT id, origem, status, created_at, detalhes
         FROM ingestao_logs
         ORDER BY created_at DESC
         LIMIT 5`
      ),
      query(
        `SELECT
          CASE
            WHEN to_regclass('public.audit_events') IS NULL THEN NULL::int
            ELSE (
              SELECT COUNT(*)::int
              FROM public.audit_events
              WHERE severity = 'error'
                AND created_at >= NOW() - INTERVAL '24 hours'
            )
          END AS total`
      ).catch(() => ({ rows: [{ total: null }] })),
    ])

    const totalAtendimentos = Number(totais.rows[0]?.total_atendimentos || 0)
    const totalProcessados = Number(totais.rows[0]?.processados || 0)
    const pendentes = Number(totais.rows[0]?.pendentes || 0)
    const totalComEmbedding = Number(totais.rows[0]?.com_embedding || 0)
    const pendentesAcumulados = Number(totais.rows[0]?.pendentes_acumulados || 0)
    const auditErrors24h =
      auditErrors.rows[0]?.total == null
        ? null
        : Number(auditErrors.rows[0]?.total || 0)
    const embeddingCoverage = totalProcessados > 0
      ? Math.round((totalComEmbedding / totalProcessados) * 100) / 100
      : null

    return NextResponse.json({
      supabaseOnline: true, // legado para frontend
      ultimaAtualizacao: now,
      totalAtendimentos,
      processados: totalProcessados,
      pendentes,
      // Observabilidade do cérebro
      saude: {
        embedding_coverage: embeddingCoverage,
        com_embedding: totalComEmbedding,
        pendentes_acumulados: pendentesAcumulados,
        audit_errors_24h: auditErrors24h,
        alerta_embedding: embeddingCoverage !== null && embeddingCoverage < 0.7,
        alerta_backlog: pendentesAcumulados > 20,
        alerta_erros: (auditErrors24h || 0) > 10,
      },
      porCategoria: porCategoria.rows || [],
      porTecnico: porTecnico.rows || [],
      porDia: porDia.rows || [],
      ultimasIngestoes: ultimasIngestoes.rows || [],
    })
  } catch (error) {
    logger.error("metricas_postgres_offline", {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({
      supabaseOnline: false,
      ultimaAtualizacao: now,
      totalAtendimentos: 0,
      processados: 0,
      pendentes: 0,
      porCategoria: [],
      porTecnico: [],
      porDia: [],
      ultimasIngestoes: [],
    })
  }
}

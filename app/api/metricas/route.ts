import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

export async function GET() {
  const now = new Date().toISOString()

  try {
    const supabase = await createClient()

    const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const vintEquatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [
      { count: totalAtendimentos, error: e1 },
      { count: processados, error: e2 },
      { count: pendentes, error: e3 },
      { data: porCategoria, error: e4 },
      { data: porTecnico, error: e5 },
      { count: comEmbedding, error: e6 },
      { count: pendentesAcumulados, error: e7 },
      { count: auditErrors24h, error: e8 },
    ] = await Promise.all([
      supabase.from("atendimentos").select("*", { count: "exact", head: true }),
      supabase
        .from("atendimentos")
        .select("*", { count: "exact", head: true })
        .eq("processado", true),
      supabase
        .from("atendimentos")
        .select("*", { count: "exact", head: true })
        .eq("processado", false),
      supabase
        .from("atendimentos")
        .select("categoria_id, categorias(nome)")
        .not("categoria_id", "is", null),
      supabase.from("atendimentos").select("tecnico"),
      // Processados que têm embedding gerado
      supabase
        .from("atendimentos")
        .select("*", { count: "exact", head: true })
        .eq("processado", true)
        .not("embedding", "is", null),
      // Pendentes de processamento há mais de 5 minutos (backlog preocupante)
      supabase
        .from("atendimentos")
        .select("*", { count: "exact", head: true })
        .eq("processado", false)
        .lt("created_at", cincoMinutosAtras),
      // Erros de auditoria nas últimas 24h
      supabase
        .from("audit_events")
        .select("*", { count: "exact", head: true })
        .eq("severity", "error")
        .gte("created_at", vintEquatroHorasAtras),
    ])

    const supabaseError = e1 || e2 || e3 || e4 || e5
    if (supabaseError) {
      logger.warn("supabase_parcialmente_indisponivel", { error: supabaseError.message })
    }

    const categoriaCount: Record<string, number> = {}
    porCategoria?.forEach((item) => {
      const nome =
        (item.categorias as { nome: string } | null)?.nome || "Sem categoria"
      categoriaCount[nome] = (categoriaCount[nome] || 0) + 1
    })

    const tecnicoCount: Record<string, number> = {}
    porTecnico?.forEach((item) => {
      tecnicoCount[item.tecnico] = (tecnicoCount[item.tecnico] || 0) + 1
    })

    const hoje = new Date()
    const ultimos7Dias = new Date(hoje.getTime() - 7 * 24 * 60 * 60 * 1000)

    const { data: atendimentosPorDia } = await supabase
      .from("atendimentos")
      .select("data_atendimento")
      .gte("data_atendimento", ultimos7Dias.toISOString())

    const porDia: Record<string, number> = {}
    atendimentosPorDia?.forEach((item) => {
      const dia = new Date(item.data_atendimento).toLocaleDateString("pt-BR")
      porDia[dia] = (porDia[dia] || 0) + 1
    })

    const { data: ultimasIngestoes } = await supabase
      .from("ingestao_logs")
      .select("id, origem, status, created_at, detalhes")
      .order("created_at", { ascending: false })
      .limit(5)

    const totalProcessados = processados || 0
    const totalComEmbedding = comEmbedding || 0
    const embeddingCoverage = totalProcessados > 0
      ? Math.round((totalComEmbedding / totalProcessados) * 100) / 100
      : null

    return NextResponse.json({
      supabaseOnline: true,
      ultimaAtualizacao: now,
      totalAtendimentos: totalAtendimentos || 0,
      processados: totalProcessados,
      pendentes: pendentes || 0,
      // Observabilidade do cérebro
      saude: {
        embedding_coverage: embeddingCoverage,
        com_embedding: totalComEmbedding,
        pendentes_acumulados: pendentesAcumulados || 0,
        audit_errors_24h: e8 ? null : (auditErrors24h || 0),
        alerta_embedding: embeddingCoverage !== null && embeddingCoverage < 0.7,
        alerta_backlog: (pendentesAcumulados || 0) > 20,
        alerta_erros: !e8 && (auditErrors24h || 0) > 10,
      },
      porCategoria: Object.entries(categoriaCount).map(([nome, total]) => ({
        nome,
        total,
      })),
      porTecnico: Object.entries(tecnicoCount)
        .map(([nome, total]) => ({ nome, total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      porDia: Object.entries(porDia)
        .map(([data, total]) => ({ data, total }))
        .sort(
          (a, b) =>
            new Date(a.data.split("/").reverse().join("-")).getTime() -
            new Date(b.data.split("/").reverse().join("-")).getTime()
        ),
      ultimasIngestoes: ultimasIngestoes || [],
    })
  } catch (error) {
    logger.error("metricas_supabase_offline", {
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

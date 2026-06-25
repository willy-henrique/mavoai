import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/knowledge — lista itens da base de conhecimento (tabela `atendimentos`)
 * para CURADORIA pelo painel. Protegido pelo middleware (/api/knowledge/*).
 *
 * Query params:
 *   busca     → filtra por texto (problema / solução / resumo / texto_original)
 *   canal     → filtra por origem (ex.: documentacao, whatsapp). vazio/"todos" = sem filtro
 *   tenant_id → filtra por empresa. vazio = todas
 *   limit     → itens por página (1..100, default 20)
 *   offset    → deslocamento (default 0)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const busca = (searchParams.get("busca") || "").trim()
  const canal = (searchParams.get("canal") || "").trim()
  const tenantId = (searchParams.get("tenant_id") || "").trim()
  const limit = Math.min(Math.max(parseInt(searchParams.get("limit") || "20", 10) || 20, 1), 100)
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10) || 0, 0)

  try {
    const where: string[] = []
    const params: unknown[] = []

    if (tenantId) {
      params.push(tenantId)
      where.push(`tenant_id = $${params.length}`)
    }
    if (canal && canal !== "todos") {
      params.push(canal)
      where.push(`canal = $${params.length}`)
    }
    if (busca) {
      params.push(`%${busca}%`)
      const p = `$${params.length}`
      where.push(
        `(texto_original ILIKE ${p} OR problema ILIKE ${p} OR solucao ILIKE ${p} OR resumo_problema ILIKE ${p} OR resumo ILIKE ${p})`,
      )
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""

    const [countResult, dataResult, canaisResult] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM atendimentos ${whereSql}`, params),
      query(
        `SELECT
           id, resumo_problema, problema, causa, solucao, canal, categoria, tenant_id,
           data_atendimento, updated_at,
           (embedding IS NOT NULL) AS tem_embedding,
           LEFT(COALESCE(texto_original, ''), 400) AS preview
         FROM atendimentos
         ${whereSql}
         ORDER BY COALESCE(updated_at, data_atendimento) DESC NULLS LAST
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
      // Origens distintas para montar o filtro na UI (barato; ignora erro)
      query(`SELECT DISTINCT canal FROM atendimentos WHERE canal IS NOT NULL ORDER BY canal`).catch(
        () => ({ rows: [] as Array<{ canal: string }> }),
      ),
    ])

    const total = Number(countResult.rows[0]?.total || 0)
    const canais = (canaisResult.rows as Array<{ canal: string }>).map((r) => r.canal).filter(Boolean)

    return NextResponse.json({ data: dataResult.rows, total, limit, offset, canais })
  } catch (error) {
    console.error("knowledge GET error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "knowledge_list_failed" }, { status: 500 })
  }
}

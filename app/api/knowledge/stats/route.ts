import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get("tenant_id") || "auge"

  const [totals, byCategory, recent] = await Promise.all([
    query(
      `SELECT
         COUNT(*)::int           AS total,
         COUNT(embedding)::int   AS with_embeddings
       FROM atendimentos
       WHERE tenant_id = $1`,
      [tenantId],
    ),
    query(
      `SELECT categoria, COUNT(*)::int AS count
       FROM atendimentos
       WHERE tenant_id = $1
       GROUP BY categoria
       ORDER BY count DESC
       LIMIT 20`,
      [tenantId],
    ),
    query(
      `SELECT DATE(data_atendimento) AS day, COUNT(*)::int AS count
       FROM atendimentos
       WHERE tenant_id = $1
         AND data_atendimento >= NOW() - INTERVAL '7 days'
       GROUP BY day
       ORDER BY day DESC`,
      [tenantId],
    ),
  ])

  return NextResponse.json({
    total: totals.rows[0]?.total ?? 0,
    with_embeddings: totals.rows[0]?.with_embeddings ?? 0,
    by_category: byCategory.rows.map((r) => ({
      category: r.categoria ?? "Sem categoria",
      count: r.count,
    })),
    recent_by_day: recent.rows.map((r) => ({
      day: r.day,
      count: r.count,
    })),
  })
}

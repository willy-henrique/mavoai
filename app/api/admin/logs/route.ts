/**
 * GET /api/admin/logs?status=&origem=&limit=
 *
 * Logs operacionais da IA: cada evento de ingestão/atendimento (mensagem que
 * entrou, auto-reply enviado, erros, duplicados...). Protegido pelo middleware.
 */
import { NextResponse } from "next/server"
import { query } from "@/lib/database/postgres-client-no-vector"

export const dynamic = "force-dynamic"

type RawLog = {
  id: string
  created_at: string
  origem: string
  status: string
  payload: Record<string, unknown> | null
  detalhes: Record<string, unknown> | null
}

function str(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v)
}

/** Classifica o status em ok | erro | info para a cor do badge. */
function nivel(status: string): "ok" | "erro" | "info" {
  const s = status.toLowerCase()
  if (s.includes("erro") || s.includes("falh") || s.includes("invalid")) return "erro"
  if (s === "sucesso" || s.includes("enviado") || s.includes("ok")) return "ok"
  return "info"
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const status = searchParams.get("status")?.trim() || ""
  const origem = searchParams.get("origem")?.trim() || ""
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 80), 1), 300)

  const where: string[] = []
  const params: unknown[] = []
  if (status) { params.push(status); where.push(`status = $${params.length}`) }
  if (origem) { params.push(origem); where.push(`origem = $${params.length}`) }
  params.push(limit)
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

  try {
    const [rowsRes, sumRes] = await Promise.all([
      query(
        `SELECT id, created_at, origem, status, payload, detalhes
           FROM ingestao_logs
           ${whereSql}
          ORDER BY created_at DESC
          LIMIT $${params.length}`,
        params,
      ),
      query(
        `SELECT status, COUNT(*)::int AS n
           FROM ingestao_logs
          WHERE created_at > NOW() - INTERVAL '24 hours'
          GROUP BY status ORDER BY n DESC`,
        [],
      ),
    ])

    const logs = (rowsRes.rows as RawLog[]).map((r) => {
      const p = r.payload || {}
      const d = r.detalhes || {}
      const mensagem =
        str(p.mensagens) || str(p.content) || str(p.message) || str(p.titulo) || str(d.nota) || ""
      const detalhe = [
        d.source_system ? `origem=${str(d.source_system)}` : "",
        d.ticket_id ? `ticket=${str(d.ticket_id)}` : "",
        d.notas != null ? `notas=${str(d.notas)}` : "",
        d.notas_encontradas != null ? `encontradas=${str(d.notas_encontradas)}` : "",
        d.indexados != null ? `indexados=${str(d.indexados)}` : "",
        d.inseridos != null ? `inseridos=${str(d.inseridos)}` : "",
        d.via ? `via=${str(d.via)}` : "",
        d.motivo ? `motivo: ${str(d.motivo)}` : "",
      ].filter(Boolean).join(" · ")
      return {
        id: r.id,
        created_at: r.created_at,
        canal: r.origem,
        status: r.status,
        nivel: nivel(r.status),
        cliente: str((p.cliente as { nome?: string })?.nome ?? p.cliente),
        mensagem: mensagem.slice(0, 300),
        detalhe: detalhe.slice(0, 300),
      }
    })

    const resumo: Record<string, number> = {}
    for (const row of sumRes.rows as { status: string; n: number }[]) resumo[row.status] = row.n

    return NextResponse.json({ logs, resumo })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "internal_error", detail: msg, logs: [], resumo: {} }, { status: 500 })
  }
}

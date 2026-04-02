import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = await createClient()
    const [integrationsRes, runsRes] = await Promise.all([
      supabase
        .from("integrations")
        .select("id, tenant_id, source_system, name, is_active, rate_limit_per_minute, updated_at")
        .order("updated_at", { ascending: false })
        .limit(100),
      supabase
        .from("integration_runs")
        .select("id, integration_id, tenant_id, source_system, status, started_at, finished_at, total_received, total_processed, total_failed")
        .order("started_at", { ascending: false })
        .limit(200),
    ])

    if (integrationsRes.error) throw integrationsRes.error
    if (runsRes.error) throw runsRes.error

    const runsByIntegration = new Map<string, any[]>()
    for (const run of runsRes.data || []) {
      const key = String(run.integration_id || `${run.tenant_id}:${run.source_system}`)
      const list = runsByIntegration.get(key) || []
      list.push(run)
      runsByIntegration.set(key, list)
    }

    const data = (integrationsRes.data || []).map((it) => {
      const runs = runsByIntegration.get(String(it.id)) || []
      const lastRun = runs[0] || null
      return {
        ...it,
        lastRun,
        stats24h: runs
          .filter((r) => Date.now() - new Date(r.started_at).getTime() <= 24 * 60 * 60 * 1000)
          .reduce(
            (acc, r) => {
              acc.total_received += Number(r.total_received || 0)
              acc.total_processed += Number(r.total_processed || 0)
              acc.total_failed += Number(r.total_failed || 0)
              return acc
            },
            { total_received: 0, total_processed: 0, total_failed: 0 },
          ),
      }
    })

    return NextResponse.json({ data, total: data.length, timestamp: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json(
      {
        error: "integration_status_unavailable",
        detalhe: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

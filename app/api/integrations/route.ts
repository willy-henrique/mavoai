import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const result = await query(`
      SELECT
        i.id,
        i.tenant_id,
        i.source_system,
        i.name,
        i.description,
        i.is_active,
        i.rate_limit_per_minute,
        i.base_url,
        i.webhook_url,
        i.auth_type,
        CASE WHEN i.auth_token IS NOT NULL AND i.auth_token <> '' THEN true ELSE false END AS has_auth_token,
        i.outbound_active,
        i.icon,
        i.created_at,
        i.updated_at,
        (
          SELECT json_build_object(
            'status', r.status,
            'started_at', r.started_at,
            'finished_at', r.finished_at,
            'total_received', r.total_received,
            'total_processed', r.total_processed,
            'total_failed', r.total_failed
          )
          FROM public.integration_runs r
          WHERE r.integration_id = i.id
          ORDER BY r.started_at DESC
          LIMIT 1
        ) as last_run,
        (
          SELECT json_build_object(
            'received', COALESCE(SUM(r.total_received), 0),
            'processed', COALESCE(SUM(r.total_processed), 0),
            'failed', COALESCE(SUM(r.total_failed), 0)
          )
          FROM public.integration_runs r
          WHERE r.integration_id = i.id
            AND r.started_at >= NOW() - INTERVAL '24 hours'
        ) as stats_24h
      FROM public.integrations i
      ORDER BY i.created_at ASC
    `)
    return NextResponse.json({ data: result.rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const {
      name,
      source_system,
      tenant_id = "default",
      rate_limit_per_minute = 120,
      description = "",
      base_url = "",
      webhook_url = "",
      auth_type = "bearer",
      auth_token = "",
      outbound_active = false,
    } = await request.json()

    if (!name || !source_system) {
      return NextResponse.json({ error: "name e source_system são obrigatórios" }, { status: 400 })
    }

    const result = await query(
      `INSERT INTO public.integrations
         (tenant_id, source_system, name, description, is_active, rate_limit_per_minute,
          base_url, webhook_url, auth_type, auth_token, outbound_active)
       VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (tenant_id, source_system)
       DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
         base_url = EXCLUDED.base_url,
         webhook_url = EXCLUDED.webhook_url,
         auth_type = EXCLUDED.auth_type,
         auth_token = CASE WHEN EXCLUDED.auth_token <> '' THEN EXCLUDED.auth_token ELSE integrations.auth_token END,
         outbound_active = EXCLUDED.outbound_active,
         updated_at = NOW()
       RETURNING id, tenant_id, source_system, name, description, is_active, rate_limit_per_minute,
                 base_url, webhook_url, auth_type, outbound_active,
                 CASE WHEN auth_token IS NOT NULL AND auth_token <> '' THEN true ELSE false END AS has_auth_token,
                 created_at, updated_at`,
      [tenant_id, source_system, name, description, rate_limit_per_minute,
       base_url, webhook_url, auth_type, auth_token, outbound_active]
    )

    return NextResponse.json({ data: result.rows[0] }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

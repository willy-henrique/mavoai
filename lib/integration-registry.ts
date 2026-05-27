import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"
import {
  getIntegrationDisplayName,
  normalizeSourceSystem,
} from "@/lib/integration-sources"

type IntegrationRunStatus =
  | "running"
  | "success"
  | "duplicate_ignored"
  | "validation_error"
  | "error"

type IntegrationRunContext = {
  tenantId: string
  sourceSystem: string
  integrationId: string | null
  runId: string | null
}

function isMissingRelationError(error: unknown, tableName?: string) {
  const message =
    error instanceof Error ? error.message : String(error || "")
  const isMissing =
    message.includes("does not exist") ||
    message.includes("não existe") ||
    message.includes("no existe")
  return isMissing && (!tableName || message.includes(`"${tableName}"`))
}

export async function startIntegrationRun(params: {
  tenantId: string
  sourceSystem: string
}) {
  const sourceSystem = normalizeSourceSystem(params.sourceSystem)
  const name = getIntegrationDisplayName(sourceSystem)
  let integrationId: string | null = null

  try {
    const integrationResult = await query(
      `INSERT INTO integrations (
        tenant_id,
        source_system,
        name,
        is_active,
        rate_limit_per_minute,
        updated_at
      ) VALUES ($1, $2, $3, true, $4, NOW())
      ON CONFLICT (tenant_id, source_system)
      DO UPDATE SET
        name = EXCLUDED.name,
        is_active = true,
        rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
        updated_at = NOW()
      RETURNING id`,
      [
        params.tenantId,
        sourceSystem,
        name,
        Number(process.env.INTEGRATION_RATE_LIMIT_PER_MIN || "120"),
      ],
    )
    integrationId = integrationResult.rows[0]?.id ?? null
  } catch (error) {
    if (!isMissingRelationError(error, "integrations")) throw error
  }

  let runId: string | null = null
  try {
    const runResult = await query(
      `INSERT INTO integration_runs (
        integration_id,
        tenant_id,
        source_system,
        status,
        total_received,
        total_processed,
        total_failed,
        details
      ) VALUES ($1, $2, $3, 'running', 1, 0, 0, '{}'::jsonb)
      RETURNING id`,
      [integrationId, params.tenantId, sourceSystem],
    )
    runId = runResult.rows[0]?.id ?? null
  } catch (error) {
    if (!isMissingRelationError(error, "integration_runs")) throw error
  }

  return {
    tenantId: params.tenantId,
    sourceSystem,
    integrationId,
    runId,
  } satisfies IntegrationRunContext
}

export async function finishIntegrationRun(
  context: IntegrationRunContext,
  params: {
    status: IntegrationRunStatus
    totalProcessed?: number
    totalFailed?: number
    details?: Record<string, unknown>
  },
) {
  if (!context.runId) return

  try {
    await query(
      `UPDATE integration_runs
       SET status = $2,
           finished_at = NOW(),
           total_processed = $3,
           total_failed = $4,
           details = COALESCE(details, '{}'::jsonb) || $5::jsonb
       WHERE id = $1`,
      [
        context.runId,
        params.status,
        Number(params.totalProcessed || 0),
        Number(params.totalFailed || 0),
        JSON.stringify(params.details || {}),
      ],
    )
  } catch (error) {
    if (!isMissingRelationError(error, "integration_runs")) throw error
  }
}

export async function registerDedupKeyRecord(params: {
  tenantId: string
  dedupKey: string
  payloadHash: string
}) {
  try {
    const result = await query(
      `INSERT INTO dedup_keys (tenant_id, dedup_key, payload_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (tenant_id, dedup_key) DO NOTHING
       RETURNING id`,
      [params.tenantId, params.dedupKey, params.payloadHash],
    )
    return { duplicated: result.rows.length === 0, available: true }
  } catch (error) {
    if (isMissingRelationError(error, "dedup_keys")) {
      return { duplicated: false, available: false }
    }
    throw error
  }
}

export async function registerSourceRecord(params: {
  tenantId: string
  sourceSystem: string
  sourceEntityId: string
  ingestionId: string
  payloadHash: string
}) {
  try {
    await query(
      `INSERT INTO source_records (
        tenant_id,
        source_system,
        source_entity_id,
        ingestion_id,
        payload_hash
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (tenant_id, source_system, source_entity_id)
      DO UPDATE SET
        ingestion_id = EXCLUDED.ingestion_id,
        payload_hash = EXCLUDED.payload_hash,
        last_seen_at = NOW(),
        seen_count = source_records.seen_count + 1`,
      [
        params.tenantId,
        normalizeSourceSystem(params.sourceSystem),
        params.sourceEntityId,
        params.ingestionId,
        params.payloadHash,
      ],
    )
  } catch (error) {
    if (!isMissingRelationError(error, "source_records")) throw error
  }
}

export async function auditIntegrationEvent(params: {
  tenantId?: string
  sourceSystem?: string
  eventType: string
  severity?: "info" | "warn" | "error"
  message?: string
  context?: Record<string, unknown>
}) {
  try {
    await query(
      `INSERT INTO audit_events (
        tenant_id,
        source_system,
        event_type,
        severity,
        message,
        context
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        params.tenantId || null,
        params.sourceSystem
          ? normalizeSourceSystem(params.sourceSystem)
          : null,
        params.eventType,
        params.severity || "info",
        params.message || null,
        JSON.stringify(params.context || {}),
      ],
    )
  } catch (error) {
    if (!isMissingRelationError(error, "audit_events")) {
      logger.warn("audit_integration_event_failed", {
        error: error instanceof Error ? error.message : String(error),
        eventType: params.eventType,
      })
    }
  }
}

export async function getIntegrationSummary() {
  try {
    const result = await query(
      `SELECT
        COUNT(*)::int AS configured,
        COUNT(*) FILTER (WHERE is_active = true)::int AS active
       FROM integrations`,
    )
    return {
      configured: Number(result.rows[0]?.configured || 0),
      active: Number(result.rows[0]?.active || 0),
    }
  } catch (error) {
    if (isMissingRelationError(error, "integrations")) {
      return { configured: 0, active: 0 }
    }
    throw error
  }
}

export async function listIntegrationStatuses() {
  try {
    const result = await query(
      `SELECT
         i.id,
         i.tenant_id,
         i.source_system,
         i.name,
         i.is_active,
         i.rate_limit_per_minute,
         i.updated_at,
         lr.status AS last_run_status,
         lr.started_at AS last_run_started_at,
         lr.finished_at AS last_run_finished_at,
         lr.total_received AS last_run_total_received,
         lr.total_processed AS last_run_total_processed,
         lr.total_failed AS last_run_total_failed,
         COALESCE(stats.total_received, 0)::int AS stats_total_received,
         COALESCE(stats.total_processed, 0)::int AS stats_total_processed,
         COALESCE(stats.total_failed, 0)::int AS stats_total_failed
       FROM integrations i
       LEFT JOIN LATERAL (
         SELECT
           status,
           started_at,
           finished_at,
           total_received,
           total_processed,
           total_failed
         FROM integration_runs
         WHERE integration_id = i.id
            OR (
              integration_id IS NULL
              AND tenant_id = i.tenant_id
              AND source_system = i.source_system
            )
         ORDER BY started_at DESC
         LIMIT 1
       ) lr ON TRUE
       LEFT JOIN LATERAL (
         SELECT
           SUM(total_received) AS total_received,
           SUM(total_processed) AS total_processed,
           SUM(total_failed) AS total_failed
         FROM integration_runs
         WHERE (
           integration_id = i.id
           OR (
             integration_id IS NULL
             AND tenant_id = i.tenant_id
             AND source_system = i.source_system
           )
         )
           AND started_at >= NOW() - INTERVAL '24 hours'
       ) stats ON TRUE
       ORDER BY i.updated_at DESC
       LIMIT 100`,
    )

    return result.rows.map((row) => ({
      id: row.id,
      tenant_id: row.tenant_id,
      source_system: row.source_system,
      name: row.name,
      is_active: row.is_active,
      rate_limit_per_minute: row.rate_limit_per_minute,
      updated_at: row.updated_at,
      lastRun: row.last_run_status
        ? {
            status: row.last_run_status,
            started_at: row.last_run_started_at,
            finished_at: row.last_run_finished_at,
            total_received: Number(row.last_run_total_received || 0),
            total_processed: Number(row.last_run_total_processed || 0),
            total_failed: Number(row.last_run_total_failed || 0),
          }
        : null,
      stats24h: {
        total_received: Number(row.stats_total_received || 0),
        total_processed: Number(row.stats_total_processed || 0),
        total_failed: Number(row.stats_total_failed || 0),
      },
    }))
  } catch (error) {
    if (
      isMissingRelationError(error, "integrations") ||
      isMissingRelationError(error, "integration_runs")
    ) {
      return []
    }
    throw error
  }
}

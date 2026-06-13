import { Ratelimit } from "@upstash/ratelimit"
import { Redis } from "@upstash/redis"
import { logger } from "@/lib/logger"
import { getSecret } from "@/lib/secret-store"

type AuthResult =
  | { ok: true; tenantId: string; sourceSystem: string; ingestionId: string; sourceEntityId: string }
  | { ok: false; status: number; error: string }

const WINDOW_MS = 60_000
const memoryRateLimit = new Map<string, { start: number; count: number }>()

// Rate limiter distribuído via Upstash Redis (quando configurado)
let upstashRatelimit: Ratelimit | null = null
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  upstashRatelimit = new Ratelimit({
    redis: new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    }),
    limiter: Ratelimit.slidingWindow(
      Number(process.env.INTEGRATION_RATE_LIMIT_PER_MIN || "120"),
      "1 m"
    ),
    prefix: "cerebro_rl",
  })
}

function getHeader(headers: Headers, name: string) {
  return headers.get(name) || headers.get(name.toLowerCase()) || ""
}

export async function validateIntegrationHeaders(request: Request): Promise<AuthResult> {
  const required = String(process.env.INTEGRATION_AUTH_REQUIRED || "false").toLowerCase() === "true"
  const sourceSystem = getHeader(request.headers, "X-Source-System") || "willtalk"
  const sourceEntityId = getHeader(request.headers, "X-Source-Entity-Id") || "unknown"
  const tenantId = getHeader(request.headers, "X-Tenant-Id") || "default"
  const ingestionId = getHeader(request.headers, "X-Ingestion-Id") || `ing-${Date.now()}`

  if (!required) {
    return { ok: true, tenantId, sourceSystem, ingestionId, sourceEntityId }
  }

  // Token editável pelo painel (banco → env).
  const auth = getHeader(request.headers, "Authorization")
  const expected = await getSecret("CEREBRO_INGEST_TOKEN")
  if (!auth.startsWith("Bearer ") || !expected || auth.slice(7) !== expected) {
    return { ok: false, status: 401, error: "unauthorized_integration" }
  }

  return { ok: true, tenantId, sourceSystem, ingestionId, sourceEntityId }
}

export async function enforceRateLimit(tenantId: string, sourceSystem: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const key = `${tenantId}:${sourceSystem}`

  // Usar Upstash Redis se configurado (funciona em multi-instância/Vercel)
  if (upstashRatelimit) {
    const { success } = await upstashRatelimit.limit(key)
    if (!success) {
      return { ok: false, status: 429, error: "rate_limit_exceeded" }
    }
    return { ok: true }
  }

  // Fallback in-memory (single instance / desenvolvimento local)
  const max = Number(process.env.INTEGRATION_RATE_LIMIT_PER_MIN || "120")
  const now = Date.now()
  const rec = memoryRateLimit.get(key)

  if (!rec || now - rec.start > WINDOW_MS) {
    memoryRateLimit.set(key, { start: now, count: 1 })
    return { ok: true }
  }

  if (rec.count >= max) {
    return { ok: false, status: 429, error: "rate_limit_exceeded" }
  }

  rec.count += 1
  memoryRateLimit.set(key, rec)
  return { ok: true }
}

export async function registerDedupKey(
  supabase: any,
  tenantId: string,
  dedupKey: string,
  payloadHash: string,
) {
  const { error } = await supabase.from("dedup_keys").insert({
    tenant_id: tenantId,
    dedup_key: dedupKey,
    payload_hash: payloadHash,
  })
  if (error && String(error.message).toLowerCase().includes("duplicate")) {
    return { duplicated: true }
  }
  if (error && String(error.code) === "23505") {
    return { duplicated: true }
  }
  if (error && String(error.message).includes("relation \"dedup_keys\" does not exist")) {
    return { duplicated: false }
  }
  if (error) throw error
  return { duplicated: false }
}

export async function registerSourceRecord(
  supabase: any,
  payload: {
    tenantId: string
    sourceSystem: string
    sourceEntityId: string
    ingestionId?: string
    payloadHash: string
  },
) {
  const existing = await supabase
    .from("source_records")
    .select("id, seen_count")
    .eq("tenant_id", payload.tenantId)
    .eq("source_system", payload.sourceSystem)
    .eq("source_entity_id", payload.sourceEntityId)
    .maybeSingle()

  if (existing.error && !String(existing.error.message).includes("relation \"source_records\" does not exist")) {
    throw existing.error
  }
  if (String(existing.error?.message || "").includes("relation \"source_records\" does not exist")) {
    return
  }

  if (existing.data?.id) {
    await supabase
      .from("source_records")
      .update({
        payload_hash: payload.payloadHash,
        ingestion_id: payload.ingestionId || null,
        last_seen_at: new Date().toISOString(),
        seen_count: Number(existing.data.seen_count || 1) + 1,
      })
      .eq("id", existing.data.id)
    return
  }

  await supabase.from("source_records").insert({
    tenant_id: payload.tenantId,
    source_system: payload.sourceSystem,
    source_entity_id: payload.sourceEntityId,
    ingestion_id: payload.ingestionId || null,
    payload_hash: payload.payloadHash,
  })
}

export async function auditEvent(
  supabase: any,
  data: {
    tenantId?: string
    sourceSystem?: string
    eventType: string
    severity?: "info" | "warn" | "error"
    traceId?: string
    message?: string
    context?: Record<string, unknown>
  },
) {
  const { error } = await supabase.from("audit_events").insert({
    tenant_id: data.tenantId || null,
    source_system: data.sourceSystem || null,
    event_type: data.eventType,
    severity: data.severity || "info",
    trace_id: data.traceId || null,
    message: data.message || null,
    context: data.context || {},
  })
  if (error && !String(error.message).includes("relation \"audit_events\" does not exist")) {
    logger.warn("audit_event_write_failed", {
      tenantId: data.tenantId,
      eventType: data.eventType,
      error: error.message,
    })
  }
}


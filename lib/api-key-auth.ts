/**
 * lib/api-key-auth.ts
 *
 * Autenticação por API Key para endpoints públicos /api/v1/*.
 * Convive com o auth interno (CEREBRO_INGEST_TOKEN) sem conflito.
 *
 * Formato: Authorization: Bearer mk_live_<random>
 */

import { createHash, randomBytes } from "crypto"
import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ApiKeyScope = "query" | "search" | "ingest" | "curate"

export type ApiKeyAuthResult =
  | { ok: true;  tenantId: string; scopes: ApiKeyScope[]; keyId: string }
  | { ok: false; status: number;   error: string }

interface CachedKey {
  tenantId: string
  scopes: ApiKeyScope[]
  keyId: string
  expiresAt: string | null
  cachedAt: number
}

// ─── Cache in-memory (60s TTL) ────────────────────────────────────────────────

const KEY_CACHE = new Map<string, CachedKey>()
const CACHE_TTL_MS = 60_000

function getCached(hash: string): CachedKey | null {
  const entry = KEY_CACHE.get(hash)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    KEY_CACHE.delete(hash)
    return null
  }
  return entry
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/** Gera um novo token bruto. Retorna { token, hash, prefix }. */
export function generateApiKey(): { token: string; hash: string; prefix: string } {
  const raw    = randomBytes(32).toString("hex")
  const token  = `mk_live_${raw}`
  const hash   = hashToken(token)
  const prefix = token.slice(0, 16)
  return { token, hash, prefix }
}

/** SHA-256 do token bruto. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Valida o Bearer token da requisição contra a tabela api_keys.
 * Usa cache de 60s para evitar 1 query por request.
 */
export async function validateApiKey(request: Request): Promise<ApiKeyAuthResult> {
  const auth = request.headers.get("Authorization") || ""
  if (!auth.startsWith("Bearer mk_live_")) {
    return { ok: false, status: 401, error: "missing_or_invalid_api_key" }
  }

  const token = auth.slice(7)
  const hash  = hashToken(token)

  // Cache hit
  const cached = getCached(hash)
  if (cached) {
    if (cached.expiresAt && new Date(cached.expiresAt) < new Date()) {
      KEY_CACHE.delete(hash)
      return { ok: false, status: 401, error: "api_key_expired" }
    }
    return { ok: true, tenantId: cached.tenantId, scopes: cached.scopes, keyId: cached.keyId }
  }

  // DB lookup
  try {
    const result = await query(
      `SELECT id, tenant_id, scopes, expires_at
         FROM public.api_keys
        WHERE key_hash = $1 AND is_active = true
        LIMIT 1`,
      [hash]
    )

    if (result.rows.length === 0) {
      return { ok: false, status: 401, error: "invalid_api_key" }
    }

    const row = result.rows[0]

    if (row.expires_at && new Date(row.expires_at) < new Date()) {
      return { ok: false, status: 401, error: "api_key_expired" }
    }

    const entry: CachedKey = {
      tenantId : row.tenant_id,
      scopes   : row.scopes as ApiKeyScope[],
      keyId    : row.id,
      expiresAt: row.expires_at ?? null,
      cachedAt : Date.now(),
    }
    KEY_CACHE.set(hash, entry)

    // Atualiza last_used_at de forma assíncrona (fire-and-forget)
    query(
      "UPDATE public.api_keys SET last_used_at = NOW() WHERE id = $1",
      [row.id]
    ).catch((e) => logger.warn("api_key_last_used_update_failed", { keyId: row.id, error: e.message }))

    return { ok: true, tenantId: row.tenant_id, scopes: row.scopes, keyId: row.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn("api_key_auth_db_error", { error: msg })
    return { ok: false, status: 503, error: "auth_service_unavailable" }
  }
}

/** Verifica se a key tem o scope necessário. */
export function hasScope(scopes: ApiKeyScope[], required: ApiKeyScope): boolean {
  return scopes.includes(required)
}

/** Invalida o cache para uma key específica (usar após revogar). */
export function invalidateKeyCache(hash: string): void {
  KEY_CACHE.delete(hash)
}

/** Rate limit simples por keyId (in-memory, janela de 1 min). */
const RL_MAP = new Map<string, { start: number; count: number }>()
const RL_WINDOW = 60_000

export function checkApiKeyRateLimit(keyId: string, limitPerMin: number): boolean {
  const now = Date.now()
  const rec = RL_MAP.get(keyId)

  if (!rec || now - rec.start > RL_WINDOW) {
    RL_MAP.set(keyId, { start: now, count: 1 })
    return true
  }

  if (rec.count >= limitPerMin) return false

  rec.count += 1
  return true
}

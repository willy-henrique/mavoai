/**
 * lib/system-config-store.ts
 *
 * Configurações de runtime armazenadas no PostgreSQL.
 * DB tem precedência sobre env vars — mudanças via UI entram em vigor
 * sem restart do servidor (TTL de cache: 30s).
 *
 * Chaves disponíveis:
 *   ai.base_url       | ai.chat_model | ai.curator_model | ai.api_key
 *   embedding.base_url | embedding.model | embedding.api_key | embedding.dimensions
 */

import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"

// ─── Cache in-memory ──────────────────────────────────────────────────────────

const CACHE = new Map<string, string>()
let cacheLoadedAt = 0
const CACHE_TTL_MS = 30_000

export function invalidateConfigCache() {
  CACHE.clear()
  cacheLoadedAt = 0
}

async function loadAll(): Promise<Map<string, string>> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS && CACHE.size > 0) {
    return CACHE
  }
  try {
    const result = await query("SELECT key, value FROM public.system_config")
    CACHE.clear()
    for (const row of result.rows as { key: string; value: string }[]) {
      CACHE.set(row.key, row.value)
    }
    cacheLoadedAt = Date.now()
  } catch {
    // Tabela pode não existir ainda (migration pendente) — ignora silenciosamente
    cacheLoadedAt = Date.now() // evita retry até próximo TTL
  }
  return CACHE
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Lê um valor do DB, ou usa o fallback (env var / default hardcoded).
 * Retorna undefined apenas se fallback não fornecido.
 */
export async function getSystemConfig(key: string, fallback?: string): Promise<string | undefined> {
  const all = await loadAll()
  return all.has(key) ? all.get(key) : fallback
}

/**
 * Retorna todas as configs carregadas (sem chaves de API — mascaradas).
 */
export async function getAllSystemConfig(): Promise<Record<string, string>> {
  const all = await loadAll()
  const result: Record<string, string> = {}
  for (const [k, v] of all.entries()) {
    // Mascara chaves de API no retorno
    result[k] = k.endsWith(".api_key") ? maskKey(v) : v
  }
  return result
}

/** Retorna todas as configs incluindo chaves em claro (apenas para uso interno/server). */
export async function getAllSystemConfigRaw(): Promise<Record<string, string>> {
  const all = await loadAll()
  return Object.fromEntries(all.entries())
}

// ─── Escrita ──────────────────────────────────────────────────────────────────

export interface ModelConfig {
  ai_base_url?: string
  ai_chat_model?: string
  ai_curator_model?: string
  ai_api_key?: string
  embedding_base_url?: string
  embedding_model?: string
  embedding_api_key?: string
  embedding_dimensions?: string
}

/**
 * Salva a configuração de modelos IA no banco.
 * Valores em branco são ignorados (mantém o valor atual).
 * Valores que são placeholders de máscara ("••••...") também são ignorados.
 */
export async function saveModelConfig(cfg: ModelConfig): Promise<void> {
  const entries: Array<[string, string]> = []

  const map: Record<keyof ModelConfig, string> = {
    ai_base_url        : "ai.base_url",
    ai_chat_model      : "ai.chat_model",
    ai_curator_model   : "ai.curator_model",
    ai_api_key         : "ai.api_key",
    embedding_base_url : "embedding.base_url",
    embedding_model    : "embedding.model",
    embedding_api_key  : "embedding.api_key",
    embedding_dimensions: "embedding.dimensions",
  }

  for (const [field, dbKey] of Object.entries(map) as Array<[keyof ModelConfig, string]>) {
    const val = cfg[field]?.trim()
    if (!val || val.startsWith("••••")) continue  // ignora vazio ou máscara
    entries.push([dbKey, val])
  }

  if (entries.length === 0) return

  for (const [key, value] of entries) {
    await query(
      `INSERT INTO public.system_config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value],
    )
  }

  logger.info("system_config_saved", { keys: entries.map(([k]) => k) })
  invalidateConfigCache()
}

// ─── Segredos (tokens/chaves editáveis pelo painel) ─────────────────────────────

/**
 * Salva segredos no banco como `secret.<NOME>`.
 * Valores em branco ou mascarados ("••••...") são ignorados (mantém o atual).
 */
export async function saveSecrets(secrets: Record<string, string>): Promise<void> {
  const entries: Array<[string, string]> = []
  for (const [name, rawVal] of Object.entries(secrets)) {
    const val = (rawVal ?? "").trim()
    if (!val || val.startsWith("••••")) continue
    entries.push([`secret.${name}`, val])
  }
  if (entries.length === 0) return

  for (const [key, value] of entries) {
    await query(
      `INSERT INTO public.system_config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
      [key, value],
    )
  }

  logger.info("secrets_saved", { keys: entries.map(([k]) => k) })
  invalidateConfigCache()
}

/** Grava (ou atualiza) uma chave qualquer do system_config. */
export async function setSystemConfig(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO public.system_config (key, value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
    [key, value],
  )
  invalidateConfigCache()
}

/** Remove um segredo do banco — volta a valer a variável de ambiente. */
export async function deleteSecret(name: string): Promise<void> {
  await query("DELETE FROM public.system_config WHERE key = $1", [`secret.${name}`])
  logger.info("secret_deleted", { key: `secret.${name}` })
  invalidateConfigCache()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function maskKey(key: string): string {
  if (!key || key.length < 8) return "••••••••"
  return `${key.slice(0, 6)}${"•".repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
}

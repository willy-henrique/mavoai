/**
 * lib/agent-config.ts
 *
 * Camada de configuração dos agentes do Cérebro.
 * Carrega parâmetros do banco (agent_configs) com cache TTL de 60s.
 * Falls back para defaults do código se não houver registro no banco.
 *
 * Expõe também os AGENT_DEFAULTS — fonte única de verdade dos valores padrão.
 */

import { query } from "@/lib/database/postgres-client-no-vector"

// ─── IDs canônicos dos agentes ─────────────────────────────────────────────────

export const AGENT_IDS = [
  "orchestrator",
  "triage",
  "investigation",
  "resolution",
  "vision",
  "curator",
  "handoff",
] as const

export type AgentId = (typeof AGENT_IDS)[number]

// ─── Parâmetros específicos de cada agente ─────────────────────────────────────

export interface OrchestratorParams {
  fast_path_min_chars: number
  investigation_required_adequate_rounds: number
  investigation_max_inadequate_before_handoff: number
  investigation_max_inbound_without_handoff: number
  menu_max_invalid_attempts: number
}

export interface TriageParams {
  max_attempts: number
  min_confidence: number
  reply_max_chars: number
}

export interface InvestigationParams {
  /** Reservado — customizável via system_prompt. */
  placeholder?: never
}

export interface ResolutionParams {
  max_attempts: number
  rag_results_limit: number
  rag_similarity_threshold: number
}

export interface VisionParams {
  enabled: boolean
  model_override: string
}

export interface CuratorParams {
  auto_curate: boolean
  similarity_alert_threshold: number
}

export interface HandoffParams {
  max_summary_chars: number
}

export type AgentParamsMap = {
  orchestrator: OrchestratorParams
  triage: TriageParams
  investigation: InvestigationParams
  resolution: ResolutionParams
  vision: VisionParams
  curator: CuratorParams
  handoff: HandoffParams
}

// ─── Defaults (fonte única de verdade) ────────────────────────────────────────

export const AGENT_DEFAULTS: AgentParamsMap = {
  orchestrator: {
    fast_path_min_chars: 35,
    // 2 rodadas de evidência antes de resolver (1 era muito agressivo)
    investigation_required_adequate_rounds: 2,
    investigation_max_inadequate_before_handoff: 3,
    investigation_max_inbound_without_handoff: 14,
    menu_max_invalid_attempts: 3,
  },
  triage: {
    max_attempts: 2,
    min_confidence: 0.65,
    reply_max_chars: 220,
  },
  investigation: {},
  resolution: {
    max_attempts: 2,
    rag_results_limit: 5,
    // 0.55 = mínimo de semelhança para um caso histórico ser usado como referência.
    // Abaixo disso o caso é descartado — contexto ruim confunde mais do que ajuda.
    rag_similarity_threshold: 0.55,
  },
  vision: {
    enabled: true,
    model_override: "",
  },
  curator: {
    auto_curate: false,
    similarity_alert_threshold: 0.85,
  },
  handoff: {
    max_summary_chars: 1000,
  },
}

export interface AgentConfig<Id extends AgentId = AgentId> {
  agent_id: Id
  tenant_id: string
  enabled: boolean
  system_prompt: string | null
  params: AgentParamsMap[Id]
  updated_at: string
}

// ─── Cache em memória com TTL ──────────────────────────────────────────────────

const CACHE_TTL_MS = 60_000 // 60 segundos

interface CacheEntry<T> {
  value: T
  expires: number
}

const configCache = new Map<string, CacheEntry<AgentConfig>>()

function cacheKey(agentId: string, tenantId: string) {
  return `${agentId}:${tenantId}`
}

function fromCache<T>(key: string): T | null {
  const entry = configCache.get(key) as CacheEntry<T> | undefined
  if (!entry) return null
  if (Date.now() > entry.expires) {
    configCache.delete(key)
    return null
  }
  return entry.value
}

function toCache<T>(key: string, value: T) {
  configCache.set(key, { value: value as unknown as AgentConfig, expires: Date.now() + CACHE_TTL_MS })
}

export function invalidateAgentConfigCache(agentId: string, tenantId: string) {
  configCache.delete(cacheKey(agentId, tenantId))
}

// ─── Loader principal ──────────────────────────────────────────────────────────

/**
 * Carrega a config do agente do banco.
 * Merge: defaults ← params do banco (sobrescreve só o que foi definido).
 */
export async function loadAgentConfig<Id extends AgentId>(
  agentId: Id,
  tenantId = "default",
): Promise<AgentConfig<Id>> {
  const key = cacheKey(agentId, tenantId)
  const cached = fromCache<AgentConfig<Id>>(key)
  if (cached) return cached

  const defaults = AGENT_DEFAULTS[agentId] as AgentParamsMap[Id]

  try {
    const result = await query(
      `SELECT enabled, system_prompt, params, updated_at
       FROM public.agent_configs
       WHERE agent_id = $1 AND tenant_id = $2
       LIMIT 1`,
      [agentId, tenantId],
    )

    const row = result.rows[0]

    const merged: AgentConfig<Id> = row
      ? {
          agent_id: agentId,
          tenant_id: tenantId,
          enabled: row.enabled as boolean,
          system_prompt: row.system_prompt as string | null,
          params: { ...defaults, ...(row.params as Partial<AgentParamsMap[Id]>) },
          updated_at: String(row.updated_at),
        }
      : {
          agent_id: agentId,
          tenant_id: tenantId,
          enabled: true,
          system_prompt: null,
          params: defaults,
          updated_at: new Date().toISOString(),
        }

    toCache(key, merged)
    return merged
  } catch {
    // Banco inacessível → usa defaults sem cache
    return {
      agent_id: agentId,
      tenant_id: tenantId,
      enabled: true,
      system_prompt: null,
      params: defaults,
      updated_at: new Date().toISOString(),
    }
  }
}

/**
 * Salva (upsert) a config de um agente no banco e invalida o cache.
 */
export async function saveAgentConfig(
  agentId: AgentId,
  tenantId: string,
  patch: { enabled?: boolean; system_prompt?: string | null; params?: Partial<AgentParamsMap[AgentId]> },
): Promise<void> {
  const current = await loadAgentConfig(agentId, tenantId)

  const newEnabled = patch.enabled ?? current.enabled
  const newPrompt =
    "system_prompt" in patch ? patch.system_prompt ?? null : current.system_prompt
  const newParams = { ...current.params, ...(patch.params ?? {}) }

  await query(
    `INSERT INTO public.agent_configs (agent_id, tenant_id, enabled, system_prompt, params)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (agent_id, tenant_id)
     DO UPDATE SET enabled = $3, system_prompt = $4, params = $5, updated_at = NOW()`,
    [agentId, tenantId, newEnabled, newPrompt, JSON.stringify(newParams)],
  )

  invalidateAgentConfigCache(agentId, tenantId)
}

/**
 * Retorna os params resolvidos (banco ou default) para uso rápido pelos agentes.
 * Nunca lança exceção — garante safe fallback para defaults.
 */
export async function getAgentParams<Id extends AgentId>(
  agentId: Id,
  tenantId = "default",
): Promise<AgentParamsMap[Id]> {
  try {
    const cfg = await loadAgentConfig(agentId, tenantId)
    return cfg.params
  } catch {
    return AGENT_DEFAULTS[agentId] as AgentParamsMap[Id]
  }
}

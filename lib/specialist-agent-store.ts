/**
 * lib/specialist-agent-store.ts
 *
 * CRUD + cache para agentes especialistas por domínio.
 * Cache TTL: 5min (mudanças via UI propagam em até 5min).
 */

import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"
import { ANTI_HALLUCINATION_BLOCK } from "@/lib/escalation-detector"

export interface SpecialistAgent {
  id: string
  tenant_id: string
  domain: string
  name: string
  description: string | null
  system_prompt: string
  keywords: string[]
  model_base_url: string | null
  model_name: string | null
  priority: number
  is_active: boolean
  created_at: string
  updated_at: string
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE = new Map<string, { agents: SpecialistAgent[]; at: number }>()
const CACHE_TTL = 5 * 60_000

export function invalidateSpecialistCache(tenantId: string) {
  CACHE.delete(tenantId)
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export async function loadSpecialistAgents(tenantId: string): Promise<SpecialistAgent[]> {
  const cached = CACHE.get(tenantId)
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.agents

  try {
    const result = await query(
      `SELECT id, tenant_id, domain, name, description, system_prompt,
              keywords, model_base_url, model_name, priority, is_active,
              created_at, updated_at
         FROM public.specialist_agents
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY priority DESC, domain`,
      [tenantId],
    )
    // Injeta o bloco anti-alucinação em todos os system_prompts automaticamente,
    // sem precisar editar cada registro no banco
    const agents = (result.rows as SpecialistAgent[]).map((a) => ({
      ...a,
      system_prompt: a.system_prompt
        ? `${a.system_prompt}\n${ANTI_HALLUCINATION_BLOCK}`
        : ANTI_HALLUCINATION_BLOCK,
    }))
    CACHE.set(tenantId, { agents, at: Date.now() })
    return agents
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn("specialist_agent_load_error", { tenantId, error: msg })
    return []
  }
}

/**
 * Carrega agentes com fallback em cascata: tenantId → "auge" → [].
 * Garante que tenants novos sem agentes próprios herdem os agentes base do "auge".
 */
export async function loadSpecialistAgentsCascade(tenantId: string): Promise<SpecialistAgent[]> {
  const agents = await loadSpecialistAgents(tenantId)
  if (agents.length > 0) return agents
  if (tenantId === "auge") return agents
  return loadSpecialistAgents("auge")
}

export async function loadAllSpecialistAgents(tenantId: string): Promise<SpecialistAgent[]> {
  try {
    const result = await query(
      `SELECT id, tenant_id, domain, name, description, system_prompt,
              keywords, model_base_url, model_name, priority, is_active,
              created_at, updated_at
         FROM public.specialist_agents
        WHERE tenant_id = $1
        ORDER BY priority DESC, domain`,
      [tenantId],
    )
    return result.rows as SpecialistAgent[]
  } catch {
    return []
  }
}

// ─── Escrita ──────────────────────────────────────────────────────────────────

export interface UpsertSpecialistAgentInput {
  tenant_id: string
  domain: string
  name: string
  description?: string | null
  system_prompt?: string
  keywords?: string[]
  model_base_url?: string | null
  model_name?: string | null
  priority?: number
  is_active?: boolean
}

export async function upsertSpecialistAgent(input: UpsertSpecialistAgentInput): Promise<SpecialistAgent> {
  const result = await query(
    `INSERT INTO public.specialist_agents
       (tenant_id, domain, name, description, system_prompt, keywords,
        model_base_url, model_name, priority, is_active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (tenant_id, domain) DO UPDATE
       SET name           = EXCLUDED.name,
           description    = EXCLUDED.description,
           system_prompt  = EXCLUDED.system_prompt,
           keywords       = EXCLUDED.keywords,
           model_base_url = EXCLUDED.model_base_url,
           model_name     = EXCLUDED.model_name,
           priority       = EXCLUDED.priority,
           is_active      = EXCLUDED.is_active,
           updated_at     = NOW()
     RETURNING *`,
    [
      input.tenant_id,
      input.domain,
      input.name,
      input.description ?? null,
      input.system_prompt ?? "",
      `{${(input.keywords ?? []).join(",")}}`,
      input.model_base_url ?? null,
      input.model_name ?? null,
      input.priority ?? 0,
      input.is_active ?? true,
    ],
  )
  invalidateSpecialistCache(input.tenant_id)
  return result.rows[0] as SpecialistAgent
}

export async function updateSpecialistAgentById(
  id: string,
  tenantId: string,
  patch: Partial<Omit<UpsertSpecialistAgentInput, "tenant_id" | "domain">>,
): Promise<SpecialistAgent | null> {
  const sets: string[] = []
  const vals: unknown[] = [id, tenantId]
  let i = 3

  if (patch.name !== undefined)           { sets.push(`name = $${i++}`);           vals.push(patch.name) }
  if (patch.description !== undefined)    { sets.push(`description = $${i++}`);    vals.push(patch.description) }
  if (patch.system_prompt !== undefined)  { sets.push(`system_prompt = $${i++}`);  vals.push(patch.system_prompt) }
  if (patch.keywords !== undefined)       { sets.push(`keywords = $${i++}`);       vals.push(`{${patch.keywords.join(",")}}`) }
  if (patch.model_base_url !== undefined) { sets.push(`model_base_url = $${i++}`); vals.push(patch.model_base_url) }
  if (patch.model_name !== undefined)     { sets.push(`model_name = $${i++}`);     vals.push(patch.model_name) }
  if (patch.priority !== undefined)       { sets.push(`priority = $${i++}`);       vals.push(patch.priority) }
  if (patch.is_active !== undefined)      { sets.push(`is_active = $${i++}`);      vals.push(patch.is_active) }

  if (sets.length === 0) return null
  sets.push(`updated_at = NOW()`)

  const result = await query(
    `UPDATE public.specialist_agents
        SET ${sets.join(", ")}
      WHERE id = $1 AND tenant_id = $2
      RETURNING *`,
    vals,
  )
  if (result.rows.length === 0) return null
  invalidateSpecialistCache(tenantId)
  return result.rows[0] as SpecialistAgent
}

export async function deleteSpecialistAgentById(id: string, tenantId: string): Promise<boolean> {
  const result = await query(
    `DELETE FROM public.specialist_agents WHERE id = $1 AND tenant_id = $2 RETURNING id`,
    [id, tenantId],
  )
  if (result.rows.length > 0) invalidateSpecialistCache(tenantId)
  return result.rows.length > 0
}

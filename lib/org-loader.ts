import { query } from "@/lib/database/postgres-client-no-vector"

export interface OrgConfig {
  id: string
  display_name: string
  product_name: string
  description: string | null
  is_active: boolean
}

const cache = new Map<string, { config: OrgConfig; expiresAt: number }>()
let _listCache: { orgs: OrgConfig[]; expiresAt: number } | null = null
const TTL_MS = 5 * 60 * 1000 // 5 min

export async function loadOrgConfig(orgId: string): Promise<OrgConfig | null> {
  if (!orgId) return null
  const now = Date.now()
  const cached = cache.get(orgId)
  if (cached && cached.expiresAt > now) return cached.config

  try {
    const result = await query(
      "SELECT id, display_name, product_name, description, is_active FROM organizations WHERE id = $1 AND is_active = true LIMIT 1",
      [orgId],
    )
    const row = result.rows[0]
    if (!row) return null
    const config: OrgConfig = {
      id: row.id,
      display_name: row.display_name,
      product_name: row.product_name,
      description: row.description ?? null,
      is_active: Boolean(row.is_active),
    }
    cache.set(orgId, { config, expiresAt: now + TTL_MS })
    return config
  } catch {
    return null
  }
}

export async function listActiveOrgs(): Promise<OrgConfig[]> {
  const now = Date.now()
  if (_listCache && _listCache.expiresAt > now) return _listCache.orgs

  try {
    const result = await query(
      "SELECT id, display_name, product_name, description, is_active FROM organizations WHERE is_active = true ORDER BY display_name",
    )
    const orgs: OrgConfig[] = result.rows.map((row: any) => ({
      id: row.id,
      display_name: row.display_name,
      product_name: row.product_name,
      description: row.description ?? null,
      is_active: true,
    }))
    _listCache = { orgs, expiresAt: now + TTL_MS }
    return orgs
  } catch {
    return []
  }
}

export function invalidateOrgCache(orgId?: string) {
  if (orgId) {
    cache.delete(orgId)
  } else {
    cache.clear()
  }
  _listCache = null
}

/**
 * GET/POST/DELETE /api/v1/keys
 *
 * CRUD de API Keys para integração externa.
 * Protegido por CEREBRO_INTERNAL_TOKEN (token interno de admin).
 *
 * POST   → cria key, retorna token bruto UMA vez
 * GET    → lista keys do tenant (sem token, só prefix + metadados)
 * DELETE → desativa key (is_active = false)
 */

import { NextResponse } from "next/server"
import { query } from "@/lib/database/postgres-client-no-vector"
import {
  generateApiKey,
  hashToken,
  invalidateKeyCache,
  type ApiKeyScope,
} from "@/lib/api-key-auth"

export const dynamic = "force-dynamic"

// ─── Auth interna ─────────────────────────────────────────────────────────────

function isAdminAuth(request: Request): boolean {
  const auth     = request.headers.get("Authorization") || ""
  const expected = process.env.CEREBRO_INTERNAL_TOKEN || ""
  return !!expected && auth === `Bearer ${expected}`
}

// ─── POST — Criar API Key ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!isAdminAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: Record<string, unknown>
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const tenantId = typeof body.tenant_id === "string" ? body.tenant_id.trim() : ""
  const name     = typeof body.name      === "string" ? body.name.trim()      : ""

  if (!tenantId) return NextResponse.json({ error: "tenant_id_required" }, { status: 400 })
  if (!name)     return NextResponse.json({ error: "name_required" },     { status: 400 })

  const rawScopes = Array.isArray(body.scopes) ? body.scopes : ["query", "search"]
  const validScopes: ApiKeyScope[] = (rawScopes as string[]).filter((s) =>
    ["query", "search", "ingest", "curate"].includes(s)
  ) as ApiKeyScope[]

  const rateLimit  = typeof body.rate_limit_per_min === "number" ? body.rate_limit_per_min : 60
  const expiresAt  = typeof body.expires_at         === "string" ? body.expires_at         : null

  // Verificar limite de 10 keys ativas por tenant
  const countResult = await query(
    "SELECT COUNT(*) FROM public.api_keys WHERE tenant_id = $1 AND is_active = true",
    [tenantId]
  )
  if (Number(countResult.rows[0].count) >= 10) {
    return NextResponse.json(
      { error: "max_keys_reached", message: "Limite de 10 API Keys ativas por tenant atingido." },
      { status: 422 }
    )
  }

  const { token, hash, prefix } = generateApiKey()

  try {
    const result = await query(
      `INSERT INTO public.api_keys
         (key_hash, key_prefix, tenant_id, name, scopes, rate_limit_per_min, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, key_prefix, tenant_id, name, scopes, rate_limit_per_min, is_active, expires_at, created_at`,
      [hash, prefix, tenantId, name, validScopes, rateLimit, expiresAt]
    )

    const row = result.rows[0]
    return NextResponse.json({
      id          : row.id,
      token,                // ← retornado UMA vez, nunca mais
      key_prefix  : row.key_prefix,
      tenant_id   : row.tenant_id,
      name        : row.name,
      scopes      : row.scopes,
      rate_limit_per_min: row.rate_limit_per_min,
      is_active   : row.is_active,
      expires_at  : row.expires_at,
      created_at  : row.created_at,
      _note       : "Guarde o token agora — ele não será exibido novamente.",
    }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("organizations")) {
      return NextResponse.json({ error: "tenant_not_found" }, { status: 404 })
    }
    console.error("api_keys POST error:", msg)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

// ─── GET — Listar API Keys ────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (!isAdminAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get("tenant_id")

  const sql = tenantId
    ? "SELECT id, key_prefix, tenant_id, name, scopes, rate_limit_per_min, is_active, last_used_at, expires_at, created_at FROM public.api_keys WHERE tenant_id = $1 ORDER BY created_at DESC"
    : "SELECT id, key_prefix, tenant_id, name, scopes, rate_limit_per_min, is_active, last_used_at, expires_at, created_at FROM public.api_keys ORDER BY created_at DESC"

  const params = tenantId ? [tenantId] : []
  const result = await query(sql, params)
  return NextResponse.json({ data: result.rows })
}

// ─── DELETE — Revogar API Key ─────────────────────────────────────────────────

export async function DELETE(request: Request) {
  if (!isAdminAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

  const result = await query(
    "UPDATE public.api_keys SET is_active = false WHERE id = $1 RETURNING id, key_hash",
    [id]
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Invalida cache
  invalidateKeyCache(result.rows[0].key_hash)

  return NextResponse.json({ ok: true, id: result.rows[0].id })
}

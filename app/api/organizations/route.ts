import { invalidateOrgCache } from "@/lib/org-loader"
import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get("active") === "true"

  const sql = activeOnly
    ? "SELECT id, display_name, product_name, description, is_active, created_at, updated_at FROM organizations WHERE is_active = true ORDER BY display_name"
    : "SELECT id, display_name, product_name, description, is_active, created_at, updated_at FROM organizations ORDER BY display_name"

  const result = await query(sql)
  return NextResponse.json(result.rows)
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const { id, display_name, product_name, description } = body as Record<string, unknown>

  if (!id || typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json({ error: "id deve ser slug lowercase (ex: minha-empresa)" }, { status: 400 })
  }
  if (!display_name || typeof display_name !== "string") {
    return NextResponse.json({ error: "display_name obrigatorio" }, { status: 400 })
  }
  if (!product_name || typeof product_name !== "string") {
    return NextResponse.json({ error: "product_name obrigatorio" }, { status: 400 })
  }

  const result = await query(
    `INSERT INTO organizations (id, display_name, product_name, description, is_active)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (id) DO NOTHING
     RETURNING *`,
    [id, display_name, product_name, description ?? null],
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "id já existe" }, { status: 409 })
  }

  invalidateOrgCache(id)
  return NextResponse.json(result.rows[0], { status: 201 })
}

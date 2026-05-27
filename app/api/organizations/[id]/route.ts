import { invalidateOrgCache } from "@/lib/org-loader"
import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const { display_name, product_name, description, is_active } = body as Record<string, unknown>

  const result = await query(
    `UPDATE organizations
     SET display_name  = COALESCE($2, display_name),
         product_name  = COALESCE($3, product_name),
         description   = COALESCE($4, description),
         is_active     = COALESCE($5, is_active),
         updated_at    = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      display_name ?? null,
      product_name ?? null,
      description ?? null,
      is_active !== undefined ? Boolean(is_active) : null,
    ],
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  invalidateOrgCache(id)
  return NextResponse.json(result.rows[0])
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  if (id === "auge") {
    return NextResponse.json({ error: "não é possível remover a org padrão AUGE" }, { status: 400 })
  }

  const result = await query(
    "UPDATE organizations SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id",
    [id],
  )

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  invalidateOrgCache(id)
  return NextResponse.json({ ok: true })
}

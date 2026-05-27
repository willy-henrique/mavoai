import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

const ALLOWED_FIELDS = [
  "name",
  "description",
  "is_active",
  "rate_limit_per_minute",
  "base_url",
  "webhook_url",
  "auth_type",
  "auth_token",
  "outbound_active",
] as const

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const fields: string[] = []
    const values: unknown[] = []
    let i = 1

    for (const key of ALLOWED_FIELDS) {
      if (key in body) {
        fields.push(`${key} = $${i++}`)
        values.push(body[key])
      }
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "Nenhum campo válido para atualizar" }, { status: 400 })
    }

    fields.push(`updated_at = NOW()`)
    values.push(id)

    const result = await query(
      `UPDATE public.integrations SET ${fields.join(", ")} WHERE id = $${i}
       RETURNING id, tenant_id, source_system, name, description, is_active, rate_limit_per_minute,
                 base_url, webhook_url, auth_type, outbound_active,
                 CASE WHEN auth_token IS NOT NULL AND auth_token <> '' THEN true ELSE false END AS has_auth_token,
                 created_at, updated_at`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Integração não encontrada" }, { status: 404 })
    }

    return NextResponse.json({ data: result.rows[0] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await query("DELETE FROM public.integrations WHERE id = $1", [id])
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

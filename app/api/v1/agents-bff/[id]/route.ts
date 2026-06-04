/**
 * GET/PUT/DELETE /api/v1/agents-bff/:id
 * BFF proxy — injeta CEREBRO_INTERNAL_TOKEN server-side.
 */
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BASE = process.env.INTERNAL_BASE_URL || "http://localhost:3000"

function adminHeaders(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${process.env.CEREBRO_INTERNAL_TOKEN ?? ""}`,
    ...extra,
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const qs = searchParams.toString()
  const resp = await fetch(`${BASE}/api/v1/agents/${id}${qs ? `?${qs}` : ""}`, {
    headers: adminHeaders(),
    cache: "no-store",
  })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.text()
  const resp = await fetch(`${BASE}/api/v1/agents/${id}`, {
    method: "PUT",
    headers: adminHeaders({ "Content-Type": "application/json" }),
    body,
  })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const qs = searchParams.toString()
  const resp = await fetch(`${BASE}/api/v1/agents/${id}${qs ? `?${qs}` : ""}`, {
    method: "DELETE",
    headers: adminHeaders(),
  })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

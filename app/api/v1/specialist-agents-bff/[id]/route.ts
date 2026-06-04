import { NextResponse } from "next/server"
export const dynamic = "force-dynamic"
const BASE = process.env.INTERNAL_BASE_URL || "http://localhost:3000"
function h(extra?: Record<string,string>) { return { Authorization: `Bearer ${process.env.CEREBRO_INTERNAL_TOKEN ?? ""}`, ...extra } }

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.text()
  const resp = await fetch(`${BASE}/api/v1/specialist-agents/${id}`, { method: "PATCH", headers: h({ "Content-Type": "application/json" }), body })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const resp = await fetch(`${BASE}/api/v1/specialist-agents/${id}`, { method: "DELETE", headers: h() })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

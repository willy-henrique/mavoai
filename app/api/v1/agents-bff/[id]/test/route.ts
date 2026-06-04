import { NextResponse } from "next/server"
export const dynamic = "force-dynamic"
const BASE = process.env.INTERNAL_BASE_URL || "http://localhost:3000"
function h(extra?: Record<string, string>) { return { Authorization: `Bearer ${process.env.CEREBRO_INTERNAL_TOKEN ?? ""}`, ...extra } }

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.text()
  const resp = await fetch(`${BASE}/api/v1/agents/${id}/test`, { method: "POST", headers: h({ "Content-Type": "application/json" }), body })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

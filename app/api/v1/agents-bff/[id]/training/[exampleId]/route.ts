import { NextResponse } from "next/server"
export const dynamic = "force-dynamic"
const BASE = process.env.INTERNAL_BASE_URL || "http://localhost:3000"
function h() { return { Authorization: `Bearer ${process.env.CEREBRO_INTERNAL_TOKEN ?? ""}` } }

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; exampleId: string }> }) {
  const { id, exampleId } = await params
  const resp = await fetch(`${BASE}/api/v1/agents/${id}/training/${exampleId}`, { method: "DELETE", headers: h() })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

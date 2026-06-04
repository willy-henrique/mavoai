/**
 * GET /api/v1/agents-bff
 * BFF proxy — injeta CEREBRO_INTERNAL_TOKEN server-side.
 */
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BASE = process.env.INTERNAL_BASE_URL || "http://localhost:3000"

function adminHeaders() {
  return { Authorization: `Bearer ${process.env.CEREBRO_INTERNAL_TOKEN ?? ""}` }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const qs = searchParams.toString()
  const resp = await fetch(`${BASE}/api/v1/agents${qs ? `?${qs}` : ""}`, {
    headers: adminHeaders(),
    cache: "no-store",
  })
  return NextResponse.json(await resp.json(), { status: resp.status })
}

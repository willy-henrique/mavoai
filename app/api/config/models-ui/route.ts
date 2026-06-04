/**
 * GET/POST /api/config/models-ui
 *
 * BFF proxy para a aba "Modelos IA" do settings panel.
 * Injeta CEREBRO_INTERNAL_TOKEN server-side — o browser nunca vê o token.
 */

import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const BASE_URL = process.env.INTERNAL_BASE_URL || "http://localhost:3000"

function adminHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.CEREBRO_INTERNAL_TOKEN ?? ""}`,
  }
}

export async function GET() {
  try {
    const resp = await fetch(`${BASE_URL}/api/config/models`, {
      headers: adminHeaders(),
      cache: "no-store",
    })
    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}

export async function POST(request: Request) {
  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  try {
    const resp = await fetch(`${BASE_URL}/api/config/models`, {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify(body),
    })
    const data = await resp.json()
    return NextResponse.json(data, { status: resp.status })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "proxy_error", detail: msg }, { status: 502 })
  }
}

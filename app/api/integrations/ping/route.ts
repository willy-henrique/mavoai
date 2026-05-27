import { NextResponse } from "next/server"

const PLATFORM_URLS: Record<string, string> = {
  willtalk: process.env.WILLTALK_REPLY_WEBHOOK_URL?.replace(/\/api\/.*/, "") || "http://localhost:4002",
  mtalk: process.env.MTALK_BASE_URL || "http://localhost:4003",
  mavo_gestao: process.env.MAVO_GESTAO_BASE_URL || "http://localhost:4004",
}

export async function POST(request: Request) {
  try {
    const { source_system, url } = await request.json()

    const baseUrl = url || PLATFORM_URLS[source_system]
    if (!baseUrl) {
      return NextResponse.json({ ok: false, error: "URL da plataforma não configurada" })
    }

    const start = Date.now()
    try {
      const res = await fetch(`${baseUrl}/api/health`, {
        method: "GET",
        signal: AbortSignal.timeout(3000),
      })
      return NextResponse.json({
        ok: res.ok || res.status < 500,
        latency_ms: Date.now() - start,
        status: res.status,
        url: baseUrl,
      })
    } catch {
      // Tenta rota raiz se /api/health não existir
      try {
        const res2 = await fetch(baseUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(3000),
        })
        return NextResponse.json({
          ok: res2.status < 500,
          latency_ms: Date.now() - start,
          status: res2.status,
          url: baseUrl,
        })
      } catch {
        return NextResponse.json({
          ok: false,
          latency_ms: Date.now() - start,
          error: "Plataforma inacessível",
          url: baseUrl,
        })
      }
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    )
  }
}

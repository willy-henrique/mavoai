import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const result = await query(
      `SELECT base_url, webhook_url, auth_type, auth_token, outbound_active FROM public.integrations WHERE id = $1`,
      [id]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Integração não encontrada" }, { status: 404 })
    }

    const { base_url, webhook_url, auth_type, auth_token, outbound_active } = result.rows[0]
    const results: Record<string, unknown> = {}

    // ── inbound ping (base_url) ──────────────────────────────────────────────
    if (base_url) {
      const start = Date.now()
      try {
        const res = await fetch(`${base_url}/api/health`, {
          method: "GET",
          signal: AbortSignal.timeout(4000),
        })
        results.inbound = { ok: res.ok || res.status < 500, latency_ms: Date.now() - start, status: res.status, url: base_url }
      } catch {
        try {
          const start2 = Date.now()
          const res2 = await fetch(base_url, { method: "HEAD", signal: AbortSignal.timeout(4000) })
          results.inbound = { ok: res2.status < 500, latency_ms: Date.now() - start2, status: res2.status, url: base_url }
        } catch {
          results.inbound = { ok: false, latency_ms: Date.now() - start, error: "Serviço inacessível", url: base_url }
        }
      }
    } else {
      results.inbound = { ok: null, error: "URL base não configurada" }
    }

    // ── outbound webhook test ────────────────────────────────────────────────
    if (outbound_active && webhook_url) {
      const headers: Record<string, string> = { "Content-Type": "application/json" }
      if (auth_token) {
        if (auth_type === "bearer") headers["Authorization"] = `Bearer ${auth_token}`
        else if (auth_type === "api_key") headers["X-Api-Key"] = auth_token
        else if (auth_type === "basic") headers["Authorization"] = `Basic ${auth_token}`
      }

      const start = Date.now()
      try {
        const res = await fetch(webhook_url, {
          method: "POST",
          headers,
          body: JSON.stringify({ type: "ping", source: "cerebro", timestamp: new Date().toISOString() }),
          signal: AbortSignal.timeout(5000),
        })
        results.outbound = { ok: res.status < 500, latency_ms: Date.now() - start, status: res.status, url: webhook_url }
      } catch (err) {
        results.outbound = { ok: false, latency_ms: Date.now() - start, error: err instanceof Error ? err.message : "Falha na requisição", url: webhook_url }
      }
    } else if (outbound_active && !webhook_url) {
      results.outbound = { ok: null, error: "Webhook URL não configurada" }
    } else {
      results.outbound = { ok: null, skipped: true, reason: "Outbound desativado" }
    }

    return NextResponse.json({ results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}

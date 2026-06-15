/**
 * GET /api/admin/ai-status
 *
 * Saúde e limites da IA em tempo real. Faz UMA chamada mínima ao provedor de
 * chat e lê os headers de rate limit (Groq: x-ratelimit-*). Protegido pelo
 * middleware. Não fazer auto-polling agressivo — cada chamada consome 1 request.
 */
import { NextResponse } from "next/server"
import { getSystemConfig } from "@/lib/system-config-store"
import { query } from "@/lib/database/postgres-client-no-vector"

export const dynamic = "force-dynamic"

function num(v: string | null): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function detectarProvider(baseUrl: string): string {
  try {
    const h = new URL(baseUrl).hostname
    if (h.includes("groq")) return "Groq"
    if (h.includes("google") || h.includes("gemini")) return "Google Gemini"
    if (h.includes("openrouter")) return "OpenRouter"
    if (h.includes("openai")) return "OpenAI"
    return h
  } catch {
    return "Personalizado"
  }
}

export async function GET() {
  const baseUrl =
    (await getSystemConfig("ai.base_url")) || process.env.AI_BASE_URL || "https://api.groq.com/openai/v1"
  const model =
    (await getSystemConfig("ai.chat_model")) || process.env.AI_CHAT_MODEL || "llama-3.3-70b-versatile"
  const apiKey =
    (await getSystemConfig("ai.api_key")) || process.env.AI_API_KEY || process.env.GROQ_API_KEY || ""
  const provider = detectarProvider(baseUrl)

  // Erros das últimas 24h (rate limit / falhas de auto-reply)
  let erros24h = 0
  try {
    const e = await query(
      `SELECT COUNT(*)::int AS n FROM ingestao_logs
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND (status ILIKE '%erro%' OR detalhes->>'motivo' ILIKE '%rate%' OR detalhes->>'motivo' ILIKE '%429%')`,
      [],
    )
    erros24h = e.rows[0]?.n ?? 0
  } catch { /* tabela ausente — ignora */ }

  if (!apiKey) {
    return NextResponse.json({ ok: false, status: "sem_chave", provider, model, erros_24h: erros24h })
  }

  let httpStatus = 0
  let headers: Headers | null = null
  let detalheErro: string | null = null
  try {
    const r = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
    })
    httpStatus = r.status
    headers = r.headers
    if (!r.ok) detalheErro = (await r.text()).slice(0, 200)
  } catch (e) {
    detalheErro = e instanceof Error ? e.message : String(e)
  }

  const g = (k: string) => headers?.get(k) ?? null
  const reqLimit = num(g("x-ratelimit-limit-requests"))
  const reqRem = num(g("x-ratelimit-remaining-requests"))
  const tokLimit = num(g("x-ratelimit-limit-tokens"))
  const tokRem = num(g("x-ratelimit-remaining-tokens"))

  const pct = (rem: number | null, lim: number | null) =>
    rem != null && lim != null && lim > 0 ? rem / lim : null
  const pcts = [pct(reqRem, reqLimit), pct(tokRem, tokLimit)].filter((x): x is number => x != null)
  const lowest = pcts.length ? Math.min(...pcts) : null

  let status: string
  if (httpStatus === 429) status = "critico"
  else if (httpStatus !== 200) status = "offline"
  else if (lowest != null) status = lowest < 0.1 ? "critico" : lowest < 0.25 ? "atencao" : "ok"
  else status = "ok"

  return NextResponse.json({
    ok: httpStatus === 200,
    provider,
    model,
    http_status: httpStatus,
    status,
    erros_24h: erros24h,
    retry_after: g("retry-after"),
    detalhe_erro: detalheErro,
    limites: {
      requisicoes: { limite: reqLimit, restante: reqRem, reset: g("x-ratelimit-reset-requests") },
      tokens: { limite: tokLimit, restante: tokRem, reset: g("x-ratelimit-reset-tokens") },
    },
    checked_at: new Date().toISOString(),
  })
}

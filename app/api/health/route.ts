import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

async function checkSupabase(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now()
  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("atendimentos")
      .select("id", { count: "exact", head: true })
    return { ok: !error, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, latencyMs: Date.now() - start }
  }
}

async function checkPgvectorRpc(): Promise<{ ok: boolean }> {
  try {
    const supabase = await createClient()
    // Vetor de zeros com 1536 dimensões — só para verificar se a função existe
    const zeroVector = `[${Array(1536).fill(0).join(",")}]`
    const { error } = await supabase.rpc("buscar_atendimentos_semanticos", {
      query_embedding: zeroVector,
      match_count: 1,
    })
    // Erro de dados é ok (sem resultados), erro de função não existe é crítico
    const funcaoAusente = error && String(error.message).includes("does not exist")
    return { ok: !funcaoAusente }
  } catch {
    return { ok: false }
  }
}

async function checkAIChat(): Promise<{ ok: boolean; latencyMs: number; provider: string; model: string }> {
  const start = Date.now()
  const apiKey = process.env.AI_API_KEY || process.env.GROK_API_KEY || ""
  const baseUrl = process.env.AI_BASE_URL || "https://api.x.ai/v1"
  const model = process.env.AI_CHAT_MODEL || "grok-2-latest"
  const provider = baseUrl.includes("groq") ? "groq" : baseUrl.includes("x.ai") ? "xai" : "custom"

  if (!apiKey) return { ok: false, latencyMs: 0, provider, model }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return { ok: res.ok, latencyMs: Date.now() - start, provider, model }
  } catch {
    return { ok: false, latencyMs: Date.now() - start, provider, model }
  }
}

async function checkEmbedding(): Promise<{ ok: boolean; latencyMs: number; provider: string; model: string }> {
  const start = Date.now()
  const key = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || ""
  const baseUrl = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
  const model = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
  const provider = baseUrl.includes("openai") ? "openai" : "custom"

  if (!key || key.startsWith("gsk_") || key.length <= 10) {
    return { ok: false, latencyMs: 0, provider, model }
  }

  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    })
    return { ok: res.ok, latencyMs: Date.now() - start, provider, model }
  } catch {
    return { ok: false, latencyMs: Date.now() - start, provider, model }
  }
}

async function getEmbeddingCoverage(): Promise<number | null> {
  try {
    const supabase = await createClient()
    const [{ count: totalProcessados }, { count: comEmbedding }] = await Promise.all([
      supabase.from("atendimentos").select("*", { count: "exact", head: true }).eq("processado", true),
      supabase.from("atendimentos").select("*", { count: "exact", head: true }).eq("processado", true).not("embedding", "is", null),
    ])
    if (!totalProcessados) return null
    return Math.round(((comEmbedding || 0) / totalProcessados) * 100) / 100
  } catch {
    return null
  }
}

export async function GET() {
  const [supabaseResult, aiChatResult, embeddingResult] = await Promise.all([
    checkSupabase(),
    checkAIChat(),
    checkEmbedding(),
  ])

  const [pgvectorResult, embeddingCoverage, integrationsData] = await Promise.all([
    supabaseResult.ok ? checkPgvectorRpc() : Promise.resolve({ ok: false }),
    supabaseResult.ok ? getEmbeddingCoverage() : Promise.resolve(null),
    supabaseResult.ok
      ? createClient().then((db) =>
          db.from("integrations").select("is_active").limit(500)
        ).then(({ data }) => ({
          configured: data?.length || 0,
          active: (data || []).filter((x) => x.is_active).length,
        })).catch(() => ({ configured: 0, active: 0 }))
      : Promise.resolve({ configured: 0, active: 0 }),
  ])

  const status =
    !supabaseResult.ok || !aiChatResult.ok
      ? "unhealthy"
      : !embeddingResult.ok
        ? "degraded"
        : "healthy"

  if (status !== "healthy") {
    logger.warn("health_check_nao_saudavel", { status, supabase: supabaseResult.ok, ai_chat: aiChatResult.ok, embedding: embeddingResult.ok })
  }

  return NextResponse.json({
    status,
    checks: {
      supabase: {
        ok: supabaseResult.ok,
        latency_ms: supabaseResult.latencyMs,
      },
      ai_chat: {
        ok: aiChatResult.ok,
        latency_ms: aiChatResult.latencyMs,
        provider: aiChatResult.provider,
        model: aiChatResult.model,
      },
      embedding: {
        ok: embeddingResult.ok,
        latency_ms: embeddingResult.latencyMs,
        provider: embeddingResult.provider,
        model: embeddingResult.model,
      },
      pgvector_rpc: {
        ok: pgvectorResult.ok,
      },
      embedding_coverage: {
        pct: embeddingCoverage,
        alerta: embeddingCoverage !== null && embeddingCoverage < 0.7,
      },
    },
    integrations: integrationsData,
    // Campos legados mantidos para não quebrar clientes existentes
    supabase: supabaseResult.ok,
    groq: aiChatResult.ok,
    embedding: embeddingResult.ok,
    timestamp: new Date().toISOString(),
  })
}

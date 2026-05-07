import { NextResponse } from "next/server"
import { query } from "@/lib/database/postgres-client-no-vector"
import { getIntegrationSummary } from "@/lib/integration-registry"
import { logger } from "@/lib/logger"
import { GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"

export const dynamic = "force-dynamic"

async function checkPostgres(): Promise<{ ok: boolean; latencyMs: number }> {
  const start = Date.now()
  try {
    await query("SELECT 1")
    return { ok: true, latencyMs: Date.now() - start }
  } catch {
    return { ok: false, latencyMs: Date.now() - start }
  }
}

async function checkPgvectorRpc(): Promise<{ ok: boolean }> {
  try {
    await query("SELECT 1 FROM information_schema.routines WHERE routine_name = 'buscar_atendimentos_semanticos' LIMIT 1")
    return { ok: true }
  } catch {
    return { ok: false }
  }
}

async function checkAIChat(): Promise<{ ok: boolean; latencyMs: number; provider: string; model: string }> {
  const start = Date.now()
  const apiKey =
    process.env.AI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GROK_API_KEY ||
    ""
  const baseUrl =
    process.env.AI_BASE_URL || "https://api.groq.com/openai/v1"
  const model =
    process.env.AI_CHAT_MODEL ||
    (baseUrl.includes("groq") ? GROQ_LLAMA4_SCOUT_INSTRUCT : "grok-2-latest")
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
    const result = await query(
      `SELECT
        COUNT(*) FILTER (WHERE processado = true)::int AS total_processados,
        COUNT(*) FILTER (WHERE processado = true AND embedding IS NOT NULL)::int AS com_embedding
       FROM atendimentos`
    )
    const totalProcessados = Number(result.rows[0]?.total_processados || 0)
    const comEmbedding = Number(result.rows[0]?.com_embedding || 0)
    if (!totalProcessados) return null
    return Math.round((comEmbedding / totalProcessados) * 100) / 100
  } catch {
    return null
  }
}

export async function GET() {
  const [postgresResult, aiChatResult, embeddingResult] = await Promise.all([
    checkPostgres(),
    checkAIChat(),
    checkEmbedding(),
  ])

  const [pgvectorResult, embeddingCoverage, integrations] = await Promise.all([
    postgresResult.ok ? checkPgvectorRpc() : Promise.resolve({ ok: false }),
    postgresResult.ok ? getEmbeddingCoverage() : Promise.resolve(null),
    postgresResult.ok
      ? getIntegrationSummary()
      : Promise.resolve({ configured: 0, active: 0 }),
  ])

  const status =
    !postgresResult.ok || !aiChatResult.ok
      ? "unhealthy"
      : !embeddingResult.ok
        ? "degraded"
        : "healthy"

  if (status !== "healthy") {
    logger.warn("health_check_nao_saudavel", { status, postgres: postgresResult.ok, ai_chat: aiChatResult.ok, embedding: embeddingResult.ok })
  }

  return NextResponse.json({
    status,
    checks: {
      postgres: {
        ok: postgresResult.ok,
        latency_ms: postgresResult.latencyMs,
      },
      supabase: {
        ok: postgresResult.ok,
        latency_ms: postgresResult.latencyMs,
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
    integrations,
    // Campos legados mantidos para não quebrar clientes existentes
    supabase: postgresResult.ok,
    groq: aiChatResult.ok,
    embedding: embeddingResult.ok,
    timestamp: new Date().toISOString(),
  })
}

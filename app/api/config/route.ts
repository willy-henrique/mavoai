import { NextResponse } from "next/server"
import { GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"
import { SUPPORTED_INTEGRATION_SOURCES } from "@/lib/integration-sources"

export const dynamic = "force-dynamic"

export async function GET() {
  const aiBaseUrl =
    process.env.AI_BASE_URL || "https://api.groq.com/openai/v1"
  const provider = aiBaseUrl.includes("groq")
    ? "groq"
    : aiBaseUrl.includes("x.ai")
      ? "xai"
      : aiBaseUrl.includes("openai")
        ? "openai"
        : "custom"

  const defaultChatModel =
    provider === "groq" ? GROQ_LLAMA4_SCOUT_INSTRUCT : "grok-2-latest"
  const hasAiKey = !!(
    process.env.AI_API_KEY ||
    process.env.GROQ_API_KEY ||
    process.env.GROK_API_KEY
  )
  const hasEmbeddingKey = !!(
    process.env.EMBEDDING_API_KEY ||
    process.env.OPENAI_API_KEY
  )
  const authRequired = process.env.INTEGRATION_AUTH_REQUIRED === "true"
  const hasIngestToken = !!process.env.CEREBRO_INGEST_TOKEN
  const hasInternalToken = !!process.env.CEREBRO_INTERNAL_TOKEN
  const willtalkWebhookUrl = process.env.WILLTALK_WEBHOOK_URL || ""
  const willtalkWebhookToken = process.env.WILLTALK_WEBHOOK_TOKEN || ""
  const willtalkReplyWebhookUrl = process.env.WILLTALK_REPLY_WEBHOOK_URL || ""
  const hasDatabaseUrl = !!process.env.DATABASE_URL
  const hasSupabaseUrl = !!process.env.NEXT_PUBLIC_SUPABASE_URL
  const hasSupabaseAnonKey = !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const hasSupabaseServiceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY

  // URLs de serviços externos (derivadas das variáveis de ambiente)
  const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || process.env.WILLTALK_WEBHOOK_URL || ""
  const n8nBaseUrl = n8nWebhookUrl ? (() => { try { const u = new URL(n8nWebhookUrl); return `${u.protocol}//${u.host}` } catch { return "" } })() : ""
  const willtalkReplyUrl = process.env.WILLTALK_REPLY_WEBHOOK_URL || ""
  const willtalkBaseUrl = willtalkReplyUrl ? (() => { try { const u = new URL(willtalkReplyUrl); return `${u.protocol}//${u.host}` } catch { return "" } })() : ""
  const cerebroBaseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
  const cerebroIngestToken = process.env.CEREBRO_INGEST_TOKEN ? "configurado" : "ausente"
  const hasN8nToken = !!process.env.N8N_WEBHOOK_TOKEN

  const blockers: string[] = []
  const warnings: string[] = []

  if (!hasDatabaseUrl) blockers.push("DATABASE_URL nao configurada")
  if (!hasAiKey) blockers.push("AI_API_KEY ou GROQ_API_KEY nao configurada")
  if (!authRequired) blockers.push("INTEGRATION_AUTH_REQUIRED deve ficar true no piloto")
  if (!hasIngestToken) blockers.push("CEREBRO_INGEST_TOKEN nao configurado")
  if (!willtalkWebhookUrl) blockers.push("WILLTALK_WEBHOOK_URL nao configurada")
  if (!willtalkWebhookToken) blockers.push("WILLTALK_WEBHOOK_TOKEN nao configurado")
  if (!willtalkReplyWebhookUrl) blockers.push("WILLTALK_REPLY_WEBHOOK_URL nao configurada")
  if (!hasInternalToken) warnings.push("CEREBRO_INTERNAL_TOKEN ausente; processamento interno fica sem protecao dedicada")
  if (!hasEmbeddingKey) warnings.push("Embeddings OpenAI nao configurados; busca cai para fallback textual")
  if (!hasSupabaseUrl || !hasSupabaseAnonKey || !hasSupabaseServiceKey) {
    warnings.push("Credenciais Supabase incompletas; rotas legadas de categorias/setup podem falhar")
  }

  return NextResponse.json({
    ai: {
      baseUrl: aiBaseUrl,
      model: process.env.AI_CHAT_MODEL || defaultChatModel,
      provider,
      hasApiKey: hasAiKey,
    },
    embedding: {
      baseUrl: process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1",
      model: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
      hasApiKey: hasEmbeddingKey,
    },
    willtalk: {
      webhookUrl: willtalkWebhookUrl,
      autoReplyEnabled: process.env.WILLTALK_AUTO_REPLY_ENABLED === "true",
      replyWebhookUrl: willtalkReplyWebhookUrl,
      maxChars: Number(process.env.WILLTALK_WEBHOOK_MAX_CHARS || 12000),
      attempts: Number(process.env.WILLTALK_WEBHOOK_ATTEMPTS || 3),
      timeoutMs: Number(process.env.WILLTALK_WEBHOOK_TIMEOUT_MS || 8000),
      events: (process.env.WILLTALK_WEBHOOK_EVENTS || "").split(",").filter(Boolean),
    },
    integrations: {
      canonicalPath: "/api/ingestao/v1/events",
      adapters: SUPPORTED_INTEGRATION_SOURCES,
    },
    security: {
      authRequired,
      hasIngestToken,
      hasInternalToken,
      rateLimitPerMin: Number(process.env.INTEGRATION_RATE_LIMIT_PER_MIN || 120),
    },
    database: {
      hasDatabaseUrl,
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      hasAnonKey: hasSupabaseAnonKey,
      hasServiceKey: hasSupabaseServiceKey,
    },
    upstash: {
      configured: !!(
        process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ),
    },
    readiness: {
      readyForPilot: blockers.length === 0,
      blockers,
      warnings,
    },
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "",
    services: {
      n8n: { baseUrl: n8nBaseUrl, webhookUrl: n8nWebhookUrl, hasToken: hasN8nToken },
      willtalk: { baseUrl: willtalkBaseUrl },
      cerebro: { baseUrl: cerebroBaseUrl, ingestToken: cerebroIngestToken },
    },
  })
}

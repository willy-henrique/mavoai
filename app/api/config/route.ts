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

  return NextResponse.json({
    ai: {
      baseUrl: aiBaseUrl,
      model: process.env.AI_CHAT_MODEL || defaultChatModel,
      provider,
      hasApiKey: !!(
        process.env.AI_API_KEY ||
        process.env.GROQ_API_KEY ||
        process.env.GROK_API_KEY
      ),
    },
    embedding: {
      baseUrl: process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1",
      model: process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small",
      hasApiKey: !!(process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY),
    },
    willtalk: {
      webhookUrl: process.env.WILLTALK_WEBHOOK_URL || "",
      autoReplyEnabled: process.env.WILLTALK_AUTO_REPLY_ENABLED === "true",
      replyWebhookUrl: process.env.WILLTALK_REPLY_WEBHOOK_URL || "",
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
      authRequired: process.env.INTEGRATION_AUTH_REQUIRED === "true",
      hasIngestToken: !!process.env.CEREBRO_INGEST_TOKEN,
      hasInternalToken: !!process.env.CEREBRO_INTERNAL_TOKEN,
      rateLimitPerMin: Number(process.env.INTEGRATION_RATE_LIMIT_PER_MIN || 120),
    },
    supabase: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      hasAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    upstash: {
      configured: !!(
        process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
      ),
    },
    baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "",
  })
}

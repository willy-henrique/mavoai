/**
 * GET/POST /api/config/models
 *
 * Leitura e escrita da configuração de modelos de IA.
 * Protegido por CEREBRO_INTERNAL_TOKEN.
 *
 * GET  → retorna config atual (chaves mascaradas) + valores ativos (DB ou env)
 * POST → salva novos valores no DB (valores em branco são ignorados)
 */

import { NextResponse } from "next/server"
import {
  getAllSystemConfigRaw,
  saveModelConfig,
  maskKey,
  type ModelConfig,
} from "@/lib/system-config-store"

export const dynamic = "force-dynamic"

const DEFAULT_CHAT_BASE_URL  = "https://api.groq.com/openai/v1"
const DEFAULT_CHAT_MODEL     = "meta-llama/llama-4-scout-17b-16e-instruct"
const DEFAULT_CURATOR_MODEL  = "meta-llama/llama-4-maverick-17b-128e-instruct"
const DEFAULT_FAST_MODEL     = "llama-3.1-8b-instant"
const DEFAULT_EMBED_BASE_URL = "https://api.jina.ai/v1"
const DEFAULT_EMBED_MODEL    = "jina-embeddings-v5-text-small"
const DEFAULT_EMBED_DIMS     = "1024"

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAdmin(request: Request): boolean {
  const auth     = request.headers.get("Authorization") || ""
  const expected = process.env.CEREBRO_INTERNAL_TOKEN || ""
  return !!expected && auth === `Bearer ${expected}`
}

// ─── GET ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const raw = await getAllSystemConfigRaw()

  // Resolve valor efetivo: DB > env var > default hardcoded
  const effective = {
    ai_base_url        : raw["ai.base_url"]         || process.env.AI_BASE_URL         || DEFAULT_CHAT_BASE_URL,
    ai_chat_model      : raw["ai.chat_model"]        || process.env.AI_CHAT_MODEL        || DEFAULT_CHAT_MODEL,
    ai_curator_model   : raw["ai.curator_model"]     || process.env.AI_CURATOR_MODEL     || DEFAULT_CURATOR_MODEL,
    ai_fast_model      : raw["ai.fast_model"]         || process.env.AI_FAST_MODEL        || DEFAULT_FAST_MODEL,
    ai_api_key_set     : !!(raw["ai.api_key"]        || process.env.AI_API_KEY           || process.env.GROQ_API_KEY),
    ai_api_key_masked  : maskKey(raw["ai.api_key"]   || process.env.AI_API_KEY           || process.env.GROQ_API_KEY || ""),
    ai_api_key_source  : raw["ai.api_key"] ? "db" : (process.env.AI_API_KEY || process.env.GROQ_API_KEY) ? "env" : "none",

    embedding_base_url : raw["embedding.base_url"]   || process.env.EMBEDDING_BASE_URL   || DEFAULT_EMBED_BASE_URL,
    embedding_model    : raw["embedding.model"]       || process.env.AI_EMBEDDING_MODEL   || DEFAULT_EMBED_MODEL,
    embedding_dimensions: raw["embedding.dimensions"] || process.env.AI_EMBEDDING_DIMENSIONS || DEFAULT_EMBED_DIMS,
    embedding_api_key_set    : !!(raw["embedding.api_key"]  || process.env.EMBEDDING_API_KEY),
    embedding_api_key_masked : maskKey(raw["embedding.api_key"] || process.env.EMBEDDING_API_KEY || ""),
    embedding_api_key_source : raw["embedding.api_key"] ? "db" : process.env.EMBEDDING_API_KEY ? "env" : "none",
  }

  return NextResponse.json({ effective, raw_keys: Object.keys(raw) })
}

// ─── POST ─────────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!isAdmin(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: ModelConfig
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  try {
    await saveModelConfig(body)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("config/models POST error:", msg)
    return NextResponse.json({ error: "internal_error", detail: msg }, { status: 500 })
  }
}

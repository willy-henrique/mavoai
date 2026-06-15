/**
 * GET/POST /api/admin/ai-fallbacks
 *
 * Configura a cadeia de modelos de RESERVA (fallback) usada quando o modelo
 * principal estoura o limite. Protegido pelo middleware.
 *
 * GET  → { fallbacks:[{provider,model}], chaves:{provider:bool}, providers:[...] }
 * POST → { fallbacks:[{provider,model}] }  (salva em system_config "ai.fallbacks")
 */
import { NextResponse } from "next/server"
import { getSystemConfig, setSystemConfig } from "@/lib/system-config-store"
import { getSecret } from "@/lib/secret-store"
import { PROVIDER_PRESETS, DEFAULT_FALLBACKS, type FallbackEntry } from "@/lib/provider-presets"

export const dynamic = "force-dynamic"

async function temChave(providerId: string): Promise<boolean> {
  const preset = PROVIDER_PRESETS.find((p) => p.id === providerId)
  if (!preset) return false
  if (await getSecret(preset.env_key)) return true
  if (providerId === "groq" && (process.env.AI_API_KEY || process.env.GROQ_API_KEY)) return true
  return false
}

export async function GET() {
  let fallbacks: FallbackEntry[] = []
  const raw = await getSystemConfig("ai.fallbacks")
  if (raw) { try { const p = JSON.parse(raw); if (Array.isArray(p)) fallbacks = p } catch { /* ignore */ } }
  const usandoPadrao = fallbacks.length === 0
  if (usandoPadrao) fallbacks = DEFAULT_FALLBACKS

  const chaves: Record<string, boolean> = {}
  for (const p of PROVIDER_PRESETS) chaves[p.id] = await temChave(p.id)

  const providers = PROVIDER_PRESETS.map((p) => ({
    id: p.id,
    label: p.label,
    models: p.models.map((m) => ({ id: m.id, label: m.label })),
  }))

  return NextResponse.json({ fallbacks, usando_padrao: usandoPadrao, chaves, providers })
}

export async function POST(request: Request) {
  let body: { fallbacks?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const idsValidos = new Set(PROVIDER_PRESETS.map((p) => p.id))
  const limpo: FallbackEntry[] = Array.isArray(body.fallbacks)
    ? body.fallbacks
        .filter((e): e is FallbackEntry =>
          !!e && typeof e === "object" &&
          idsValidos.has((e as FallbackEntry).provider) &&
          typeof (e as FallbackEntry).model === "string" &&
          (e as FallbackEntry).model.trim().length > 0,
        )
        .map((e) => ({ provider: e.provider, model: e.model.trim() }))
        .slice(0, 8)
    : []

  try {
    await setSystemConfig("ai.fallbacks", JSON.stringify(limpo))
    return NextResponse.json({ ok: true, salvos: limpo.length })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "internal_error", detail: msg }, { status: 500 })
  }
}

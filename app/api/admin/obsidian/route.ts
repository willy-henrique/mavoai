/**
 * GET/POST /api/admin/obsidian — configuração da integração Obsidian.
 * Protegido pelo middleware (sessão admin).
 *
 * GET  → { api_url, token_set, token_masked, category }
 * POST → salva { api_url, token, category } em system_config (token via secret.*)
 */
import { NextResponse } from "next/server"
import { getSystemConfig, setSystemConfig, maskKey } from "@/lib/system-config-store"
import { getSecret } from "@/lib/secret-store"

export const dynamic = "force-dynamic"

export async function GET() {
  const apiUrl = (await getSystemConfig("obsidian.api_url")) || process.env.OBSIDIAN_API_URL || ""
  const token = await getSecret("OBSIDIAN_API_TOKEN")
  const category = (await getSystemConfig("obsidian.category")) || "Obsidian"
  return NextResponse.json({
    api_url: apiUrl,
    token_set: !!token,
    token_masked: token ? maskKey(token) : "",
    category,
  })
}

export async function POST(request: Request) {
  let body: { api_url?: string; token?: string; category?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  try {
    if (typeof body.api_url === "string" && body.api_url.trim()) {
      await setSystemConfig("obsidian.api_url", body.api_url.trim().replace(/\/$/, ""))
    }
    if (typeof body.category === "string" && body.category.trim()) {
      await setSystemConfig("obsidian.category", body.category.trim())
    }
    // Token só é salvo se vier preenchido e não for a máscara.
    if (typeof body.token === "string" && body.token.trim() && !body.token.startsWith("••••")) {
      const clean = body.token.trim().replace(/^Bearer\s+/i, "")
      await setSystemConfig("secret.OBSIDIAN_API_TOKEN", clean)
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "internal_error", detail: msg }, { status: 500 })
  }
}

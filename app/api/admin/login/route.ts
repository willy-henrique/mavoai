/**
 * POST /api/admin/login   { password }
 *
 * Confere a senha contra ADMIN_PASSWORD e, se bater, grava o cookie de sessão.
 * Liberado no middleware (precisa ser acessível sem sessão).
 */
import { NextResponse } from "next/server"
import {
  ADMIN_COOKIE,
  adminPasswordConfigured,
  checkPassword,
  createSessionToken,
  sessionCookieOptions,
} from "@/lib/admin-auth"

export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  if (!adminPasswordConfigured()) {
    return NextResponse.json(
      { error: "admin_password_nao_configurada", detail: "Defina ADMIN_PASSWORD no ambiente." },
      { status: 503 },
    )
  }

  let password = ""
  try {
    const body = await request.json()
    password = String(body?.password ?? "")
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  if (!checkPassword(password)) {
    return NextResponse.json({ error: "senha_invalida" }, { status: 401 })
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(ADMIN_COOKIE, await createSessionToken(), sessionCookieOptions())
  return res
}

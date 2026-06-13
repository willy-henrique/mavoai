import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ADMIN_COOKIE, verifySessionToken } from "@/lib/admin-auth"

/**
 * Protege o PAINEL ADMIN com login (senha única).
 *
 * O matcher abaixo garante que o middleware roda APENAS em:
 *   - "/"                  → a página do painel
 *   - "/api/config/*"      → configuração de modelos/IA (sensível)
 *   - "/api/admin/*"       → endpoints administrativos (tokens, etc.)
 *
 * Os webhooks de integração (/api/ingestao/*, /api/orquestrador/*, /api/v1/*,
 * /api/mtalk/*) NÃO são tocados — eles têm autenticação própria por token e
 * precisam continuar acessíveis para sistemas externos.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Login/logout sempre liberados (senão não há como autenticar).
  if (pathname.startsWith("/api/admin/login") || pathname.startsWith("/api/admin/logout")) {
    return NextResponse.next()
  }

  const ok = await verifySessionToken(req.cookies.get(ADMIN_COOKIE)?.value)

  // APIs sensíveis → 401 em JSON quando não autenticado.
  if (pathname.startsWith("/api/config") || pathname.startsWith("/api/admin")) {
    if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    return NextResponse.next()
  }

  // Página do painel → redireciona para /login quando não autenticado.
  if (!ok) {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ["/", "/api/config/:path*", "/api/admin/:path*"],
}

import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { ADMIN_COOKIE, getSession, safeEqual } from "@/lib/admin-auth"

/**
 * Protege o painel com login por senha + PAPEL (role).
 *
 * Áreas:
 *   - "/" e /api/{config,admin,knowledge}  → SÓ papel "admin"
 *   - "/manager/*" e /api/manager/*        → papel "admin" OU "gerente" (curadoria)
 *
 * Os webhooks de integração (/api/ingestao/*, /api/orquestrador/*, /api/v1/*,
 * /api/mtalk/*) NÃO são tocados — têm autenticação própria por token.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Login/logout sempre liberados (senão não há como autenticar).
  if (pathname.startsWith("/api/admin/login") || pathname.startsWith("/api/admin/logout")) {
    return NextResponse.next()
  }

  const session = await getSession(req.cookies.get(ADMIN_COOKIE)?.value)
  const isAdmin = session?.role === "admin"
  const authed = !!session

  const internalOk = () => {
    const auth = req.headers.get("authorization") || ""
    const internal = process.env.CEREBRO_INTERNAL_TOKEN || ""
    return !!internal && safeEqual(auth, `Bearer ${internal}`)
  }

  const redirectLogin = () => {
    const url = req.nextUrl.clone()
    url.pathname = "/login"
    url.search = ""
    return NextResponse.redirect(url)
  }

  // ── APIs do módulo de curadoria → admin OU gerente (ou token interno) ──
  if (pathname.startsWith("/api/manager")) {
    if (authed || internalOk()) return NextResponse.next()
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // ── APIs sensíveis do admin → SÓ admin (ou token interno hop servidor→servidor) ──
  if (
    pathname.startsWith("/api/config") ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/knowledge")
  ) {
    if (isAdmin || internalOk()) return NextResponse.next()
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // ── Página do módulo de curadoria → admin ou gerente ──
  if (pathname.startsWith("/manager")) {
    if (authed) return NextResponse.next()
    return redirectLogin()
  }

  // ── Página do painel admin "/" → só admin; gerente é mandado ao módulo dele ──
  if (!authed) return redirectLogin()
  if (!isAdmin) {
    const url = req.nextUrl.clone()
    url.pathname = "/manager/ai-curation"
    url.search = ""
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

export const config = {
  matcher: [
    "/",
    "/manager/:path*",
    "/api/config/:path*",
    "/api/admin/:path*",
    "/api/knowledge/:path*",
    "/api/manager/:path*",
  ],
}

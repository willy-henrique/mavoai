/**
 * lib/admin-auth.ts
 *
 * Autenticação do PAINEL ADMIN por senha única.
 *
 * - Login: o usuário envia a senha; comparamos com ADMIN_PASSWORD.
 * - Sessão: cookie httpOnly assinado por HMAC-SHA256 (Web Crypto) com expiração.
 *   Usa Web Crypto (globalThis.crypto.subtle), que funciona TANTO no Node
 *   (route handlers) QUANTO no Edge runtime (middleware) — por isso não usamos
 *   o módulo "crypto" do Node nem Buffer aqui.
 *
 * Secrets envolvidos:
 *   ADMIN_PASSWORD        — a senha de admin (obrigatória; sem ela, ninguém entra)
 *   ADMIN_SESSION_SECRET  — chave p/ assinar o cookie (fallback: CEREBRO_INTERNAL_TOKEN)
 */

export const ADMIN_COOKIE = "mavo_admin"
/** Sessão válida por 7 dias. */
const TTL_MS = 1000 * 60 * 60 * 24 * 7

function sessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.CEREBRO_INTERNAL_TOKEN ||
    "mavo-admin-dev-secret-troque-isto"
  )
}

const enc = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  let out = ""
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0")
  return out
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload))
  return toHex(sig)
}

/** Comparação de tempo (quase) constante para evitar timing attacks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** true se houver uma senha de admin configurada (sem ela o painel fica trancado). */
export function adminPasswordConfigured(): boolean {
  return !!(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length > 0)
}

/** Confere a senha enviada no login. */
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || ""
  if (!expected) return false
  return safeEqual(input, expected)
}

/** Cria o valor do cookie de sessão (`<exp>.<hmac>`). */
export async function createSessionToken(): Promise<string> {
  const exp = String(Date.now() + TTL_MS)
  const sig = await sign(exp)
  return `${exp}.${sig}`
}

/** Valida o cookie de sessão: assinatura correta + não expirado. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const dot = token.indexOf(".")
  if (dot <= 0) return false
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(payload)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = await sign(payload)
  return safeEqual(sig, expected)
}

/** Opções padrão do cookie de sessão. */
export function sessionCookieOptions(maxAgeSec = TTL_MS / 1000) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSec,
  }
}

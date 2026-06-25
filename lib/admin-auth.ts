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
 *   MANAGER_PASSWORD      — senha do Gerente de Curadoria (opcional; acessa só /manager/*)
 *   ADMIN_SESSION_SECRET  — chave p/ assinar o cookie (fallback: CEREBRO_INTERNAL_TOKEN)
 *
 * Papéis (role no cookie): "admin" acessa tudo; "gerente" acessa só o módulo de
 * curadoria (/manager/*). O cookie é `<exp>:<role>.<hmac>`; cookies legados no
 * formato `<exp>.<hmac>` continuam válidos e são tratados como "admin".
 */

export type Role = "admin" | "gerente"

export const ADMIN_COOKIE = "mavo_admin"
/** Sessão válida por 7 dias. */
const TTL_MS = 1000 * 60 * 60 * 24 * 7

function sessionSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET || process.env.CEREBRO_INTERNAL_TOKEN
  if (!s) {
    throw new Error(
      "ADMIN_SESSION_SECRET (ou CEREBRO_INTERNAL_TOKEN) não configurado. " +
      "Defina a variável de ambiente antes de iniciar o servidor.",
    )
  }
  return s
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

/** Comparação de tempo constante para evitar timing attacks — exportada para outros módulos. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** true se houver uma senha de admin configurada (sem ela o painel fica trancado). */
export function adminPasswordConfigured(): boolean {
  return !!(process.env.ADMIN_PASSWORD && process.env.ADMIN_PASSWORD.length > 0)
}

/** Confere a senha enviada no login (compat — só admin). */
export function checkPassword(input: string): boolean {
  const expected = process.env.ADMIN_PASSWORD || ""
  if (!expected) return false
  return safeEqual(input, expected)
}

/** true se houver uma senha de gerente de curadoria configurada. */
export function managerPasswordConfigured(): boolean {
  return !!(process.env.MANAGER_PASSWORD && process.env.MANAGER_PASSWORD.length > 0)
}

/**
 * Autentica a senha e retorna o papel correspondente, ou null se não bater.
 * Admin tem precedência (se as duas senhas forem iguais, vira admin).
 */
export function authenticate(input: string): Role | null {
  const admin = process.env.ADMIN_PASSWORD || ""
  const manager = process.env.MANAGER_PASSWORD || ""
  if (admin && safeEqual(input, admin)) return "admin"
  if (manager && safeEqual(input, manager)) return "gerente"
  return null
}

/** Cria o valor do cookie de sessão (`<exp>:<role>.<hmac>`). */
export async function createSessionToken(role: Role = "admin"): Promise<string> {
  const payload = `${Date.now() + TTL_MS}:${role}`
  const sig = await sign(payload)
  return `${payload}.${sig}`
}

/**
 * Valida o cookie e retorna a sessão (papel), ou null se inválido/expirado.
 * Usa o ÚLTIMO ponto como separador (o hmac é hex, sem ponto). Cookies legados
 * no formato `<exp>.<hmac>` continuam válidos e são tratados como "admin".
 */
export async function getSession(token: string | undefined | null): Promise<{ role: Role } | null> {
  if (!token) return null
  const dot = token.lastIndexOf(".")
  if (dot <= 0) return null
  const payload = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const expected = await sign(payload)
  if (!safeEqual(sig, expected)) return null
  const sep = payload.indexOf(":")
  const expStr = sep === -1 ? payload : payload.slice(0, sep)
  const roleStr = sep === -1 ? "admin" : payload.slice(sep + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return null
  return { role: roleStr === "gerente" ? "gerente" : "admin" }
}

/** Valida o cookie de sessão: assinatura correta + não expirado (qualquer papel). */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  return (await getSession(token)) !== null
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

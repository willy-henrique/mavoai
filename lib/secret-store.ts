/**
 * lib/secret-store.ts
 *
 * Cofre de segredos gerenciáveis pelo painel admin.
 *
 * Cada segredo é resolvido com a ordem de precedência:
 *   1. system_config no banco (chave `secret.<NOME>`)  ← editável pelo painel
 *   2. variável de ambiente process.env[<NOME>]         ← fallback
 *
 * Assim, editar um token no painel passa a ter EFEITO imediato (cache de 30s do
 * system-config-store), sem precisar de redeploy. Se o banco estiver fora, cai
 * para o env automaticamente.
 *
 * IMPORTANTE: os consumidores destes tokens devem usar getSecret() em vez de
 * ler process.env diretamente, senão a edição no painel não surte efeito.
 */

import { getSystemConfig } from "@/lib/system-config-store"

/**
 * Segredos que o painel pode visualizar/editar.
 *
 * Obs.: a chave do Groq (chat) e a do Jina (embeddings) NÃO entram aqui — elas
 * são gerenciadas em Configurações → Modelos (chaves `ai.api_key`/`embedding.api_key`),
 * que é onde os consumidores efetivamente as leem. Colocá-las aqui criaria duas
 * fontes de verdade para o mesmo segredo.
 */
export const MANAGED_SECRETS = {
  OPENROUTER_API_KEY:   { label: "OpenRouter",              group: "ia",         placeholder: "sk-or-..." },
  GOOGLE_API_KEY:       { label: "Google Gemini",           group: "ia",         placeholder: "AIza..." },
  CEREBRO_INGEST_TOKEN: { label: "Token de ingestão (webhooks)", group: "seguranca", placeholder: "token..." },
  MTALK_BASE_URL:       { label: "MTalk — Base URL",        group: "mtalk",      placeholder: "https://s11.mtalk.com.br" },
  MTALK_API_TOKEN:      { label: "MTalk — Token",           group: "mtalk",      placeholder: "token..." },
  WILLTALK_API_URL:     { label: "WillTalk — API URL",      group: "willtalk",   placeholder: "https://..." },
  WILLTALK_API_TOKEN:   { label: "WillTalk — Token",        group: "willtalk",   placeholder: "token..." },
} as const

export type ManagedSecretName = keyof typeof MANAGED_SECRETS

/** Indica se um nome é um segredo gerenciável conhecido. */
export function isManagedSecret(name: string): name is ManagedSecretName {
  return Object.prototype.hasOwnProperty.call(MANAGED_SECRETS, name)
}

/**
 * Resolve um segredo: banco (secret.<NOME>) → env var → "".
 * Use SEMPRE isto no lugar de process.env para tokens gerenciáveis.
 */
export async function getSecret(name: string): Promise<string> {
  const dbVal = await getSystemConfig(`secret.${name}`)
  if (dbVal && dbVal.trim()) return dbVal.trim()
  return process.env[name] || ""
}

/** Origem efetiva de um segredo. */
export async function secretSource(name: string): Promise<"db" | "env" | "none"> {
  const dbVal = await getSystemConfig(`secret.${name}`)
  if (dbVal && dbVal.trim()) return "db"
  if (process.env[name]) return "env"
  return "none"
}

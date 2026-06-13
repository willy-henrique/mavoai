/**
 * scripts/atualizar-modelo-ia.mjs
 *
 * Ajusta o modelo de chat da IA direto no banco (tabela system_config).
 *
 * Por que existe: o system_config do banco tem PRECEDÊNCIA sobre as env vars
 * (ver lib/ai-provider.ts → getChatConfig). Então, se em produção a chave
 * `ai.chat_model` estiver salva com um modelo fraco (ex: llama-4-scout-17b),
 * trocar o .env NÃO surte efeito. Este script alinha o banco.
 *
 * Uso:
 *   node scripts/atualizar-modelo-ia.mjs                       # aplica o padrão forte
 *   node scripts/atualizar-modelo-ia.mjs llama-3.3-70b-versatile
 *   node scripts/atualizar-modelo-ia.mjs openai/gpt-oss-120b   # máxima qualidade (mais lento)
 *   node scripts/atualizar-modelo-ia.mjs --mostrar             # só mostra o que está salvo
 *
 * Requer DATABASE_URL no .env.local (ou no ambiente).
 */

import { readFileSync, existsSync } from "fs"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Carrega .env.local manualmente (sem depender de dotenv)
const envPath = path.join(__dirname, "..", ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key && !process.env[key]) process.env[key] = val
  }
}

const DATABASE_URL =
  process.env.DATABASE_URL || "postgresql://postgres:1@localhost:6001/mavoai"

const DEFAULT_MODEL = "llama-3.3-70b-versatile"
const arg = process.argv[2]
const apenasMostrar = arg === "--mostrar" || arg === "--show"
const novoModelo = !arg || apenasMostrar ? DEFAULT_MODEL : arg.trim()

let pg
try {
  pg = require("pg")
} catch {
  console.error("❌ Módulo 'pg' não encontrado. Execute: npm install")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 10_000 })

async function run() {
  console.log("🔌 Conectando em:", DATABASE_URL.replace(/:([^:@]+)@/, ":***@"))
  const client = await pool.connect()
  try {
    const atual = await client.query(
      "SELECT key, value FROM public.system_config WHERE key LIKE 'ai.%' ORDER BY key",
    )
    console.log("\n📋 system_config (antes):")
    if (atual.rows.length === 0) {
      console.log("   (vazio — a IA está usando as env vars como fallback)")
    } else {
      for (const r of atual.rows) {
        const v = r.key.endsWith(".api_key") ? `${String(r.value).slice(0, 6)}…` : r.value
        console.log(`   ${r.key} = ${v}`)
      }
    }

    if (apenasMostrar) {
      console.log("\nℹ️  Modo --mostrar: nada foi alterado.")
      return
    }

    await client.query(
      `INSERT INTO public.system_config (key, value, updated_at)
       VALUES ('ai.chat_model', $1, NOW())
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [novoModelo],
    )

    console.log(`\n✅ ai.chat_model atualizado para: ${novoModelo}`)
    console.log("   (cache do app expira em ~30s; sem necessidade de restart)")
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((e) => {
  console.error("\n❌ Erro:", e.message)
  console.error("   Verifique se o banco está no ar e o DATABASE_URL está correto.")
  process.exit(1)
})

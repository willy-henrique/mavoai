/**
 * scripts/migrate.mjs
 *
 * Executa o setup completo do banco de dados automaticamente.
 * Conecta no PostgreSQL e roda o script 000_SETUP_COMPLETO.sql.
 *
 * Uso:
 *   node scripts/migrate.mjs
 *
 * Requer: DATABASE_URL no .env.local ou variável de ambiente.
 */

import { readFileSync, existsSync } from "fs"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

// Carregar .env.local manualmente (sem dotenv instalado globalmente)
const envPath = path.join(__dirname, "..", ".env.local")
if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eqIdx = trimmed.indexOf("=")
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "")
    if (key && !process.env[key]) process.env[key] = val
  }
  console.log("✅ .env.local carregado")
} else {
  console.warn("⚠️  .env.local não encontrado — usando variáveis de ambiente do sistema")
}

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:1@localhost:5434/mavoai"

console.log("🔌 Conectando em:", DATABASE_URL.replace(/:([^:@]+)@/, ":***@"))

let pg
try {
  pg = require("pg")
} catch {
  console.error("❌ Módulo 'pg' não encontrado. Execute: npm install")
  process.exit(1)
}

const { Pool } = pg

const pool = new Pool({
  connectionString: DATABASE_URL,
  connectionTimeoutMillis: 10_000,
})

async function run() {
  const client = await pool.connect()

  try {
    console.log("\n📋 Executando SETUP COMPLETO do banco Mavo.AI...\n")

    // Verifica se pgvector está disponível
    try {
      await client.query("CREATE EXTENSION IF NOT EXISTS vector")
      console.log("✅ Extensão pgvector: ativa")
    } catch (e) {
      console.error("❌ pgvector não disponível:", e.message)
      console.error("   Use a imagem Docker: pgvector/pgvector:pg16")
      console.error("   Ou instale: https://github.com/pgvector/pgvector")
      process.exit(1)
    }

    // Ler o SQL master
    const sqlPath = path.join(__dirname, "000_SETUP_COMPLETO.sql")
    if (!existsSync(sqlPath)) {
      console.error("❌ Arquivo não encontrado:", sqlPath)
      process.exit(1)
    }

    const sql = readFileSync(sqlPath, "utf-8")

    // Executar tudo em uma transação
    await client.query("BEGIN")
    try {
      await client.query(sql)
      await client.query("COMMIT")
      console.log("✅ Todas as tabelas e funções criadas com sucesso!")
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    }

    // Verificação final
    const tabelas = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    )
    const orgs = await client.query("SELECT id, display_name FROM public.organizations")
    const categorias = await client.query("SELECT COUNT(*) AS total FROM public.categorias")

    console.log("\n📊 Status do banco:")
    console.log(`   Tabelas criadas: ${tabelas.rows.map(r => r.table_name).join(", ")}`)
    console.log(`   Organizations: ${orgs.rows.map(r => `${r.id} (${r.display_name})`).join(", ")}`)
    console.log(`   Categorias: ${categorias.rows[0].total}`)

    // Verifica se pgvector está indexando
    const vecCheck = await client.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'atendimentos' AND indexdef LIKE '%hnsw%'
    `)
    if (vecCheck.rows.length > 0) {
      console.log("   Índice vetorial HNSW: ✅ ativo")
    } else {
      console.log("   Índice vetorial HNSW: ⚠️  não encontrado")
    }

    console.log("\n✅ Setup concluído! O banco está pronto.\n")
    console.log("🚀 Próximo passo: npm run dev")

  } catch (e) {
    console.error("\n❌ Erro durante o setup:", e.message)
    if (e.message.includes("connect")) {
      console.error("\n   Banco não encontrado. Verifique:")
      console.error("   1. Docker está rodando? → docker compose up -d")
      console.error("   2. DATABASE_URL está correto no .env.local?")
      console.error(`   3. URL atual: ${DATABASE_URL.replace(/:([^:@]+)@/, ":***@")}`)
    }
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

run()

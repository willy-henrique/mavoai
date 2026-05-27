/**
 * migrate-to-docker.mjs
 *
 * Migra os dados do PostgreSQL local (sem pgvector) para o Docker (com pgvector).
 *
 * Uso:
 *   node scripts/migrate-to-docker.mjs
 *
 * Pré-requisitos:
 *   1. Docker Desktop rodando
 *   2. docker-compose up -d (container mavoai-postgres ativo)
 *   3. DATABASE_URL no .env.local apontando para o local (porta 5433)
 *   DOCKER_DB_URL no .env.local OU variável de ambiente apontando para o Docker
 *   Por padrão usa: postgresql://postgres:1@localhost:5433/mavoai (mesmo host)
 *
 * O script:
 *   1. Lê todos os registros de atendimentos do banco local
 *   2. Ativa pgvector no banco destino
 *   3. Recria a coluna embedding como vector(1536)
 *   4. Cria a função buscar_atendimentos_semanticos
 *   5. Insere os registros no banco destino (ON CONFLICT DO NOTHING)
 */

import fs from "fs"
import path from "path"
import { createRequire } from "module"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local")
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
    if (k && !process.env[k]) process.env[k] = v
  }
}
loadEnv()

const bold = (s) => `\x1b[1m${s}\x1b[0m`
const green = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const red = (s) => `\x1b[31m${s}\x1b[0m`
const dim = (s) => `\x1b[2m${s}\x1b[0m`

const SOURCE_URL = process.env.DATABASE_URL || "postgresql://postgres:1@localhost:5433/mavoai"
// Docker sobe na mesma porta 5433 mapeada para o container — use porta diferente se precisar separar
const DEST_URL = process.env.DOCKER_DB_URL || process.env.DATABASE_URL || "postgresql://postgres:1@localhost:5433/mavoai"

if (SOURCE_URL === DEST_URL) {
  console.log(yellow("\n⚠  SOURCE_URL e DEST_URL são iguais."))
  console.log(dim("   Se o Docker já subiu e tomou o lugar do postgres local, isso é normal."))
  console.log(dim("   Se ainda está rodando o postgres local na mesma porta, defina DOCKER_DB_URL diferente.\n"))
}

async function main() {
  console.log(bold("\n🔄 Migração de dados → Docker (pgvector)"))
  console.log(dim("─".repeat(55)))

  const { default: pg } = await import("pg")

  const src = new pg.Client({ connectionString: SOURCE_URL })
  const dst = new pg.Client({ connectionString: DEST_URL })

  console.log(dim(`Fonte: ${SOURCE_URL}`))
  console.log(dim(`Destino: ${DEST_URL}`))

  try {
    await src.connect()
    console.log(green("✓ Conectado à fonte"))
  } catch (e) {
    console.log(red(`✗ Erro ao conectar na fonte: ${e.message}`))
    process.exit(1)
  }

  if (SOURCE_URL !== DEST_URL) {
    try {
      await dst.connect()
      console.log(green("✓ Conectado ao destino"))
    } catch (e) {
      console.log(red(`✗ Erro ao conectar no destino: ${e.message}`))
      console.log(yellow("  Certifique-se de que o Docker Desktop está rodando e executou: docker-compose up -d"))
      await src.end()
      process.exit(1)
    }
  }

  const target = SOURCE_URL === DEST_URL ? src : dst

  // 1. Ativa pgvector no destino
  console.log("\n1. Ativando pgvector...")
  try {
    await target.query("CREATE EXTENSION IF NOT EXISTS vector")
    console.log(green("   ✓ pgvector ativo"))
  } catch (e) {
    console.log(red(`   ✗ Falha: ${e.message}`))
    console.log(yellow("   Use a imagem pgvector/pgvector:pg16 no docker-compose.yml"))
    process.exit(1)
  }

  // 2. Migra coluna embedding de bytea para vector(1536)
  console.log("2. Convertendo coluna embedding para vector(1536)...")
  try {
    await target.query(`
      ALTER TABLE public.atendimentos
        ALTER COLUMN embedding TYPE vector(1536)
        USING NULL::vector(1536)
    `)
    console.log(green("   ✓ Coluna convertida"))
  } catch (e) {
    if (e.message.includes("already")) {
      console.log(dim("   (coluna já é vector — ok)"))
    } else {
      console.log(yellow(`   ⚠ ${e.message.slice(0, 120)}`))
    }
  }

  // 3. Cria índice e função de busca semântica
  console.log("3. Criando função de busca semântica...")
  await target.query(`
    CREATE INDEX IF NOT EXISTS atendimentos_embedding_idx
    ON public.atendimentos USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100)
  `).catch(() => {}) // ivfflat precisa de dados para criar; silencia erro aqui

  await target.query(`
    CREATE OR REPLACE FUNCTION public.buscar_atendimentos_semanticos(
      query_embedding vector(1536),
      match_count int DEFAULT 3
    )
    RETURNS TABLE (
      id uuid,
      similaridade float,
      resumo_problema text,
      causa text,
      solucao text
    )
    LANGUAGE sql STABLE AS $$
      SELECT
        a.id,
        (1 - (a.embedding <=> query_embedding))::float AS similaridade,
        COALESCE(a.resumo_problema, a.problema, a.resumo, a.texto_original) AS resumo_problema,
        a.causa,
        a.solucao
      FROM public.atendimentos a
      WHERE a.embedding IS NOT NULL
      ORDER BY a.embedding <=> query_embedding
      LIMIT GREATEST(match_count, 1);
    $$
  `)
  console.log(green("   ✓ Função buscar_atendimentos_semanticos criada"))

  // 4. Se fonte ≠ destino, copia os registros
  if (SOURCE_URL !== DEST_URL) {
    console.log("4. Copiando registros...")
    const rows = (await src.query(`
      SELECT cliente, tecnico, canal, texto_original, resumo_problema,
             problema, causa, solucao, processado, ticket_externo,
             categoria, resumo, created_at, updated_at
      FROM public.atendimentos
      ORDER BY created_at
    `)).rows

    console.log(dim(`   ${rows.length} registros encontrados`))
    let ok = 0, skip = 0
    for (const r of rows) {
      try {
        await dst.query(
          `INSERT INTO public.atendimentos
             (cliente, tecnico, canal, texto_original, resumo_problema,
              problema, causa, solucao, processado, ticket_externo,
              categoria, resumo, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           ON CONFLICT DO NOTHING`,
          [r.cliente, r.tecnico, r.canal, r.texto_original, r.resumo_problema,
           r.problema, r.causa, r.solucao, r.processado, r.ticket_externo,
           r.categoria, r.resumo, r.created_at, r.updated_at]
        )
        ok++
      } catch { skip++ }
    }
    console.log(green(`   ✓ ${ok} inseridos${skip > 0 ? `, ${skip} pulados` : ""}`))
  } else {
    console.log(dim("4. Mesma URL → migração de dados pulada (já no lugar)"))
  }

  await src.end()
  if (SOURCE_URL !== DEST_URL) await dst.end()

  console.log(bold(green("\n✅ Migração concluída!")))
  console.log(dim("   Agora execute o import de PDFs para gerar os embeddings:"))
  console.log(dim("   node scripts/import-pdf-knowledge.mjs ./seus-pdfs/\n"))
}

main().catch((e) => {
  console.error(red(`\n✗ Erro: ${e.message}`))
  process.exit(1)
})

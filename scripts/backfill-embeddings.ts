/**
 * Backfill de embeddings para atendimentos processados sem vetor.
 * Uso: npx tsx scripts/backfill-embeddings.ts
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e
 * NEXT_PUBLIC_BASE_URL (ou http://localhost:3000 por padrão) no .env.local
 * O app deve estar rodando antes de executar este script.
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(__dirname, "..", ".env.local") })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"
const internalToken = process.env.CEREBRO_INTERNAL_TOKEN

if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local")
  process.exit(1)
}

const supabase = createClient(url, key)

async function backfill() {
  console.log("🔍 Buscando atendimentos processados sem embedding...")

  const { data: pendentes, error } = await supabase
    .from("atendimentos")
    .select("id, texto_original")
    .eq("processado", true)
    .is("embedding", null)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("Erro ao buscar atendimentos:", error.message)
    process.exit(1)
  }

  if (!pendentes || pendentes.length === 0) {
    console.log("✅ Nenhum atendimento pendente de embedding.")
    return
  }

  console.log(`📋 Encontrados ${pendentes.length} atendimento(s) sem embedding. Iniciando backfill...`)

  let sucesso = 0
  let falha = 0

  for (const atendimento of pendentes) {
    try {
      const res = await fetch(`${baseUrl}/api/atendimentos/processar`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(internalToken ? { "X-Internal-Token": internalToken } : {}),
        },
        body: JSON.stringify({
          id: atendimento.id,
          texto_original: atendimento.texto_original,
        }),
      })

      if (res.ok) {
        sucesso++
        console.log(`  ✓ ${atendimento.id}`)
      } else {
        const body = await res.text()
        falha++
        console.warn(`  ✗ ${atendimento.id} — HTTP ${res.status}: ${body.slice(0, 100)}`)
      }
    } catch (err) {
      falha++
      console.warn(`  ✗ ${atendimento.id} — ${err instanceof Error ? err.message : String(err)}`)
    }

    // Pausa entre requisições para não sobrecarregar a IA
    await new Promise((r) => setTimeout(r, 1500))
  }

  console.log(`\n📊 Backfill concluído: ${sucesso} ok, ${falha} falha(s).`)
}

backfill()

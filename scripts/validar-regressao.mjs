/**
 * scripts/validar-regressao.mjs
 *
 * Teste de regressão / health-check do Mavo.AI. Roda os 20 casos adversariais
 * de scripts/test-cases.json contra POST /api/orquestrador/v1/diagnostico e
 * gera um relatório objetivo de acerto/erro — sem avaliação subjetiva.
 *
 * Mede:
 *   - acerto de ROTEAMENTO (agente_esperado == agente acionado);
 *   - aprovação de CONTEÚDO (deve_conter: OR / nao_deve_conter: nenhum);
 *   - tempo médio de resposta por domínio;
 *   - erros nos casos de fallback (sistema nunca inventa resposta fora de escopo).
 *
 * CRITÉRIO DE APROVAÇÃO GERAL (sistema pronto para cliente real):
 *   - >= 90% de acerto no roteamento
 *   - >= 85% de aprovação nos critérios de conteúdo
 *   - 0 erros nos casos de fallback
 *   - tempo médio < 4s em todos os domínios
 *
 * Uso:
 *   node scripts/validar-regressao.mjs
 *   BASE_URL=http://localhost:3000 TENANT_ID=auge node scripts/validar-regressao.mjs
 *
 * Variáveis de ambiente:
 *   BASE_URL   (default http://localhost:3000)
 *   TENANT_ID  (default auge — tenant onde os especialistas estão semeados)
 *   AUTH_TOKEN (opcional — só se INTEGRATION_AUTH_REQUIRED=true no servidor)
 */

import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BASE_URL = process.env.BASE_URL || "http://localhost:3000"
const TENANT_ID = process.env.TENANT_ID || "auge"
const AUTH_TOKEN = process.env.AUTH_TOKEN || ""
const ENDPOINT = `${BASE_URL}/api/orquestrador/v1/diagnostico`

// Limiares de aprovação geral.
const LIMIAR_ROTEAMENTO = 0.9
const LIMIAR_CONTEUDO = 0.85
const LIMIAR_TEMPO_MS = 4000

const norm = (s) => String(s || "").toLowerCase()

function avaliaConteudo(resposta, caso) {
  const r = norm(resposta)
  const deve = caso.deve_conter || []
  const naoDeve = caso.nao_deve_conter || []

  // OR: se houver lista, ao menos uma frase precisa aparecer.
  const passDeve = deve.length === 0 || deve.some((frase) => r.includes(norm(frase)))
  // Nenhuma das proibidas pode aparecer.
  const proibidaEncontrada = naoDeve.find((frase) => r.includes(norm(frase))) || null

  return { passDeve, proibidaEncontrada, passou: passDeve && !proibidaEncontrada }
}

async function rodaCaso(caso) {
  const headers = { "Content-Type": "application/json", "X-Tenant-Id": TENANT_ID }
  if (AUTH_TOKEN) headers["Authorization"] = `Bearer ${AUTH_TOKEN}`

  const t0 = Date.now()
  let res, data
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({ mensagem: caso.mensagem, tenant_id: TENANT_ID }),
    })
    data = await res.json()
  } catch (e) {
    return { caso, erroRede: e.message, tempo_ms: Date.now() - t0 }
  }
  if (!res.ok) {
    return { caso, erroHttp: `HTTP ${res.status}: ${JSON.stringify(data).slice(0, 200)}`, tempo_ms: Date.now() - t0 }
  }

  const tempo_ms = typeof data.tempo_ms === "number" ? data.tempo_ms : Date.now() - t0
  const roteamentoOk = norm(data.agente) === norm(caso.agente_esperado)
  const conteudo = avaliaConteudo(data.resposta, caso)

  return { caso, data, tempo_ms, roteamentoOk, conteudo }
}

function pct(n, d) {
  return d === 0 ? "—" : `${((100 * n) / d).toFixed(1)}%`
}

async function main() {
  // Permite rodar outro conjunto: CASES_FILE=test-cases-variacoes.json node scripts/validar-regressao.mjs
  const arquivo = path.join(__dirname, process.env.CASES_FILE || "test-cases.json")
  const { casos } = JSON.parse(readFileSync(arquivo, "utf-8"))

  console.log(`\n🧪 Mavo.AI — regressão (${casos.length} casos)`)
  console.log(`   Endpoint: ${ENDPOINT}`)
  console.log(`   Tenant:   ${TENANT_ID}\n`)

  const resultados = []
  for (const caso of casos) {
    const r = await rodaCaso(caso)
    resultados.push(r)

    if (r.erroRede || r.erroHttp) {
      console.log(`  ⚠️  ${caso.id.padEnd(12)} ERRO: ${r.erroRede || r.erroHttp}`)
      continue
    }
    const rotIcon = r.roteamentoOk ? "✅" : "❌"
    const conIcon = r.conteudo.passou ? "✅" : "❌"
    console.log(
      `  ${rotIcon}${conIcon} ${caso.id.padEnd(12)} ` +
        `rot: ${String(r.data.agente).padEnd(10)} (esp ${caso.agente_esperado}) ` +
        `score ${Number(r.data.score).toFixed(2)}  ${r.tempo_ms}ms`,
    )
    if (!r.roteamentoOk || !r.conteudo.passou) {
      if (!r.conteudo.passDeve) console.log(`        ↳ faltou conter alguma de: ${JSON.stringify(caso.deve_conter)}`)
      if (r.conteudo.proibidaEncontrada) console.log(`        ↳ continha proibida: "${r.conteudo.proibidaEncontrada}"`)
      console.log(`        ↳ resposta: ${String(r.data.resposta).replace(/\s+/g, " ").slice(0, 160)}…`)
    }
  }

  // ── Agregação por domínio ──────────────────────────────────────────────────
  const dominios = [...new Set(casos.map((c) => c.dominio))]
  console.log(`\n📊 RELATÓRIO POR DOMÍNIO`)
  const temposPorDominio = {}
  let rotOkTotal = 0, conOkTotal = 0, validos = 0
  let falhasFallback = 0

  for (const dom of dominios) {
    const doDom = resultados.filter((r) => r.caso.dominio === dom && r.data)
    const rotOk = doDom.filter((r) => r.roteamentoOk).length
    const conOk = doDom.filter((r) => r.conteudo.passou).length
    const tempos = doDom.map((r) => r.tempo_ms)
    const tempoMedio = tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : 0
    temposPorDominio[dom] = tempoMedio

    rotOkTotal += rotOk
    conOkTotal += conOk
    validos += doDom.length
    if (dom === "fallback") falhasFallback = doDom.length - Math.min(rotOk, conOk)

    console.log(
      `   ${dom.padEnd(10)} roteamento ${pct(rotOk, doDom.length).padStart(6)}  ` +
        `conteúdo ${pct(conOk, doDom.length).padStart(6)}  tempo médio ${tempoMedio}ms`,
    )
  }

  // ── Veredito geral ─────────────────────────────────────────────────────────
  const taxaRot = validos ? rotOkTotal / validos : 0
  const taxaCon = validos ? conOkTotal / validos : 0
  const tempoMax = Math.max(0, ...Object.values(temposPorDominio))
  const erros = resultados.filter((r) => r.erroRede || r.erroHttp).length

  console.log(`\n🏁 VEREDITO GERAL`)
  const linha = (ok, label) => `   ${ok ? "✅" : "❌"} ${label}`
  console.log(linha(taxaRot >= LIMIAR_ROTEAMENTO, `Roteamento ${pct(rotOkTotal, validos)} (mín ${LIMIAR_ROTEAMENTO * 100}%)`))
  console.log(linha(taxaCon >= LIMIAR_CONTEUDO, `Conteúdo ${pct(conOkTotal, validos)} (mín ${LIMIAR_CONTEUDO * 100}%)`))
  console.log(linha(falhasFallback === 0, `Fallback sem invenção: ${falhasFallback} falha(s)`))
  console.log(linha(tempoMax < LIMIAR_TEMPO_MS, `Tempo médio máx ${tempoMax}ms (limite ${LIMIAR_TEMPO_MS}ms)`))
  if (erros > 0) console.log(`   ⚠️  ${erros} caso(s) com erro de rede/HTTP (não contabilizados)`)

  const aprovado =
    taxaRot >= LIMIAR_ROTEAMENTO &&
    taxaCon >= LIMIAR_CONTEUDO &&
    falhasFallback === 0 &&
    tempoMax < LIMIAR_TEMPO_MS &&
    erros === 0

  console.log(`\n${aprovado ? "✅ APROVADO — pronto para exposição a cliente real." : "❌ REPROVADO — não exponha a cliente real ainda."}\n`)
  process.exit(aprovado ? 0 : 1)
}

main().catch((e) => {
  console.error("\n❌ Erro fatal:", e.message)
  process.exit(1)
})

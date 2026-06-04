/**
 * Teste completo dos 6 domínios especialistas via API real
 * Simula usuário já triado (queue_id selecionado) enviando pergunta técnica
 * → testa fast-path resolution + roteamento especialista
 *
 * Uso: node scripts/test-domains.mjs
 */

const BASE_URL = "http://localhost:3000"
const INGEST_TOKEN = "9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1"
const TENANT_ID = "auge"
const ORG_ID = "auge"

// Filas simuladas — passadas no payload (sem banco)
const QUEUES = [
  { id: "q-pdv",       name: "Suporte PDV / Frente de Caixa",  menu_option: 1, is_active: true },
  { id: "q-fiscal",    name: "Suporte Fiscal / NF-e / SEFAZ",  menu_option: 2, is_active: true },
  { id: "q-tef",       name: "Suporte TEF / Pagamentos",       menu_option: 3, is_active: true },
  { id: "q-estoque",   name: "Suporte Estoque / Compras",      menu_option: 4, is_active: true },
  { id: "q-hardware",  name: "Suporte Hardware / Periféricos", menu_option: 5, is_active: true },
  { id: "q-integracao","name": "Suporte Integrações / API",    menu_option: 6, is_active: true },
]

// Uma pergunta técnica representativa por domínio
const TEST_CASES = [
  {
    domain: "pdv",
    label: "Caixa não abre — SAT offline",
    queueId: "q-pdv",
    message: "O caixa está dando erro ao tentar abrir, aparece a mensagem 'Falha na comunicação com o servidor'. O SAT também não está respondendo. O que devo fazer para resolver?",
  },
  {
    domain: "fiscal",
    label: "NF-e rejeitada código 562 SEFAZ",
    queueId: "q-fiscal",
    message: "Estou tentando emitir NF-e mas está sendo rejeitada com código 562 pelo SEFAZ. O DANFE não está sendo gerado e o XML está retornando erro de schema. Como faço para resolver essa rejeição?",
  },
  {
    domain: "tef",
    label: "PinPad timeout SiTEF Ingenico",
    queueId: "q-tef",
    message: "O pinpad da Ingenico não está respondendo quando tento passar o cartão de crédito no caixa. O SiTEF mostra timeout na transação e fica tentando conectar. Como resolvo o problema de comunicação do TEF com o pinpad?",
  },
  {
    domain: "estoque",
    label: "Custo médio zerado após XML NF-e",
    queueId: "q-estoque",
    message: "O custo médio de vários produtos ficou zerado após importação de XML de nota de entrada NF-e. O estoque entrou corretamente mas o custo está como R$ 0,00. Como faço para recalcular o custo médio e corrigir os valores de cada produto?",
  },
  {
    domain: "hardware",
    label: "Impressora Argox OS-214 não imprime",
    queueId: "q-hardware",
    message: "A impressora de etiquetas Argox OS-214plus parou de imprimir etiquetas de produto. O driver está instalado corretamente, aparece online na lista de impressoras do Windows, mas ao mandar imprimir a etiqueta via ERP ela não sai. O led da impressora está piscando verde.",
  },
  {
    domain: "integracao",
    label: "API Shopify erro 401 OAuth token",
    queueId: "q-integracao",
    message: "A integração do ERP com o Shopify está retornando erro 401 unauthorized ao tentar sincronizar os pedidos. O token de autenticação OAuth foi gerado ontem no painel do Shopify. Como devo configurar o webhook e o token para corrigir a autenticação na API?",
  },
]

let convCounter = 1

async function testDomain(testCase) {
  const { domain, label, queueId, message } = testCase
  const convId = `test-conv-${domain}-${convCounter++}-${Date.now()}`

  console.log(`\n${"=".repeat(65)}`)
  console.log(`🧪 DOMÍNIO: ${domain.toUpperCase()} — ${label}`)
  console.log(`${"=".repeat(65)}`)
  console.log(`📨 "${message.slice(0, 90)}..."`)

  const startTime = Date.now()

  // Simula usuário já triado: queue_id selecionado, triage_completed=false
  // O orquestrador entra direto no fast-path / resolution se mensagem for técnica
  const payload = {
    platform: "test_cli",
    organization_id: ORG_ID,
    event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversation_id: convId,
    cliente: {
      nome: `Teste ${domain.toUpperCase()}`,
      telefone: "11999999999",
    },
    mensagem: message,
    business_hours_open: true,
    conversation: {
      triage_completed: false,
      menu_attempts: 1,
      queue_id: queueId,
      resolution_active: false,
      resolution_attempts: 0,
    },
    queues: QUEUES,
  }

  try {
    const res = await fetch(`${BASE_URL}/api/orquestrador/v1/mensagem`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${INGEST_TOKEN}`,
        "X-Tenant-Id": TENANT_ID,
        "X-Source-System": "test_cli",
        "X-Source-Entity-Id": convId,
      },
      body: JSON.stringify(payload),
    })

    const elapsed = Date.now() - startTime

    if (!res.ok) {
      const err = await res.text()
      console.log(`❌ HTTP ${res.status}: ${err.slice(0, 300)}`)
      return { domain, ok: false, status: res.status, elapsed }
    }

    const data = await res.json()
    const replyText = data?.reply_text || ""
    const reason = data?.reason || "?"
    const triageCompleted = data?.triage_completed
    const resolutionActive = data?.resolution_active

    console.log(`✅ HTTP 200 | reason=${reason} | triage_completed=${triageCompleted} | resolution_active=${resolutionActive} | ${elapsed}ms`)
    console.log()
    console.log(`📋 RESPOSTA:`)
    console.log(`${"─".repeat(55)}`)

    const lines = String(replyText).split("\n")
    const maxLines = 20
    lines.slice(0, maxLines).forEach(l => console.log(`  ${l}`))
    if (lines.length > maxLines) console.log(`  ... (+${lines.length - maxLines} linhas)`)
    console.log(`${"─".repeat(55)}`)

    // Análise qualitativa
    const hasContent = replyText && replyText.length > 80
    const isFastPath = reason?.includes("fast_resolution") || reason?.includes("fast_path")
    const isInvestigation = reason?.includes("investigat")
    const isJustAck = (reason === "post_triage_ack" || reason === "investigation_initiated") && replyText.length < 150
    const isResolution = reason?.includes("resolution") || isFastPath

    if (!hasContent) {
      console.log(`⚠️  AVISO: Resposta muito curta (${replyText.length} chars)`)
    } else if (isJustAck) {
      console.log(`⚠️  AVISO: Apenas ACK/investigação — IA não gerou solução ainda`)
    } else if (isFastPath) {
      console.log(`🚀 FAST-PATH: Solução gerada diretamente (${replyText.length} chars)`)
    } else if (isResolution) {
      console.log(`🎯 RESOLUÇÃO: IA gerou solução técnica (${replyText.length} chars)`)
    } else if (isInvestigation) {
      console.log(`🔍 INVESTIGAÇÃO: IA coletando mais informações (${replyText.length} chars)`)
    }

    return { domain, ok: true, reason, elapsed, chars: replyText.length }
  } catch (e) {
    const elapsed = Date.now() - startTime
    console.log(`❌ Erro de rede: ${e.message} (${elapsed}ms)`)
    return { domain, ok: false, error: e.message, elapsed }
  }
}

// Aguarda o servidor estar pronto
async function waitForServer(maxMs = 15000) {
  const start = Date.now()
  while (Date.now() - start < maxMs) {
    try {
      const r = await fetch(`${BASE_URL}/api/health`)
      if (r.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, 1000))
  }
  return false
}

console.log("🔍 Verificando servidor em localhost:3000...")
const ready = await waitForServer()
if (!ready) {
  console.error("❌ Servidor não está respondendo")
  process.exit(1)
}
console.log("✅ Servidor OK\n")

const results = []
for (const tc of TEST_CASES) {
  const r = await testDomain(tc)
  results.push(r)
  // Pausa para não estourar rate limit Groq (30 req/min)
  await new Promise(res => setTimeout(res, 3000))
}

// Resumo final
console.log(`\n${"=".repeat(65)}`)
console.log("📊 RESUMO DOS TESTES")
console.log(`${"=".repeat(65)}`)
const ok = results.filter(r => r.ok).length
const withSolution = results.filter(r =>
  r.reason?.includes("resolution") || r.reason?.includes("fast") || r.reason?.includes("investigat")
).length
console.log(`✅ HTTP 200:    ${ok}/${results.length}`)
console.log(`🎯 Com solução: ${withSolution}/${results.length}`)
console.log()
results.forEach(r => {
  let icon = "❌"
  if (r.ok && (r.reason?.includes("fast") || r.reason?.includes("resolution"))) icon = "🚀"
  else if (r.ok && r.reason?.includes("investigat")) icon = "🔍"
  else if (r.ok) icon = "✅"

  const info = r.ok
    ? `reason=${r.reason?.slice(0, 30).padEnd(30)} | chars=${String(r.chars).padStart(4)} | ${r.elapsed}ms`
    : `erro=${r.error || r.status}`
  console.log(`  ${icon} ${r.domain.padEnd(12)} ${info}`)
})

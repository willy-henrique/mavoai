/**
 * Testa o fluxo real: primeira mensagem sem queue_id selecionado
 * O orquestrador deve auto-classificar a fila E tentar fast-path resolution
 *
 * Este é o cenário real de uso no WillTalk/WhatsApp
 */

const BASE_URL = "http://localhost:3000"
const INGEST_TOKEN = "***REMOVED-MTALK-TOKEN***"
const TENANT_ID = "auge"
const ORG_ID = "auge"

// Filas que WillTalk envia junto com cada mensagem
const QUEUES = [
  { id: "q-pdv",       name: "Suporte PDV / Frente de Caixa",  menu_option: 1, is_active: true },
  { id: "q-fiscal",    name: "Suporte Fiscal / NF-e / SEFAZ",  menu_option: 2, is_active: true },
  { id: "q-tef",       name: "Suporte TEF / Pagamentos",       menu_option: 3, is_active: true },
  { id: "q-estoque",   name: "Suporte Estoque / Compras",      menu_option: 4, is_active: true },
  { id: "q-hardware",  name: "Suporte Hardware / Periféricos", menu_option: 5, is_active: true },
  { id: "q-integracao","name": "Suporte Integrações / API",    menu_option: 6, is_active: true },
]

// Primeira mensagem sem queue selecionado — o usuário descreve o problema direto
const FIRST_MSG_CASES = [
  {
    domain: "pdv",
    msg: "Meu caixa PDV não está abrindo, quando tento abrir aparece 'Falha na comunicação com o servidor concentrador'. Reiniciei o computador e o erro persiste.",
  },
  {
    domain: "fiscal",
    msg: "A NF-e está sendo rejeitada pelo SEFAZ com código 562. Projeto do Assinante Diferente. Meu certificado digital A3 foi trocado essa semana.",
  },
  {
    domain: "tef",
    msg: "O pinpad Ingenico está apresentando timeout ao tentar processar cartão. O gerenciador SiTEF está rodando mas a transação não passa.",
  },
  {
    domain: "estoque",
    msg: "Após importar XML de nota de entrada NFe, o custo médio de 50 produtos ficou zerado no sistema. O estoque entrou mas o custo está R$ 0,00.",
  },
  {
    domain: "hardware",
    msg: "A impressora de etiquetas Argox OS-214plus não está imprimindo. O driver está instalado, aparece online no Windows 10, mas o ERP não consegue imprimir etiquetas.",
  },
  {
    domain: "integracao",
    msg: "A API do Shopify está retornando 401 unauthorized na sincronização de pedidos. O token OAuth foi renovado hoje no painel de apps do Shopify.",
  },
]

let counter = 0

async function testFirstMessage(tc) {
  const convId = `first-${tc.domain}-${counter++}-${Date.now()}`
  console.log(`\n${"=".repeat(60)}`)
  console.log(`🧪 ${tc.domain.toUpperCase()} — Primeira mensagem (sem queue_id)`)
  console.log(`${"=".repeat(60)}`)
  console.log(`📨 "${tc.msg.slice(0, 80)}..."`)

  const start = Date.now()
  const res = await fetch(`${BASE_URL}/api/orquestrador/v1/mensagem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${INGEST_TOKEN}`,
      "X-Tenant-Id": TENANT_ID,
      "X-Source-System": "test_cli",
    },
    body: JSON.stringify({
      platform: "test_cli",
      organization_id: ORG_ID,
      event_id: `evt-${Date.now()}`,
      conversation_id: convId,
      cliente: { nome: "Cliente Teste", telefone: "11999999999" },
      mensagem: tc.msg,
      business_hours_open: true,
      conversation: {
        triage_completed: false,
        menu_attempts: 0,
        queue_id: null,  // ← sem fila selecionada — fluxo real
      },
      queues: QUEUES,
    }),
  }).then(r => r.json())

  const elapsed = Date.now() - start
  const reply = res.reply_text || ""
  const reason = res.reason || "?"
  const queueSelected = res.queue_id

  const icon = reason.includes("fast_resolution") ? "🚀" : reason.includes("resolution") ? "🎯" : reason.includes("menu") ? "📋" : reason.includes("investigat") ? "🔍" : "✅"

  console.log(`${icon} reason=${reason} | queue=${queueSelected ?? "null"} | ${elapsed}ms`)
  console.log()
  const lines = reply.split("\n").slice(0, 15)
  lines.forEach(l => console.log(`   ${l}`))
  if (reply.split("\n").length > 15) console.log(`   ... (+${reply.split("\n").length - 15} linhas)`)

  return { domain: tc.domain, reason, queueSelected, elapsed, chars: reply.length }
}

const health = await fetch(`${BASE_URL}/api/health`).catch(() => null)
if (!health?.ok) { console.error("❌ Servidor offline"); process.exit(1) }
console.log("✅ Servidor OK")

const results = []
for (const tc of FIRST_MSG_CASES) {
  try {
    const r = await testFirstMessage(tc)
    results.push({ ...r, ok: true })
  } catch(e) {
    console.log(`❌ ${tc.domain}: ${e.message}`)
    results.push({ domain: tc.domain, ok: false, error: e.message })
  }
  await new Promise(r => setTimeout(r, 3000))
}

console.log(`\n${"=".repeat(60)}`)
console.log("📊 RESUMO — PRIMEIRA MENSAGEM")
console.log(`${"=".repeat(60)}`)
const fastPaths = results.filter(r => r.reason?.includes("fast_resolution")).length
const resolutions = results.filter(r => r.reason?.includes("resolution")).length
const menus = results.filter(r => r.reason?.includes("menu") || r.reason?.includes("presented")).length
console.log(`🚀 Fast-path (resolve na 1ª mensagem): ${fastPaths}/${results.length}`)
console.log(`🎯 Resolução (qualquer):                ${resolutions}/${results.length}`)
console.log(`📋 Menu apresentado:                    ${menus}/${results.length}`)
console.log()
results.forEach(r => {
  const icon = r.reason?.includes("fast_resolution") ? "🚀" : r.reason?.includes("menu") || r.reason?.includes("presented") ? "📋" : "✅"
  const q = r.queueSelected ? `→ ${r.queueSelected}` : ""
  console.log(`  ${icon} ${r.domain.padEnd(12)} ${(r.reason || r.error || "?").slice(0, 32).padEnd(32)} ${q} (${r.elapsed}ms)`)
})

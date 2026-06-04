/**
 * Testa o ciclo completo: investigação → resposta do usuário → resolução
 * Simula 2 turnos de conversa para cada domínio
 */

const BASE_URL = "http://localhost:3000"
const INGEST_TOKEN = "9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1"
const TENANT_ID = "auge"
const ORG_ID = "auge"

const QUEUES = [
  { id: "q-pdv",       name: "Suporte PDV / Frente de Caixa",  menu_option: 1, is_active: true },
  { id: "q-fiscal",    name: "Suporte Fiscal / NF-e / SEFAZ",  menu_option: 2, is_active: true },
  { id: "q-tef",       name: "Suporte TEF / Pagamentos",       menu_option: 3, is_active: true },
  { id: "q-estoque",   name: "Suporte Estoque / Compras",      menu_option: 4, is_active: true },
  { id: "q-hardware",  name: "Suporte Hardware / Periféricos", menu_option: 5, is_active: true },
  { id: "q-integracao","name": "Suporte Integrações / API",    menu_option: 6, is_active: true },
]

// Casos que testam 2 turnos: pergunta técnica → resposta com detalhes → IA resolve
const TWO_TURN_CASES = [
  {
    domain: "fiscal",
    label: "NF-e rejeição 562 → detalhes completos",
    queueId: "q-fiscal",
    turn1: "NF-e rejeitada código 562 SEFAZ, DANFE não sendo gerado, nota fiscal eletrônica com erro de schema XML.",
    turn1_response: "O sistema está exibindo 'Rejeição 562 - Projeto do Assinante Diferente' na tela de emissão. Estou usando certificado A3 e o token expirou há 3 dias. O CFOP está como 5102.",
    // Estado após turn 1 (investigation)
    afterTurn1: {
      triage_completed: false,
      menu_attempts: 1,
      queue_id: "q-fiscal",
      resolution_active: false,
      resolution_attempts: 0,
      investigation_adequate_rounds: 0,
      last_ai_reply: "Qual mensagem ou código de erro aparece na tela? Me manda o texto exato ou uma foto.",
    },
  },
  {
    domain: "estoque",
    label: "Custo médio zerado → detalhes da importação",
    queueId: "q-estoque",
    turn1: "Custo médio de produtos zerado após importar XML nota de entrada NF-e no ERP AUGE. Estoque entrou mas custo está R$ 0,00.",
    turn1_response: "Importei pela tela de Compras > Importar XML NF-e. 47 produtos ficaram com custo zerado. A nota é de um fornecedor novo. O produto estava como inativo no cadastro e eu reativei antes.",
    afterTurn1: {
      triage_completed: false,
      menu_attempts: 1,
      queue_id: "q-estoque",
      resolution_active: false,
      resolution_attempts: 0,
      investigation_adequate_rounds: 0,
      last_ai_reply: "Você consegue informar o módulo exato do AUGE onde fez a importação e se há alguma mensagem de erro ou aviso?",
    },
  },
  {
    domain: "hardware",
    label: "Impressora Argox não imprime → detalhes físicos",
    queueId: "q-hardware",
    turn1: "Impressora Argox OS-214plus não imprime etiquetas, driver instalado, aparece online no Windows, led verde piscando.",
    turn1_response: "No ERP a impressora está configurada na porta USB001. Já tentei reimprimir mas não sai nada. O papel e o ribbon estão ok. Ontem funcionava normal. Só acontece no ERP, no Windows o teste de impressão funciona.",
    afterTurn1: {
      triage_completed: false,
      menu_attempts: 1,
      queue_id: "q-hardware",
      resolution_active: false,
      resolution_attempts: 0,
      investigation_adequate_rounds: 0,
      last_ai_reply: "Você já verificou se a impressora está configurada corretamente no ERP?",
    },
  },
]

async function sendMessage(conversationId, queueId, mensagem, conversationState) {
  const payload = {
    platform: "test_cli",
    organization_id: ORG_ID,
    event_id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    conversation_id: conversationId,
    cliente: { nome: "Teste Cliente", telefone: "11999999999" },
    mensagem,
    business_hours_open: true,
    conversation: conversationState,
    queues: QUEUES,
  }

  const res = await fetch(`${BASE_URL}/api/orquestrador/v1/mensagem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${INGEST_TOKEN}`,
      "X-Tenant-Id": TENANT_ID,
      "X-Source-System": "test_cli",
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`HTTP ${res.status}: ${err.slice(0, 200)}`)
  }

  return res.json()
}

async function testTwoTurns(tc) {
  const { domain, label, queueId, turn1, turn1_response, afterTurn1 } = tc
  const convId = `test2-${domain}-${Date.now()}`

  console.log(`\n${"=".repeat(65)}`)
  console.log(`🧪 DOMÍNIO: ${domain.toUpperCase()} — ${label}`)
  console.log(`${"=".repeat(65)}`)

  // TURNO 1: Pergunta inicial (com queue_id já selecionado)
  console.log(`\n📨 TURNO 1: "${turn1.slice(0, 80)}..."`)
  const t1Start = Date.now()
  let turn1Data
  try {
    turn1Data = await sendMessage(convId, queueId, turn1, {
      triage_completed: false,
      menu_attempts: 1,
      queue_id: queueId,
    })
    const elapsed = Date.now() - t1Start
    console.log(`   → reason=${turn1Data.reason} | ${elapsed}ms`)
    console.log(`   → "${String(turn1Data.reply_text || "").slice(0, 100)}"`)
  } catch (e) {
    console.log(`   ❌ Erro: ${e.message}`)
    return { domain, ok: false, error: e.message }
  }

  await new Promise(r => setTimeout(r, 2500))

  // TURNO 2: Usuário fornece detalhes → IA deve resolver
  console.log(`\n📨 TURNO 2 (detalhes): "${turn1_response.slice(0, 80)}..."`)
  const t2Start = Date.now()
  let turn2Data
  try {
    turn2Data = await sendMessage(convId, queueId, turn1_response, afterTurn1)
    const elapsed = Date.now() - t2Start
    console.log(`   → reason=${turn2Data.reason} | chars=${turn2Data.reply_text?.length || 0} | ${elapsed}ms`)
  } catch (e) {
    console.log(`   ❌ Erro: ${e.message}`)
    return { domain, ok: false, error: e.message }
  }

  const replyText = turn2Data?.reply_text || ""
  const reason = turn2Data?.reason || "?"
  const isResolution = reason.includes("resolution") || reason.includes("fast")

  console.log()
  console.log(`📋 RESPOSTA FINAL (Turno 2):`)
  console.log(`${"─".repeat(55)}`)
  const lines = replyText.split("\n")
  lines.slice(0, 20).forEach(l => console.log(`  ${l}`))
  if (lines.length > 20) console.log(`  ... (+${lines.length - 20} linhas)`)
  console.log(`${"─".repeat(55)}`)

  if (isResolution && replyText.length > 100) {
    console.log(`🎯 SUCESSO: Resolução técnica gerada (${replyText.length} chars)`)
  } else {
    console.log(`⚠️  AVISO: reason=${reason}, chars=${replyText.length}`)
  }

  return { domain, ok: true, reason, chars: replyText.length, isResolution }
}

// Check server
const r = await fetch(`${BASE_URL}/api/health`).catch(() => null)
if (!r?.ok) { console.error("❌ Servidor offline"); process.exit(1) }
console.log("✅ Servidor OK\n")

const results = []
for (const tc of TWO_TURN_CASES) {
  const r = await testTwoTurns(tc)
  results.push(r)
  await new Promise(r => setTimeout(r, 3000))
}

console.log(`\n${"=".repeat(65)}`)
console.log("📊 RESUMO 2 TURNOS")
console.log(`${"=".repeat(65)}`)
results.forEach(r => {
  const icon = r.isResolution ? "🎯" : r.ok ? "✅" : "❌"
  const info = r.ok
    ? `reason=${r.reason?.slice(0, 25).padEnd(25)} | chars=${String(r.chars).padStart(4)}`
    : `erro=${r.error}`
  console.log(`  ${icon} ${r.domain.padEnd(12)} ${info}`)
})

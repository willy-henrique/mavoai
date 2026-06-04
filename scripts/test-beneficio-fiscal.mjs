const BASE_URL = "http://localhost:3000"
const INGEST_TOKEN = "9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1"

const QUEUES = [
  { id: "q-fiscal", name: "Suporte Fiscal / NF-e / SEFAZ", menu_option: 1, is_active: true },
]

const CASOS = [
  {
    msg: "NF-e rejeitada pelo SEFAZ com a mensagem: Informado código de benefício fiscal para CST sem benefício fiscal. Como resolvo?",
    label: "Rejeição código benefício"
  },
  {
    msg: "Onde eu configuro o código de benefício fiscal no sistema? No cadastro do produto ou na operação fiscal?",
    label: "Onde fica código de benefício"
  },
  {
    msg: "Tenho uma NF-e de garantia sendo rejeitada. O CST é 090 e aparece erro de código de benefício.",
    label: "CST 090 + código benefício garantia"
  },
]

for (const caso of CASOS) {
  console.log(`\n${"=".repeat(60)}`)
  console.log(`🧪 ${caso.label}`)
  console.log(`📨 "${caso.msg}"`)
  console.log("=".repeat(60))

  const res = await fetch(`${BASE_URL}/api/orquestrador/v1/mensagem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INGEST_TOKEN}`,
      "X-Tenant-Id": "auge",
      "X-Source-System": "test_cli",
    },
    body: JSON.stringify({
      platform: "test_cli",
      organization_id: "auge",
      event_id: `evt-${Date.now()}`,
      conversation_id: `test-benef-${Date.now()}`,
      cliente: { nome: "Danilo Empresa", telefone: "11999999999" },
      mensagem: caso.msg,
      business_hours_open: true,
      conversation: { triage_completed: false, menu_attempts: 0, queue_id: null },
      queues: QUEUES,
    }),
  }).then(r => r.json())

  const reply = res.reply_text || res.error || JSON.stringify(res)
  console.log(`\n${reply}\n`)
  await new Promise(r => setTimeout(r, 3000))
}

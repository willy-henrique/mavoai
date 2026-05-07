/**
 * Verifica Cérebro com servidor rodando (npm run dev).
 * Uso: npm run verify:stack
 * Opcional: VERIFY_BASE_URL=http://127.0.0.1:3000
 */

const base = (process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "")

async function main() {
  console.log("Base:", base)

  const healthRes = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) })
  const healthJson = await healthRes.json().catch(() => ({}))
  console.log("\n[GET /api/health]", healthRes.status, healthJson.status || healthJson)

  const orchBody = {
    platform: "verify",
    organization_id: "org_verify",
    event_id: `verify-${Date.now()}`,
    conversation_id: "conv_verify",
    cliente: { nome: "Verify", telefone: "5511999999999" },
    mensagem: "1",
    business_hours_open: true,
    conversation: { triage_completed: false, menu_attempts: 0, queue_id: null },
    queues: [
      {
        id: "q_verify",
        menu_option: 1,
        name: "Fila teste",
        default_sla_mins: 30,
        is_active: true,
      },
    ],
  }

  const orchRes = await fetch(`${base}/api/orquestrador/v1/mensagem`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Source-System": "verify",
      "X-Tenant-Id": "org_verify",
      "X-Ingestion-Id": orchBody.event_id,
      "X-Source-Entity-Id": orchBody.conversation_id,
    },
    body: JSON.stringify(orchBody),
    signal: AbortSignal.timeout(20_000),
  })
  const orchText = await orchRes.text()
  let orchJson
  try {
    orchJson = JSON.parse(orchText)
  } catch {
    orchJson = { raw: orchText.slice(0, 200) }
  }
  console.log("\n[POST /api/orquestrador/v1/mensagem]", orchRes.status)
  console.log("reason:", orchJson.reason)
  console.log("reply_preview:", String(orchJson.reply_text || "").slice(0, 120).replace(/\n/g, " "))

  if (!healthRes.ok) process.exitCode = 1
  if (!orchRes.ok) process.exitCode = 1
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})

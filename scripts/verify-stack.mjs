/**
 * Verifica Cérebro com servidor rodando (npm run dev).
 * Uso: npm run verify:stack
 * Opcional:
 *   VERIFY_BASE_URL=http://127.0.0.1:3000
 *   VERIFY_STRICT=true
 */

import dotenv from "dotenv"

dotenv.config({ path: ".env.local", quiet: true })
dotenv.config({ quiet: true })

const base = (process.env.VERIFY_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "")
const token = process.env.CEREBRO_INGEST_TOKEN || process.env.N8N_WEBHOOK_TOKEN || ""
const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}
const strict = String(process.env.VERIFY_STRICT || "false").toLowerCase() === "true"

async function main() {
  console.log("Base:", base)

  const configRes = await fetch(`${base}/api/config`, { signal: AbortSignal.timeout(15_000) })
  const configJson = await configRes.json().catch(() => ({}))
  console.log("\n[GET /api/config]", configRes.status)
  console.log("readyForPilot:", configJson?.readiness?.readyForPilot)
  if (Array.isArray(configJson?.readiness?.blockers) && configJson.readiness.blockers.length > 0) {
    console.log("blockers:", configJson.readiness.blockers.join(" | "))
  }
  if (Array.isArray(configJson?.readiness?.warnings) && configJson.readiness.warnings.length > 0) {
    console.log("warnings:", configJson.readiness.warnings.join(" | "))
  }

  const healthRes = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(15_000) })
  const healthJson = await healthRes.json().catch(() => ({}))
  console.log("\n[GET /api/health]", healthRes.status, healthJson.status || healthJson)
  if (healthJson?.status !== "healthy") {
    console.log("health_note:", "ambiente ainda nao esta healthy; verifique postgres, IA e embeddings")
  }

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
      ...authHeaders,
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

  if (!configRes.ok) process.exitCode = 1
  if (!healthRes.ok) process.exitCode = 1
  if (!orchRes.ok) process.exitCode = 1
  if (healthJson?.status === "unhealthy") process.exitCode = 1
  if (strict && configJson?.readiness?.readyForPilot !== true) process.exitCode = 1
  if (strict && healthJson?.status !== "healthy") process.exitCode = 1
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})

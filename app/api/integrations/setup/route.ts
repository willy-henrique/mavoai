/**
 * POST /api/integrations/setup
 *
 * Seed das integrações padrão no banco — MTalk, WillTalk, Mavo Gestão.
 * Lê as configurações do .env e faz upsert na tabela `integrations`.
 * Idempotente: pode ser chamado várias vezes sem duplicar registros.
 *
 * Protegido pelo token interno CEREBRO_INTERNAL_TOKEN.
 */

import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"

function checkInternalAuth(request: Request): boolean {
  const token = process.env.CEREBRO_INTERNAL_TOKEN
  if (!token) return true // sem token configurado → modo dev, permite tudo
  const auth = request.headers.get("authorization") || ""
  return auth === `Bearer ${token}`
}

interface IntegrationSeed {
  source_system: string
  name:          string
  description:   string
  base_url:      string
  webhook_url:   string
  auth_type:     string
  auth_token:    string
  outbound_active: boolean
  icon:          string
  tenant_id:     string
  rate_limit_per_minute: number
}

function buildSeeds(): IntegrationSeed[] {
  const seeds: IntegrationSeed[] = []

  // ── MTalk ──────────────────────────────────────────────────────────────────
  const mtalkBase  = process.env.MTALK_BASE_URL  || ""
  const mtalkToken = process.env.MTALK_API_TOKEN || ""
  seeds.push({
    source_system:         "mtalk",
    name:                  "MTalk",
    description:           "Plataforma de atendimento WhatsApp — recebe mensagens e responde via API",
    base_url:              mtalkBase,
    webhook_url:           mtalkBase ? `${mtalkBase}/backend/api/messages/send` : "",
    auth_type:             "bearer",
    auth_token:            mtalkToken,
    outbound_active:       !!(mtalkBase && mtalkToken),
    icon:                  "message-circle",
    tenant_id:             "default",
    rate_limit_per_minute: 120,
  })

  // ── WillTalk ───────────────────────────────────────────────────────────────
  // Suporta modo direto (WILLTALK_API_URL) ou webhook legado (WILLTALK_REPLY_WEBHOOK_URL)
  const willApiUrl    = process.env.WILLTALK_API_URL    || ""
  const willApiToken  = process.env.WILLTALK_API_TOKEN  || ""
  const willWebhook   = process.env.WILLTALK_REPLY_WEBHOOK_URL || ""
  const willToken     = process.env.WILLTALK_WEBHOOK_TOKEN || ""

  const willBaseUrl   = willApiUrl || willWebhook.replace(/\/api\/.*$/, "") || ""
  const willOutbound  = !!(willApiUrl && willApiToken) || !!(willWebhook)

  seeds.push({
    source_system:         "willtalk",
    name:                  "WillTalk",
    description:           "Integração WhatsApp via webhook — recebe e responde mensagens de suporte",
    base_url:              willBaseUrl,
    webhook_url:           willApiUrl
      ? `${willApiUrl.replace(/\/$/, "")}/backend/api/messages/send`
      : willWebhook,
    auth_type:             "bearer",
    auth_token:            willApiToken || willToken,
    outbound_active:       willOutbound,
    icon:                  "message-square",
    tenant_id:             "default",
    rate_limit_per_minute: 120,
  })

  // ── Mavo Gestão ────────────────────────────────────────────────────────────
  const mavoBase  = process.env.MAVO_GESTAO_BASE_URL  || ""
  const mavoToken = process.env.MAVO_GESTAO_API_TOKEN || ""
  seeds.push({
    source_system:         "mavo_gestao",
    name:                  "Mavo Gestão",
    description:           "ERP integrado — recebe chamados de suporte diretamente do sistema",
    base_url:              mavoBase,
    webhook_url:           mavoBase ? `${mavoBase}/api/webhooks/cerebro` : "",
    auth_type:             "bearer",
    auth_token:            mavoToken,
    outbound_active:       !!(mavoBase && mavoToken),
    icon:                  "database",
    tenant_id:             "default",
    rate_limit_per_minute: 60,
  })

  return seeds
}

export async function POST(request: Request) {
  if (!checkInternalAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const seeds = buildSeeds()
  const results: Array<{ source_system: string; status: string; id?: string }> = []

  for (const seed of seeds) {
    try {
      const result = await query(
        `INSERT INTO public.integrations (
          tenant_id, source_system, name, description,
          is_active, rate_limit_per_minute,
          base_url, webhook_url,
          auth_type, auth_token,
          outbound_active
        ) VALUES ($1, $2, $3, $4, true, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (tenant_id, source_system)
        DO UPDATE SET
          name                  = EXCLUDED.name,
          description           = EXCLUDED.description,
          is_active             = true,
          rate_limit_per_minute = EXCLUDED.rate_limit_per_minute,
          base_url              = CASE WHEN EXCLUDED.base_url  <> '' THEN EXCLUDED.base_url  ELSE integrations.base_url  END,
          webhook_url           = CASE WHEN EXCLUDED.webhook_url <> '' THEN EXCLUDED.webhook_url ELSE integrations.webhook_url END,
          auth_type             = EXCLUDED.auth_type,
          auth_token            = CASE WHEN EXCLUDED.auth_token <> '' THEN EXCLUDED.auth_token ELSE integrations.auth_token END,
          outbound_active       = EXCLUDED.outbound_active,
          updated_at            = NOW()
        RETURNING id`,
        [
          seed.tenant_id,
          seed.source_system,
          seed.name,
          seed.description,
          seed.rate_limit_per_minute,
          seed.base_url,
          seed.webhook_url,
          seed.auth_type,
          seed.auth_token,
          seed.outbound_active,
        ],
      )
      const id = result.rows[0]?.id
      results.push({ source_system: seed.source_system, status: "ok", id })
      logger.info("integration_seed_ok", { source_system: seed.source_system, id })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      results.push({ source_system: seed.source_system, status: `error: ${msg.slice(0, 120)}` })
      logger.error("integration_seed_erro", { source_system: seed.source_system, error: msg })
    }
  }

  const allOk = results.every(r => r.status === "ok")
  return NextResponse.json(
    { ok: allOk, integrations: results },
    { status: allOk ? 200 : 207 },
  )
}

// GET: retorna a config atual de cada integração (sem expor tokens)
export async function GET(request: Request) {
  if (!checkInternalAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  try {
    const result = await query(`
      SELECT
        id, tenant_id, source_system, name, description,
        is_active, rate_limit_per_minute,
        base_url, webhook_url, auth_type, outbound_active,
        CASE WHEN auth_token IS NOT NULL AND auth_token <> '' THEN true ELSE false END AS has_token,
        updated_at
      FROM public.integrations
      ORDER BY source_system
    `)
    return NextResponse.json({ data: result.rows })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

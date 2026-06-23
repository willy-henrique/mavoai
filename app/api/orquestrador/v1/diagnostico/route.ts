/**
 * POST /api/orquestrador/v1/diagnostico
 *
 * Endpoint de DIAGNÓSTICO / HEALTH-CHECK do roteamento + resolução, em UMA
 * chamada (one-shot). Diferente de /api/orquestrador/v1/mensagem, que é
 * stateful (triagem → menu → fila → investigação → resolução) e portanto não
 * roteia direto para um agente especialista numa única mensagem, este endpoint
 * exercita exatamente o caminho que o teste de regressão precisa medir:
 *
 *   1. resolver determinístico (resposta exata, sem LLM) — se casar, vence;
 *   2. senão, IA Router (classifyDomain) escolhe o agente + score;
 *   3. o agente especialista gera a resposta one-shot;
 *   4. se cair em fallback (domínio "geral"), devolve resposta segura de
 *      escopo — NUNCA inventa solução técnica.
 *
 * Resposta: { agente, dominio, score, strategy, deterministico, resposta, tempo_ms }
 *
 * Auth: usa o mesmo guard das integrações (validateIntegrationHeaders). Em dev
 * (INTEGRATION_AUTH_REQUIRED=false) roda sem token.
 */

import { validateIntegrationHeaders, enforceRateLimit } from "@/lib/integration-guard"
import { resolverDeterministico } from "@/lib/deterministic-resolver"
import { classifyDomain } from "@/lib/ia-router"
import { gerarTextoIAComAgente } from "@/lib/ai-provider"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  mensagem: z.string().min(1, "mensagem obrigatoria"),
  /** Tenant para carregar os agentes; default "auge" (onde os especialistas são semeados). */
  tenant_id: z.string().min(1).optional(),
})

const RESPOSTA_FALLBACK =
  "Não tenho essa informação na minha base de conhecimento do AUGE ERP. " +
  "Vou encaminhar para um atendente humano continuar com você."

export async function POST(request: Request) {
  const auth = await validateIntegrationHeaders(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const rate = await enforceRateLimit(auth.tenantId, auth.sourceSystem)
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = schema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { mensagem } = parsed.data
  const tenantId = parsed.data.tenant_id ?? (auth.tenantId !== "default" ? auth.tenantId : "auge")
  const t0 = Date.now()

  try {
    // 1. Resolver determinístico (resposta canônica, sem LLM).
    const det = resolverDeterministico(mensagem)
    if (det) {
      // Mesmo com match determinístico, roda o router para reportar o domínio
      // quando o padrão não traz domain embutido.
      const dominio = det.domain ?? (await classifyDomain(mensagem, tenantId)).domain
      return NextResponse.json({
        agente: dominio,
        dominio,
        score: 1,
        strategy: "deterministic",
        deterministico: true,
        errorKey: det.errorKey,
        resposta: det.solution,
        tempo_ms: Date.now() - t0,
      })
    }

    // 2. IA Router.
    const route = await classifyDomain(mensagem, tenantId)

    // 3. Fallback / domínio geral → resposta segura (não inventa).
    if (!route.agent) {
      return NextResponse.json({
        agente: "fallback",
        dominio: route.domain, // "geral"
        score: route.confidence,
        strategy: route.strategy,
        deterministico: false,
        resposta: RESPOSTA_FALLBACK,
        tempo_ms: Date.now() - t0,
      })
    }

    // 4. Agente especialista gera a resposta one-shot.
    const resposta = await gerarTextoIAComAgente(route.agent, route.agent.system_prompt, mensagem)

    return NextResponse.json({
      agente: route.domain,
      dominio: route.domain,
      score: route.confidence,
      strategy: route.strategy,
      deterministico: false,
      resposta,
      tempo_ms: Date.now() - t0,
    })
  } catch (error) {
    logger.error("diagnostico_failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      { error: "diagnostico_error", message: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    )
  }
}

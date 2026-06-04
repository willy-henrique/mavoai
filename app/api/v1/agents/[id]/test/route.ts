/**
 * POST /api/v1/agents/:id/test
 *
 * Executa o agente com um input de teste e devolve a resposta.
 * Registra o resultado em agent_test_runs para rastreabilidade.
 *
 * Auth: CEREBRO_INTERNAL_TOKEN (Bearer).
 */

import { NextResponse } from "next/server"
import { AGENT_IDS, loadAgentConfig, type AgentId } from "@/lib/agent-config"
import { query } from "@/lib/database/postgres-client-no-vector"
import { gerarTextoIA } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"
import { gerarTriagemIA } from "@/lib/triage-ai"
import { gerarSolucaoAutonoma } from "@/lib/resolution-engine"

export const dynamic = "force-dynamic"

function isAdminAuth(req: Request): boolean {
  const auth = req.headers.get("Authorization") || ""
  const expected = process.env.CEREBRO_INTERNAL_TOKEN || ""
  return !!expected && auth === `Bearer ${expected}`
}

function isValidAgentId(id: string): id is AgentId {
  return (AGENT_IDS as readonly string[]).includes(id)
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminAuth(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { id } = await params
  if (!isValidAgentId(id)) return NextResponse.json({ error: "agent_not_found" }, { status: 404 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const tenantId = (body.tenant_id as string | undefined) ?? "default"
  const t0 = Date.now()
  let output: Record<string, unknown> = {}
  let errorMsg: string | null = null

  try {
    const cfg = await loadAgentConfig(id, tenantId)

    switch (id) {
      case "triage": {
        const result = await gerarTriagemIA({
          mensagem_atual: String(body.message ?? ""),
          organization_id: tenantId,
          filas_disponiveis_json: body.queues ?? [],
          horario_comercial_aberto: true,
          tentativas_triagem: 0,
        })
        output = result as Record<string, unknown>
        break
      }

      case "resolution": {
        const answer = await gerarSolucaoAutonoma({
          problemText: String(body.message ?? ""),
          queueName: String(body.queue_name ?? "Suporte Geral"),
          attemptNumber: 1,
          previousSolutions: [],
          tenantId,
        })
        output = { answer }
        break
      }

      case "investigation":
      case "handoff":
      case "curator":
      case "vision":
      case "orchestrator": {
        // Playground genérico: injeta o system_prompt do agente + input livre
        const systemPrompt =
          cfg.system_prompt ??
          `Você é o agente ${id} do Cérebro Mavo AI. Responda à mensagem de teste abaixo.`
        const userMsg = String(body.message ?? "")
        const answer = await gerarTextoIA(systemPrompt, userMsg)
        output = { answer }
        break
      }

      default:
        return NextResponse.json({ error: "agent_not_testable" }, { status: 400 })
    }
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err)
  }

  const latencyMs = Date.now() - t0

  // Persiste o test run assincronamente (não bloqueia a resposta)
  query(
    `INSERT INTO public.agent_test_runs (agent_id, tenant_id, input, output, latency_ms, error)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      tenantId,
      JSON.stringify(body),
      JSON.stringify(output),
      latencyMs,
      errorMsg,
    ],
  ).catch(() => {/* silencia erro de log */})

  if (errorMsg) {
    return NextResponse.json({ ok: false, error: errorMsg, latency_ms: latencyMs }, { status: 500 })
  }

  return NextResponse.json({ ok: true, agent_id: id, output, latency_ms: latencyMs })
}

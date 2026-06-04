/**
 * GET /api/v1/agents
 *
 * Lista todos os agentes do Cérebro com status atual e configuração efetiva.
 * Auth: CEREBRO_INTERNAL_TOKEN (Bearer).
 */

import { NextResponse } from "next/server"
import { AGENT_IDS, AGENT_DEFAULTS, loadAgentConfig } from "@/lib/agent-config"

export const dynamic = "force-dynamic"

function isAdminAuth(req: Request): boolean {
  const auth = req.headers.get("Authorization") || ""
  const expected = process.env.CEREBRO_INTERNAL_TOKEN || ""
  return !!expected && auth === `Bearer ${expected}`
}

// Metadados estáticos de cada agente (espelha o AGENT_ROSTER do dashboard)
const AGENT_META: Record<string, { name: string; role: string; description: string; deps: string[] }> = {
  orchestrator: {
    name: "Orquestrador",
    role: "Controle de fluxo",
    description: "Rege todo o ciclo: menu → triagem → investigação → resolução autônoma → handoff humano.",
    deps: [],
  },
  triage: {
    name: "Triagem IA",
    role: "Classificação técnica",
    description: "Classifica chamados, define prioridade (S1–S4) e roteia para a fila correta via LLM.",
    deps: ["groq"],
  },
  investigation: {
    name: "Avaliador",
    role: "Qualidade de evidência",
    description: "Avalia cada turno de investigação: adequado, insuficiente ou fora do tema.",
    deps: ["groq"],
  },
  resolution: {
    name: "Motor de Resolução",
    role: "Resolução autônoma",
    description: "Tenta resolver em até N rodadas via RAG semântico + geração. Escala após esgotar.",
    deps: ["groq", "embedding"],
  },
  vision: {
    name: "Visão",
    role: "Análise de imagem",
    description: "Processa prints e fotos de equipamentos para extrair contexto técnico de suporte.",
    deps: ["groq"],
  },
  curator: {
    name: "Curador",
    role: "Gestão do conhecimento",
    description: "Extrai problema / causa / solução de conversas encerradas e popula a base RAG.",
    deps: ["groq", "embedding"],
  },
  handoff: {
    name: "Handoff",
    role: "Resumo para humanos",
    description: "Gera briefing estruturado ao escalar: contexto, tentativas e diagnóstico.",
    deps: ["groq"],
  },
}

export async function GET(request: Request) {
  if (!isAdminAuth(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const tenantId = url.searchParams.get("tenant_id") ?? "default"

  const agents = await Promise.all(
    AGENT_IDS.map(async (id) => {
      const cfg = await loadAgentConfig(id, tenantId)
      const meta = AGENT_META[id]
      return {
        id,
        name: meta.name,
        role: meta.role,
        description: meta.description,
        deps: meta.deps,
        enabled: cfg.enabled,
        has_prompt_override: cfg.system_prompt !== null,
        params: cfg.params,
        defaults: AGENT_DEFAULTS[id],
        updated_at: cfg.updated_at,
      }
    }),
  )

  return NextResponse.json({
    agents,
    total: agents.length,
    active: agents.filter((a) => a.enabled).length,
    tenant_id: tenantId,
  })
}

/**
 * lib/ia-router.ts
 *
 * Classifica a mensagem do usuário em um domínio especialista.
 * Estratégia 3 camadas:
 *   1. Score de keywords (O(n), sem LLM) — retorna se score > 0.7
 *   2. Score 0.4–0.7 → LLM desempata com prompt leve (~100 tokens)
 *   3. Score < 0.4 → domínio "geral"
 */

import { loadSpecialistAgentsCascade, type SpecialistAgent } from "@/lib/specialist-agent-store"
import { gerarTextoIA } from "@/lib/ai-provider"
import { logger } from "@/lib/logger"

export interface RouterResult {
  domain: string
  agent: SpecialistAgent | null
  confidence: number
  strategy: "keywords" | "llm" | "fallback"
}

const HIGH_THRESHOLD = 0.7
const LOW_THRESHOLD  = 0.4

// ─── Pontuação por keywords ───────────────────────────────────────────────────

function scoreKeywords(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const t = text.toLowerCase()
  const hits = keywords.filter((kw) => t.includes(kw.toLowerCase())).length
  // normalizado pelo raiz quadrada do total (penaliza agentes com pouquíssimas keywords)
  return hits / Math.sqrt(Math.max(keywords.length, 1))
}

// ─── Desempate via LLM ────────────────────────────────────────────────────────

async function llmClassify(
  text: string,
  candidates: Array<{ domain: string; name: string; keywords: string[] }>,
): Promise<string> {
  const list = candidates.map((c) =>
    `- ${c.domain}: ${c.name} (palavras: ${c.keywords.slice(0, 6).join(", ")})`
  ).join("\n")

  const system =
    "Você é um classificador de suporte técnico. Dado o texto do usuário, retorne APENAS o nome do domínio mais adequado (uma palavra, sem explicação)."

  const prompt =
    `Domínios disponíveis:\n${list}\n\nTexto do usuário: "${text.slice(0, 400)}"\n\nDomínio:`

  try {
    const resp = await gerarTextoIA(system, prompt)
    const domain = resp.trim().toLowerCase().split(/\s/)[0]
    if (candidates.some((c) => c.domain === domain)) return domain
  } catch (e) {
    logger.warn("ia_router_llm_error", { error: e instanceof Error ? e.message : String(e) })
  }
  return candidates[0].domain
}

// ─── Função principal ─────────────────────────────────────────────────────────

export async function classifyDomain(
  text: string,
  tenantId: string,
): Promise<RouterResult> {
  const agents = await loadSpecialistAgentsCascade(tenantId)

  if (agents.length === 0) {
    return { domain: "geral", agent: null, confidence: 0, strategy: "fallback" }
  }

  // 1. Score keyword para todos os agentes
  const scored = agents.map((a) => ({
    agent: a,
    score: scoreKeywords(text, a.keywords),
  })).sort((a, b) => b.score - a.score)

  const best = scored[0]

  // 2. Decisão por threshold
  if (best.score >= HIGH_THRESHOLD) {
    logger.info("ia_router_keywords", { domain: best.agent.domain, score: best.score })
    return {
      domain: best.agent.domain,
      agent: best.agent,
      confidence: Math.min(best.score, 1),
      strategy: "keywords",
    }
  }

  if (best.score >= LOW_THRESHOLD) {
    // Candidatos empatados ou próximos — LLM desempata
    const candidates = scored.filter((s) => s.score >= LOW_THRESHOLD)
    const domain = await llmClassify(
      text,
      candidates.map((c) => ({
        domain: c.agent.domain,
        name: c.agent.name,
        keywords: c.agent.keywords,
      })),
    )
    const winner = agents.find((a) => a.domain === domain) ?? best.agent
    logger.info("ia_router_llm", { domain: winner.domain, score: best.score })
    return {
      domain: winner.domain,
      agent: winner,
      confidence: 0.65,
      strategy: "llm",
    }
  }

  // 3. Fallback
  logger.info("ia_router_fallback", { topScore: best.score })
  return { domain: "geral", agent: null, confidence: best.score, strategy: "fallback" }
}

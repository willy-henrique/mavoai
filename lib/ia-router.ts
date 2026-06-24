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

/**
 * Normaliza para casar keyword sem depender de acento: "rejeição" e "rejeicao"
 * (typo comum do cliente) passam a bater. Mesma estratégia do resolver
 * determinístico (lib/deterministic-resolver), que antes era inconsistente com
 * o roteador — uma mensagem com acento errado caía no fallback.
 */
function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
}

/**
 * Conta quantas keywords do agente aparecem no texto do usuário.
 * (substring, sem acento e sem caixa — funciona para termos compostos como "tela preta")
 */
function countMatches(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0
  const t = normalize(text)
  return keywords.filter((kw) => t.includes(normalize(kw))).length
}

/**
 * Converte nº de keywords batidas em confiança [0,1) com retornos decrescentes.
 *
 * IMPORTANTE: a confiança depende SÓ de quantas keywords bateram — NUNCA do
 * tamanho do vocabulário do agente. A fórmula antiga (hits / √total) diluía o
 * score de agentes com lista rica de keywords: o PDV (13 keywords) batia
 * 1/√13 ≈ 0,28 num único acerto e caía no fallback (< 0,4). Penalizar vocabulário
 * é o inverso do que queremos — quanto mais sinônimos o agente cobre, melhor.
 *
 *   1 match → 0,55   2 → 0,69   3 → 0,76   4 → 0,81 …  (satura perto de 1)
 */
function confidenceFromMatches(matched: number): number {
  if (matched <= 0) return 0
  return 1 - 1 / (matched + 1.2)
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

  // 1. Score keyword para todos os agentes.
  // Ordena por confiança (nº de matches) e, em empate, pela especificidade
  // (fração do vocabulário batida) — assim o agente cujo termo é mais "central"
  // ganha o desempate sem que isso derrube agentes de vocabulário rico abaixo
  // do limiar.
  const scored = agents.map((a) => {
    const matched = countMatches(text, a.keywords)
    return {
      agent: a,
      matched,
      score: confidenceFromMatches(matched),
      specificity: a.keywords.length > 0 ? matched / a.keywords.length : 0,
    }
  }).sort((a, b) =>
    b.score - a.score || b.specificity - a.specificity,
  )

  const best = scored[0]

  // 2. Decisão por threshold
  if (best.score >= HIGH_THRESHOLD) {
    logger.info("ia_router_keywords", { domain: best.agent.domain, matched: best.matched, score: best.score })
    return {
      domain: best.agent.domain,
      agent: best.agent,
      confidence: Math.min(best.score, 1),
      strategy: "keywords",
    }
  }

  if (best.score >= LOW_THRESHOLD) {
    // Candidatos na faixa de desempate
    const candidates = scored.filter((s) => s.score >= LOW_THRESHOLD)

    // Só um candidato bateu keywords → roteia direto, sem gastar chamada de LLM.
    if (candidates.length === 1) {
      logger.info("ia_router_keywords_single", { domain: best.agent.domain, matched: best.matched, score: best.score })
      return {
        domain: best.agent.domain,
        agent: best.agent,
        confidence: best.score,
        strategy: "keywords",
      }
    }

    // Vários candidatos empatados ou próximos — LLM desempata
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

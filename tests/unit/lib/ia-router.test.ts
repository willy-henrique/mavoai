import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/specialist-agent-store", () => ({
  loadSpecialistAgentsCascade: vi.fn(),
}))

vi.mock("@/lib/ai-provider", () => ({
  gerarTextoIA: vi.fn(),
}))

import { classifyDomain } from "@/lib/ia-router"
import { loadSpecialistAgentsCascade } from "@/lib/specialist-agent-store"
import { gerarTextoIA } from "@/lib/ai-provider"

function agent(domain: string, keywords: string[], priority = 10) {
  return {
    id: domain,
    tenant_id: "auge",
    domain,
    name: `Agente ${domain}`,
    description: null,
    system_prompt: `prompt ${domain}`,
    keywords,
    model_base_url: null,
    model_name: null,
    priority,
    is_active: true,
    created_at: "",
    updated_at: "",
  }
}

// Réplica das listas de keywords semeadas (scripts/seed-especialistas.mjs)
const PDV = agent("pdv", ["pdv", "caixa", "cupom", "sangria", "suprimento", "ecf", "sat", "mfe", "concentrador", "tillit", "nfce", "contingência", "crediário"])
const FISCAL = agent("fiscal", ["nfe", "nfce", "nota fiscal", "sefaz", "certificado", "rejeição", "rejeicao", "danfe", "xml", "cfop", "cst", "csosn", "icms", "sped", "cce", "benefício", "semcbenef"])

describe("classifyDomain — correção do roteador (Problema 2)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(loadSpecialistAgentsCascade).mockResolvedValue([PDV, FISCAL] as never)
  })

  it("roteia PDV com UMA única keyword (regressão do score 0,28 → fallback)", async () => {
    const r = await classifyDomain("o pdv não abre", "auge")
    expect(r.domain).toBe("pdv")
    expect(r.strategy).toBe("keywords")
    // antes: 1/√13 ≈ 0,28 (< 0,4, caía em fallback). agora ≈ 0,55.
    expect(r.confidence).toBeGreaterThanOrEqual(0.4)
    expect(gerarTextoIA).not.toHaveBeenCalled()
  })

  it.each([["caixa travado"], ["erro no concentrador"], ["preciso fazer uma sangria"]])(
    "roteia '%s' direto para PDV sem chamar LLM",
    async (msg) => {
      const r = await classifyDomain(msg, "auge")
      expect(r.domain).toBe("pdv")
      expect(gerarTextoIA).not.toHaveBeenCalled()
    },
  )

  it("agente de vocabulário rico NÃO é penalizado — fiscal bate com 1 keyword", async () => {
    const r = await classifyDomain("recebi uma rejeição da sefaz", "auge")
    expect(r.domain).toBe("fiscal")
    expect(r.confidence).toBeGreaterThanOrEqual(0.4)
  })

  it("dois domínios empatados → desempata via LLM", async () => {
    vi.mocked(gerarTextoIA).mockResolvedValue("fiscal")
    // "sat" é keyword de PDV e "csosn" de fiscal → 2 candidatos na faixa
    const r = await classifyDomain("sat com csosn errado", "auge")
    expect(gerarTextoIA).toHaveBeenCalledTimes(1)
    expect(r.domain).toBe("fiscal")
  })

  it("sem nenhuma keyword → fallback geral", async () => {
    const r = await classifyDomain("bom dia, tudo bem?", "auge")
    expect(r.domain).toBe("geral")
    expect(r.strategy).toBe("fallback")
    expect(r.agent).toBeNull()
  })

  it("confiança cresce com mais keywords batidas (retornos decrescentes)", async () => {
    const um = await classifyDomain("sangria", "auge")
    const dois = await classifyDomain("sangria e suprimento no caixa", "auge")
    expect(dois.confidence).toBeGreaterThan(um.confidence)
  })
})

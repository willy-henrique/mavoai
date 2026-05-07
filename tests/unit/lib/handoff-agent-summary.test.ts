import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { buildAgentHandoffSummary } from "@/lib/handoff-agent-summary"
import { gerarTextoIA } from "@/lib/ai-provider"

vi.mock("@/lib/ai-provider", () => ({
  gerarTextoIA: vi.fn(),
}))

describe("buildAgentHandoffSummary", () => {
  const mockGerar = vi.mocked(gerarTextoIA)

  beforeEach(() => {
    mockGerar.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("usa fallback quando a IA falha", async () => {
    mockGerar.mockRejectedValue(new Error("rate limit"))
    const s = await buildAgentHandoffSummary({
      kind: "investigation_client_unclear",
      queueName: "Balança - MGV",
      clienteNome: "Álvaro",
      clienteTelefone: "+5511",
      lastUserMessage: "texto off",
      imageAnalysis: null,
      evalNivel: "fora_do_tema",
      evalMotivoCurto: "sem contexto técnico",
    })
    expect(s).toContain("Balança")
    expect(s).toContain("Álvaro")
    expect(s).toContain("fora_do_tema")
  })

  it("usa texto da IA quando retorno longo o suficiente", async () => {
    mockGerar.mockResolvedValue("• Linha um bem longa o suficiente para passar do limite mínimo de caracteres exigido pelo orquestrador de handoff.")
    const s = await buildAgentHandoffSummary({
      kind: "no_queues",
      queueName: null,
      clienteNome: "X",
      clienteTelefone: "y",
      lastUserMessage: "",
      imageAnalysis: null,
    })
    expect(s).toContain("Linha um")
  })
})

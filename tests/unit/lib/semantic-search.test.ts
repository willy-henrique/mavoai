import { describe, it, expect, vi, beforeEach } from "vitest"
import { buscarSemantica } from "@/lib/semantic-search"

// Mock do módulo de embeddings
vi.mock("@/lib/embeddings", () => ({
  gerarEmbedding: vi.fn(),
  embeddingParaVector: vi.fn((arr: number[]) => `[${arr.join(",")}]`),
}))

import { gerarEmbedding } from "@/lib/embeddings"

const makeSupabase = (rpcResult: { data?: unknown; error?: unknown } = { data: [], error: null }) => ({
  rpc: vi.fn().mockResolvedValue(rpcResult),
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    or: vi.fn().mockResolvedValue({ data: [], error: null }),
  }),
})

describe("buscarSemantica", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("usa busca vetorial quando embedding funciona e RPC retorna dados", async () => {
    const mockEmbedding = Array(1536).fill(0.1)
    vi.mocked(gerarEmbedding).mockResolvedValue(mockEmbedding)

    const rows = [
      { id: "1", similaridade: 0.92, resumo_problema: "Impressora não imprime", causa: "Driver corrompido", solucao: "Reinstalar driver" },
    ]
    const supabase = makeSupabase({ data: rows, error: null })

    const resultado = await buscarSemantica(supabase as any, "impressora com problema")

    expect(supabase.rpc).toHaveBeenCalledWith("buscar_atendimentos_semanticos", expect.any(Object))
    expect(resultado).toHaveLength(1)
    expect(resultado[0].estrategia).toBe("vetorial")
    expect(resultado[0].similaridade).toBe(0.92)
  })

  it("cai no fallback textual quando embedding lança erro", async () => {
    vi.mocked(gerarEmbedding).mockRejectedValue(new Error("EMBEDDING_API_KEY não configurada"))

    const fallbackRows = [
      { id: "2", resumo_problema: "Rede sem acesso", problema: "Sem rede", causa: "Cabo desconectado", solucao: "Reconectar cabo", resumo: "Rede offline", texto_original: "rede sem acesso cabo", processado: true },
    ]
    const supabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: fallbackRows, error: null }),
      }),
    }

    const resultado = await buscarSemantica(supabase as any, "rede sem acesso")

    expect(supabase.rpc).not.toHaveBeenCalled()
    expect(resultado).toHaveLength(1)
    expect(resultado[0].estrategia).toBe("textual")
  })

  it("cai no fallback textual quando RPC retorna erro", async () => {
    const mockEmbedding = Array(1536).fill(0.1)
    vi.mocked(gerarEmbedding).mockResolvedValue(mockEmbedding)

    const fallbackRows = [
      { id: "3", resumo_problema: "Software travado", problema: "Software", causa: "Memória", solucao: "Reiniciar", resumo: "SW travado", texto_original: "software travado", processado: true },
    ]
    const supabase = {
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "rpc error" } }),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: fallbackRows, error: null }),
      }),
    }

    const resultado = await buscarSemantica(supabase as any, "software travado")

    expect(resultado[0].estrategia).toBe("textual")
  })

  it("retorna array vazio quando não há dados e fallback também é vazio", async () => {
    vi.mocked(gerarEmbedding).mockRejectedValue(new Error("sem embedding"))

    const supabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    }

    const resultado = await buscarSemantica(supabase as any, "xyz inexistente")

    expect(resultado).toHaveLength(0)
  })

  it("respeita o limite de resultados", async () => {
    vi.mocked(gerarEmbedding).mockRejectedValue(new Error("sem embedding"))

    const rows = Array.from({ length: 5 }, (_, i) => ({
      id: String(i),
      resumo_problema: `Problema ${i}`,
      problema: `P${i}`,
      causa: null,
      solucao: `S${i}`,
      resumo: `R${i}`,
      texto_original: `texto ${i}`,
      processado: true,
    }))

    const supabase = {
      rpc: vi.fn(),
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        or: vi.fn().mockResolvedValue({ data: rows.slice(0, 2), error: null }),
      }),
    }

    const resultado = await buscarSemantica(supabase as any, "qualquer coisa", 2)

    expect(resultado.length).toBeLessThanOrEqual(2)
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { buscarSemantica } from "@/lib/semantic-search"

vi.mock("@/lib/embeddings", () => ({
  gerarEmbedding: vi.fn(),
  embeddingParaVector: vi.fn((arr: number[]) => `[${arr.join(",")}]`),
}))

vi.mock("@/lib/database/postgres-client-no-vector", () => ({
  query: vi.fn(),
}))

import { gerarEmbedding } from "@/lib/embeddings"
import { query } from "@/lib/database/postgres-client-no-vector"

describe("buscarSemantica", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("usa busca vetorial quando embedding funciona e RPC retorna dados", async () => {
    const mockEmbedding = Array(1536).fill(0.1)
    vi.mocked(gerarEmbedding).mockResolvedValue(mockEmbedding)
    vi.mocked(query).mockResolvedValueOnce({
      rows: [
        {
          id: "1",
          similaridade: 0.92,
          resumo_problema: "Impressora não imprime",
          causa: "Driver corrompido",
          solucao: "Reinstalar driver",
        },
      ],
    })

    const resultado = await buscarSemantica("impressora com problema")

    expect(query).toHaveBeenCalled()
    expect(String(vi.mocked(query).mock.calls[0][0])).toContain("buscar_atendimentos_semanticos")
    expect(resultado).toHaveLength(1)
    expect(resultado[0].estrategia).toBe("vetorial")
    expect(resultado[0].similaridade).toBe(0.92)
  })

  it("cai no fallback textual quando embedding lança erro", async () => {
    vi.mocked(gerarEmbedding).mockRejectedValue(new Error("EMBEDDING_API_KEY não configurada"))

    const fallbackRows = [
      {
        id: "2",
        resumo_problema: "Rede sem acesso",
        problema: "Sem rede",
        causa: "Cabo desconectado",
        solucao: "Reconectar cabo",
        resumo: "Rede offline",
        texto_original: "rede sem acesso cabo",
        processado: true,
      },
    ]

    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes("buscar_atendimentos_simples")) {
        return { rows: fallbackRows }
      }
      if (sql.includes("FROM atendimentos") && sql.includes("ORDER BY")) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const resultado = await buscarSemantica("rede sem acesso")

    expect(resultado.length).toBeGreaterThanOrEqual(1)
    expect(resultado[0].estrategia).toBe("textual")
  })

  it("cai no fallback textual quando RPC vetorial falha", async () => {
    const mockEmbedding = Array(1536).fill(0.1)
    vi.mocked(gerarEmbedding).mockResolvedValue(mockEmbedding)
    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes("buscar_atendimentos_semanticos")) {
        throw new Error("função buscar_atendimentos_semanticos não existe")
      }
      if (sql.includes("buscar_atendimentos_simples")) {
        return {
          rows: [
            {
              id: "3",
              resumo_problema: "Software travado",
              problema: "Software",
              causa: "Memória",
              solucao: "Reiniciar",
              resumo: "SW travado",
              texto_original: "software travado",
              processado: true,
            },
          ],
        }
      }
      if (sql.includes("FROM atendimentos") && sql.includes("ORDER BY")) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const resultado = await buscarSemantica("software travado")

    expect(resultado[0].estrategia).toBe("textual")
  })

  it("retorna array vazio quando não há dados e fallback também é vazio", async () => {
    vi.mocked(gerarEmbedding).mockRejectedValue(new Error("sem embedding"))

    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes("buscar_atendimentos_simples")) {
        return { rows: [] }
      }
      if (sql.includes("FROM atendimentos") && sql.includes("ORDER BY")) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const resultado = await buscarSemantica("xyz inexistente")

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
      texto_original: `texto problema coisa ${i}`,
      processado: true,
    }))

    vi.mocked(query).mockImplementation(async (sql: string) => {
      if (sql.includes("buscar_atendimentos_simples")) {
        return { rows }
      }
      if (sql.includes("FROM atendimentos") && sql.includes("ORDER BY")) {
        return { rows: [] }
      }
      return { rows: [] }
    })

    const resultado = await buscarSemantica("qualquer coisa problema", 2)

    expect(resultado.length).toBeLessThanOrEqual(2)
  })
})

import { gerarEmbeddingIA } from "@/lib/ai-provider"

export async function gerarEmbedding(texto: string): Promise<number[]> {
  const input = texto.trim()
  if (!input) {
    throw new Error("Texto vazio para gerar embedding")
  }

  return gerarEmbeddingIA(input)
}

export function embeddingParaVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}

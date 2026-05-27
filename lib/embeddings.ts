import { gerarEmbeddingIA } from "@/lib/ai-provider"

export async function gerarEmbedding(texto: string): Promise<number[]> {
  const input = texto.trim()
  if (!input) {
    throw new Error("Texto vazio para gerar embedding")
  }
  // "retrieval.query" = embedding otimizado para busca (Jina/Matryoshka); ignorado pelo OpenAI
  return gerarEmbeddingIA(input, "retrieval.query")
}

export function embeddingParaVector(embedding: number[]): string {
  return `[${embedding.join(",")}]`
}

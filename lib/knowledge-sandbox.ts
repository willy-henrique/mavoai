/**
 * lib/knowledge-sandbox.ts
 *
 * Modo Comparativo do Gerente de Curadoria: antes de PUBLICAR um item (rascunho
 * ou em_teste), simula lado a lado como a IA responderia HOJE (sem o item) vs.
 * como responderia SE o item estivesse publicado. Evita publicar algo que na
 * prática não muda ou piora a resposta.
 */

import { buscarSemantica, type ResultadoSemantico } from "@/lib/semantic-search"
import { gerarRespostaComCasos } from "@/lib/assisted-response"
import type { KnowledgeItem } from "@/lib/knowledge-curation"

export interface ResultadoSandbox {
  pergunta: string
  respostaAtual: string
  respostaComItem: string
  casosUsadosAtual: number
  casosUsadosComItem: number
}

/** Representa o item candidato como se já fosse o melhor match do RAG (pós-publicação). */
function itemComoCaso(item: KnowledgeItem): ResultadoSemantico {
  return {
    id: item.id,
    similaridade: 0.95,
    resumo_problema: item.pergunta,
    causa: item.intencao,
    solucao: item.resposta_oficial,
    estrategia: "curado",
  }
}

/**
 * Roda a comparação. `perguntaTeste` permite o gerente testar com uma pergunta
 * diferente da original (ex.: uma variação de como o cliente pode perguntar);
 * por padrão usa a própria `pergunta` do item.
 */
export async function simularPublicacao(
  item: KnowledgeItem,
  perguntaTeste?: string,
): Promise<ResultadoSandbox> {
  const pergunta = (perguntaTeste?.trim() || item.pergunta).slice(0, 2000)

  const casosReais = await buscarSemantica(pergunta, 5, item.tenant_id)
  // Remove o próprio item da busca real (caso já esteja publicado) pra comparação justa.
  const semItem = casosReais.filter((c) => c.id !== item.id)
  const comItem = [itemComoCaso(item), ...semItem].slice(0, 5)

  const [atual, comOItem] = await Promise.all([
    gerarRespostaComCasos(pergunta, "cliente", semItem),
    gerarRespostaComCasos(pergunta, "cliente", comItem),
  ])

  return {
    pergunta,
    respostaAtual: atual.resposta,
    respostaComItem: comOItem.resposta,
    casosUsadosAtual: semItem.length,
    casosUsadosComItem: comItem.length,
  }
}

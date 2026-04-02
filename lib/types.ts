export interface Categoria {
  id: string
  nome: string
  descricao: string | null
  created_at: string
}

export interface Atendimento {
  id: string
  ticket_externo?: string | null
  canal?: string | null
  cliente: string
  tecnico: string
  data_atendimento: string
  texto_original: string
  resumo_problema?: string | null
  resumo: string | null
  problema: string | null
  causa: string | null
  solucao: string | null
  categoria?: string | null
  categoria_id: string | null
  embedding: string | null
  processado: boolean
  created_at: string
  updated_at: string
  categorias?: Categoria
}

export interface AtendimentoInput {
  cliente: string
  tecnico: string
  texto_original: string
  data_atendimento?: string
}

export interface ProcessedAtendimento {
  resumo: string
  problema: string
  causa: string
  solucao: string
  categoria: string
}

export interface SearchResult extends Atendimento {
  similarity?: number
}

export interface ResultadoBuscaSemantica {
  id: string
  similaridade: number
  resumo_problema: string
  causa: string | null
  solucao: string | null
  estrategia?: "vetorial" | "textual"
  score_lexical?: number
}

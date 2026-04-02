// ─── Configuração do cliente ───────────────────────────────────────────────

export interface CerebroClientConfig {
  /** URL base do Cérebro. Ex: "http://localhost:3000" ou "https://cerebro.empresa.com" */
  baseUrl: string
  /** Bearer token configurado em CEREBRO_INGEST_TOKEN */
  token: string
  /** Identificador do tenant/organização. Default: "default" */
  tenantId?: string
  /** Nome do sistema que está integrando. Ex: "erp-x", "crm-salesforce" */
  sourceSystem?: string
  /** Timeout em ms para cada requisição. Default: 30000 */
  timeout?: number
}

// ─── Ingestão ─────────────────────────────────────────────────────────────

export interface EventoIngestao {
  /** ID único do ticket no sistema de origem */
  ticket_id: string
  /** Nome do cliente/empresa */
  cliente: string
  /** Canal de origem: "whatsapp", "email", "erp", "api", etc. */
  canal?: string
  /** Texto completo do problema relatado */
  mensagens: string
  /** Nome do técnico responsável */
  tecnico?: string
  /** ISO timestamp do evento na origem */
  data_evento?: string
  /** Metadados de rastreabilidade (opcional — gerados automaticamente se omitido) */
  metadata?: {
    sourceSystem?: string
    sourceEntityId?: string
    tenantId?: string
    ingestionId?: string
    tags?: string[]
  }
}

export interface ResultadoIngestao {
  /** ID do atendimento criado no Cérebro */
  atendimento_id: string
  status: "ok"
}

// ─── Busca Semântica ───────────────────────────────────────────────────────

export interface ResultadoBusca {
  id: string
  similaridade: number
  resumo_problema: string
  causa: string | null
  solucao: string | null
  estrategia: "vetorial" | "textual"
  score_lexical?: number
}

export interface RespostaBusca {
  resultados: ResultadoBusca[]
  tipo_busca: "semantica" | "textual"
}

// ─── Query Unificada ───────────────────────────────────────────────────────

export type NivelConfianca = "alta" | "media" | "baixa"
export type Audiencia = "atendente" | "cliente"

export interface CasoUtilizado {
  id: string
  resumo_problema: string
  similaridade: number
  estrategia: "vetorial" | "textual"
}

export interface ResultadoQuery {
  /** Resposta gerada pela IA com diagnóstico e passos práticos */
  resposta: string
  /** Nível de confiança baseado na similaridade dos casos encontrados */
  confianca: NivelConfianca
  /** Audiência para qual a resposta foi gerada */
  audience: Audiencia
  /** Casos históricos utilizados para gerar a resposta */
  casos: CasoUtilizado[]
}

// ─── Health ───────────────────────────────────────────────────────────────

export type StatusSistema = "healthy" | "degraded" | "unhealthy"

export interface HealthStatus {
  status: StatusSistema
  supabase: boolean
  groq: boolean
  embedding: boolean
  integrations: {
    configured: number
    active: number
  }
  timestamp: string
}

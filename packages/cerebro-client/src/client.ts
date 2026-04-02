import type {
  CerebroClientConfig,
  EventoIngestao,
  ResultadoIngestao,
  ResultadoBusca,
  RespostaBusca,
  ResultadoQuery,
  Audiencia,
  HealthStatus,
} from "./types"
import {
  CerebroError,
  CerebroAuthError,
  CerebroDuplicateError,
  CerebroIAIndisponivel,
  CerebroNetworkError,
  CerebroRateLimitError,
  CerebroTimeoutError,
  CerebroValidationError,
} from "./errors"

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_TENANT_ID = "default"
const DEFAULT_SOURCE_SYSTEM = "cerebro-client-sdk"

export class CerebroClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly tenantId: string
  private readonly sourceSystem: string
  private readonly timeout: number

  constructor(config: CerebroClientConfig) {
    if (!config.baseUrl) throw new CerebroValidationError("baseUrl é obrigatório")
    if (!config.token) throw new CerebroValidationError("token é obrigatório")

    this.baseUrl = config.baseUrl.replace(/\/$/, "")
    this.token = config.token
    this.tenantId = config.tenantId ?? DEFAULT_TENANT_ID
    this.sourceSystem = config.sourceSystem ?? DEFAULT_SOURCE_SYSTEM
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT_MS
  }

  // ─── Ingestão ─────────────────────────────────────────────────────────

  /**
   * Ingere um ticket de suporte no Cérebro.
   * O Cérebro processa assincronamente com IA e gera embedding vetorial.
   *
   * @throws {CerebroDuplicateError} se o mesmo ingestionId já foi processado
   * @throws {CerebroValidationError} se campos obrigatórios estiverem ausentes
   * @throws {CerebroAuthError} se o token for inválido
   */
  async ingest(evento: EventoIngestao): Promise<ResultadoIngestao> {
    const ingestionId =
      evento.metadata?.ingestionId ??
      `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const payload = {
      ...evento,
      metadata: {
        sourceSystem: this.sourceSystem,
        sourceEntityId: evento.metadata?.sourceEntityId ?? evento.ticket_id,
        tenantId: this.tenantId,
        ingestionId,
        ...evento.metadata,
      },
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.token}`,
      "X-Source-System": payload.metadata.sourceSystem,
      "X-Source-Entity-Id": payload.metadata.sourceEntityId,
      "X-Tenant-Id": payload.metadata.tenantId,
      "X-Ingestion-Id": ingestionId,
    }

    const data = await this._fetch<{ status: string; atendimento_id?: string; dedupKey?: string }>(
      "/api/ingestao/v1/events",
      { method: "POST", headers, body: payload }
    )

    if (data.status === "duplicate_ignored") {
      throw new CerebroDuplicateError(data.dedupKey)
    }

    return { atendimento_id: data.atendimento_id!, status: "ok" }
  }

  // ─── Busca Semântica ──────────────────────────────────────────────────

  /**
   * Busca casos similares ao texto informado usando embeddings vetoriais.
   * Cai automaticamente em busca textual se embeddings não estiverem disponíveis.
   *
   * @param texto - Descrição do problema a buscar
   * @param limite - Número máximo de resultados (default: 3)
   */
  async search(texto: string, limite = 3): Promise<RespostaBusca> {
    if (!texto?.trim()) throw new CerebroValidationError("texto é obrigatório para busca")

    return this._fetch<RespostaBusca>("/api/busca-semantica", {
      method: "POST",
      body: { texto: texto.trim(), limite },
    })
  }

  // ─── Query Unificada ──────────────────────────────────────────────────

  /**
   * Busca casos similares E gera resposta assistida por IA em uma única chamada.
   * Ideal para integrar em chatbots, n8n, automações.
   *
   * @param texto - Descrição do problema
   * @param audience - "atendente" (técnico, linguagem detalhada) ou "cliente" (simples e cordial)
   * @throws {CerebroIAIndisponivel} se as chaves de IA não estiverem configuradas no servidor
   * @throws {CerebroRateLimitError} se o provedor de IA estiver com rate limit
   */
  async query(texto: string, audience: Audiencia = "atendente"): Promise<ResultadoQuery> {
    if (!texto?.trim()) throw new CerebroValidationError("texto é obrigatório para query")

    return this._fetch<ResultadoQuery>("/api/query/v1", {
      method: "POST",
      body: { texto: texto.trim(), audience },
    })
  }

  // ─── Health ───────────────────────────────────────────────────────────

  /**
   * Verifica o status de saúde do Cérebro.
   * Útil para health checks em pipelines de CI/CD e monitoramento.
   */
  async health(): Promise<HealthStatus> {
    return this._fetch<HealthStatus>("/api/health", { method: "GET" })
  }

  // ─── Internals ────────────────────────────────────────────────────────

  private async _fetch<T>(
    path: string,
    options: {
      method: "GET" | "POST"
      headers?: Record<string, string>
      body?: unknown
    }
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeout)

    const defaultHeaders: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    }

    let response: Response
    try {
      response = await fetch(url, {
        method: options.method,
        headers: { ...defaultHeaders, ...(options.headers ?? {}) },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new CerebroTimeoutError(this.timeout)
      }
      throw new CerebroNetworkError(err)
    } finally {
      clearTimeout(timer)
    }

    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = null
    }

    if (response.ok) return body as T

    // Mapear códigos HTTP para erros específicos
    const msg =
      (body && typeof body === "object" && "error" in body
        ? String((body as { error: unknown }).error)
        : null) ??
      (body && typeof body === "object" && "mensagem" in body
        ? String((body as { mensagem: unknown }).mensagem)
        : null) ??
      `HTTP ${response.status}`

    switch (response.status) {
      case 400:
        throw new CerebroValidationError(msg)
      case 401:
        throw new CerebroAuthError(msg)
      case 409:
        throw new CerebroDuplicateError(
          (body as { dedupKey?: string } | null)?.dedupKey
        )
      case 429:
        throw new CerebroRateLimitError(msg)
      case 503:
        throw new CerebroIAIndisponivel(msg)
      default:
        throw new CerebroError(msg, response.status, body)
    }
  }
}

/**
 * Erro base do SDK do Cérebro.
 * Todos os erros específicos herdam desta classe.
 */
export class CerebroError extends Error {
  /** Código HTTP da resposta (quando aplicável) */
  readonly statusCode?: number
  /** Corpo da resposta de erro */
  readonly body?: unknown

  constructor(message: string, statusCode?: number, body?: unknown) {
    super(message)
    this.name = "CerebroError"
    this.statusCode = statusCode
    this.body = body
  }
}

/**
 * Erro de autenticação (HTTP 401).
 * Token ausente, inválido ou expirado.
 */
export class CerebroAuthError extends CerebroError {
  constructor(message = "Token de autenticação inválido ou ausente") {
    super(message, 401)
    this.name = "CerebroAuthError"
  }
}

/**
 * Erro de rate limiting (HTTP 429).
 * Muitas requisições em um curto período.
 */
export class CerebroRateLimitError extends CerebroError {
  /** Sugestão de tempo de espera em milissegundos antes de tentar novamente */
  readonly retryAfterMs: number

  constructor(message = "Limite de requisições atingido", retryAfterMs = 15000) {
    super(message, 429)
    this.name = "CerebroRateLimitError"
    this.retryAfterMs = retryAfterMs
  }
}

/**
 * Evento duplicado (HTTP 409).
 * O ingestionId já foi processado — não é necessário reenviar.
 */
export class CerebroDuplicateError extends CerebroError {
  readonly dedupKey?: string

  constructor(dedupKey?: string) {
    super("Evento duplicado — já foi processado anteriormente", 409)
    this.name = "CerebroDuplicateError"
    this.dedupKey = dedupKey
  }
}

/**
 * Erro de validação (HTTP 400).
 * Payload inválido ou campos obrigatórios ausentes.
 */
export class CerebroValidationError extends CerebroError {
  constructor(message: string) {
    super(message, 400)
    this.name = "CerebroValidationError"
  }
}

/**
 * IA não configurada (HTTP 503).
 * Chaves de API de IA ausentes no servidor.
 */
export class CerebroIAIndisponivel extends CerebroError {
  constructor(message = "IA não configurada no servidor do Cérebro") {
    super(message, 503)
    this.name = "CerebroIAIndisponivel"
  }
}

/**
 * Erro de timeout na requisição.
 */
export class CerebroTimeoutError extends CerebroError {
  constructor(timeoutMs: number) {
    super(`Requisição excedeu o timeout de ${timeoutMs}ms`)
    this.name = "CerebroTimeoutError"
  }
}

/**
 * Erro de rede (sem conexão, servidor inacessível, etc.)
 */
export class CerebroNetworkError extends CerebroError {
  constructor(cause: unknown) {
    const msg = cause instanceof Error ? cause.message : String(cause)
    super(`Erro de rede ao contactar o Cérebro: ${msg}`)
    this.name = "CerebroNetworkError"
  }
}

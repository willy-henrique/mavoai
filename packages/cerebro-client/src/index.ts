export { CerebroClient } from "./client"

export type {
  CerebroClientConfig,
  EventoIngestao,
  ResultadoIngestao,
  ResultadoBusca,
  RespostaBusca,
  ResultadoQuery,
  CasoUtilizado,
  Audiencia,
  NivelConfianca,
  HealthStatus,
  StatusSistema,
} from "./types"

export {
  CerebroError,
  CerebroAuthError,
  CerebroRateLimitError,
  CerebroDuplicateError,
  CerebroValidationError,
  CerebroIAIndisponivel,
  CerebroTimeoutError,
  CerebroNetworkError,
} from "./errors"

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogContext {
  traceId?: string
  tenantId?: string
  sourceSystem?: string
  durationMs?: number
  atendimentoId?: string
  ticketId?: string
  endpoint?: string
  [key: string]: unknown
}

interface LogEntry extends LogContext {
  level: LogLevel
  message: string
  timestamp: string
}

function emit(level: LogLevel, message: string, context?: LogContext): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...context,
  }

  // Em produção, stdout é coletado pelo Vercel Logs / qualquer agregador
  // O formato JSON permite filtrar por campo (ex: level=error, tenantId=X)
  const output = JSON.stringify(entry)

  if (level === "error") {
    console.error(output)
  } else if (level === "warn") {
    console.warn(output)
  } else {
    console.log(output)
  }
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("debug", message, context),
  info: (message: string, context?: LogContext) => emit("info", message, context),
  warn: (message: string, context?: LogContext) => emit("warn", message, context),
  error: (message: string, context?: LogContext) => emit("error", message, context),
}

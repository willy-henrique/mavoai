import { normalizeSourceSystem } from "@/lib/integration-sources"

export type CanonicalIntegrationEvent = {
  ticket_id: string
  cliente: string
  canal: string
  mensagens: string
  tecnico: string
  data_evento: string
  metadata: {
    sourceSystem: string
    sourceEntityId: string
    tenantId: string
    ingestionId: string
    sourceTimestamp?: string
    tags?: string[]
  }
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as UnknownRecord
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value)
    }
  }
  return ""
}

function toText(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  if (Array.isArray(value)) {
    return value.map((item) => toText(item)).filter(Boolean).join("\n").trim()
  }
  const record = asRecord(value)
  if (!record) return ""

  return pickFirstString(
    record.text,
    record.body,
    record.content,
    record.message,
    record.description,
    record.descricao,
    record.observacao,
    record.observacoes,
  )
}

function buildTicketId(sourcePrefix: string, candidate: string) {
  return candidate || `${sourcePrefix}-${Date.now()}`
}

function buildIngestionId(sourcePrefix: string, candidate: string, ticketId: string) {
  return candidate || `${sourcePrefix}-${ticketId}-${Date.now()}`
}

function joinNonEmpty(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("\n\n")
}

export function adaptMtalkPayload(raw: unknown): CanonicalIntegrationEvent {
  const data = asRecord(raw) || {}
  const contact = asRecord(data.contact) || asRecord(data.cliente) || asRecord(data.customer) || {}
  const message = asRecord(data.message) || asRecord(data.last_message) || {}
  const conversation = asRecord(data.conversation) || {}
  const organization = asRecord(data.organization) || {}

  const sourceSystem = normalizeSourceSystem(
    pickFirstString(data.source_system, data.sourceSystem, "mtalk"),
    "mtalk",
  )
  const ticketId = buildTicketId(
    "mtalk",
    pickFirstString(
      data.ticket_id,
      data.ticketId,
      data.conversation_id,
      data.conversationId,
      conversation.id,
      data.chat_id,
      data.id,
    ),
  )
  const cliente = pickFirstString(
    contact.nome,
    contact.name,
    contact.full_name,
    contact.fullName,
    data.cliente_nome,
    data.customer_name,
    data.nome,
  ) || "Cliente MTalk"
  const tenantId =
    pickFirstString(
      data.tenant_id,
      data.tenantId,
      data.organization_id,
      data.organizationId,
      organization.id,
      data.workspace_id,
      data.account_id,
    ) || "mtalk"
  const sourceEntityId =
    pickFirstString(
      data.event_id,
      data.eventId,
      message.id,
      data.message_id,
      data.messageId,
      data.id,
      ticketId,
    ) || ticketId
  const mensagens =
    joinNonEmpty([
      toText(data.mensagens),
      toText(data.message),
      toText(message.text),
      toText(message.body),
      toText(message.content),
      toText(data.body),
      toText(data.content),
    ]) || ""
  const canal = pickFirstString(
    data.canal,
    data.channel,
    conversation.channel,
    message.channel,
    "whatsapp",
  )
  const tecnico = pickFirstString(
    data.tecnico,
    data.agent_name,
    data.agentName,
    data.assignee_name,
    "MTalk",
  )
  const dataEvento = pickFirstString(
    data.data_evento,
    data.timestamp,
    data.created_at,
    data.updated_at,
    message.created_at,
    new Date().toISOString(),
  )
  const ingestionId = buildIngestionId(
    "mtalk",
    pickFirstString(data.ingestion_id, data.ingestionId, data.event_id, data.eventId),
    ticketId,
  )

  return {
    ticket_id: ticketId,
    cliente,
    canal,
    mensagens,
    tecnico,
    data_evento: dataEvento,
    metadata: {
      sourceSystem,
      sourceEntityId,
      tenantId,
      ingestionId,
      sourceTimestamp: dataEvento,
      tags: ["mtalk"],
    },
  }
}

export function adaptMavoGestaoPayload(raw: unknown): CanonicalIntegrationEvent {
  const data = asRecord(raw) || {}
  const cliente = asRecord(data.cliente) || asRecord(data.customer) || asRecord(data.empresa) || {}
  const responsavel = asRecord(data.responsavel) || {}

  const sourceSystem = normalizeSourceSystem(
    pickFirstString(data.source_system, data.sourceSystem, "mavo_gestao"),
    "mavo_gestao",
  )
  const ticketId = buildTicketId(
    "mavo-gestao",
    pickFirstString(
      data.ticket_id,
      data.ticketId,
      data.chamado_id,
      data.chamadoId,
      data.protocolo,
      data.id,
      data.codigo,
    ),
  )
  const clienteNome = pickFirstString(
    cliente.nome,
    cliente.name,
    cliente.razao_social,
    cliente.razaoSocial,
    data.cliente_nome,
    data.razao_social,
    data.empresa_nome,
    data.loja,
  ) || "Cliente Mavo Gestao"
  const tenantId =
    pickFirstString(
      data.tenant_id,
      data.tenantId,
      data.organization_id,
      data.organizationId,
      data.empresa_id,
      data.empresaId,
      data.filial_id,
      data.filialId,
      "mavo_gestao",
    ) || "mavo_gestao"
  const sourceEntityId =
    pickFirstString(
      data.event_id,
      data.eventId,
      data.chamado_id,
      data.chamadoId,
      data.id,
      ticketId,
    ) || ticketId
  const mensagens = joinNonEmpty([
    pickFirstString(data.titulo, data.subject, data.assunto),
    toText(data.descricao),
    toText(data.problema),
    toText(data.detalhes),
    toText(data.observacoes),
    toText(data.historico),
  ])
  const tecnico = pickFirstString(
    responsavel.nome,
    responsavel.name,
    data.tecnico,
    data.atendente,
    data.owner_name,
    "Mavo Gestao",
  )
  const dataEvento = pickFirstString(
    data.data_evento,
    data.updated_at,
    data.updatedAt,
    data.created_at,
    data.createdAt,
    new Date().toISOString(),
  )
  const ingestionId = buildIngestionId(
    "mavo-gestao",
    pickFirstString(data.ingestion_id, data.ingestionId, data.event_id, data.eventId),
    ticketId,
  )

  return {
    ticket_id: ticketId,
    cliente: clienteNome,
    canal: pickFirstString(data.canal, data.channel, "erp"),
    mensagens,
    tecnico,
    data_evento: dataEvento,
    metadata: {
      sourceSystem,
      sourceEntityId,
      tenantId,
      ingestionId,
      sourceTimestamp: dataEvento,
      tags: ["mavo_gestao", "erp"],
    },
  }
}

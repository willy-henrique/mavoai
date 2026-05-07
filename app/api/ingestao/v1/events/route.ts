import { forwardCanonicalIngestionEvent } from "@/lib/integration-forwarding"
import { NextResponse } from "next/server"

type CanonicalEvent = {
  ticket_id?: string
  cliente?: string
  cliente_id?: string
  canal?: string
  mensagens?: string
  tecnico?: string
  data_evento?: string
  metadata?: {
    sourceSystem?: string
    sourceEntityId?: string
    tenantId?: string
    ingestionId?: string
    sourceTimestamp?: string
    tags?: string[]
  }
}

export async function POST(request: Request) {
  let payload: CanonicalEvent | null = null
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "payload_invalido" }, { status: 400 })
  }

  if (!payload?.ticket_id || !payload?.cliente || !payload?.mensagens) {
    return NextResponse.json(
      { error: "ticket_id, cliente e mensagens sao obrigatorios" },
      { status: 400 },
    )
  }

  return forwardCanonicalIngestionEvent(request, {
    ticket_id: payload.ticket_id,
    cliente: payload.cliente,
    canal: payload.canal || "outro",
    mensagens: payload.mensagens,
    tecnico: payload.tecnico || "IntegracaoExterna",
    data_evento:
      payload.data_evento ||
      payload.metadata?.sourceTimestamp ||
      new Date().toISOString(),
    metadata: {
      sourceSystem: payload.metadata?.sourceSystem || "external",
      sourceEntityId: payload.metadata?.sourceEntityId || payload.ticket_id,
      tenantId: payload.metadata?.tenantId || "default",
      ingestionId: payload.metadata?.ingestionId || `ing-${Date.now()}`,
      sourceTimestamp: payload.metadata?.sourceTimestamp,
      tags: payload.metadata?.tags,
    },
  })
}

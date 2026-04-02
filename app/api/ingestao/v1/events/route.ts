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

  const headers = new Headers()
  headers.set("Content-Type", "application/json")
  const auth = request.headers.get("authorization")
  if (auth) headers.set("Authorization", auth)

  headers.set("X-Source-System", payload.metadata?.sourceSystem || "external")
  headers.set("X-Source-Entity-Id", payload.metadata?.sourceEntityId || payload.ticket_id)
  headers.set("X-Tenant-Id", payload.metadata?.tenantId || "default")
  headers.set("X-Ingestion-Id", payload.metadata?.ingestionId || `ing-${Date.now()}`)

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
  const forwardPayload = {
    ticket_id: payload.ticket_id,
    cliente: payload.cliente,
    canal: payload.canal || "outro",
    mensagens: payload.mensagens,
    tecnico: payload.tecnico || "IntegracaoExterna",
    data_evento: payload.data_evento || payload.metadata?.sourceTimestamp || new Date().toISOString(),
    metadata: payload.metadata || {},
  }

  const res = await fetch(`${baseUrl}/api/ingestao/willtalk`, {
    method: "POST",
    headers,
    body: JSON.stringify(forwardPayload),
  })
  const body = await res.json().catch(() => ({}))

  return NextResponse.json(body, { status: res.status })
}

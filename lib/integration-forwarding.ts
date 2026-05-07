import type { CanonicalIntegrationEvent } from "@/lib/integration-adapters"
import { normalizeSourceSystem } from "@/lib/integration-sources"
import { NextResponse } from "next/server"

export async function forwardCanonicalIngestionEvent(
  request: Request,
  payload: CanonicalIntegrationEvent,
) {
  const headers = new Headers()
  headers.set("Content-Type", "application/json")

  const auth = request.headers.get("authorization")
  if (auth) headers.set("Authorization", auth)

  headers.set(
    "X-Source-System",
    normalizeSourceSystem(payload.metadata?.sourceSystem || request.headers.get("X-Source-System") || "external"),
  )
  headers.set(
    "X-Source-Entity-Id",
    payload.metadata?.sourceEntityId || request.headers.get("X-Source-Entity-Id") || payload.ticket_id,
  )
  headers.set(
    "X-Tenant-Id",
    payload.metadata?.tenantId || request.headers.get("X-Tenant-Id") || "default",
  )
  headers.set(
    "X-Ingestion-Id",
    payload.metadata?.ingestionId || request.headers.get("X-Ingestion-Id") || `ing-${Date.now()}`,
  )

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
  const response = await fetch(`${baseUrl}/api/ingestao/willtalk`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ticket_id: payload.ticket_id,
      cliente: payload.cliente,
      canal: payload.canal || "outro",
      mensagens: payload.mensagens,
      tecnico: payload.tecnico || "IntegracaoExterna",
      data_evento:
        payload.data_evento ||
        payload.metadata?.sourceTimestamp ||
        new Date().toISOString(),
      metadata: payload.metadata || {},
    }),
  })

  const body = await response.json().catch(() => ({}))
  return NextResponse.json(body, { status: response.status })
}

import { adaptMtalkPayload } from "@/lib/integration-adapters"
import { forwardCanonicalIngestionEvent } from "@/lib/integration-forwarding"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  let raw: unknown

  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "payload_invalido" }, { status: 400 })
  }

  const payload = adaptMtalkPayload(raw)
  if (!payload.ticket_id || !payload.cliente || !payload.mensagens) {
    return NextResponse.json(
      { error: "ticket_id, cliente e mensagens sao obrigatorios" },
      { status: 400 },
    )
  }

  return forwardCanonicalIngestionEvent(request, payload)
}

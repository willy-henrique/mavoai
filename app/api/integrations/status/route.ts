import { listIntegrationStatuses } from "@/lib/integration-registry"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const data = await listIntegrationStatuses()

    return NextResponse.json({
      data,
      total: data.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: "integration_status_unavailable",
        detalhe: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

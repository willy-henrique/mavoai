import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"

export async function POST(request: Request) {
  const body = await request.json()
  logger.info("mtalk_webhook_payload_debug", { payload: JSON.stringify(body).slice(0, 3000) })
  console.log("=== MTALK WEBHOOK PAYLOAD ===", JSON.stringify(body, null, 2))
  return NextResponse.json({ status: "received" })
}

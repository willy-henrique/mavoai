import { NextResponse } from "next/server"
import { curationStats } from "@/lib/knowledge-curation"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stats = await curationStats(searchParams.get("tenant_id") || undefined)
  return NextResponse.json(stats)
}

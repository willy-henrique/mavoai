/**
 * POST /api/admin/obsidian/sync  { dryRun?: boolean }
 *
 * Dispara a sincronização do vault do Obsidian → RAG. Protegido pelo middleware.
 * dryRun=true só lista as notas (testa a conexão sem indexar).
 * Cada etapa fica registrada em ingestao_logs (origem='obsidian') → aba Logs.
 */
import { NextResponse } from "next/server"
import { syncObsidian } from "@/lib/obsidian-sync"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(request: Request) {
  let dryRun = false
  try {
    const body = await request.json()
    dryRun = !!body?.dryRun
  } catch { /* sem body = sync completo */ }

  const result = await syncObsidian({ dryRun })
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

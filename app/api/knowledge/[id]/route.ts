import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * DELETE /api/knowledge/[id] — remove PERMANENTEMENTE um item da base de
 * conhecimento (tabela `atendimentos`). A IA para de recuperá-lo na busca
 * seguinte. Destrutivo. Protegido pelo middleware (/api/knowledge/*).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id || !id.trim()) {
    return NextResponse.json({ error: "id_obrigatorio" }, { status: 400 })
  }

  try {
    const result = await query(
      `DELETE FROM atendimentos WHERE id = $1
       RETURNING id, resumo_problema, canal, tenant_id`,
      [id],
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "nao_encontrado" }, { status: 404 })
    }

    logger.info("knowledge_item_removido", {
      id,
      canal: result.rows[0]?.canal ?? null,
      tenant_id: result.rows[0]?.tenant_id ?? null,
    })
    return NextResponse.json({ ok: true, deleted: result.rows[0] })
  } catch (error) {
    console.error("knowledge DELETE error:", error instanceof Error ? error.message : String(error))
    return NextResponse.json({ error: "knowledge_delete_failed" }, { status: 500 })
  }
}

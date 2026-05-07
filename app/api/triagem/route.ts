import { gerarTriagemIA } from "@/lib/triage-ai"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const triagem = await gerarTriagemIA({
      organization_id: body?.organization_id,
      ticket_id: body?.ticket_id,
      conversation_id: body?.conversation_id,
      cliente_nome: body?.cliente_nome,
      cliente_telefone: body?.cliente_telefone,
      canal: body?.canal || "whatsapp",
      mensagem_atual: body?.mensagem_atual || body?.mensagens || body?.texto || "",
      historico_conversa: body?.historico_conversa || "",
      filas_disponiveis_json: body?.filas_disponiveis_json || [],
      horario_comercial_aberto: body?.horario_comercial_aberto,
      tentativas_triagem: body?.tentativas_triagem,
      idioma_preferencial: body?.idioma_preferencial || "pt-BR",
      metadados_json: body?.metadados_json || {},
    })

    return NextResponse.json(triagem)
  } catch (error) {
    return NextResponse.json(
      {
        queue_id: null,
        prioridade: "media",
        severidade: "S3",
        triage_completed: false,
        should_reply: true,
        reply_text: "Nao consegui concluir a triagem agora. Vou encaminhar para um atendente.",
        human_handoff: true,
        confidence: 0.0,
        resumo_triagem: "falha na triagem automatica",
        campos_faltantes: [],
        error_detail: error instanceof Error ? error.message : "erro_desconhecido",
      },
      { status: 500 },
    )
  }
}


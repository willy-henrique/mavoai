import {
  enforceRateLimit,
  validateIntegrationHeaders,
} from "@/lib/integration-guard"
import { logger } from "@/lib/logger"
import { runPlatformOrchestrator, type OrchestratorQueue } from "@/lib/platform-orchestrator"
import { NextResponse } from "next/server"
import { z } from "zod"

const queueSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    menu_option: z.coerce.number().optional(),
    menuOption: z.coerce.number().optional(),
    default_sla_mins: z.coerce.number().optional(),
    defaultSlaMins: z.coerce.number().optional(),
    is_active: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .transform(
    (q): OrchestratorQueue => ({
      id: q.id,
      name: q.name,
      menu_option: q.menu_option ?? q.menuOption ?? 0,
      default_sla_mins: q.default_sla_mins ?? q.defaultSlaMins,
      is_active: q.is_active ?? q.isActive ?? true,
    }),
  )

const requestSchema = z.object({
  platform: z.string().min(1).default("unknown"),
  organization_id: z.string().min(1),
  event_id: z.string().min(1),
  conversation_id: z.string().min(1),
  cliente: z.object({
    nome: z.string().min(1),
    telefone: z.string().min(4),
  }),
  mensagem: z.string().default(""),
  media_url: z.string().url().optional().nullable(),
  mime_type: z.string().optional().nullable(),
  business_hours_open: z.boolean().default(true),
  conversation: z.object({
    triage_completed: z.boolean().default(false),
    menu_attempts: z.coerce.number().default(0),
    queue_id: z.string().nullable().optional(),
    menu_invalid_attempts: z.coerce.number().int().min(0).optional(),
    investigation_adequate_rounds: z.coerce.number().int().min(0).optional(),
    /** Opcional: total de mensagens do cliente desde a escolha da fila (anti-loop). */
    investigation_messages_seen: z.coerce.number().int().min(0).optional(),
    investigation_inadequate_streak: z.coerce.number().int().min(0).optional(),
    resolution_active: z.boolean().optional(),
    resolution_attempts: z.coerce.number().int().min(0).optional(),
    resolution_problem_text: z.string().optional(),
    resolution_prev_solutions: z.string().optional(),
  }),
  queues: z.array(queueSchema).default([]),
}).superRefine((data, ctx) => {
  const hasText = String(data.mensagem || "").trim().length > 0
  const hasMedia = Boolean(data.media_url)
  if (!hasText && !hasMedia) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "mensagem ou media_url obrigatorio",
      path: ["mensagem"],
    })
  }
})

/**
 * Orquestrador Mavo (Cérebro): triagem + investigação + visão.
 * WillTalk, MTalk e outros canais enviam estado + filas; este endpoint devolve reply_text e próximo estado.
 */
export async function POST(request: Request) {
  const auth = validateIntegrationHeaders(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  const rate = await enforceRateLimit(auth.tenantId, auth.sourceSystem)
  if (!rate.ok) {
    return NextResponse.json({ error: rate.error }, { status: rate.status })
  }

  let json: unknown
  try {
    json = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const parsed = requestSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const body = parsed.data

  try {
    const out = await runPlatformOrchestrator({
      platform: body.platform,
      organization_id: body.organization_id,
      event_id: body.event_id,
      conversation_id: body.conversation_id,
      cliente: body.cliente,
      mensagem: body.mensagem,
      media_url: body.media_url,
      mime_type: body.mime_type,
      business_hours_open: body.business_hours_open,
      conversation: {
        triage_completed: body.conversation.triage_completed,
        menu_attempts: body.conversation.menu_attempts,
        queue_id: body.conversation.queue_id ?? null,
        menu_invalid_attempts:
          body.conversation.menu_invalid_attempts,
        investigation_adequate_rounds:
          body.conversation.investigation_adequate_rounds,
        investigation_messages_seen:
          body.conversation.investigation_messages_seen,
        investigation_inadequate_streak:
          body.conversation.investigation_inadequate_streak,
        resolution_active:
          body.conversation.resolution_active,
        resolution_attempts:
          body.conversation.resolution_attempts,
        resolution_problem_text:
          body.conversation.resolution_problem_text,
        resolution_prev_solutions:
          body.conversation.resolution_prev_solutions,
      },
      queues: body.queues,
    })

    logger.info("orquestrador_mensagem_ok", {
      platform: body.platform,
      organization_id: body.organization_id,
      conversation_id: body.conversation_id,
      reason: out.reason,
    })

    return NextResponse.json(out)
  } catch (error) {
    logger.error("orquestrador_mensagem_failed", {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json(
      {
        error: "orchestrator_error",
        reply_text:
          "Nao consegui processar sua mensagem agora. Um atendente vai continuar por aqui em breve.",
        triage_completed: true,
        menu_attempts: body.conversation.menu_attempts,
        queue_id: body.conversation.queue_id ?? null,
        reason: "internal_error",
        agent_handoff_summary:
          `• Erro interno no orquestrador ao processar a mensagem.\n` +
          `• Cliente: ${body.cliente.nome} (${body.cliente.telefone}).\n` +
          `• Recorte da mensagem: ${String(body.mensagem || "").slice(0, 400)}`,
        investigation_inadequate_streak: 0,
      },
      { status: 500 },
    )
  }
}

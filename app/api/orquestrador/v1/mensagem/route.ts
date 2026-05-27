import {
  enforceRateLimit,
  validateIntegrationHeaders,
} from "@/lib/integration-guard"
import { notifyHandoff } from "@/lib/handoff-notifier"
import { logger } from "@/lib/logger"
import { loadOrgConfig } from "@/lib/org-loader"
import {
  runPlatformOrchestrator,
  type OrchestratorConversationState,
  type OrchestratorQueue,
} from "@/lib/platform-orchestrator"
import { loadSession, saveSession, deleteSession } from "@/lib/session-store"
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
    last_ai_reply: z.string().optional(),
    company_selection_phase: z.enum(["pending", "selected"]).optional(),
    selected_tenant_id: z.string().nullable().optional(),
    company_selection_invalid_attempts: z.coerce.number().int().min(0).optional(),
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

  // ── Sessão persistente ────────────────────────────────────────────────────────
  // Callers stateful (WillTalk) enviam conversation state explícito — usamos o body.
  // Callers stateless (n8n, webhooks novos) enviam conversation vazio — usamos DB.
  const savedState = await loadSession(body.conversation_id, body.organization_id)

  const bodyConversation: OrchestratorConversationState = {
    triage_completed                 : body.conversation.triage_completed,
    menu_attempts                    : body.conversation.menu_attempts,
    queue_id                         : body.conversation.queue_id ?? null,
    menu_invalid_attempts            : body.conversation.menu_invalid_attempts,
    investigation_adequate_rounds    : body.conversation.investigation_adequate_rounds,
    investigation_messages_seen      : body.conversation.investigation_messages_seen,
    investigation_inadequate_streak  : body.conversation.investigation_inadequate_streak,
    resolution_active                : body.conversation.resolution_active,
    resolution_attempts              : body.conversation.resolution_attempts,
    resolution_problem_text          : body.conversation.resolution_problem_text,
    resolution_prev_solutions        : body.conversation.resolution_prev_solutions,
    last_ai_reply                    : body.conversation.last_ai_reply,
    company_selection_phase          : body.conversation.company_selection_phase,
    selected_tenant_id               : body.conversation.selected_tenant_id,
    company_selection_invalid_attempts: body.conversation.company_selection_invalid_attempts,
  }

  // Se existe estado salvo E o body parece "vazio" (caller stateless), preferir DB.
  // Caller "vazio" = triage_completed=false, menu_attempts=0, queue_id=null, sem fase ativa.
  const bodyLooksEmpty =
    !body.conversation.triage_completed &&
    body.conversation.menu_attempts === 0 &&
    !body.conversation.queue_id &&
    !body.conversation.resolution_active &&
    !body.conversation.company_selection_phase

  const effectiveConversation: OrchestratorConversationState =
    savedState && bodyLooksEmpty ? savedState : bodyConversation

  // Resolve orgConfig a partir da sessão ativa ou do body.
  const resolvedTenantId =
    effectiveConversation.selected_tenant_id ?? body.conversation.selected_tenant_id
  const orgConfig = resolvedTenantId
    ? await loadOrgConfig(resolvedTenantId)
    : null

  try {
    const out = await runPlatformOrchestrator({
      platform        : body.platform,
      organization_id : body.organization_id,
      event_id        : body.event_id,
      conversation_id : body.conversation_id,
      cliente         : body.cliente,
      mensagem        : body.mensagem,
      media_url       : body.media_url,
      mime_type       : body.mime_type,
      business_hours_open: body.business_hours_open,
      conversation    : effectiveConversation,
      queues          : body.queues,
      orgConfig,
    })

    // ── Persistir estado de saída ────────────────────────────────────────────
    const nextState: OrchestratorConversationState = {
      triage_completed                  : out.triage_completed,
      menu_attempts                     : out.menu_attempts,
      queue_id                          : out.queue_id,
      menu_invalid_attempts             : out.menu_invalid_attempts,
      investigation_adequate_rounds     : out.investigation_adequate_rounds,
      // investigation_messages_seen não é retornado pelo orquestrador;
      // incrementa a partir do estado anterior se o usuário estava em fila.
      investigation_messages_seen       :
        effectiveConversation.queue_id
          ? (effectiveConversation.investigation_messages_seen ?? 0) + 1
          : effectiveConversation.investigation_messages_seen,
      investigation_inadequate_streak   : out.investigation_inadequate_streak,
      resolution_active                 : out.resolution_active,
      resolution_attempts               : out.resolution_attempts,
      resolution_problem_text           : out.resolution_problem_text,
      resolution_prev_solutions         : out.resolution_prev_solutions,
      last_ai_reply                     : out.last_ai_reply,
      company_selection_phase           : out.company_selection_phase,
      selected_tenant_id                : out.selected_tenant_id,
      company_selection_invalid_attempts: out.company_selection_invalid_attempts,
    }

    if (out.triage_completed) {
      deleteSession(body.conversation_id, body.organization_id).catch(() => {})
    } else {
      saveSession(body.conversation_id, body.organization_id, body.platform, nextState).catch(() => {})
    }

    logger.info("orquestrador_mensagem_ok", {
      platform: body.platform,
      organization_id: body.organization_id,
      conversation_id: body.conversation_id,
      reason: out.reason,
    })

    // Dispara notificação de handoff de forma assíncrona (fire-and-forget).
    // Não bloqueia a resposta — erros de webhook não afetam o cliente.
    if (out.triage_completed && out.agent_handoff_summary) {
      notifyHandoff({
        tenantId: auth.tenantId,
        sourceSystem: auth.sourceSystem,
        conversationId: body.conversation_id,
        platform: body.platform,
        queueId: out.queue_id,
        cliente: body.cliente,
        summary: out.agent_handoff_summary,
        reason: out.reason,
      }).catch(() => {})
    }

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

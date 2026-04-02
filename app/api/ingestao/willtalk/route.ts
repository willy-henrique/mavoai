import { gerarRespostaAssistida } from "@/lib/assisted-response"
import { createClient } from "@/lib/supabase/server"
import {
  auditEvent,
  enforceRateLimit,
  registerDedupKey,
  registerSourceRecord,
  validateIntegrationHeaders,
} from "@/lib/integration-guard"
import {
  autoReplyHabilitado,
  enviarRespostaParaWillTalk,
} from "@/lib/willtalk-reply"
import { after } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import crypto from "crypto"

interface PayloadWillTalk {
  ticket_id?: string
  cliente?: string
  canal?: string
  mensagens?: string
  tecnico?: string
  data_evento?: string
  metadata?: {
    sourceSystem?: string
    sourceEntityId?: string
    tenantId?: string
    ingestionId?: string
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  let payload: PayloadWillTalk | null = null

  try {
    const auth = validateIntegrationHeaders(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }
    const rate = await enforceRateLimit(auth.tenantId, auth.sourceSystem)
    if (!rate.ok) {
      return NextResponse.json({ error: rate.error }, { status: rate.status })
    }

    payload = await request.json()

    const ticketId = payload.ticket_id?.trim()
    const cliente = payload.cliente?.trim()
    const mensagens = payload.mensagens?.trim()
    const tecnico = payload.tecnico?.trim() || "WillTalk"
    const dataEvento = payload.data_evento || new Date().toISOString()
    const sourceSystem = payload.metadata?.sourceSystem || auth.sourceSystem || "willtalk"
    const sourceEntityId = payload.metadata?.sourceEntityId || auth.sourceEntityId || ticketId || "unknown"
    const tenantId = payload.metadata?.tenantId || auth.tenantId || "default"
    const ingestionId = payload.metadata?.ingestionId || auth.ingestionId

    if (!ticketId || !cliente || !mensagens) {
      await registrarLogIngestao(supabase, "erro_validacao", payload, {
        motivo: "ticket_id, cliente e mensagens sao obrigatorios",
      })

      return NextResponse.json(
        { error: "ticket_id, cliente e mensagens sao obrigatorios" },
        { status: 400 }
      )
    }

    const textoOriginal = `[${payload.canal || "whatsapp"}][ticket:${ticketId}] ${mensagens}`
    const dedupKey = `${sourceSystem}:${sourceEntityId}:${ingestionId}`
    const payloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ ticketId, cliente, mensagens, dataEvento, sourceSystem, sourceEntityId }))
      .digest("hex")
    const dedup = await registerDedupKey(supabase, tenantId, dedupKey, payloadHash)
    if (dedup.duplicated) {
      await auditEvent(supabase, {
        tenantId,
        sourceSystem,
        eventType: "ingest.duplicate",
        severity: "warn",
        traceId: ingestionId,
        message: "Evento ignorado por deduplicacao",
        context: { dedupKey, ticketId, sourceEntityId },
      })
      return NextResponse.json({ status: "duplicate_ignored", dedupKey }, { status: 409 })
    }
    await registerSourceRecord(supabase, {
      tenantId,
      sourceSystem,
      sourceEntityId,
      ingestionId,
      payloadHash,
    })

    const { data, error } = await supabase
      .from("atendimentos")
      .insert({
        ticket_externo: ticketId,
        canal: payload.canal || "whatsapp",
        cliente,
        tecnico,
        texto_original: textoOriginal,
        data_atendimento: dataEvento,
      })
      .select()
      .single()

    if (error) {
      await registrarLogIngestao(supabase, "erro_insert", payload, {
        motivo: error.message,
      })
      return NextResponse.json(
        { error: "Erro ao criar atendimento da ingestao" },
        { status: 500 }
      )
    }

    await registrarLogIngestao(supabase, "sucesso", payload, {
      atendimento_id: data.id,
      ticket_id: ticketId,
      tenant_id: tenantId,
      source_system: sourceSystem,
      source_entity_id: sourceEntityId,
      ingestion_id: ingestionId,
    })
    await auditEvent(supabase, {
      tenantId,
      sourceSystem,
      eventType: "ingest.accepted",
      traceId: ingestionId,
      message: "Ingestao aceita e atendimento criado",
      context: { atendimentoId: data.id, ticketId, sourceEntityId },
    })

    // Dispara processamento IA após retornar a resposta (Next.js 15 after()).
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || new URL(request.url).origin
    const atendimentoId = data.id
    after(async () => {
      try {
        await fetch(`${baseUrl}/api/atendimentos/processar`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(process.env.CEREBRO_INTERNAL_TOKEN
              ? { "X-Internal-Token": process.env.CEREBRO_INTERNAL_TOKEN }
              : {}),
          },
          body: JSON.stringify({
            id: atendimentoId,
            texto_original: textoOriginal,
          }),
        })
      } catch (err) {
        logger.error("trigger_processamento_falhou", {
          atendimentoId,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    if (autoReplyHabilitado() && (payload.canal || "whatsapp") === "whatsapp") {
      const textoConsulta = mensagens
      const AUTO_REPLY_TIMEOUT_MS = 30_000

      Promise.resolve()
        .then(async () => {
          const ac = new AbortController()
          const timer = setTimeout(() => ac.abort(), AUTO_REPLY_TIMEOUT_MS)

          try {
            const resposta = await Promise.race([
              gerarRespostaAssistida(supabase, textoConsulta),
              new Promise<never>((_, reject) => {
                ac.signal.addEventListener("abort", () =>
                  reject(new Error("auto-reply timeout"))
                )
              }),
            ])

            await enviarRespostaParaWillTalk({
              ticketId,
              cliente,
              canal: payload?.canal || "whatsapp",
              resposta,
            })
            await registrarLogIngestao(supabase, "auto_reply_enviado", payload, {
              ticket_id: ticketId,
            })
          } finally {
            clearTimeout(timer)
          }
        })
        .catch(async (err) => {
          const msg = err instanceof Error ? err.message : String(err)
          const is429 = msg.includes("429") || msg.includes("rate_limit")
          const isTimeout = msg.includes("timeout")
          logger.warn("auto_reply_skip", {
            ticketId,
            motivo: is429 ? "rate_limit_ia" : isTimeout ? "timeout" : "erro",
            error: msg.slice(0, 200),
          })
          await registrarLogIngestao(supabase, "auto_reply_erro", payload, {
            ticket_id: ticketId,
            motivo: msg.slice(0, 400),
            skipped: true,
          }).catch(() => {})
        })
    }

    return NextResponse.json({
      status: "ok",
      atendimento_id: data.id,
    })
  } catch (error) {
    await auditEvent(supabase, {
      eventType: "ingest.error",
      severity: "error",
      message: error instanceof Error ? error.message : "erro desconhecido",
    })
    await registrarLogIngestao(supabase, "erro_runtime", payload, {
      motivo: error instanceof Error ? error.message : "erro desconhecido",
    })
    return NextResponse.json({ error: "Erro na ingestao WillTalk" }, { status: 500 })
  }
}

async function registrarLogIngestao(
  supabase: any,
  status: string,
  payload: unknown,
  detalhes: Record<string, unknown>
) {
  const { error } = await supabase.from("ingestao_logs").insert({
    origem: "willtalk",
    status,
    payload,
    detalhes,
  })

  if (error) {
    logger.warn("ingestao_log_falhou", { status, error: error.message })
  }
}

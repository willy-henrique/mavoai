import { gerarRespostaWhatsApp, pediuHumano } from "@/lib/assisted-response"
import {
  carregarConversa,
  salvarConversa,
  marcarHandoff,
} from "@/lib/whatsapp-memory"
import { notifyHandoff } from "@/lib/handoff-notifier"
import {
  enforceRateLimit,
  validateIntegrationHeaders,
} from "@/lib/integration-guard"
import { query } from "@/lib/database/postgres-client-no-vector"
import {
  auditIntegrationEvent,
  finishIntegrationRun,
  registerDedupKeyRecord,
  registerSourceRecord,
  startIntegrationRun,
} from "@/lib/integration-registry"
import {
  getIntegrationDisplayName,
  normalizeSourceSystem,
} from "@/lib/integration-sources"
import {
  autoReplyHabilitado,
  enviarRespostaParaWillTalk,
} from "@/lib/willtalk-reply"
import { after } from "next/server"
import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"
import { sanitizePII } from "@/lib/pii-sanitizer"
import crypto from "crypto"

interface PayloadWillTalk {
  ticket_id?: string
  cliente?: string | { nome?: string; name?: string }
  canal?: string
  mensagens?: string
  tecnico?: string
  data_evento?: string
  historico_conversa?: string
  queue_id?: string | null
  prioridade?: string
  severidade?: string
  triage_completed?: boolean
  human_handoff?: boolean
  confidence?: number
  resumo_triagem?: string
  campos_faltantes?: string[]
  metadados_json?: Record<string, unknown>
  // Número de telefone do contato — igual ao MTalk
  number?: string
  phone?: string
  contact?: { number?: string; phone?: string; phone_number?: string }
  metadata?: {
    sourceSystem?: string
    sourceEntityId?: string
    tenantId?: string
    ingestionId?: string
    reply_text?: string
    triage_completed?: boolean | string
    prioridade?: string
    severidade?: string
    human_handoff?: boolean | string
    confidence?: number | string
    resumo_triagem?: string
    campos_faltantes?: unknown
    number?: string
    phone?: string
  }
}

function resolveClienteNome(cliente: PayloadWillTalk["cliente"]) {
  if (typeof cliente === "string") return cliente.trim()
  if (cliente && typeof cliente === "object") {
    return String(cliente.nome || cliente.name || "").trim()
  }
  return ""
}

function extractContactNumber(payload: PayloadWillTalk): string | undefined {
  const raw =
    payload.contact?.number ??
    payload.contact?.phone ??
    payload.contact?.phone_number ??
    payload.number ??
    payload.phone ??
    payload.metadata?.number ??
    payload.metadata?.phone
  if (!raw) return undefined
  const digits = String(raw).replace(/[^0-9]/g, "")
  return digits.length >= 8 ? digits : undefined
}

function buildRichConversationText(payload: PayloadWillTalk, ticketId: string, mensagens: string) {
  const canal = payload.canal || "whatsapp"
  const metadata = payload.metadata || {}
  const triageCompletedRaw = payload.triage_completed ?? metadata.triage_completed
  const humanHandoffRaw = payload.human_handoff ?? metadata.human_handoff
  const confidenceRaw = payload.confidence ?? metadata.confidence
  const camposFaltantesRaw = payload.campos_faltantes ?? metadata.campos_faltantes

  const triageCompleted =
    typeof triageCompletedRaw === "boolean"
      ? triageCompletedRaw
      : String(triageCompletedRaw || "").toLowerCase() === "true"
  const humanHandoff =
    typeof humanHandoffRaw === "boolean"
      ? humanHandoffRaw
      : String(humanHandoffRaw || "").toLowerCase() === "true"
  const confidence = Number(confidenceRaw)
  const camposFaltantes = Array.isArray(camposFaltantesRaw)
    ? camposFaltantesRaw.map((x) => String(x)).slice(0, 8)
    : []

  const triageBits = [
    payload.queue_id ? `fila=${payload.queue_id}` : null,
    (payload.prioridade || metadata.prioridade) ? `prioridade=${payload.prioridade || metadata.prioridade}` : null,
    (payload.severidade || metadata.severidade) ? `severidade=${payload.severidade || metadata.severidade}` : null,
    `triage_completed=${triageCompleted}`,
    `human_handoff=${humanHandoff}`,
    Number.isFinite(confidence) ? `confidence=${Math.max(0, Math.min(1, confidence)).toFixed(2)}` : null,
    (payload.resumo_triagem || metadata.resumo_triagem)
      ? `resumo_triagem=${String(payload.resumo_triagem || metadata.resumo_triagem).slice(0, 220)}`
      : null,
    camposFaltantes.length > 0 ? `campos_faltantes=${camposFaltantes.join(",")}` : null,
  ]
    .filter(Boolean)
    .join(" | ")

  const replyText = String(metadata.reply_text || "").trim()
  const historico = String(payload.historico_conversa || "").trim()

  const parts = [
    `[${canal}][ticket:${ticketId}]`,
    `cliente: ${mensagens}`,
    triageBits ? `triagem: ${triageBits}` : "",
    replyText ? `atendente_ia: ${replyText}` : "",
    historico ? `historico: ${historico}` : "",
    payload.metadados_json ? `metadados: ${JSON.stringify(payload.metadados_json).slice(0, 2000)}` : "",
  ].filter(Boolean)

  return parts.join(" | ").slice(0, 12000)
}

export async function POST(request: Request) {
  let payload: PayloadWillTalk | null = null
  let sourceSystem = "willtalk"
  let tenantId = "default"
  let integrationRun:
    | Awaited<ReturnType<typeof startIntegrationRun>>
    | null = null

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
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "payload_invalido" }, { status: 400 })
    }

    const body = payload
    const ticketId = body.ticket_id?.trim()
    const cliente = resolveClienteNome(body.cliente)
    const mensagens = body.mensagens?.trim()
    sourceSystem = normalizeSourceSystem(
      body.metadata?.sourceSystem || auth.sourceSystem || "willtalk",
      "willtalk",
    )
    const tecnico =
      body.tecnico?.trim() || getIntegrationDisplayName(sourceSystem)
    const dataEvento = body.data_evento || new Date().toISOString()
    const sourceEntityId = body.metadata?.sourceEntityId || auth.sourceEntityId || ticketId || "unknown"
    tenantId = body.metadata?.tenantId || auth.tenantId || "default"
    const ingestionId = body.metadata?.ingestionId || auth.ingestionId
    integrationRun = await startIntegrationRun({
      tenantId,
      sourceSystem,
    })

    if (!ticketId || !cliente || !mensagens) {
      const detalhes = {
        motivo: "ticket_id, cliente e mensagens sao obrigatorios",
        source_system: sourceSystem,
      }
      await registrarLogIngestao("erro_validacao", body, detalhes, sourceSystem)
      await finishIntegrationRun(integrationRun, {
        status: "validation_error",
        totalFailed: 1,
        details: detalhes,
      })
      await auditIntegrationEvent({
        tenantId,
        sourceSystem,
        eventType: "ingestao_validacao_falhou",
        severity: "warn",
        message: "Campos obrigatorios ausentes na ingestao",
        context: detalhes,
      })

      return NextResponse.json(
        { error: "ticket_id, cliente e mensagens sao obrigatorios" },
        { status: 400 }
      )
    }

    const textoOriginal = sanitizePII(buildRichConversationText(body, ticketId, mensagens))
    const payloadHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ ticketId, cliente, mensagens, dataEvento, sourceSystem, sourceEntityId }))
      .digest("hex")
    // Evita colisao de dedup quando o provedor nao envia ingestionId consistente.
    const safeIngestionId = ingestionId || `auto-${payloadHash.slice(0, 12)}`
    const dedupKey = `${sourceSystem}:${sourceEntityId}:${safeIngestionId}`
    const dedupRegistry = await registerDedupKeyRecord({
      tenantId,
      dedupKey,
      payloadHash,
    })
    let duplicated = dedupRegistry.duplicated

    if (!duplicated && !dedupRegistry.available) {
      const dedupRes = await query(
        `SELECT id
         FROM ingestao_logs
         WHERE origem = $1
           AND status = 'sucesso'
           AND detalhes->>'dedup_key' = $2
         LIMIT 1`,
        [sourceSystem, dedupKey]
      )
      duplicated = dedupRes.rows.length > 0
    }

    if (duplicated) {
      const detalhes = {
        dedup_key: dedupKey,
        ticket_id: ticketId,
        source_system: sourceSystem,
      }
      await registrarLogIngestao("duplicado", body, detalhes, sourceSystem)
      await finishIntegrationRun(integrationRun, {
        status: "duplicate_ignored",
        details: detalhes,
      })
      await auditIntegrationEvent({
        tenantId,
        sourceSystem,
        eventType: "ingestao_duplicada",
        severity: "info",
        message: "Evento ignorado por deduplicacao",
        context: detalhes,
      })
      return NextResponse.json({ status: "duplicate_ignored", dedupKey }, { status: 409 })
    }

    const insert = await query(
      `INSERT INTO atendimentos (
        ticket_externo, canal, cliente, tecnico, texto_original, data_atendimento
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id`,
      [ticketId, body.canal || "whatsapp", cliente, tecnico, textoOriginal, dataEvento]
    )
    const atendimentoId = insert.rows[0]?.id

    if (!atendimentoId) {
      const detalhes = {
        motivo: "falha ao criar atendimento",
        source_system: sourceSystem,
      }
      await registrarLogIngestao("erro_insert", body, detalhes, sourceSystem)
      await finishIntegrationRun(integrationRun, {
        status: "error",
        totalFailed: 1,
        details: detalhes,
      })
      await auditIntegrationEvent({
        tenantId,
        sourceSystem,
        eventType: "ingestao_insert_falhou",
        severity: "error",
        message: "Falha ao criar atendimento na ingestao",
        context: detalhes,
      })
      return NextResponse.json(
        { error: "Erro ao criar atendimento da ingestao" },
        { status: 500 }
      )
    }

    await registrarLogIngestao("sucesso", body, {
      atendimento_id: atendimentoId,
      ticket_id: ticketId,
      tenant_id: tenantId,
      source_system: sourceSystem,
      source_entity_id: sourceEntityId,
      ingestion_id: safeIngestionId,
      dedup_key: dedupKey,
    }, sourceSystem)
    await registerSourceRecord({
      tenantId,
      sourceSystem,
      sourceEntityId,
      ingestionId: safeIngestionId,
      payloadHash,
    })
    await finishIntegrationRun(integrationRun, {
      status: "success",
      totalProcessed: 1,
      details: {
        atendimento_id: atendimentoId,
        ticket_id: ticketId,
        dedup_key: dedupKey,
      },
    })

    // Dispara processamento IA após retornar a resposta (Next.js 15 after()).
    const baseUrl = process.env.INTERNAL_BASE_URL || new URL(request.url).origin
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

    // Auto-reply — paridade com o MTalk: memória da conversa + handoff + tom conversacional.
    const contactNumber = extractContactNumber(body)
    // Mensagem vinda do MTalk: ele já respondeu (com memória própria). Aqui o
    // endpoint serve só de armazenamento/RAG — não responde de novo (evita eco duplo).
    const ehEcoDoMtalk = sourceSystem === "mtalk"

    if (autoReplyHabilitado() && !ehEcoDoMtalk) {
      const MSG_HANDOFF =
        "Já estou te passando para um atendente, tá? Só um instante que alguém continua o atendimento por aqui."
      const canal = body.canal || "whatsapp"

      // Carrega o histórico da conversa (mesma memória usada pelo MTalk).
      const conversa = await carregarConversa(ticketId)

      // Já transferido para um humano → o bot fica em silêncio.
      if (conversa.handoff) {
        return NextResponse.json({ status: "ok", atendimento_id: atendimentoId, handoff: true })
      }

      // Dispara a transferência para um atendente humano e devolve a mensagem de aviso.
      const dispararHandoff = async (motivo: string): Promise<string> => {
        conversa.messages.push({ role: "user", content: mensagens })
        await marcarHandoff(ticketId, conversa)
        notifyHandoff({
          tenantId,
          sourceSystem,
          conversationId: ticketId,
          platform: canal,
          queueId: body.queue_id ?? null,
          cliente: { nome: cliente, telefone: contactNumber ?? "" },
          summary: `Cliente: ${cliente}. Última mensagem: "${mensagens.slice(0, 280)}".`,
          reason: motivo,
        }).catch(() => undefined)
        return MSG_HANDOFF
      }

      const AUTO_REPLY_TIMEOUT_MS = 30_000
      const ac = new AbortController()
      const timer = setTimeout(() => ac.abort(), AUTO_REPLY_TIMEOUT_MS)

      let resposta: string | null = null

      try {
        // Pedido explícito de humano → transfere na hora.
        if (pediuHumano(mensagens)) {
          resposta = await dispararHandoff("cliente_pediu_humano")
          clearTimeout(timer)
        } else {
          const resultado = await Promise.race([
            gerarRespostaWhatsApp(mensagens, cliente, conversa.messages),
            new Promise<never>((_, reject) => {
              ac.signal.addEventListener("abort", () =>
                reject(new Error("auto-reply timeout"))
              )
            }),
          ])
          clearTimeout(timer)

          if (resultado.escalar) {
            resposta = await dispararHandoff("ia_nao_resolveu")
          } else {
            resposta = resultado.resposta
            // Salva o turno (cliente + IA) — assim a IA lembra o contexto na próxima mensagem
            // e não fica se reapresentando nem repetindo perguntas já respondidas.
            conversa.messages.push({ role: "user", content: mensagens })
            conversa.messages.push({ role: "assistant", content: resposta })
            await salvarConversa(ticketId, conversa)
          }
        }

        // Envia a resposta (API direta se number disponível, senão webhook)
        if (resposta) {
          enviarRespostaParaWillTalk({
            ticketId,
            cliente,
            canal,
            resposta,
            number: contactNumber,
          }).then(() => {
            registrarLogIngestao("auto_reply_enviado", body, {
              ticket_id: ticketId,
              source_system: sourceSystem,
              via: contactNumber ? "api_direta" : "webhook",
            }, sourceSystem).catch(() => {})
          }).catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err)
            logger.warn("auto_reply_envio_erro", { ticketId, error: msg.slice(0, 200) })
          })
        }

      } catch (err) {
        clearTimeout(timer)
        const msg = err instanceof Error ? err.message : String(err)
        const is429 = msg.includes("429") || msg.includes("rate_limit")
        const isTimeout = msg.includes("timeout")
        logger.warn("auto_reply_skip", {
          ticketId,
          motivo: is429 ? "rate_limit_ia" : isTimeout ? "timeout" : "erro",
          error: msg.slice(0, 200),
        })
        await registrarLogIngestao("auto_reply_erro", body, {
          ticket_id: ticketId,
          motivo: msg.slice(0, 400),
          skipped: true,
          source_system: sourceSystem,
        }, sourceSystem).catch(() => {})
      }

      // Retorna a resposta no HTTP — igual ao MTalk
      if (resposta) {
        return NextResponse.json({
          status: "ok",
          atendimento_id: atendimentoId,
          messages: [{ type: "text", text: resposta }],
          text: resposta,
          message: resposta,
        })
      }
    }

    return NextResponse.json({
      status: "ok",
      atendimento_id: atendimentoId,
    })
  } catch (error) {
    const detalhes = {
      motivo: error instanceof Error ? error.message : "erro desconhecido",
      source_system: sourceSystem,
    }
    await registrarLogIngestao("erro_runtime", payload, detalhes, sourceSystem)
    if (integrationRun) {
      await finishIntegrationRun(integrationRun, {
        status: "error",
        totalFailed: 1,
        details: detalhes,
      })
    }
    await auditIntegrationEvent({
      tenantId,
      sourceSystem,
      eventType: "ingestao_runtime_falhou",
      severity: "error",
      message: "Erro inesperado na ingestao",
      context: detalhes,
    })
    return NextResponse.json({ error: "Erro na ingestao WillTalk" }, { status: 500 })
  }
}

async function registrarLogIngestao(
  status: string,
  payload: unknown,
  detalhes: Record<string, unknown>,
  origem = "willtalk",
) {
  try {
    await query(
      `INSERT INTO ingestao_logs (origem, status, payload, detalhes)
       VALUES ($1, $2, $3::jsonb, $4::jsonb)`,
      [origem, status, JSON.stringify(payload ?? {}), JSON.stringify(detalhes ?? {})]
    )
  } catch (error) {
    logger.warn("ingestao_log_falhou", {
      status,
      origem,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

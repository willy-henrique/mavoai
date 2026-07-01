/**
 * lib/ai-curator.ts
 *
 * Curadoria automática de conversas encerradas.
 * Extrai problema, causa e solução de transcrições brutas,
 * sanitiza PII, detecta recorrência e insere na base de conhecimento.
 *
 * Integra com: ai-provider, embeddings, semantic-search, pii-sanitizer.
 */

import { gerarTextoIACurador } from "@/lib/ai-provider"
import { gerarEmbedding } from "@/lib/embeddings"
import { buscarSemantica } from "@/lib/semantic-search"
import { sanitizePII } from "@/lib/pii-sanitizer"
import { query } from "@/lib/database/postgres-client-no-vector"
import { logger } from "@/lib/logger"
import { createKnowledgeItem } from "@/lib/knowledge-curation"

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface CuratedCase {
  id: string
  resumo_problema: string
  causa: string
  solucao: string
  categoria: string
  tags: string[]
  dominio: string
  recurrence_alert: "nenhuma" | "cliente" | "sistemico"
  tenant_id: string
}

interface CurationResult {
  resumo_problema: string
  causa: string
  solucao: string
  categoria: string
  tags: string[]
  dominio: string
}

// ─── Prompt de curadoria ──────────────────────────────────────────────────────

const SYSTEM_CURATOR = `Você é um curador de base de conhecimento para suporte técnico de software ERP/PDV.
Analise a transcrição de atendimento e extraia as informações estruturadas.
Responda APENAS com JSON válido, sem markdown, sem explicações.

Formato obrigatório:
{
  "resumo_problema": "string curta (máx 200 chars)",
  "causa": "string explicando a causa raiz (máx 400 chars)",
  "solucao": "string detalhada com os passos da solução",
  "categoria": "uma das: fiscal | pdv | estoque | hardware | financeiro | cadastro | integracao | outro",
  "tags": ["array", "de", "palavras-chave", "máx 8"],
  "dominio": "fiscal | pdv | tef | estoque | hardware | geral"
}`

// ─── Detecção de recorrência ──────────────────────────────────────────────────

const RECURRENCE_THRESHOLD = 0.87   // similaridade mínima para considerar recorrência
const RECURRENCE_WINDOW_DAYS = 30

/**
 * Detecta se o mesmo problema já ocorreu recentemente.
 * Retorna "cliente" (mesmo cliente), "sistemico" (muitos clientes) ou "nenhuma".
 */
async function detectarRecorrencia(
  resumo: string,
  tenantId: string,
): Promise<"nenhuma" | "cliente" | "sistemico"> {
  try {
    const casos = await buscarSemantica(resumo, 10, tenantId)
    const similares = casos.filter(c => c.similaridade >= RECURRENCE_THRESHOLD)

    if (similares.length === 0) return "nenhuma"

    // Busca casos recentes via SQL para análise de recorrência
    const ids = similares.map(c => c.id)
    const placeholders = ids.map((_, i) => `$${i + 2}`).join(", ")
    const result = await query(
      `SELECT canal, created_at FROM public.atendimentos
        WHERE id = ANY(ARRAY[${placeholders}]::uuid[])
          AND tenant_id = $1
          AND created_at > NOW() - INTERVAL '${RECURRENCE_WINDOW_DAYS} days'`,
      [tenantId, ...ids],
    )

    if (result.rows.length >= 5) return "sistemico"
    if (result.rows.length >= 2) return "cliente"
    return "nenhuma"
  } catch {
    return "nenhuma"
  }
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Cura uma transcrição de atendimento encerrado.
 * 1. Sanitiza PII do texto
 * 2. Extrai estrutura via LLM
 * 3. Gera embedding
 * 4. Detecta recorrência
 * 5. Insere em public.atendimentos
 *
 * @param rawText   Transcrição bruta da conversa
 * @param tenantId  Tenant do atendimento
 * @param conversationId ID da conversa (para rastreabilidade)
 */
export async function curarConversa(
  rawText: string,
  tenantId: string,
  conversationId: string,
): Promise<CuratedCase> {
  // 1. Sanitiza PII antes de qualquer processamento IA
  const textoSanitizado = sanitizePII(rawText)

  // 2. Extrai estrutura via LLM
  let parsed: CurationResult
  try {
    // gerarTextoIACurador usa Llama 4 Maverick (128k contexto) — mais preciso para JSON.
    // Mesma chave Groq, 100% gratuito. Fallback automático para Scout se Maverick falhar.
    const resposta = await gerarTextoIACurador(
      SYSTEM_CURATOR,
      `Analise este atendimento de suporte técnico e extraia as informações:\n\n${textoSanitizado.slice(0, 8000)}`,
    )
    // Remove possível markdown wrapper
    const jsonStr = resposta
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim()
    parsed = JSON.parse(jsonStr)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.warn("ai_curator_parse_error", { conversationId, tenantId, error: msg })
    // Fallback mínimo: usa texto bruto como resumo
    parsed = {
      resumo_problema: textoSanitizado.slice(0, 200),
      causa: "Extraído automaticamente — revisar manualmente",
      solucao: textoSanitizado.slice(0, 1000),
      categoria: "outro",
      tags: ["curadoria_automatica"],
      dominio: "geral",
    }
  }

  // 3. Gera embedding do resumo sanitizado
  let embedding: number[] = []
  try {
    embedding = await gerarEmbedding(parsed.resumo_problema)
  } catch (e) {
    logger.warn("ai_curator_embedding_error", { conversationId, tenantId })
  }

  // 4. Detecta recorrência
  const recurrence_alert = await detectarRecorrencia(parsed.resumo_problema, tenantId)
  if (recurrence_alert !== "nenhuma") {
    logger.warn("ai_curator_recorrencia", { tenantId, tipo: recurrence_alert, resumo: parsed.resumo_problema.slice(0, 100) })
  }

  // 5. Insere na base de conhecimento
  const embeddingStr = embedding.length > 0
    ? `[${embedding.join(",")}]`
    : null

  try {
    // Usa postgres-client (com vector) se disponível para persistir embedding
    const { query: queryVec } = await import("@/lib/database/postgres-client").catch(() => ({ query: null }))
    const q = queryVec ?? query

    const tagsArr = `{${(parsed.tags ?? [])
      .map(t => `"${t.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
      .join(",")}}`

    const baseParams: unknown[] = [
      tenantId,
      parsed.resumo_problema,
      parsed.causa,
      parsed.solucao,
      parsed.categoria,
      tagsArr,
      textoSanitizado.slice(0, 10000),
    ]

    const embeddingClause = embeddingStr
      ? `, $${baseParams.length + 1}::vector`
      : ", NULL"
    if (embeddingStr) baseParams.push(embeddingStr)

    const result = await q(
      `INSERT INTO public.atendimentos
         (tenant_id, canal, cliente, tecnico,
          resumo_problema, causa, solucao, categoria, tags,
          texto_original, embedding,
          resolution_confirmed, resolution_source)
       VALUES ($1, 'curado', 'Mavo AI Curator', 'Mavo AI',
               $2, $3, $4, $5, $6, $7
               ${embeddingClause},
               true, 'autonomous_ai')
       RETURNING id`,
      baseParams,
    )

    const id = result.rows[0]?.id ?? crypto.randomUUID()

    logger.info("ai_curator_ok", { id, tenantId, conversationId, recurrence_alert })

    // Captura automática 100% (Fase 2 da Curadoria): todo atendimento encerrado que passa
    // por aqui também vira um RASCUNHO em knowledge_items, pronto pra revisão do gerente —
    // antes disso, a "dobradinha" dependia do gerente digitar manualmente. Best-effort: uma
    // falha aqui não pode derrubar a curadoria em `atendimentos` (que já foi concluída acima).
    if (parsed.resumo_problema.trim().length >= 5) {
      try {
        await createKnowledgeItem({
          tenant_id: tenantId,
          pergunta: parsed.resumo_problema,
          intencao: parsed.causa,
          categoria: parsed.categoria,
          palavras_chave: parsed.tags ?? [],
          resposta_oficial: parsed.solucao,
          status: "rascunho",
          criador: "auto-encerramento",
          origem_conversa_id: conversationId,
          origem_atendimento_id: id,
        })
      } catch (e) {
        logger.warn("captura_automatica_knowledge_falhou", {
          conversationId,
          tenantId,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return {
      id,
      resumo_problema : parsed.resumo_problema,
      causa           : parsed.causa,
      solucao         : parsed.solucao,
      categoria       : parsed.categoria,
      tags            : parsed.tags ?? [],
      dominio         : parsed.dominio ?? "geral",
      recurrence_alert,
      tenant_id       : tenantId,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    logger.error("ai_curator_insert_error", { conversationId, tenantId, error: msg })
    throw new Error(`Falha ao inserir caso curado: ${msg}`)
  }
}

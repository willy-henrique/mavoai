/**
 * lib/knowledge-curation.ts
 *
 * Núcleo do Módulo de Curadoria (tabela `knowledge_items`).
 * Ciclo de governança: rascunho → em_teste → publicado → arquivado.
 *
 * A "dobradinha": `gerarRascunhoDeConversa` cruza a PERGUNTA do cliente (início)
 * com a SOLUÇÃO do técnico (fim) e cria um conhecimento candidato em RASCUNHO,
 * aguardando validação do gerente antes de ir para produção.
 */

import { query } from "@/lib/database/postgres-client-no-vector"
import { gerarTextoIACurador, gerarEmbeddingIA } from "@/lib/ai-provider"
import { embeddingParaVector } from "@/lib/embeddings"
import { sanitizePII } from "@/lib/pii-sanitizer"
import { logger } from "@/lib/logger"

export type KnowledgeStatus = "rascunho" | "em_teste" | "publicado" | "arquivado"

export const KNOWLEDGE_STATUSES: KnowledgeStatus[] = [
  "rascunho",
  "em_teste",
  "publicado",
  "arquivado",
]

export interface KnowledgeItem {
  id: string
  tenant_id: string
  pergunta: string
  intencao: string | null
  categoria: string | null
  tags: string[]
  palavras_chave: string[]
  resposta_oficial: string
  resposta_alternativa: string | null
  exemplos: string[]
  confianca: number
  prioridade: number
  status: KnowledgeStatus
  versao: number
  criador: string | null
  revisor: string | null
  origem_conversa_id: string | null
  origem_atendimento_id: string | null
  uso_count: number
  ultimo_uso_at: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

const SELECT_COLS = `id, tenant_id, pergunta, intencao, categoria, tags, palavras_chave,
  resposta_oficial, resposta_alternativa, exemplos, confianca, prioridade, status, versao,
  criador, revisor, origem_conversa_id, origem_atendimento_id, uso_count, ultimo_uso_at,
  created_at, updated_at, published_at`

// ─── Leitura ──────────────────────────────────────────────────────────────────

export async function listKnowledgeItems(params: {
  tenantId?: string
  status?: KnowledgeStatus | "todos"
  busca?: string
  limit?: number
  offset?: number
}): Promise<{ data: KnowledgeItem[]; total: number }> {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100)
  const offset = Math.max(params.offset ?? 0, 0)

  const where: string[] = []
  const args: unknown[] = []
  if (params.tenantId) {
    args.push(params.tenantId)
    where.push(`tenant_id = $${args.length}`)
  }
  if (params.status && params.status !== "todos") {
    args.push(params.status)
    where.push(`status = $${args.length}`)
  }
  if (params.busca?.trim()) {
    args.push(`%${params.busca.trim()}%`)
    const p = `$${args.length}`
    where.push(`(pergunta ILIKE ${p} OR resposta_oficial ILIKE ${p} OR intencao ILIKE ${p})`)
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

  try {
    const [countRes, dataRes] = await Promise.all([
      query(`SELECT COUNT(*)::int AS total FROM public.knowledge_items ${whereSql}`, args),
      query(
        `SELECT ${SELECT_COLS} FROM public.knowledge_items ${whereSql}
         ORDER BY updated_at DESC LIMIT $${args.length + 1} OFFSET $${args.length + 2}`,
        [...args, limit, offset],
      ),
    ])
    return { data: dataRes.rows as KnowledgeItem[], total: Number(countRes.rows[0]?.total || 0) }
  } catch (e) {
    // Tabela ainda não migrada → retorna vazio em vez de quebrar a UI
    logger.warn("knowledge_items_list_falhou", { error: e instanceof Error ? e.message : String(e) })
    return { data: [], total: 0 }
  }
}

export async function getKnowledgeItem(id: string): Promise<KnowledgeItem | null> {
  const res = await query(`SELECT ${SELECT_COLS} FROM public.knowledge_items WHERE id = $1`, [id])
  return (res.rows[0] as KnowledgeItem) ?? null
}

/**
 * Gera e grava o embedding do item (Fase 2 da Curadoria) — só assim o conteúdo
 * publicado entra na busca vetorial do RAG (ver `buscar_knowledge_semantico` em
 * scripts/015_knowledge_semantic_search.sql e `lib/semantic-search.ts`).
 * Best-effort: uma falha aqui não deve derrubar a publicação/edição do item.
 */
async function reindexarEmbedding(item: KnowledgeItem): Promise<void> {
  try {
    const texto = [item.pergunta, item.palavras_chave.join(", "), item.resposta_oficial]
      .filter(Boolean)
      .join("\n")
    const embedding = await gerarEmbeddingIA(texto, "retrieval.passage")
    await query(`UPDATE public.knowledge_items SET embedding = $1::vector WHERE id = $2`, [
      embeddingParaVector(embedding),
      item.id,
    ])
  } catch (e) {
    logger.warn("knowledge_item_embedding_falhou", { id: item.id, error: e instanceof Error ? e.message : String(e) })
  }
}

// ─── Escrita ──────────────────────────────────────────────────────────────────

export interface KnowledgeInput {
  tenant_id?: string
  pergunta: string
  intencao?: string | null
  categoria?: string | null
  tags?: string[]
  palavras_chave?: string[]
  resposta_oficial?: string
  resposta_alternativa?: string | null
  exemplos?: string[]
  confianca?: number
  prioridade?: number
  status?: KnowledgeStatus
  criador?: string | null
  origem_conversa_id?: string | null
  origem_atendimento_id?: string | null
}

export async function createKnowledgeItem(input: KnowledgeInput): Promise<KnowledgeItem> {
  const res = await query(
    `INSERT INTO public.knowledge_items
      (tenant_id, pergunta, intencao, categoria, tags, palavras_chave,
       resposta_oficial, resposta_alternativa, exemplos, confianca, prioridade,
       status, criador, origem_conversa_id, origem_atendimento_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15)
     RETURNING ${SELECT_COLS}`,
    [
      input.tenant_id ?? "auge",
      input.pergunta,
      input.intencao ?? null,
      input.categoria ?? null,
      input.tags ?? [],
      input.palavras_chave ?? [],
      input.resposta_oficial ?? "",
      input.resposta_alternativa ?? null,
      JSON.stringify(input.exemplos ?? []),
      input.confianca ?? 0.8,
      input.prioridade ?? 0,
      input.status ?? "rascunho",
      input.criador ?? null,
      input.origem_conversa_id ?? null,
      input.origem_atendimento_id ?? null,
    ],
  )
  return res.rows[0] as KnowledgeItem
}

/** Campos editáveis pelo gerente. Conteúdo alterado incrementa a versão. */
export async function updateKnowledgeItem(
  id: string,
  patch: Partial<KnowledgeInput> & { revisor?: string | null },
): Promise<KnowledgeItem | null> {
  const sets: string[] = []
  const args: unknown[] = []
  const add = (col: string, val: unknown, cast = "") => {
    args.push(val)
    sets.push(`${col} = $${args.length}${cast}`)
  }

  const contentFields: Array<keyof KnowledgeInput> = [
    "pergunta", "intencao", "categoria", "resposta_oficial", "resposta_alternativa",
    "confianca", "prioridade",
  ]
  let mudouConteudo = false
  for (const f of contentFields) {
    if (patch[f] !== undefined) {
      add(f, patch[f])
      mudouConteudo = true
    }
  }
  if (patch.tags !== undefined) { add("tags", patch.tags); mudouConteudo = true }
  if (patch.palavras_chave !== undefined) { add("palavras_chave", patch.palavras_chave); mudouConteudo = true }
  if (patch.exemplos !== undefined) { add("exemplos", JSON.stringify(patch.exemplos), "::jsonb"); mudouConteudo = true }
  if (patch.revisor !== undefined) add("revisor", patch.revisor)

  if (sets.length === 0) return getKnowledgeItem(id)

  sets.push(`updated_at = NOW()`)
  if (mudouConteudo) sets.push(`versao = versao + 1`)

  args.push(id)
  const res = await query(
    `UPDATE public.knowledge_items SET ${sets.join(", ")} WHERE id = $${args.length}
     RETURNING ${SELECT_COLS}`,
    args,
  )
  const item = (res.rows[0] as KnowledgeItem) ?? null
  // Item já publicado + conteúdo mudou → reindexar, senão a busca fica com embedding velho.
  if (item && mudouConteudo && item.status === "publicado") await reindexarEmbedding(item)
  return item
}

/** Transição de status com regras (publicar carimba published_at + revisor). */
export async function transitionStatus(
  id: string,
  novo: KnowledgeStatus,
  revisor?: string | null,
): Promise<KnowledgeItem | null> {
  const publishedClause = novo === "publicado" ? ", published_at = NOW()" : ""
  const res = await query(
    `UPDATE public.knowledge_items
       SET status = $1, revisor = COALESCE($2, revisor), updated_at = NOW()${publishedClause}
     WHERE id = $3
     RETURNING ${SELECT_COLS}`,
    [novo, revisor ?? null, id],
  )
  const item = (res.rows[0] as KnowledgeItem) ?? null
  if (item) {
    logger.info("knowledge_item_status", { id, status: novo, revisor: revisor ?? null })
    if (novo === "publicado") await reindexarEmbedding(item)
  }
  return item
}

export async function deleteKnowledgeItem(id: string): Promise<boolean> {
  const res = await query(`DELETE FROM public.knowledge_items WHERE id = $1 RETURNING id`, [id])
  return res.rows.length > 0
}

// ─── A dobradinha: pergunta do cliente + solução do técnico → rascunho ──────────

/**
 * Gera um conhecimento candidato (RASCUNHO) a partir de um atendimento real.
 * Cruza a primeira mensagem (pergunta do cliente) com a solução informada pelo
 * técnico no fim. Enriquece intenção/categoria/tags via LLM curador (best-effort).
 */
export async function gerarRascunhoDeConversa(params: {
  tenantId?: string
  perguntaCliente: string
  solucaoTecnico: string
  transcricao?: string
  conversationId?: string
  atendimentoId?: string
  criador?: string
}): Promise<KnowledgeItem> {
  const pergunta = sanitizePII(params.perguntaCliente.trim())
  const solucao = sanitizePII(params.solucaoTecnico.trim())
  const contexto = params.transcricao ? sanitizePII(params.transcricao.slice(0, 6000)) : ""

  // Enriquecimento via LLM (intenção, categoria, tags, palavras-chave) — best-effort.
  let intencao: string | null = null
  let categoria: string | null = null
  let tags: string[] = []
  let palavras: string[] = []
  try {
    const raw = await gerarTextoIACurador(
      `Você organiza conhecimento de suporte técnico (ERP/PDV). A partir da pergunta do cliente e da solução do técnico, extraia metadados. Responda SOMENTE JSON válido:
{"intencao":"frase curta da intenção","categoria":"fiscal|pdv|tef|estoque|hardware|financeiro|cadastro|integracao|outro","tags":["até 6"],"palavras_chave":["até 6 variações de como o cliente pergunta isso"]}`,
      `PERGUNTA DO CLIENTE: ${pergunta}\n\nSOLUÇÃO DO TÉCNICO: ${solucao}${contexto ? `\n\nCONTEXTO: ${contexto}` : ""}`,
    )
    const m = raw.match(/\{[\s\S]*\}/)
    if (m) {
      const j = JSON.parse(m[0]) as {
        intencao?: string; categoria?: string; tags?: unknown; palavras_chave?: unknown
      }
      intencao = j.intencao?.trim() || null
      categoria = j.categoria?.trim() || null
      tags = Array.isArray(j.tags) ? j.tags.map(String).slice(0, 6) : []
      palavras = Array.isArray(j.palavras_chave) ? j.palavras_chave.map(String).slice(0, 6) : []
    }
  } catch (e) {
    logger.warn("dobradinha_enrich_falhou", { error: e instanceof Error ? e.message : String(e) })
  }

  return createKnowledgeItem({
    tenant_id: params.tenantId ?? "auge",
    pergunta,
    intencao,
    categoria,
    tags,
    palavras_chave: palavras,
    resposta_oficial: solucao,
    exemplos: palavras, // variações servem de exemplos iniciais
    status: "rascunho",
    criador: params.criador ?? "dobradinha",
    origem_conversa_id: params.conversationId ?? null,
    origem_atendimento_id: params.atendimentoId ?? null,
  })
}

// ─── Métricas do dashboard ──────────────────────────────────────────────────────

export interface CurationStats {
  por_status: Record<string, number>
  total: number
  ultimos: Array<{ id: string; pergunta: string; status: string; updated_at: string }>
  /** Publicados mais usados em respostas reais (RAG) — indica o que está de fato ajudando a IA. */
  mais_usados: Array<{ id: string; pergunta: string; uso_count: number; ultimo_uso_at: string | null }>
  /** Nº de itens publicados que nunca foram usados numa resposta real — candidatos a revisar/arquivar. */
  publicados_sem_uso: number
}

export async function curationStats(tenantId?: string): Promise<CurationStats> {
  const where = tenantId ? `WHERE tenant_id = $1` : ""
  const wherePublicado = tenantId ? `WHERE tenant_id = $1 AND status = 'publicado'` : `WHERE status = 'publicado'`
  const args = tenantId ? [tenantId] : []
  try {
    const [statusRes, ultimosRes, maisUsadosRes, semUsoRes] = await Promise.all([
      query(`SELECT status, COUNT(*)::int AS n FROM public.knowledge_items ${where} GROUP BY status`, args),
      query(
        `SELECT id, pergunta, status, updated_at FROM public.knowledge_items ${where}
         ORDER BY updated_at DESC LIMIT 8`,
        args,
      ),
      query(
        `SELECT id, pergunta, uso_count, ultimo_uso_at FROM public.knowledge_items
         ${wherePublicado} AND uso_count > 0
         ORDER BY uso_count DESC LIMIT 8`,
        args,
      ),
      query(
        `SELECT COUNT(*)::int AS n FROM public.knowledge_items ${wherePublicado} AND uso_count = 0`,
        args,
      ),
    ])
    const por_status: Record<string, number> = {}
    let total = 0
    for (const r of statusRes.rows as Array<{ status: string; n: number }>) {
      por_status[r.status] = r.n
      total += r.n
    }
    return {
      por_status,
      total,
      ultimos: ultimosRes.rows as CurationStats["ultimos"],
      mais_usados: maisUsadosRes.rows as CurationStats["mais_usados"],
      publicados_sem_uso: Number(semUsoRes.rows[0]?.n || 0),
    }
  } catch {
    return { por_status: {}, total: 0, ultimos: [], mais_usados: [], publicados_sem_uso: 0 }
  }
}

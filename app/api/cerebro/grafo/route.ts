/**
 * GET /api/cerebro/grafo?tenant_id=X
 *
 * Grafo de conhecimento baseado em dados REAIS do banco.
 * - Nós: módulos/categorias com casos processados
 * - Tamanho do nó: proporcional a casos com embedding
 * - Arestas: co-ocorrência real de módulos no mesmo dia +
 *            relações estruturais do KEYWORD_MODULE_MAP
 * - Auto-refrescável: sem cache (force-dynamic)
 */

import { KEYWORD_MODULE_MAP, type AugeModule } from "@/lib/auge-knowledge"
import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export type GrafoNodeData = {
  id: string
  label: string
  group: string
  val: number
  cases_total: number
  cases_embedded: number
  embedding_pct: number
}

export type GrafoLinkData = {
  source: string
  target: string
  weight: number
}

export type GrafoResponse = {
  nodes: GrafoNodeData[]
  links: GrafoLinkData[]
  meta: { total_cases: number; embedded_cases: number; last_updated: string | null }
}

// ─── Módulos AUGE ─────────────────────────────────────────────────────────────

const MODULE_LABELS: Record<AugeModule, string> = {
  fiscal: "Fiscal", nfe: "NF-e", nfce: "NFC-e", sat: "SAT",
  sped: "SPED", pdv: "PDV / Caixa", tef: "TEF / PIX", balanca: "Balança",
  estoque: "Estoque", cadastro_produto: "Cadastro de Produto",
  financeiro: "Financeiro", compras: "Compras", hardware: "Hardware",
  impressora_elgin: "Elgin i9/i8/i7",
  banco_dados: "Banco de Dados", instalacao: "Instalação",
  tributacao: "Tributação", certificado: "Certificado Digital",
  clientes: "Clientes", fornecedores: "Fornecedores",
  perfil_movimento: "Perfil de Movimento", vendas_retaguarda: "Vendas",
  contagem_estoque: "Contagem de Estoque", financeiro_avancado: "Fin. Avançado",
  sintegra: "Sintegra", filiais_usuarios: "Filiais e Usuários",
  reforma_tributaria: "Reforma Tributária", geral: "Geral",
}

const MODULE_GROUPS: Record<AugeModule, string> = {
  fiscal: "fiscal", nfe: "fiscal", nfce: "fiscal", sat: "fiscal",
  sped: "fiscal", tributacao: "fiscal", sintegra: "fiscal",
  reforma_tributaria: "fiscal", certificado: "fiscal",
  pdv: "operacoes", tef: "operacoes", balanca: "operacoes",
  perfil_movimento: "operacoes", vendas_retaguarda: "operacoes",
  estoque: "estoque", contagem_estoque: "estoque", compras: "estoque",
  financeiro: "financeiro", financeiro_avancado: "financeiro",
  cadastro_produto: "cadastros", clientes: "cadastros", fornecedores: "cadastros",
  hardware: "infra", impressora_elgin: "infra", banco_dados: "infra",
  instalacao: "infra", filiais_usuarios: "infra",
  geral: "geral",
}

// Palavras-chave por módulo para matching no DB
const MODULE_KEYWORDS: Partial<Record<AugeModule, string[]>> = {
  nfe: ["nfe", "nf-e", "nota fiscal eletronica", "nota fiscal eletrônica", "sefaz", "rejeicao", "danfe", "xml fiscal"],
  nfce: ["nfce", "nfc-e", "nota consumidor", "cupom eletronico"],
  pdv: ["pdv", "caixa", "cupom", "ecf", "sat", "frente de caixa", "mfe"],
  tef: ["tef", "stone", "cielo", "getnet", "pinpad", "gp", "gerenciador de pagamento", "cartao", "pix terminal"],
  estoque: ["estoque", "inventario", "saldo", "movimentacao", "painel de estoque"],
  financeiro: ["financeiro", "titulo", "receber", "pagar", "lancc", "fcontaR", "baixa", "contas a"],
  fiscal: ["fiscal", "tributacao", "aliquota", "cfop", "cst", "ncm", "icms", "pis", "cofins"],
  hardware: ["hardware", "impressora", "balanca", "leitor", "scanner", "driver", "equipamento"],
  certificado: ["certificado", "a1", "a3", "assinatura digital", "token"],
  instalacao: ["instalacao", "configuracao inicial", "banco de dados", "servidor", "setup"],
  compras: ["compra", "entrada mercadoria", "xml compra", "check-in nf", "fornecedor entrada"],
  cadastro_produto: ["cadastro", "produto", "ean", "gtin", "ncm", "codigo de barras"],
  vendas_retaguarda: ["venda", "pedido", "orcamento", "perfil de movimento", "nota saida"],
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function textMatchesModule(text: string, moduleId: AugeModule): boolean {
  const keywords = MODULE_KEYWORDS[moduleId]
  if (!keywords) return false
  const t = text.toLowerCase()
  return keywords.some((kw) => t.includes(kw))
}

function buildStaticLinks(): GrafoLinkData[] {
  const edgeWeights = new Map<string, number>()
  for (const modules of Object.values(KEYWORD_MODULE_MAP)) {
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const a = modules[i]; const b = modules[j]
        if (a === b) continue
        const key = [a, b].sort().join("||")
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1)
      }
    }
  }
  return Array.from(edgeWeights.entries())
    .filter(([, w]) => w >= 2)
    .map(([key, weight]) => {
      const [source, target] = key.split("||")
      return { source, target, weight }
    })
}

// ─── AUGE graph — híbrido (estrutura estática + tamanho real do DB) ───────────

async function buildAugeGrafo(tenantId: string): Promise<GrafoResponse> {
  // Conta casos reais por módulo via keyword matching no texto
  const [coverageRows, dbRows, lastRow] = await Promise.all([
    // Total + embedded count geral
    query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
       FROM atendimentos WHERE tenant_id = $1`,
      [tenantId],
    ),
    // Casos por texto (resumo_problema + categoria) com embedding
    query(
      `SELECT id, COALESCE(resumo_problema, '') || ' ' || COALESCE(categoria, '') || ' ' || COALESCE(solucao, '') AS texto,
              embedding IS NOT NULL AS has_embedding
       FROM atendimentos
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT 2000`,
      [tenantId],
    ),
    // Última atualização
    query(
      `SELECT MAX(updated_at) AS last_updated FROM atendimentos WHERE tenant_id = $1`,
      [tenantId],
    ),
  ])

  const totalCases  = Number(coverageRows.rows[0]?.total ?? 0)
  const embeddedCases = Number(coverageRows.rows[0]?.embedded ?? 0)
  const lastUpdated = lastRow.rows[0]?.last_updated ?? null

  // Conta por módulo
  const moduleTotal = new Map<string, number>()
  const moduleEmbedded = new Map<string, number>()
  const moduleIds = Object.keys(MODULE_LABELS) as AugeModule[]

  for (const row of dbRows.rows as { texto: string; has_embedding: boolean }[]) {
    const matched: AugeModule[] = []
    for (const m of moduleIds) {
      if (m === "geral") continue
      if (textMatchesModule(row.texto, m)) matched.push(m)
    }
    // Se não matchou nenhum módulo específico, vai para "geral"
    const targets = matched.length > 0 ? matched : (["geral"] as AugeModule[])
    for (const m of targets) {
      moduleTotal.set(m, (moduleTotal.get(m) ?? 0) + 1)
      if (row.has_embedding) {
        moduleEmbedded.set(m, (moduleEmbedded.get(m) ?? 0) + 1)
      }
    }
  }

  // Constrói nós — todos os módulos aparecem, tamanho proporcional ao DB
  const nodes: GrafoNodeData[] = moduleIds.map((id) => {
    const total    = moduleTotal.get(id) ?? 0
    const embedded = moduleEmbedded.get(id) ?? 0
    const pct      = total > 0 ? Math.round((embedded / total) * 100) : 0
    // val: 1 se sem casos, cresce logaritmicamente até 10
    const val = total === 0 ? 1 : Math.max(1, Math.min(10, Math.round(Math.log2(total + 1) * 1.5)))
    return {
      id,
      label  : MODULE_LABELS[id],
      group  : MODULE_GROUPS[id] ?? "geral",
      val,
      cases_total   : total,
      cases_embedded: embedded,
      embedding_pct : pct,
    }
  })

  const links = buildStaticLinks()

  return {
    nodes,
    links,
    meta: { total_cases: totalCases, embedded_cases: embeddedCases, last_updated: lastUpdated },
  }
}

// ─── Grafo dinâmico para outros tenants ───────────────────────────────────────

async function buildDynamicGrafo(tenantId: string): Promise<GrafoResponse> {
  const [catRows, coRows, coverageRows, lastRow] = await Promise.all([
    query(
      `SELECT COALESCE(categoria, 'Geral') AS cat,
              COUNT(*)::int AS cnt,
              COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int AS embedded
       FROM atendimentos WHERE tenant_id = $1
       GROUP BY cat ORDER BY cnt DESC`,
      [tenantId],
    ),
    query(
      `SELECT a.categoria AS cat_a, b.categoria AS cat_b, COUNT(*)::int AS weight
       FROM atendimentos a
       JOIN atendimentos b
         ON DATE(a.data_atendimento) = DATE(b.data_atendimento)
        AND a.tenant_id = b.tenant_id AND a.categoria < b.categoria
       WHERE a.tenant_id = $1 AND a.categoria IS NOT NULL AND b.categoria IS NOT NULL
       GROUP BY cat_a, cat_b HAVING COUNT(*) >= 2
       ORDER BY weight DESC LIMIT 60`,
      [tenantId],
    ),
    query(
      `SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS embedded
       FROM atendimentos WHERE tenant_id = $1`,
      [tenantId],
    ),
    query(
      `SELECT MAX(updated_at) AS last_updated FROM atendimentos WHERE tenant_id = $1`,
      [tenantId],
    ),
  ])

  const totalCases    = Number(coverageRows.rows[0]?.total ?? 0)
  const embeddedCases = Number(coverageRows.rows[0]?.embedded ?? 0)
  const total         = catRows.rows.reduce((s: number, r: { cnt: number }) => s + r.cnt, 0) || 1
  const PALETTE       = ["#10b981", "#6366f1", "#f59e0b", "#3b82f6", "#ec4899", "#94a3b8", "#e2e8f0"]

  const nodes: GrafoNodeData[] = catRows.rows.map(
    (r: { cat: string; cnt: number; embedded: number }, i: number) => ({
      id            : r.cat,
      label         : r.cat,
      group         : PALETTE[i % PALETTE.length],
      val           : Math.max(1, Math.min(10, Math.round((r.cnt / total) * 30 + 1))),
      cases_total   : r.cnt,
      cases_embedded: r.embedded,
      embedding_pct : r.cnt > 0 ? Math.round((r.embedded / r.cnt) * 100) : 0,
    }),
  )

  const links: GrafoLinkData[] = coRows.rows.map(
    (r: { cat_a: string; cat_b: string; weight: number }) => ({
      source: r.cat_a, target: r.cat_b, weight: r.weight,
    }),
  )

  return {
    nodes, links,
    meta: { total_cases: totalCases, embedded_cases: embeddedCases, last_updated: lastRow.rows[0]?.last_updated ?? null },
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get("tenant_id") || "auge"

  try {
    const data = tenantId === "auge"
      ? await buildAugeGrafo(tenantId)
      : await buildDynamicGrafo(tenantId)
    return NextResponse.json(data satisfies GrafoResponse)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("cerebro/grafo error:", msg)
    return NextResponse.json({ error: "internal_error" }, { status: 500 })
  }
}

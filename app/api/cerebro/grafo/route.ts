import { KEYWORD_MODULE_MAP, type AugeModule } from "@/lib/auge-knowledge"
import { query } from "@/lib/database/postgres-client-no-vector"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export type GrafoNodeData = {
  id: string
  label: string
  group: string
  val: number
}

export type GrafoLinkData = {
  source: string
  target: string
  weight: number
}

export type GrafoResponse = {
  nodes: GrafoNodeData[]
  links: GrafoLinkData[]
}

const MODULE_LABELS: Record<AugeModule, string> = {
  fiscal: "Fiscal",
  nfe: "NF-e",
  nfce: "NFC-e",
  sat: "SAT",
  sped: "SPED",
  pdv: "PDV / Caixa",
  tef: "TEF / PIX",
  balanca: "Balança",
  estoque: "Estoque",
  cadastro_produto: "Cadastro de Produto",
  financeiro: "Financeiro",
  compras: "Compras",
  hardware: "Hardware",
  banco_dados: "Banco de Dados",
  instalacao: "Instalação",
  tributacao: "Tributação",
  certificado: "Certificado Digital",
  clientes: "Clientes",
  fornecedores: "Fornecedores",
  perfil_movimento: "Perfil de Movimento",
  vendas_retaguarda: "Vendas",
  contagem_estoque: "Contagem de Estoque",
  financeiro_avancado: "Fin. Avançado",
  sintegra: "Sintegra",
  filiais_usuarios: "Filiais e Usuários",
  reforma_tributaria: "Reforma Tributária",
  geral: "Geral",
}

const MODULE_GROUPS: Record<AugeModule, string> = {
  fiscal: "fiscal",
  nfe: "fiscal",
  nfce: "fiscal",
  sat: "fiscal",
  sped: "fiscal",
  tributacao: "fiscal",
  sintegra: "fiscal",
  reforma_tributaria: "fiscal",
  certificado: "fiscal",
  pdv: "operacoes",
  tef: "operacoes",
  balanca: "operacoes",
  perfil_movimento: "operacoes",
  vendas_retaguarda: "operacoes",
  estoque: "estoque",
  contagem_estoque: "estoque",
  compras: "estoque",
  financeiro: "financeiro",
  financeiro_avancado: "financeiro",
  cadastro_produto: "cadastros",
  clientes: "cadastros",
  fornecedores: "cadastros",
  hardware: "infra",
  banco_dados: "infra",
  instalacao: "infra",
  filiais_usuarios: "infra",
  geral: "geral",
}

// Number of keywords where each module appears — used to size nodes
function computeModuleFrequency(): Record<string, number> {
  const freq: Record<string, number> = {}
  for (const modules of Object.values(KEYWORD_MODULE_MAP)) {
    for (const m of modules) {
      freq[m] = (freq[m] ?? 0) + 1
    }
  }
  return freq
}

function buildLinks(): GrafoLinkData[] {
  const edgeWeights = new Map<string, number>()

  for (const modules of Object.values(KEYWORD_MODULE_MAP)) {
    for (let i = 0; i < modules.length; i++) {
      for (let j = i + 1; j < modules.length; j++) {
        const a = modules[i]
        const b = modules[j]
        if (a === b) continue
        const key = [a, b].sort().join("||")
        edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1)
      }
    }
  }

  // Keep only edges with weight >= 2 to avoid graph clutter
  return Array.from(edgeWeights.entries())
    .filter(([, w]) => w >= 2)
    .map(([key, weight]) => {
      const [source, target] = key.split("||")
      return { source, target, weight }
    })
}

// ─── Dynamic graph for non-AUGE tenants ──────────────────────────────────────

async function buildDynamicGrafo(tenantId: string): Promise<GrafoResponse> {
  const [catRows, coRows] = await Promise.all([
    query(
      `SELECT COALESCE(categoria, 'Geral') AS cat, COUNT(*)::int AS cnt
       FROM atendimentos
       WHERE tenant_id = $1
       GROUP BY cat
       ORDER BY cnt DESC`,
      [tenantId],
    ),
    // Co-occurrence: pairs of categories appearing in the same day (proximity signal)
    query(
      `SELECT a.categoria AS cat_a, b.categoria AS cat_b, COUNT(*)::int AS weight
       FROM atendimentos a
       JOIN atendimentos b
         ON DATE(a.data_atendimento) = DATE(b.data_atendimento)
        AND a.tenant_id = b.tenant_id
        AND a.categoria < b.categoria
       WHERE a.tenant_id = $1
         AND a.categoria IS NOT NULL
         AND b.categoria IS NOT NULL
       GROUP BY cat_a, cat_b
       HAVING COUNT(*) >= 2
       ORDER BY weight DESC
       LIMIT 60`,
      [tenantId],
    ),
  ])

  const total = catRows.rows.reduce((s: number, r: { cnt: number }) => s + r.cnt, 0) || 1
  const PALETTE = ["#10b981", "#6366f1", "#f59e0b", "#3b82f6", "#ec4899", "#94a3b8", "#e2e8f0"]

  const nodes: GrafoNodeData[] = catRows.rows.map(
    (r: { cat: string; cnt: number }, i: number) => ({
      id: r.cat,
      label: r.cat,
      group: PALETTE[i % PALETTE.length],
      val: Math.max(1, Math.min(10, Math.round((r.cnt / total) * 30 + 1))),
    }),
  )

  const links: GrafoLinkData[] = coRows.rows.map(
    (r: { cat_a: string; cat_b: string; weight: number }) => ({
      source: r.cat_a,
      target: r.cat_b,
      weight: r.weight,
    }),
  )

  return { nodes, links }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tenantId = searchParams.get("tenant_id") || "auge"

  if (tenantId !== "auge") {
    return NextResponse.json(await buildDynamicGrafo(tenantId))
  }

  const freq = computeModuleFrequency()

  const nodes: GrafoNodeData[] = Object.entries(MODULE_LABELS).map(([id, label]) => ({
    id,
    label,
    group: MODULE_GROUPS[id as AugeModule] ?? "geral",
    val: Math.max(1, Math.min(10, Math.round((freq[id] ?? 1) / 3))),
  }))

  const links = buildLinks()

  return NextResponse.json({ nodes, links } satisfies GrafoResponse)
}

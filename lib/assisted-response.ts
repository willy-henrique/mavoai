import { gerarTextoIA } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"
import type { ResultadoSemantico } from "@/lib/semantic-search"

const SYSTEM_PROMPT = `Você é um técnico sênior de suporte de sistemas ERP, TI e hardware com 15+ anos de experiência no Brasil.

Sua função: analisar o problema atual e os casos similares históricos para gerar uma resposta técnica prática e aplicável imediatamente.

REGRAS:
1. Use os casos similares como base de diagnóstico — extraia padrões, causas e soluções
2. Se houver múltiplos casos similares, identifique o mais relevante e indique as diferenças
3. Seja específico: nomes de menus, caminhos, configurações, comandos, queries reais
4. Estruture sempre em: Diagnóstico → Passos de validação → Ação corretiva → Riscos/Cuidados
5. Se os casos não forem suficientes, indique claramente o que validar para refinar o diagnóstico
6. Nunca invente dados, caminhos ou comportamentos que não estejam no contexto
7. Se houver risco de perda de dados, avise explicitamente ANTES dos passos
8. Responda em português do Brasil, tom técnico e profissional`

const SYSTEM_PROMPT_CLIENTE = `Você é um especialista de suporte que escreve para o cliente final (não técnico).

REGRAS:
1. Linguagem simples, clara e cordial — como se explicasse para alguém sem conhecimento técnico
2. Não exponha detalhes internos de operação, nomes de servidores ou configurações sensíveis
3. Traduza termos técnicos para linguagem leiga sempre que possível
4. Inclua próximos passos numerados, simples e seguros
5. Se um passo exigir acesso técnico, diga "solicite ao seu técnico que..."
6. Nunca prometa prazo ou resultado garantido
7. Tom tranquilizador: reconheça o problema, explique o que será feito, mostre caminho claro
8. Responda em português do Brasil
9. Seja objetivo: no máximo 5 linhas curtas e sem textos longos`

function compactarCasos(casos: ResultadoSemantico[]) {
  return casos.map((c) => ({
    id: c.id,
    similaridade: c.similaridade,
    resumo_problema: (c.resumo_problema || "").slice(0, 900),
    causa: c.causa ? String(c.causa).slice(0, 400) : null,
    solucao: c.solucao ? String(c.solucao).slice(0, 900) : null,
  }))
}

function calcularConfianca(casos: ResultadoSemantico[]) {
  if (casos.length === 0) return "baixa" as const
  const top = Number(casos[0]?.similaridade || 0)
  if (top >= 0.82) return "alta" as const
  if (top >= 0.55) return "media" as const
  return "baixa" as const
}

export async function gerarRespostaAssistidaComContexto(
  texto: string,
  audience: "atendente" | "cliente" = "atendente",
) {
  const casosSimilares = await buscarSemantica(texto, 3)
  const textoLimpo = texto.trim().slice(0, 8000)
  const casosCompactados = compactarCasos(casosSimilares)
  const casosJson = JSON.stringify(casosCompactados, null, 2)
  const confianca = calcularConfianca(casosSimilares)

  const prompt = `PROBLEMA ATUAL:
${textoLimpo}

CASOS SIMILARES (ordenados por similaridade):
${casosJson}

Gere uma resposta sugerida estruturada com:
1) Diagnóstico provável (baseado nos padrões dos casos similares)
2) Passos práticos de validação (o que verificar primeiro)
3) Ação corretiva recomendada (solução principal, com caminhos e configurações específicas se disponíveis)
4) Riscos e cuidados (o que NÃO fazer, risco de perda de dados, etc.)
5) Se os casos não forem suficientes: indique o que coletar para fechar o diagnóstico`

  const resposta = await gerarTextoIA(
    audience === "cliente" ? SYSTEM_PROMPT_CLIENTE : SYSTEM_PROMPT,
    prompt,
  )
  return { resposta, casos: casosCompactados, confianca }
}

export async function gerarRespostaAssistida(
  texto: string
): Promise<string> {
  const result = await gerarRespostaAssistidaComContexto(texto, "atendente")
  return result.resposta
}

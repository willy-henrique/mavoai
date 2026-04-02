import { gerarTextoIA } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"
import type { ResultadoSemantico } from "@/lib/semantic-search"

const SYSTEM_PROMPT = `Voce e um tecnico senior de suporte.
Use os casos similares para montar uma resposta pratica, objetiva e aplicavel.
Evite respostas genericas.
Se os casos nao forem suficientes, deixe claro o que validar no diagnostico.
Responda em portugues do Brasil.`

const SYSTEM_PROMPT_CLIENTE = `Voce e um assistente de suporte que escreve para cliente final.
Use linguagem clara, simples e cordial.
Nao exponha detalhes internos de operacao.
Inclua proximos passos objetivos e seguros.`

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
  supabase: any,
  texto: string,
  audience: "atendente" | "cliente" = "atendente",
) {
  const casosSimilares = await buscarSemantica(supabase, texto, 3)
  const textoLimpo = texto.trim().slice(0, 8000)
  const casosCompactados = compactarCasos(casosSimilares)
  const casosJson = JSON.stringify(casosCompactados, null, 2)
  const confianca = calcularConfianca(casosSimilares)

  const prompt = `
Problema atual:
${textoLimpo}

Casos similares:
${casosJson}

Gere uma resposta sugerida com:
1) Diagnostico provavel
2) Passos praticos de validacao
3) Acao de correcao recomendada
4) Riscos/cuidados
`

  const resposta = await gerarTextoIA(
    audience === "cliente" ? SYSTEM_PROMPT_CLIENTE : SYSTEM_PROMPT,
    prompt,
  )
  return { resposta, casos: casosCompactados, confianca }
}

export async function gerarRespostaAssistida(
  supabase: any,
  texto: string
): Promise<string> {
  const result = await gerarRespostaAssistidaComContexto(supabase, texto, "atendente")
  return result.resposta
}

import { gerarTextoIA } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"
import { ANTI_HALLUCINATION_BLOCK } from "@/lib/escalation-detector"
import type { ResultadoSemantico } from "@/lib/semantic-search"

const SYSTEM_PROMPT = `Você é o Mavo AI, assistente de suporte técnico especializado em ERP, TI e hardware para empresas brasileiras (especialista em AUGE ERP e varejo).

COMPORTAMENTO:
- Se a mensagem for uma saudação, cumprimento ou mensagem vaga (ex: "oi", "boa tarde", "preciso de ajuda"): responda de forma cordial e pergunte qual é o problema técnico. NÃO gere análise técnica sem um problema concreto descrito.
- Se houver um problema técnico descrito: use os casos similares do banco para gerar uma análise estruturada.
- Se a similaridade dos casos for baixa (abaixo de 0.35): informe que não encontrou casos similares suficientes e peça mais detalhes sobre o problema.

VOCABULÁRIO AUGE (use quando relevante):
- Perfil de Movimento: define se a operação movimenta estoque, gera financeiro e gera fiscal
- LANCC: lançamentos financeiros; FContaR: Contas a Receber; FReceb: Baixa/Recebimento
- CABVEN/ITEVEN: cabeçalho e itens dos movimentos (vendas, compras)
- Chave NFe: documento gerado; Protocolo: autorização da SEFAZ
- DATAEXCLUSAO: exclusão lógica — registro inativo mas presente no banco
- FVendas: tela principal de vendas E compras (comportamento muda pelo perfil)

QUANDO HOUVER PROBLEMA TÉCNICO COM CASOS SIMILARES (similaridade ≥ 0.35):
1. Diagnóstico provável — baseado nos casos similares (cite a similaridade)
2. Passos de validação — menus, campos, tabelas específicas
3. Ação corretiva — caminhos exatos, configurações, comandos reais
4. Riscos e cuidados — o que NÃO fazer, risco de perda de dados
5. Se insuficiente — o que coletar (erro exato, print, versão, perfil)

REGRAS GERAIS:
- Nunca invente dados, menus ou comportamentos que não estejam no contexto
- Avise EXPLICITAMENTE sobre risco de perda de dados antes dos passos
- Responda em português do Brasil
- Erro DNS 12007: sempre é falha de DNS no cliente, nunca SEFAZ offline — solução: DNS 8.8.8.8
${ANTI_HALLUCINATION_BLOCK}`

const SYSTEM_PROMPT_CLIENTE = `Você é um especialista de suporte que escreve para o cliente final (não técnico).

REGRAS:
1. Linguagem simples, clara e cordial — como se explicasse para alguém sem conhecimento técnico
2. Não exponha detalhes internos: não citar nomes de tabelas, servidores, queries ou configurações sensíveis
3. Traduza termos técnicos para linguagem leiga sempre que possível
4. Inclua próximos passos numerados, simples e seguros — máximo 4 passos visíveis
5. Se um passo exigir acesso técnico: "solicite ao seu técnico que..."
6. Nunca prometa prazo ou resultado garantido
7. Tom tranquilizador: reconheça o problema, explique o que será feito, mostre caminho claro
8. Responda em português do Brasil
9. Seja objetivo: no máximo 5 linhas curtas — sem repetições e sem textos longos
10. Sempre feche com uma frase de próximo passo claro para o cliente`

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

const SAUDACOES = /^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hello|hi|tudo bem|tudo bom|e ai|eai|opa|salve)\b/i

function ehSaudacao(texto: string): boolean {
  return SAUDACOES.test(texto.trim()) && texto.trim().length < 60
}

export async function gerarRespostaAssistidaComContexto(
  texto: string,
  audience: "atendente" | "cliente" = "atendente",
) {
  const textoLimpo = texto.trim().slice(0, 8000)

  // Saudação simples — responde diretamente sem buscar RAG
  if (ehSaudacao(textoLimpo)) {
    const resposta = await gerarTextoIA(
      SYSTEM_PROMPT,
      `MENSAGEM DO USUÁRIO: "${textoLimpo}"\n\nResponda de forma cordial e pergunte qual problema técnico o atendente precisa resolver. Seja breve (2-3 linhas).`,
    )
    return { resposta, casos: [], confianca: "baixa" as const }
  }

  const casosSimilares = await buscarSemantica(textoLimpo, 5)
  const casosCompactados = compactarCasos(casosSimilares)
  const confianca = calcularConfianca(casosSimilares)
  const topSimilaridade = Number(casosSimilares[0]?.similaridade || 0)
  const temContexto = topSimilaridade >= 0.35

  const casosJson = temContexto
    ? JSON.stringify(casosCompactados, null, 2)
    : "[]"

  const prompt = audience === "cliente"
    ? `MENSAGEM DO CLIENTE: "${textoLimpo}"

CASOS SIMILARES DO BANCO (similaridade máxima: ${topSimilaridade.toFixed(2)}):
${casosJson}

Escreva uma resposta para o cliente final (não técnico):
1) Reconheça o problema em 1 frase simples
2) Explique o que provavelmente está acontecendo (sem jargão técnico)
3) Liste 2-4 passos simples e seguros para o cliente tentar
4) Indique quando solicitar o técnico e o que dizer a ele`
    : `PROBLEMA RELATADO: "${textoLimpo}"

CASOS SIMILARES DO BANCO (similaridade máxima: ${topSimilaridade.toFixed(2)}):
${casosJson}

${temContexto
  ? `Gere uma análise técnica estruturada baseada nos casos acima:
1) Diagnóstico provável — cite a similaridade do caso mais relevante
2) Passos de validação — menus, campos e tabelas específicas
3) Ação corretiva — caminhos exatos, configurações, comandos reais
4) Riscos e cuidados — o que NÃO fazer, risco de perda de dados
5) Se insuficiente — o que coletar (erro exato, print, versão, perfil)`
  : `Não foram encontrados casos similares suficientes no banco (similaridade máxima: ${topSimilaridade.toFixed(2)}).
Responda de forma útil pedindo informações adicionais para diagnosticar o problema: qual o erro exato, qual módulo/tela, versão do sistema, e qualquer print ou log disponível. Seja objetivo e cordial.`
}`

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

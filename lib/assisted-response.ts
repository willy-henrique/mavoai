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

export const SYSTEM_PROMPT_WHATSAPP = `Você é a Mavo AI — assistente de suporte da Auge, especializada em ajudar clientes pelo WhatsApp.

QUEM VOCÊ É:
Você tem personalidade calorosa, paciente e direta. Fala como gente, não como robô. Conhece profundamente o sistema Auge ERP, maquininhas de pagamento (TEF/POS), impressoras fiscais, SAT, NF-e e redes. Quando não sabe algo, admite e promete acionar um técnico humano.

NA PRIMEIRA MENSAGEM DA CONVERSA:
Apresente-se rápido e natural — só "sou a Mavo AI" e pergunte como pode ajudar. NÃO mencione a Auge nem nenhuma empresa na apresentação. Use o primeiro nome da pessoa (nunca o nome completo). Cada conversa começa diferente. NÃO liste os sistemas que conhece, não diga "estou aqui para o que precisar".

CONHECIMENTO DO AUGE ERP (use quando relevante):
- Perfil de Movimento: controla o que a operação movimenta (estoque, financeiro, fiscal)
- FVendas: tela de vendas e compras — comportamento muda pelo perfil de movimento
- LANCC / FContaR / FReceb: lançamentos, contas a receber, baixa de pagamentos
- Chave NF-e / Protocolo SEFAZ: emissão e autorização do documento fiscal
- SAT / NFC-e: cupom fiscal para varejo
- TEF / POS: integração da maquininha com o caixa
- Erro DNS 12007: problema de DNS no computador do cliente, nunca da SEFAZ → solução: DNS 8.8.8.8

COMO VOCÊ CONVERSA:
- CURTO. Mensagem de WhatsApp, não e-mail. 2 a 4 linhas no máximo. Se der pra dizer em 1 frase, diga em 1.
- Fale como gente conversa, não como manual: "Deixa eu ver aqui", "Entendi", "Pode ser que seja...". Nada de frases de robô de call center.
- Uma pergunta por vez — a mais importante. Espere a resposta antes da próxima.
- Problema novo → reconheça em 1 frase + UMA pergunta certeira. Não despeje passos antes de entender.
- Já entendeu → solução direta, no máximo 3 passos curtos.
- Nunca cite termos técnicos internos (tabelas, queries, IPs).
- Não resolveu → "Vou chamar um técnico pra te ajudar, tá? 🙏"
- Português do Brasil. No máximo 1 emoji por mensagem (às vezes nenhum).

EVITE A TODO CUSTO (soa robô): "Estou aqui para o que precisar", "Como posso te auxiliar", "Fico à disposição", "Prezado(a)", listar tudo que você sabe fazer, repetir o nome da pessoa toda hora.`

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
    const saudacaoPrompt = audience === "cliente"
      ? `O cliente só mandou um "${textoLimpo}" pra abrir a conversa.

Responda como uma pessoa de verdade no WhatsApp: curtíssimo, leve, no máximo 2 frases.
- Cumprimente pelo PRIMEIRO nome só (se souber).
- Diga rapidinho que é a Mavo AI. NÃO mencione a Auge nem nenhuma empresa.
- Pergunte como pode ajudar.

PROIBIDO: "estou aqui para o que precisar", "como posso te auxiliar", listar áreas/sistemas, qualquer frase de robô de atendimento. Fale curto, do jeito que gente fala.
Exemplo do tom (não copie, varie): "Oi, Ana! 😊 Aqui é a Mavo AI. Me conta, o que tá acontecendo?"`
      : `O atendente enviou: "${textoLimpo}"\n\nCumprimente e pergunte qual problema técnico precisa resolver agora.`
    const resposta = await gerarTextoIA(
      audience === "cliente" ? SYSTEM_PROMPT_WHATSAPP : SYSTEM_PROMPT,
      saudacaoPrompt,
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
    ? `MENSAGEM DO CLIENTE VIA WHATSAPP: "${textoLimpo}"

CONTEXTO DO BANCO (similaridade máxima: ${topSimilaridade.toFixed(2)}):
${casosJson}

${temContexto
  ? `Baseado no contexto, responda de forma CURTA e DIRETA (máx 5 linhas):
- Reconheça o problema em 1 frase
- Dê 1-3 passos simples para resolver OU peça UMA informação específica para avançar
- Finalize com ação clara para o cliente`
  : `Não há contexto suficiente. Faça UMA ÚNICA pergunta para entender melhor o problema.
Escolha a pergunta mais importante: qual aparelho/sistema está com problema, qual mensagem aparece na tela, ou quando começou.
NÃO faça lista de perguntas — apenas UMA.`
}`
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
    audience === "cliente" ? SYSTEM_PROMPT_WHATSAPP : SYSTEM_PROMPT,
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

// Específico para WhatsApp — audience cliente + prompt otimizado para conversas curtas
export async function gerarRespostaCliente(
  texto: string,
  nomeCliente?: string,
): Promise<string> {
  const saudacao = nomeCliente ? `O cliente se chama ${nomeCliente}. ` : ""
  const textoComContexto = saudacao ? `[${saudacao}]\n${texto}` : texto
  const result = await gerarRespostaAssistidaComContexto(textoComContexto, "cliente")
  return result.resposta
}

import { gerarTextoIA, gerarTextoIAConversa, gerarTextoIAConversaComAgente } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"
import { ANTI_HALLUCINATION_BLOCK, isEscalationSignal } from "@/lib/escalation-detector"
import { classifyDomain } from "@/lib/ia-router"
import type { ResultadoSemantico } from "@/lib/semantic-search"
import type { ChatTurn } from "@/lib/whatsapp-memory"

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

export const SYSTEM_PROMPT_WHATSAPP = `Você é a Mavo AI — a assistente de suporte técnico da Auge no WhatsApp. Seu trabalho é RESOLVER o problema do cliente, não só fazer perguntas.

QUEM VOCÊ É:
Calorosa, paciente e objetiva. Fala como gente de verdade, nunca como robô de call center. Domina o Auge ERP, PDV, maquininhas de pagamento (TEF/POS), impressoras térmicas e fiscais, SAT, NFC-e/NF-e e redes. Quando não sabe, admite e aciona um técnico humano — nunca inventa.

SEU NOME NO TOPO (importante):
O nome "*Mavo AI*" já aparece AUTOMATICAMENTE em negrito no topo de cada mensagem. Então NUNCA escreva "sou a Mavo AI", "aqui é a Mavo AI" ou similar no corpo do texto — ficaria repetido. Vá direto ao conteúdo.

PRIMEIRA MENSAGEM DA CONVERSA:
Só na PRIMEIRA mensagem: cumprimente pelo primeiro nome (se souber) e pergunte de forma calorosa como pode ajudar hoje. Exemplos (varie, não copie): "Oi, João! Como posso te ajudar hoje?", "Olá! Em que posso te ajudar hoje?". NÃO cite a Auge nem nenhuma empresa, NÃO liste o que você sabe fazer, NÃO diga "estou à disposição". Depois da primeira, NUNCA recomece com saudação nem se reapresente.

COMO RESOLVER (o mais importante):
- Quando o cliente descrever um problema concreto, NÃO devolva uma pergunta genérica. Já ofereça 1 a 3 passos práticos que costumam resolver e só então peça a ÚNICA informação que falta para avançar.
- AVANCE a cada mensagem. Nunca repita uma pergunta que o cliente já respondeu, nem peça algo que ele já disse — olhe o histórico e continue de onde parou.
- Uma pergunta por vez, a mais decisiva. Espere a resposta antes da próxima.
- Já entendeu a causa? Vá direto à solução, em até 3 passos curtos.
- Tentou e não resolveu, ou o problema foge do que você conhece? Aí sim chame um técnico humano (siga a regra de escalação).

NUNCA INVENTE:
- Não afirme marca/modelo de aparelho do qual você não tem certeza. Repita exatamente o que o cliente disse (se ele falou "i9", é "i9" — não troque o número/modelo). Se a foto ou a leitura estiver ambígua, pergunte em vez de chutar.
- Não invente nomes de menu, tela ou caminho do Auge que você não conheça. Descreva o procedimento de forma geral ou peça pro cliente te dizer o que aparece na tela.
- Não prometa prazo nem garanta resultado.

PROCEDIMENTOS RÁPIDOS (use quando o caso se encaixar):
Impressora não imprime (térmica/fiscal — Elgin, Bematech, Epson e afins):
1) Confira se está ligada, com papel e sem luz de erro acesa. Veja se a bobina está na direção certa (o lado que imprime fica para fora do rolo).
2) Faça o autoteste: desligue, segure o botão de avanço de papel e ligue. Se sair a folha de teste, o aparelho está ok e o problema é no computador/sistema.
3) No Windows, veja se a impressora não está "Pausada" ou "Offline" e limpe a fila de impressão.
4) Troque o cabo USB de porta e, no PDV, confira se a impressora selecionada é a correta.
Se mesmo assim não imprimir, aí eu chamo um técnico.

Maquininha/TEF não conecta: internet ok? Reinicie o pinpad e o TEF, confira o cabo e o status do gerenciador de TEF.
SAT/NFC-e não emite: verifique a rede, o status do equipamento SAT e o certificado; se travar, oriente a contingência.
NF-e com erro DNS 12007: é DNS no computador do cliente, nunca a SEFAZ → solução: configurar o DNS para 8.8.8.8.

VOCABULÁRIO AUGE (use só quando ajudar, sem despejar jargão no cliente):
- Perfil de Movimento: controla o que a operação movimenta (estoque, financeiro, fiscal)
- FVendas: tela de vendas e compras — muda conforme o perfil de movimento
- Chave NF-e / Protocolo SEFAZ: emissão e autorização do documento fiscal
- SAT / NFC-e: cupom fiscal do varejo; TEF / POS: maquininha integrada ao caixa

COMO VOCÊ ESCREVE:
- CURTO, de WhatsApp: 2 a 4 linhas no máximo. Se cabe em 1 frase, use 1.
- Tom leve e humano: "Deixa eu ver aqui", "Entendi", "Pode ser que seja...". Nada de frase de manual.
- Português do Brasil. NUNCA use emojis. Nunca cite tabelas, queries, IPs ou termos internos para o cliente.

EVITE A TODO CUSTO (soa robô): emojis, "Estou aqui para o que precisar", "Como posso te auxiliar", "Fico à disposição", "Prezado(a)", repetir o nome da pessoa toda hora, listar tudo que você sabe fazer, e devolver pergunta genérica sem ajudar em nada.`

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

/**
 * Prefixa a resposta com o nome da Mavo AI em negrito (formato WhatsApp):
 *   *Mavo AI*
 *   <resposta>
 * Idempotente — não duplica o cabeçalho se a mensagem já o tiver.
 * Aplicado no ponto de ENVIO de cada canal (não na memória), para o histórico
 * guardar o texto limpo.
 */
export function comCabecalhoMavo(texto: string): string {
  const t = (texto || "").trim()
  if (!t) return t
  if (/^\*\s*Mavo AI\s*\*/i.test(t)) return t
  return `*Mavo AI*\n${t}`
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
- NÃO escreva "sou a Mavo AI" (o nome já vai em negrito no topo da mensagem). NÃO mencione a Auge nem nenhuma empresa.
- Pergunte de forma calorosa como pode ajudar hoje.

PROIBIDO: emojis, "estou aqui para o que precisar", listar áreas/sistemas, qualquer frase de robô de atendimento. Fale curto, do jeito que gente fala.
Exemplo do tom (não copie, varie): "Oi, Ana! Como posso te ajudar hoje?"`
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
  : `Não há caso parecido na base, mas você NÃO deve só fazer pergunta — ajude com o que já sabe.
- Se o problema se encaixa em algum PROCEDIMENTO RÁPIDO do seu conhecimento (impressora, TEF, SAT, NF-e, rede), já passe o primeiro passo prático.
- Em seguida, faça UMA única pergunta para confirmar e avançar (qual mensagem/erro aparece, ou o que acontece ao tentar).
- NÃO despeje lista de perguntas e NÃO invente o modelo do aparelho — use o que o cliente disse.`
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

// ─── Atendimento conversacional do WhatsApp (com memória + handoff) ─────────────

/** Detecta pedido explícito de atendimento humano. */
const PEDIDO_HUMANO =
  /\b(atendente|humano|pessoa de verdade|pessoa real|ser humano|gente de verdade|falar com (algu[ée]m|uma pessoa|um humano|um atendente|o suporte)|quero (falar com|um) (atendente|humano|pessoa)|me transfere|me passa pro?|chama (o|um|a) (suporte|atendente|t[ée]cnico|gerente))\b/i

export function pediuHumano(texto: string): boolean {
  return PEDIDO_HUMANO.test(texto.trim())
}

// Instrução de escalação calibrada para o cliente final (não escala à toa).
const ESCALACAO_WHATSAPP = `

━━━ QUANDO CHAMAR UM ATENDENTE HUMANO ━━━
Tente SEMPRE ajudar primeiro com o que você sabe. Só escale se cair em um destes casos:
• O cliente pede claramente para falar com um atendente/humano
• Você realmente não consegue resolver, ou o problema foge totalmente do que você conhece
• Situação fiscal/financeira séria que você não tem certeza de como resolver
Nesses casos, responda APENAS com o token [ESCALAR_HUMANO] — nada mais, sem explicação.
Se você CONSEGUE ajudar, NÃO escale: ajude de forma direta.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

/**
 * Gera a resposta da Mavo AI para o WhatsApp levando em conta o HISTÓRICO da conversa
 * e ROTEANDO para o especialista do domínio (fiscal, PDV, TEF, estoque, hardware,
 * integração) quando a demanda se encaixa em uma área. Retorna o domínio acionado.
 * Retorna { escalar: true } quando a IA decide passar para um humano.
 */
export async function gerarRespostaWhatsApp(
  mensagem: string,
  nomeCliente: string | undefined,
  historico: ChatTurn[],
  tenantId = "default",
): Promise<{ resposta: string; escalar: boolean; domain: string }> {
  const textoLimpo = mensagem.trim().slice(0, 8000)
  const ehPrimeira = historico.length === 0
  const primeiroNome = nomeCliente?.trim().split(/\s+/)[0]

  const pareceProblema = !ehSaudacao(textoLimpo) || !ehPrimeira

  // Roteamento + RAG em paralelo (só quando parece um problema, não num "oi").
  let contextoRag = ""
  let especialista = null as Awaited<ReturnType<typeof classifyDomain>>["agent"]
  let dominio = "geral"
  if (pareceProblema) {
    const [rota, casos] = await Promise.all([
      classifyDomain(textoLimpo, tenantId).catch(() => null),
      buscarSemantica(textoLimpo, 4).catch(() => []),
    ])
    if (rota) {
      especialista = rota.agent
      dominio = rota.domain
    }
    const top = Number(casos[0]?.similaridade || 0)
    if (top >= 0.35) {
      contextoRag =
        `\n\nCONHECIMENTO INTERNO (use para resolver; NÃO diga que veio de uma "base" nem cite os termos técnicos internos):\n` +
        JSON.stringify(compactarCasos(casos), null, 2)
    }
  }

  const continuidade = ehPrimeira
    ? ""
    : `\n\nIMPORTANTE: você JÁ está no meio de uma conversa com este cliente (veja o histórico acima). NÃO se apresente de novo, NÃO repita "Sou a Mavo AI", NÃO recomece com saudação. Apenas continue naturalmente de onde parou.`

  // Conhecimento do especialista acionado (roteiro de diagnóstico da área).
  const blocoEspecialista = especialista
    ? `\n\n━━━ ESPECIALISTA ACIONADO: ${especialista.name} (${dominio}) ━━━\n` +
      `Você está atuando com o conhecimento do especialista em ${dominio}. Use o roteiro de diagnóstico abaixo para resolver, mas SEMPRE no tom de WhatsApp curto e humano definido lá em cima (sem despejar todos os passos de uma vez — uma coisa por vez):\n` +
      especialista.system_prompt
    : ""

  const system =
    SYSTEM_PROMPT_WHATSAPP +
    (primeiroNome ? `\n\nO cliente se chama ${primeiroNome} — trate pelo primeiro nome, sem repetir o nome toda hora.` : "") +
    continuidade +
    blocoEspecialista +
    contextoRag +
    ESCALACAO_WHATSAPP

  const raw = await gerarTextoIAConversaComAgente(especialista, system, historico, textoLimpo)

  if (isEscalationSignal(raw)) {
    return { resposta: "", escalar: true, domain: dominio }
  }
  return { resposta: raw.trim(), escalar: false, domain: dominio }
}

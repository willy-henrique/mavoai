import { gerarTextoIA, gerarTextoIARapido } from "@/lib/ai-provider"
import { logger } from "@/lib/logger"
import { ANTI_HALLUCINATION_BLOCK, ESCALATION_TOKEN, isEscalationSignal } from "@/lib/escalation-detector"

/**
 * Truncamento inteligente de contexto: preserva o início (problema original)
 * e o fim (troca mais recente). Melhor que slice simples que descarta o começo.
 */
function truncarContexto(ctx: string, maxChars: number): string {
  if (!ctx || ctx.length <= maxChars) return ctx
  const head = Math.floor(maxChars * 0.4)
  const tail = maxChars - head - 20
  return `${ctx.slice(0, head)}\n...[contexto omitido]...\n${ctx.slice(-tail)}`
}

export type InvestigationNivel = "adequado" | "insuficiente" | "fora_do_tema" | "topico_alterado"

export type InvestigationEvalResult = {
  nivel: InvestigationNivel
  motivoCurto: string
  textoResposta: string
}

// ─── Classificador (sem geração de resposta) ─────────────────────────────────

const EVAL_SYSTEM = `Você é um classificador de chamados de suporte técnico B2B (AUGE ERP / varejo, Brasil).

TAREFA: classifique UMA mensagem do cliente dentro de um chamado aberto.

SAÍDA: SOMENTE JSON válido, sem texto adicional:
{"nivel":"adequado"|"insuficiente"|"fora_do_tema"|"topico_alterado","motivoCurto":"até 80 chars"}

━━━ CLASSIFICAÇÕES ━━━

"topico_alterado" ← PRIORIDADE MÁXIMA, verificar PRIMEIRO
O cliente está corrigindo ou mudando o assunto do chamado.
Gatilhos obrigatórios (qualquer um):
• "na verdade" / "mas na verdade" / "na real" / "é outro"
• "nao estou com problema em X, estou com problema em Y"
• "é no concentrador" / "é no TEF" / "é no sistema X" (diferente da fila aberta)
• "me enganei" / "errei" / "esquece" / "não era isso"
• Qualquer redirecionamento explícito para outro sistema/equipamento
⚠ USE mesmo que a mensagem contenha termos técnicos

"adequado" ← evidência técnica objetiva — qualquer UMA abaixo é suficiente
SEMPRE adequado (sem exceção):
• Qualquer código de erro numérico: "erro 12007", "rejeição 252", "erro 504", "código 2"
• Qualquer mensagem de erro literal entre aspas ou copiada da tela
• "acesso negado", "usuário sem permissão", "access denied"
• "O nome do servidor não pode ser resolvido" / "não foi possível resolver"
• Print/foto enviada com texto de erro visível
TAMBÉM adequado:
• Tela/módulo específico + o que acontece: "na emissão da NF-e trava", "ao abrir FVendas aparece X"
• Sintoma verificável localizado: "só na máquina do João", "desde segunda parou", "só em homologação"
• Passos já tentados com resultado: "reiniciei o serviço e voltou o erro X"
• Nome de tabela/campo técnico: "LANCC", "CABVEN", "ITEVEN", "CFOP", "CST"
• Condição específica: "só quando tem desconto acima de 5%", "só para produtos com ST"
⚠ NUNCA classifique como "adequado":
• Saudações: "Opa", "Oi", "Olá", "Ok", "Sim", "Certo", "Bom dia", "Obrigado"
• Respostas de 1-3 palavras sem conteúdo técnico
• Mensagem que só cita o sistema sem descrever o problema: "é no fiscal", "é no AUGE"

"insuficiente" ← quer suporte mas faltam dados
• "não funciona" / "deu erro" / "não está abrindo" (sem código ou mensagem)
• Só cita sistema/equipamento sem descrever o que acontece
• Saudações ou respostas sociais curtas sem conteúdo técnico
• "tem um erro aí" sem especificar qual

"fora_do_tema" ← claramente não é suporte técnico
• Conversa pessoal, brincadeira, spam, propaganda

REGRA DE OURO: Código de erro numérico = SEMPRE adequado. Em dúvida entre adequado/insuficiente para mensagens curtas → use "insuficiente"`

export function parseInvestigationEvalJson(raw: string): Omit<InvestigationEvalResult, "textoResposta"> | null {
  let s = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s)
  if (fence) s = fence[1].trim()
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    const o = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>
    const nivel = o.nivel
    const validNivels: InvestigationNivel[] = ["adequado", "insuficiente", "fora_do_tema", "topico_alterado"]
    if (!validNivels.includes(nivel as InvestigationNivel)) return null
    return {
      nivel: nivel as InvestigationNivel,
      motivoCurto: String(o.motivoCurto || "").slice(0, 120),
    }
  } catch {
    return null
  }
}

// Detecção local rápida de saudações — sem precisar de LLM
const SAUDACOES = [
  "opa", "oi", "olá", "ola", "bom dia", "boa tarde", "boa noite",
  "ok", "sim", "nao", "não", "certo", "obrigado", "obrigada",
  "entendido", "tudo bem", "blz", "vlw", "valeu", "tks", "perfeito",
]

function isSaudacaoOuAcknowledgement(text: string): boolean {
  const t = text.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  // Mensagem curta (até 5 palavras) que só tem saudação
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length > 6) return false
  return SAUDACOES.some((s) => t === s || t.startsWith(s + " ") || t.endsWith(" " + s))
}

// Detecção local de troca de assunto — redundante com o orchestrator mas protege o avaliador
function isTopicChangeLocal(text: string): boolean {
  const t = text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  const patterns = [
    "na verdade", "mas na verdade", "nao estou com problema na",
    "e no concentrador", "e no tef", "e no fiscal", "e no pdv",
    "e em outro", "esquece", "me enganei", "errei",
  ]
  return patterns.some((p) => t.includes(p))
}

export async function evaluateInvestigationTurn(params: {
  queueName: string
  userText: string
  imageAnalysis: string | null
  previousContext?: string
  lastAiQuestion?: string
  inadequateStreak?: number
}): Promise<InvestigationEvalResult> {
  const { queueName, userText, imageAnalysis, previousContext, lastAiQuestion, inadequateStreak = 0 } = params

  // Atalhos locais sem custo de LLM
  if (!userText.trim() || isSaudacaoOuAcknowledgement(userText)) {
    return { nivel: "insuficiente", motivoCurto: "saudacao ou mensagem vazia", textoResposta: "" }
  }
  if (isTopicChangeLocal(userText)) {
    return { nivel: "topico_alterado", motivoCurto: "cliente redirecionou para outro problema", textoResposta: "" }
  }

  const contextSection = previousContext?.trim()
    ? `CONTEXTO ANTERIOR:\n${truncarContexto(previousContext, 800)}\n\n`
    : ""
  const lastQuestionSection = lastAiQuestion?.trim()
    ? `ÚLTIMA PERGUNTA FEITA:\n"${lastAiQuestion.slice(0, 150)}"\n\n`
    : ""

  const userPrompt =
    `CHAMADO ABERTO: "${queueName}"\n\n` +
    `${contextSection}${lastQuestionSection}` +
    `MENSAGEM DO CLIENTE:\n"${userText.trim()}"\n` +
    (imageAnalysis ? `IMAGEM: ${imageAnalysis}\n` : "")

  try {
    // Classificação pura (JSON) → modelo rápido/barato, economiza cota do modelo de chat.
    const raw = await gerarTextoIARapido(EVAL_SYSTEM, userPrompt)
    const parsed = parseInvestigationEvalJson(raw)
    if (parsed) return { ...parsed, textoResposta: "" }
    logger.warn("investigation_eval_unparseable", { preview: raw.slice(0, 200) })
  } catch (e) {
    logger.warn("investigation_eval_api_failed", { error: e instanceof Error ? e.message : String(e) })
  }

  return { nivel: "insuficiente", motivoCurto: "avaliacao indisponivel", textoResposta: "" }
}

// ─── Protocolo de coleta de dados por domínio ────────────────────────────────
// Campos obrigatórios que a IA DEVE coletar antes de dar qualquer diagnóstico.
// Perguntar UM campo por vez, na ordem listada. Só avança quando o anterior foi respondido.

const PROTOCOLO_COLETA = `
━━━ PROTOCOLO DE COLETA — CAMPOS OBRIGATÓRIOS POR DOMÍNIO ━━━
REGRA PRINCIPAL: NUNCA dê solução sem ter o campo #1 do domínio respondido.
Pergunte UM campo por vez, na ordem listada. Só avança quando o anterior foi respondido.

IMPRESSORA / HARDWARE GENÉRICO:
  #1 MODELO EXATO — "Qual o modelo?" (ex: Elgin i9, Bematech MP-4200, Epson TM-T20, Daruma DR-800)
     → Sem modelo não dê nenhum passo — cada modelo tem driver e configuração diferente
  #2 CONEXÃO — USB, rede (IP) ou serial (porta COM)?
  #3 STATUS WINDOWS — Aparece em Impressoras e Scanners? Com qual status?
  #4 ISOLAMENTO — Imprime pelo Bloco de Notas? (isola se é AUGE ou Windows)
  #5 → diagnóstico específico ao modelo confirmado

IMPRESSORA ELGIN i7 / i8 / i9 (modelo já confirmado):
  #1 CONEXÃO — USB (padrão) ou rede?
  #2 STATUS WINDOWS — Aparece em Impressoras e Scanners com status "Pronta" ou "Ociosa"?
  #3 UTILITÁRIO — No Utilitário Elgin aparece "ELGIN i9 | USB | Auto"?
  #4 → passo específico de instalação ou configuração no AUGE (Sistema → Painel de Controle → Parâmetros)

NF-e MODELO 55 / FISCAL:
  #1 ERRO EXATO — Código de rejeição ou mensagem exata (ex: "rejeição 539", "erro 12007")
     → Nunca assuma a causa sem o código. Nunca diga "é DNS" sem ver erro 12007.
  #2 UF — Em qual estado fica a empresa emitente?
  #3 CERTIFICADO — A1 (arquivo .pfx) ou A3 (token/smartcard)?
  #4 AMBIENTE — Produção ou homologação?
  #5 → diagnóstico baseado no código real

NFC-e MODELO 65 / PDV FISCAL:
  #1 ERRO EXATO — Código ou mensagem que aparece no PDV ou na impressora
  #2 CSC/TOKEN — O CSC e Token NFC-e estão configurados no cadastro da empresa?
  #3 AMBIENTE — Produção ou homologação?
  #4 → diagnóstico

SAT CF-e (São Paulo):
  #1 CÓDIGO DO ERRO SAT — "Qual o código numérico retornado pelo SAT?" (ex: 2, 5, 6, 64)
  #2 EQUIPAMENTO — O equipamento SAT está conectado via USB e aparece no Gerenciador de Dispositivos?
  #3 ATIVAÇÃO — O SAT já foi ativado e associado ao CNPJ na SEFAZ-SP?
  #4 → diagnóstico pelo código SAT

TEF / MAQUININHA / PIX:
  #1 ADQUIRENTE — "Qual a operadora?" (Stone, Cielo, Rede, Getnet, Safrapay, PagSeguro, Elgin...)
     → Procedimento, códigos e suporte são completamente diferentes por adquirente
  #2 ERRO — Mensagem no terminal/maquininha E na tela do caixa (podem ser diferentes)
  #3 ABRANGÊNCIA — Afeta todos os caixas/terminais ou só um?
  #4 TIPO — Falha em todos os pagamentos ou só cartão/PIX/débito/crédito?
  #5 → diagnóstico por adquirente + código

BALANÇA:
  #1 MARCA E MODELO — "Qual a marca e modelo?" (Toledo, Filizola, Prix, Urano, Líder, Micheletti...)
  #2 CONEXÃO — Serial (porta COM) ou rede (IP)?
  #3 SINTOMA — Não pesa? Não comunica com o AUGE? Não recebe produtos? Peso errado?
  #4 → diagnóstico por modelo + conexão

BANCO DE DADOS / SERVIDOR / CONEXÃO:
  #1 BANCO — Firebird ou PostgreSQL?
  #2 ERRO EXATO — "Qual a mensagem exata?" (ex: "connection refused", "page corrupted")
  #3 ABRANGÊNCIA — Uma máquina ou todas? Ocorre ao abrir o sistema ou durante uso?
  #4 → diagnóstico por banco + mensagem

PDV / CAIXA (abertura, fechamento, sangria, venda no caixa):
  #1 ETAPA — Em qual momento ocorre? (ao abrir caixa? ao lançar item? ao fechar? ao finalizar?)
  #2 ERRO — Mensagem exata que aparece ou comportamento observado
  #3 OPERADOR — Acontece com todos os operadores ou só com um?
  #4 → diagnóstico por etapa + erro

VENDAS / RETAGUARDA (FVendas, nota de saída):
  #1 PERFIL — Qual perfil de movimento está sendo usado? (ex: *103, venda, NFe modelo 55...)
     → O perfil define tudo: estoque, financeiro, fiscal. Sem ele não dá para diagnosticar.
  #2 ETAPA — Onde trava ou qual comportamento errado? (ao incluir? ao finalizar? ao gerar NF-e?)
  #3 ERRO — Mensagem exata que aparece
  #4 → diagnóstico por perfil + etapa

COMPRAS / ENTRADA DE NOTAS:
  #1 PERFIL — Qual perfil de entrada está usando? (ex: *201, entrada, check-in NF...)
  #2 ETAPA — Onde trava? (ao bipar chave? ao carregar itens? ao gravar? ao gerar financeiro?)
  #3 ERRO — Mensagem exata
  #4 → diagnóstico por perfil + etapa

ESTOQUE / CONTAGEM:
  #1 TIPO — Estoque comum ou com grade (tamanho/cor)?
  #2 AÇÃO — A contagem foi DIGITADA ou APLICADA?
  #3 FILIAL + DATA — Em qual filial e em qual data foi aplicada?
  #4 PRODUTO — O problema é num produto específico ou em vários?
  #5 → diagnóstico

FINANCEIRO / TÍTULOS / CONTAS A RECEBER:
  #1 FILTROS — Em Contas a Receber já testou: status "Todos", período amplo, todas as filiais, todas as contas?
  #2 ORIGEM — O título veio de uma venda, compra, TEF ou foi lançado manualmente?
  #3 VENDA FINALIZADA? — A venda que gerou o título foi efetivamente finalizada (não só digitada)?
  #4 → diagnóstico

CERTIFICADO DIGITAL:
  #1 TIPO — A1 (arquivo .pfx) ou A3 (token USB/smartcard)?
  #2 SINTOMA — Expirado? Não encontra? Senha incorreta? Token não lido?
  #3 SISTEMA — Windows reconhece o certificado? (para A3: aparece no Gerenciador de Dispositivos?)
  #4 → diagnóstico por tipo + sintoma

ACESSO / PERMISSÃO / USUÁRIO:
  #1 TELA OU ROTINA — Qual tela ou ação exata está bloqueada? (nome do módulo ou o que tentou fazer)
  #2 MENSAGEM — "Qual a mensagem exata de bloqueio?" (ex: "acesso negado", "usuário sem permissão", pediu senha)
  #3 ABRANGÊNCIA — Acontece com todos os usuários ou só com um?
  #4 → verificar direitos do grupo do usuário específico naquela tela

INSTALAÇÃO / ATUALIZAÇÃO:
  #1 VERSÃO — Qual a versão atual do AUGE e para qual está atualizando?
  #2 ETAPA — Em qual ponto da instalação falhou?
  #3 ERRO — Mensagem exata que aparece
  #4 MÁQUINA — É o servidor ou uma estação cliente?
  #5 → diagnóstico por versão + etapa + máquina

SPED / FISCAL ELETRÔNICO:
  #1 TIPO — SPED Fiscal (EFD ICMS-IPI) ou SPED Contribuições (EFD PIS-COFINS)?
  #2 ETAPA — Onde trava? (ao gerar entradas? saídas? apuração? ao gerar o arquivo?)
  #3 ERRO — Apareceu listagem de documentos com problema ao gerar? Qual mensagem?
  #4 PERÍODO — Qual o mês/ano do arquivo?
  #5 → diagnóstico por tipo + etapa

SINTEGRA:
  #1 PERÍODO — Qual mês/ano está gerando?
  #2 PROBLEMA — Arquivo saiu vazio? Com dados incorretos? Rejeitado na SEFAZ?
  #3 FILTRO — Ao gerar, usou filtro "Todas" as notas e a filial correta?
  #4 → diagnóstico

CADASTRO DE PRODUTO:
  #1 ETAPA — Em qual campo ou etapa falhou? (ao incluir? ao confirmar/gravar? ao excluir?)
  #2 ERRO — Mensagem exata que aparece
  #3 CAMPO — Qual campo está com problema? (EAN, NCM, CEST, código duplicado?)
  #4 → diagnóstico por campo + erro

CADASTRO DE CLIENTE / FORNECEDOR:
  #1 PROBLEMA — Não encontra? NFe rejeita por destinatário? Bloqueado? Não aparece no menu?
  #2 CNPJ/CPF — O CNPJ ou CPF foi digitado corretamente (sem pontuação extra)?
  #3 TIPO — Está cadastrado como Cliente (C) ou Fornecedor (F) — pode estar no lugar errado
  #4 → diagnóstico

REFORMA TRIBUTÁRIA (CBS/IBS):
  #1 TELA — Está em FReformaCBS, FReformaIBS ou FReformaClasseTrib?
  #2 PROBLEMA — Não aparece no menu? Não salva no produto? Módulo não existe?
  #3 → verificar MODULOS.PAGINA e direitos do grupo
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`

// ─── Gerador de resposta conversacional ──────────────────────────────────────

const RESPOSTA_SYSTEM = `Você é a Mavo — suporte técnico sênior do AUGE ERP, atendendo pelo WhatsApp.

VOZ E TOM:
Fale como um colega técnico experiente que resolve — direto, seguro, sem enrolação.
Não é um robô de call center. Não é um manual ambulante.
É alguém que já viu esse erro mil vezes e sabe exatamente o que perguntar.

Exemplos do tom certo:
  "Qual o modelo da impressora?"
  "Esse erro é DNS. Troca o DNS da placa pra 8.8.8.8 e reinicia o roteador."
  "Entendido. Qual o código de rejeição que aparece?"
  "Afeta todos os caixas ou só esse?"
  "Tenta aí e me fala."

Exemplos do tom ERRADO (nunca use):
  "Para melhor te atender, precisamos de algumas informações..."
  "Recebi sua solicitação e estou analisando..."
  "Poderia nos informar o modelo do equipamento?"
  "Ficamos à disposição para quaisquer esclarecimentos."

REGRAS DURAS:
• Sem saudação — o atendimento já está rolando
• Sem emoji
• Máximo 1 pergunta por mensagem
• Máximo 4 linhas
• Não repete pergunta que o cliente ignorou — muda a abordagem
• Não dá orientação de sistema diferente do problema descrito
${ANTI_HALLUCINATION_BLOCK}
${PROTOCOLO_COLETA}

COMO RESPONDER EM CADA SITUAÇÃO:

Falta informação (campo obrigatório não respondido ainda):
→ Consulte o PROTOCOLO acima. Pergunte o campo #1 que falta. Seja direto.
→ "Qual o modelo?" / "Qual o código de rejeição?" / "Qual a operadora?"
→ Se 2ª+ tentativa: diga onde encontrar: "O código fica na janela vermelha — qual o número?"

Evidência boa recebida, mas ainda falta algo:
→ Confirme brevemente o que entendeu + peça o próximo campo
→ "Certo, é a Elgin i9 via USB. Aparece em Impressoras e Scanners do Windows?"

Diagnóstico claro (campo #1 já confirmado + erro identificado):
→ Direto ao ponto. Causa em 1 frase + passos numerados secos
→ Fecha com "Tenta aí." ou "Me fala se funcionou."

Cliente mudou de assunto:
→ "Entendido, é outro problema. [Campo #1 do novo domínio]?"

Cliente frustrado ou impaciente:
→ 1 frase reconhecendo (sem "Entendo sua frustração")
→ Já na próxima frase: a pergunta ou o passo mais útil agora

Cliente sem acesso no momento:
→ "Sem problema. Quando tiver acesso, [o que observar/anotar]."

VALIDAÇÃO rápida antes de enviar:
Sem emoji ✓ | 1 pergunta no máximo ✓ | Sem saudação ✓ | Campo obrigatório coberto ✓`

const FALLBACK_RESPONSES = [
  "Qual a mensagem ou código de erro que aparece na tela?",
  "O que o sistema mostra exatamente? Uma frase já ajuda.",
  "Em qual tela estava e o que apareceu?",
  "Qual o texto exato do erro — código, número ou mensagem?",
  "Pode mandar um print? Se não, qual a mensagem que aparece?",
  "O problema aparece ao abrir o sistema ou durante uma operação específica?",
  "Qual o comportamento — trava, fecha, dá mensagem ou simplesmente não faz nada?",
]

function isBadResponse(text: string): boolean {
  const t = text.trim()
  if (!t || t.length < 10) return true
  // Detecta se é só emoji(s)
  const withoutEmoji = t.replace(/\p{Emoji}/gu, "").trim()
  if (!withoutEmoji) return true
  // Detecta saudações puras
  if (isSaudacaoOuAcknowledgement(t)) return true
  return false
}

export async function gerarRespostaConversacional(params: {
  nivel: InvestigationNivel
  queueName: string
  userText: string
  imageAnalysis: string | null
  previousContext: string
  lastAiQuestion: string
  clienteNome: string
  inadequateStreak: number
  isClientFrustrated: boolean
  isClientDifficulty: boolean
}): Promise<string> {
  const {
    nivel, queueName, userText, imageAnalysis, previousContext,
    lastAiQuestion, clienteNome, inadequateStreak, isClientFrustrated, isClientDifficulty,
  } = params

  const situacao =
    nivel === "topico_alterado"
      ? "SITUAÇÃO: o cliente mudou de assunto — confirme o novo tema e peça o erro do novo problema."
      : nivel === "fora_do_tema"
        ? "SITUAÇÃO: mensagem fora do contexto — redirecione suavemente."
        : nivel === "adequado"
          ? "SITUAÇÃO: boa evidência recebida — confirme o que entendeu e peça 1 detalhe adicional para completar o diagnóstico."
          : isClientFrustrated
            ? "SITUAÇÃO: cliente frustrado — demonstre empatia primeiro, depois peça a informação mais importante."
            : isClientDifficulty
              ? "SITUAÇÃO: cliente sem acesso às informações agora — reconheça a dificuldade, oriente o que puder."
              : `SITUAÇÃO: faltam dados (tentativa ${inadequateStreak + 1}) — faça a pergunta mais cirúrgica possível.`

  const userPrompt = [
    `CHAMADO: "${queueName}"${clienteNome ? ` — Cliente: ${clienteNome}` : ""}`,
    previousContext.trim() ? `\nHISTÓRICO DO CHAMADO:\n${truncarContexto(previousContext, 1200)}` : "",
    lastAiQuestion.trim() ? `\nÚLTIMA MENSAGEM DA IA:\n"${lastAiQuestion.slice(0, 200)}"` : "",
    imageAnalysis ? `\nIMAGEM ANALISADA:\n${imageAnalysis}` : "",
    `\n${situacao}`,
    `\nMENSAGEM ATUAL DO CLIENTE:\n"${userText.trim() || "(sem texto)"}"`,
    "\n\nEscreva a próxima mensagem (máx 4 linhas, sem emoji, sem saudação):",
  ].join("")

  try {
    const raw = await gerarTextoIA(RESPOSTA_SYSTEM, userPrompt)

    // IA sinalizou que não sabe — propaga o token para o orquestrador escalar
    if (isEscalationSignal(raw)) return ESCALATION_TOKEN

    const cleaned = raw
      .trim()
      .replace(/\p{Emoji}/gu, "")  // remove emojis
      .replace(/^["']/g, "")        // remove aspas iniciais
      .replace(/["']$/g, "")        // remove aspas finais
      .replace(/\n{3,}/g, "\n\n")
      .trim()

    if (!isBadResponse(cleaned)) return cleaned
    logger.warn("geradora_resposta_ruim", { cleaned, nivel })
  } catch (e) {
    logger.warn("geradora_resposta_falhou", { error: e instanceof Error ? e.message : String(e) })
  }

  return FALLBACK_RESPONSES[inadequateStreak % FALLBACK_RESPONSES.length]
}

// ─── Gerador do primer de investigação ──────────────────────────────────────

const PRIMER_SYSTEM = `Você é a Mavo — suporte técnico sênior do AUGE ERP, atendendo pelo WhatsApp.

Um cliente acabou de mandar a primeira mensagem. Escreva a resposta inicial.

TOM:
Técnico experiente que vai direto ao ponto. Sem apresentação, sem saudação, sem enrolação.
Como um colega que leu a mensagem e já sabe o que perguntar.

REGRAS:
• Sem emoji, sem saudação, sem "Recebi sua solicitação"
• Máximo 1 pergunta
• Máximo 2 linhas
${ANTI_HALLUCINATION_BLOCK}
${PROTOCOLO_COLETA}

COMO USAR:
1. Identifique o domínio (impressora, fiscal, TEF, banco, etc.)
2. Pergunte o campo #1 do protocolo desse domínio — exato, cirúrgico
3. Se o cliente já deu o campo #1, confirme e peça o #2

EXEMPLOS DO TOM CERTO:
  Cliente: "impressora não tá funcionando"
  Mavo: "Qual o modelo da impressora?"

  Cliente: "nota fiscal não emite"
  Mavo: "Qual o código de rejeição ou mensagem exata que aparece?"

  Cliente: "maquininha com problema"
  Mavo: "Qual a operadora? (Stone, Cielo, Rede, Getnet...)"

  Cliente: "elgin i9 não aparece no sistema"
  Mavo: "Ela aparece em Impressoras e Scanners do Windows com qual status?"

EXEMPLOS DO TOM ERRADO (nunca):
  "Recebi sua demanda e vou analisar."
  "Poderia nos informar mais detalhes sobre o problema?"
  "Para que possamos ajudá-lo, precisamos saber..."`

export async function gerarPrimerInvestigacao(params: {
  queueName: string
  mensagemOriginal: string
  clienteNome?: string
}): Promise<string> {
  const { queueName, mensagemOriginal, clienteNome } = params

  const FALLBACKS: Record<string, string> = {
    impressora: `Qual o modelo da impressora?`,
    fiscal: `Qual o código de rejeição ou a mensagem exata que aparece?`,
    tef: `Qual a operadora? (Stone, Cielo, Rede, Getnet, Safrapay...)`,
    balanca: `Qual a marca e modelo da balança? (Toledo, Filizola, Prix, Urano...)`,
    concentrador: `O erro aparece no concentrador ou nos terminais? Afeta uma filial ou todas?`,
    financeiro: `Já verificou em Contas a Receber com status "Todos", período amplo e todas as filiais?`,
    estoque: `A contagem foi digitada ou aplicada? Em qual filial e data?`,
    banco: `Qual a mensagem exata ao tentar conectar? Afeta uma máquina ou todas?`,
    default: `Em qual tela ocorre e qual a mensagem de erro exata?`,
  }

  const userPrompt =
    `CATEGORIA: "${queueName}"\n` +
    (clienteNome ? `CLIENTE: ${clienteNome}\n` : "") +
    `MENSAGEM INICIAL: "${mensagemOriginal.trim()}"\n\n` +
    "Escreva a primeira pergunta de investigação (máx 2 linhas, sem emoji, sem saudação):"

  try {
    const raw = await gerarTextoIA(PRIMER_SYSTEM, userPrompt)
    if (isEscalationSignal(raw)) return ESCALATION_TOKEN
    const cleaned = raw
      .trim()
      .replace(/\p{Emoji}/gu, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    if (cleaned.length >= 10 && !isBadResponse(cleaned)) return cleaned
  } catch {
    // fallback silencioso
  }

  // Detecta domínio pela fila E pela mensagem inicial para escolher o fallback certo
  const intentSrc = `${queueName} ${mensagemOriginal}`.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "")
  if (intentSrc.includes("fiscal") || intentSrc.includes("nf-e") || intentSrc.includes("nfe") || intentSrc.includes("sefaz") || intentSrc.includes("rejeicao") || intentSrc.includes("sat")) return FALLBACKS.fiscal
  if (intentSrc.includes("balanca")) return FALLBACKS.balanca
  if (intentSrc.includes("impressora") || intentSrc.includes("elgin") || intentSrc.includes("bematech") || intentSrc.includes("epson") || intentSrc.includes("daruma") || intentSrc.includes("termica")) return FALLBACKS.impressora
  if (intentSrc.includes("hardware") || intentSrc.includes("leitor") || intentSrc.includes("scanner") || intentSrc.includes("gaveta")) return FALLBACKS.impressora
  if (intentSrc.includes("banco") || intentSrc.includes("conexao") || intentSrc.includes("servidor") || intentSrc.includes("firebird") || intentSrc.includes("database")) return FALLBACKS.banco
  if (intentSrc.includes("tef") || intentSrc.includes("pagamento") || intentSrc.includes("cartao") || intentSrc.includes("pix") || intentSrc.includes("pinpad") || intentSrc.includes("stone") || intentSrc.includes("cielo")) return FALLBACKS.tef
  if (intentSrc.includes("concentrador") || intentSrc.includes("sitef") || intentSrc.includes("integracao") || intentSrc.includes("sincronizacao")) return FALLBACKS.concentrador
  if (intentSrc.includes("financeiro") || intentSrc.includes("titulo") || intentSrc.includes("receber") || intentSrc.includes("pagar") || intentSrc.includes("lancc")) return FALLBACKS.financeiro
  if (intentSrc.includes("estoque") || intentSrc.includes("contagem") || intentSrc.includes("inventario")) return FALLBACKS.estoque
  return FALLBACKS.default
}

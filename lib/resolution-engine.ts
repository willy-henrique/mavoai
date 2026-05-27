/**
 * Motor de Resolução Autônoma
 *
 * Tenta resolver o problema do cliente em até MAX_AI_RESOLUTION_ATTEMPTS tentativas,
 * usando busca semântica em casos históricos + IA gerativa sênior.
 * Só escala para humano após esgotar as tentativas ou se o cliente pedir explicitamente.
 */

import { gerarTextoIA } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"
import { selecionarConhecimento } from "@/lib/auge-knowledge"
import type { OrgConfig } from "@/lib/org-loader"

export const MAX_AI_RESOLUTION_ATTEMPTS = 2

function isAugeProductRegistrationContext(queueName: string, problemText: string): boolean {
  const q = `${queueName} ${problemText}`.toLowerCase()
  return (
    q.includes("auge") &&
    q.includes("cadastro") &&
    q.includes("produto")
  )
}

function isAugeSalesContext(queueName: string, problemText: string): boolean {
  const q = `${queueName} ${problemText}`.toLowerCase()
  const salesTerms = ["venda", "nfe", "nf-e", "nota fiscal", "financeiro", "financeiro", "lancc", "fcontar", "titulo", "receber", "finalizadora", "protocolo", "chave nfe"]
  return salesTerms.some((t) => q.includes(t))
}

function isAugeStockContext(queueName: string, problemText: string): boolean {
  const q = `${queueName} ${problemText}`.toLowerCase()
  const stockTerms = ["estoque", "contagem", "compra", "entrada", "painel de estoque", "saldo", "grade", "inventario", "transferencia"]
  return stockTerms.some((t) => q.includes(t))
}

function isAugeFinancialContext(queueName: string, problemText: string): boolean {
  const q = `${queueName} ${problemText}`.toLowerCase()
  const finTerms = ["financeiro", "lancc", "titulo", "receber", "pagar", "baixa", "recebimento", "pagamento", "fluxo de caixa", "conta corrente", "extrato"]
  return finTerms.some((t) => q.includes(t))
}

function selectContextualPlaybook(queueName: string, problemText: string): string | null {
  if (isAugeProductRegistrationContext(queueName, problemText)) {
    return buildAugeProductRegistrationPlaybook()
  }
  if (isAugeSalesContext(queueName, problemText)) {
    return buildAugeSalesPlaybook()
  }
  if (isAugeStockContext(queueName, problemText)) {
    return buildAugeStockPlaybook()
  }
  if (isAugeFinancialContext(queueName, problemText)) {
    return buildAugeFinancialPlaybook()
  }
  return null
}

function buildAugeProductRegistrationPlaybook(): string {
  return `PLAYBOOK AUGE - CADASTRO DE PRODUTO (usar como base tecnica):
- Fluxo base: Incluir -> Append -> defaults em NewRecord -> Confirmar -> Post -> BeforePost -> AfterPost.
- Validacoes obrigatorias antes de gravar: PRODUTO, COLECAO, DESCRICAO, NREDUZIDO, UNIDADE, CLASSIFICACAO, FABRICANTE, ALIQUOTATRIBUTARIA.
- Formatos criticos: NMERCOSUL com 8 caracteres; CEST (se informado) com 7 caracteres; pesos/margens nao negativos.
- Codigo do produto: pode ser automatico ou manual conforme configuracao; validar unicidade; se existir excluido com mesmo codigo, orientar restauracao.
- EAN/GTIN (CODIGO2): validar EAN13 quando ativo; impedir dois EANs validos no mesmo produto; validar duplicidade em PROCODIGO.
- Persistencia complementar: atualizar PRODUTOFILIAL, PROCODIGO e CONJUNTOS quando aplicavel.
- Exclusao: considerar regra de exclusao logica por DATAEXCLUSAO e restricoes por movimentacao fiscal.

CHECKLIST DE DIAGNOSTICO RAPIDO:
1) Em qual etapa falha (incluir, confirmar/post, afterpost, exclusao)?
2) Qual mensagem exata aparece?
3) Qual campo concreto esta invalido (ex.: CEST, NMERCOSUL, EAN, aliquota)?
4) Ha duplicidade de codigo/EAN ou conflito com registro excluido?
5) O tipo do cadastro esta correto (Produto, Materia-prima ou Servico)?`
}

function buildAugeSalesPlaybook(): string {
  return `PLAYBOOK AUGE - VENDAS E FINANCEIRO (usar como base tecnica):
CONCEITO CENTRAL: o Perfil de Movimento e quem decide se a operacao movimenta estoque, gera financeiro e gera fiscal.
Antes de orientar qualquer problema de venda, perguntar: qual perfil foi usado?

CHECKLIST VENDA NAO GEROU FINANCEIRO:
1) A venda foi finalizada (nao apenas digitada)?
2) O perfil de movimento gera financeiro? (FPerfilVenda -> campo gerar financeiro)
3) Ha prazo e finalizadora configurados no perfil?
4) O titulo aparece em FContaR com filtros diferentes (periodo, status: todos, filial)?
5) A venda foi excluida ou cancelada?

CHECKLIST NFe NAO EMITE:
1) Qual rejeicao aparece? Ler a mensagem completa.
2) A venda tem chave NFe? Tem protocolo? (sem protocolo = pendente ou falha)
3) O perfil tem modelo 55 e serie configurada?
4) Cliente/destinatario tem CNPJ/IE/endereco/cidade e codigo IBGE corretos?
5) Produto tem NCM (8 dig), unidade, aliquota e CFOP?
6) Certificado digital esta valido?

CANCELAMENTO COM NFe AUTORIZADA:
- Prazo maximo: 24h apos autorizacao da SEFAZ
- Se apenas impressao falhou: reimprimir, nao cancelar
- Se NFe ficou pendente: consultar/reenviar antes de emitir outra nota

ESTADOS DA NFe:
- Sem chave: documento nao gerou NFe
- Chave sem protocolo: pendente ou falha de envio
- Protocolo preenchido: autorizada pela SEFAZ
- Protocolo OFFLINE: NFCe em contingencia`
}

function buildAugeStockPlaybook(): string {
  return `PLAYBOOK AUGE - ESTOQUE E CONTAGEM (usar como base tecnica):

CHECKLIST COMPRA NAO ENTROU NO ESTOQUE:
1) A compra foi confirmada/finalizada (nao apenas iniciada)?
2) O perfil de compra tem entrada de estoque ativa? (FPerfilVenda)
3) A compra foi feita na filial correta?
4) O Painel de Estoque esta sendo consultado na data correta?
5) Se foi via XML/check-in NF, o processamento de estoque foi executado?

CHECKLIST ESTOQUE NEGATIVO:
1) Consultar movimentacao do produto (FMovimentacao) no periodo completo
2) Houve venda registrada antes da compra dar entrada?
3) Houve contagem aplicada que zerou/reduziu o saldo?
4) Se produto tem grade: tamanho/cor foram registrados corretamente em todos os movimentos?
5) Ha transferencias pendentes entre filiais?
Correcao: entrada/ajuste ou contagem autorizada conforme politica da empresa.

CHECKLIST CONTAGEM DE ESTOQUE:
1) A contagem foi digitada/importada ou foi efetivamente aplicada?
2) Qual data foi informada ao aplicar?
3) Em qual filial?
4) Estoque e comum ou com grade (tamanho/cor)?
5) O usuario tem direito _AutorizacaoParaAplicarContagem?
A contagem grava em MOVIMENTOPERIODO e pode regravar movimentos do dia aplicado.`
}

function buildAugeFinancialPlaybook(): string {
  return `PLAYBOOK AUGE - FINANCEIRO E TITULOS (usar como base tecnica):
TABELA CENTRAL: LANCC - todos os lancamentos financeiros ficam aqui.

CHECKLIST TITULO NAO APARECE:
1) Mudar filtro de periodo (ampliar data inicio/fim)
2) Mudar filtro de status: selecionar "Todos" (nao so "Aberto")
3) Verificar filial (titulo pode estar em outra filial)
4) Verificar conta (titulo pode estar em conta diferente)
5) Verificar se a venda/compra foi confirmada (titulo so e gerado apos confirmacao)
6) Verificar se a venda foi excluida/cancelada

FLUXO FINANCEIRO DE VENDA:
Venda finalizada -> perfil define finalizadora e prazo -> titulo criado em LANCC -> FReceb faz a baixa -> FDeposito ou FContaT movem entre contas

FLUXO FINANCEIRO DE COMPRA:
Compra confirmada -> duplicatas do XML ou prazo manual -> titulos do fornecedor em LANCC -> pagamento baixa o titulo

PERGUNTAS OBRIGATORIAS ANTES DE ORIENTAR:
- Data base: emissao, vencimento ou pagamento?
- Status: aberto, pago, estornado, excluido?
- Conta/perfil de conta especifico?
- Origem: venda, compra, transferencia ou lancamento manual?`
}

// ─── System prompts por tentativa ────────────────────────────────────────────

function buildResolutionSystemPrompt(attempt: number, orgConfig?: OrgConfig | null): string {
  const produto = orgConfig?.product_name || "AUGE ERP"
  const isAuge = !orgConfig || orgConfig.id === "auge"

  const augeVocab = isAuge
    ? `
VOCABULÁRIO NATIVO ${produto} (use estes termos ao orientar):
- Perfil de Movimento: configuração que define se a operação movimenta estoque, gera financeiro e gera fiscal — sempre verificar antes de diagnosticar venda/compra
- Finalizadora: forma de pagamento no fechamento (dinheiro, cartão, prazo, convênio, haver)
- LANCC: tabela de lançamentos financeiros — onde ficam títulos a receber e a pagar
- CABVEN/ITEVEN: cabeçalho e itens dos movimentos (vendas, compras)
- FVendas: tela principal de vendas E compras — comportamento muda conforme o perfil
- Chave NFe: chave de acesso gerada para o documento; Protocolo: número de autorização da SEFAZ (sem protocolo = pendente)
- DATAEXCLUSAO: exclusão lógica — registro inativo mas ainda no banco
- FContaR: tela de Contas a Receber; FReceb: baixa/recebimento de títulos
- FContagem: tela de contagem de estoque; MOVIMENTOPERIODO: tabela que grava o saldo da contagem
`
    : ""

  if (attempt === 1) {
    return `Você é um técnico experiente de suporte do sistema ${produto} no Brasil.
Responde pelo WhatsApp — como um colega que sabe muito e explica de forma direta e amigável.

MISSÃO: resolver o problema do cliente de forma clara e rápida.

REGRAS DE OURO:
- Tom natural e direto, como alguém que conhece o sistema e quer ajudar — não como um robô
- Linguagem simples: o cliente pode ser leigo, escreva como se fosse explicar para qualquer pessoa
- NUNCA comece com saudação (Olá, Bom dia) — o atendimento já está em andamento
- NUNCA use rótulos internos ("Diagnóstico:", "Análise:", "Causa raiz:")
- Sem emoji, sem markdown pesado — *negrito* só em termos realmente críticos
- Nunca invente menus ou caminhos que não existam no sistema
${augeVocab}
TAMANHO DA RESPOSTA — regra principal:
- Máximo 10 linhas no total (incluindo passos)
- Passos de procedimento: use seta (→) para encadear sub-etapas na mesma linha
- Se o procedimento tiver muitas etapas, agrupe por fase (Parte 1, Parte 2) em mensagens separadas
- Prefira 1 frase curta de contexto + passos concisos + 1 frase de encerramento

FORMATO:
[1 frase explicando o que fazer — simples e direta]
1. Passo curto
2. Passo curto
3. Passo curto (máximo 6 passos; agrupe sub-etapas com →)
Me fala se funcionou.`
  }

  if (attempt === 2) {
    return `Você é um técnico experiente de suporte do sistema ${produto} no Brasil.
Responde pelo WhatsApp — como um colega direto que vai tentar uma abordagem diferente.

A solução anterior NÃO resolveu. Tente uma causa raiz DIFERENTE.

REGRAS:
- NÃO repita nenhum passo anterior
- Investigue: permissões, cache, versão, rede, serviço parado, banco, configuração fiscal
- Tom natural e direto — sem rótulos internos, sem saudação
- Linguagem simples para qualquer pessoa entender
- Máximo 10 linhas; agrupe sub-etapas com → na mesma linha
- Mencione brevemente por que está tentando algo diferente

FORMATO:
[1 frase explicando o que vai tentar agora e por quê é diferente]
1. Passo diferente e curto
2. Passo diferente e curto
3. Passo (máximo 6; use → para encadear)
Tenta aí e me conta.`
  }

  return `Você é um técnico experiente de suporte do sistema ${produto} no Brasil.
Esta é a última tentativa antes de passar para um técnico.

REGRAS:
- Abordagem mais definitiva: reinstalação, reset de configuração, limpeza de banco
- Direto ao ponto, sem enrolação
- Sem rótulos internos, sem saudação
- Linguagem simples
- Máximo 10 linhas; agrupe sub-etapas com →
- Avise no final que se não resolver, um técnico assumirá

FORMATO:
[1 frase direta sobre o que vai tentar]
1. Passo definitivo e curto
2. Passo definitivo e curto
3. Passo (máximo 6; use →)
Se não resolver, passo pra um técnico continuar com você.`
}

// ─── Geração de solução ───────────────────────────────────────────────────────

/**
 * Gera uma solução autônoma para o problema do cliente.
 *
 * @param params.problemText     Texto acumulado do problema relatado
 * @param params.queueName       Nome da fila/categoria do chamado
 * @param params.attemptNumber   Número da tentativa (1, 2 ou 3)
 * @param params.previousSolutions  Soluções já tentadas (para evitar repetição)
 */
export async function gerarSolucaoAutonoma(params: {
  problemText: string
  queueName: string
  attemptNumber: number
  previousSolutions?: string[]
  tenantId?: string
  orgConfig?: OrgConfig | null
}): Promise<string> {
  const { problemText, queueName, attemptNumber, previousSolutions = [], tenantId, orgConfig } = params
  const isAuge = !tenantId || tenantId === "auge"

  // Busca casos similares no histórico (filtrado pelo tenant)
  const casos = await buscarSemantica(problemText, 5, tenantId)
  const casosFormatted =
    casos
      .slice(0, 4)
      .map((c, i) => {
        const sim = Math.round((Number(c.similaridade) || 0) * 100)
        const prob = (c.resumo_problema || "").slice(0, 350)
        const causa = c.causa ? String(c.causa).slice(0, 200) : "—"
        const sol = c.solucao ? String(c.solucao).slice(0, 500) : "—"
        return `[Caso ${i + 1} — ${sim}% similar]\nProblema: ${prob}\nCausa raiz: ${causa}\nSolução: ${sol}`
      })
      .join("\n\n---\n\n") || "Nenhum caso similar encontrado. Use conhecimento técnico especializado."

  const prevSection =
    previousSolutions.length > 0
      ? `\n\n=== SOLUÇÕES JÁ TENTADAS — NÃO REPITA ===\n${previousSolutions.map((s, i) => `Tentativa ${i + 1}: ${s.slice(0, 300)}`).join("\n")}`
      : ""

  const systemPrompt = buildResolutionSystemPrompt(attemptNumber, orgConfig)

  const contextoAuge = isAuge ? selecionarConhecimento(`${queueName} ${problemText}`, 3) : ""
  const playbook = isAuge ? selectContextualPlaybook(queueName, problemText) : null
  const produto = orgConfig?.product_name || "AUGE ERP"
  const knowledgeLabel = isAuge ? `BASE DE CONHECIMENTO ${produto}` : "BASE DE CONHECIMENTO"

  const userPrompt = `FILA/CATEGORIA: ${queueName}
TENTATIVA: ${attemptNumber} de ${MAX_AI_RESOLUTION_ATTEMPTS}

PROBLEMA RELATADO PELO CLIENTE:
${problemText.slice(0, 2000)}
${contextoAuge ? `\n=== ${knowledgeLabel} (use como referência técnica) ===\n${contextoAuge}` : ""}
${playbook ? `\n=== PLAYBOOK ESPECÍFICO ${produto} ===\n${playbook}` : ""}
=== CASOS SIMILARES RESOLVIDOS ANTERIORMENTE ===
${casosFormatted}
${prevSection}`

  const raw = await gerarTextoIA(systemPrompt, userPrompt)
  return raw.trim()
}

// ─── Detecção de resultado ─────────────────────────────────────────────────────

export type ResolutionOutcome = "resolved" | "failed" | "needs_human" | "unclear"

/**
 * Detecta o resultado da tentativa de resolução a partir da resposta do cliente.
 */
export function detectResolutionOutcome(text: string): ResolutionOutcome {
  // Normaliza: minúsculo + remove acentos
  const t = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")

  // Pedido explícito de humano — prioridade máxima
  const humanSignals = [
    "falar com humano",
    "falar com atendente",
    "falar com alguem",
    "quero atendente",
    "preciso de humano",
    "atendente humano",
    "nao quero ia",
    "nao quero robo",
    "nao quero bot",
    "me passa para",
    "quero falar com",
    "liga pra mim",
    "me ligue",
    "pode me ligar",
  ]
  if (humanSignals.some((s) => t.includes(s))) return "needs_human"

  // "Funcionou, mas..." indica resolução parcial com novo problema — não fechar o ticket
  const partialResolutionPattern = /\b(funcionou|resolveu|deu certo|funcionando|voltou)\b.{0,80}\b(mas|porem|so que|agora|entretanto|contudo|todavia|novo erro|outra coisa|agora tem|agora da)\b/
  if (partialResolutionPattern.test(t)) return "unclear"

  // Não funcionou — verificado ANTES dos sinais de sucesso para evitar falsos positivos
  // ("não deu", "não foi" devem retornar "failed", não "resolved")
  const failedSignals = [
    "nao funcionou",
    "nao resolveu",
    "continua",
    "mesmo problema",
    "ainda com problema",
    "ainda nao",
    "nao adiantou",
    "continua o erro",
    "ainda aparece",
    "piorou",
    "deu errado",
    "nao consegui",
    "sem sucesso",
    "continua igual",
    "mesmo erro",
    "nao deu",
    "ta igual",
    "ta do mesmo jeito",
    "do mesmo jeito",
    "tentei e nao",
    "fiz e nao",
    "fiz mas nao",
    "tentei mas nao",
    "erro continua",
    "problema continua",
    "nao saiu",
    "permanece",
    "persiste",
    "nao foi",
    "nao resolve",
    "ainda com erro",
    "nada mudou",
    "nao mudou",
    "igual antes",
    "nao adiantou nada",
  ]
  if (failedSignals.some((s) => t.includes(s))) return "failed"

  // Problema resolvido — apenas frases específicas (sem palavras isoladas ambíguas como "deu", "foi", "saiu")
  const resolvedSignals = [
    "funcionou",
    "resolveu",
    "deu certo",
    "funcionando",
    "resolvido",
    "consegui",
    "esta funcionando",
    "ta funcionando",
    "voltou a funcionar",
    "voltou",
    "corrigiu",
    "tudo certo",
    "tudo ok",
    "ok obrigado",
    "perfeito obrigado",
    "show obrigado",
    "otimo obrigado",
    "excelente obrigado",
    "ja esta",
    "ja ta",
    "resolvido obrigado",
    "ok funcionou",
    "funcionou obrigado",
    "obrigado resolveu",
    "certo obrigado",
  ]
  if (resolvedSignals.some((s) => t.includes(s))) return "resolved"

  return "unclear"
}

// ─── Mensagens de feedback ao cliente ─────────────────────────────────────────

export function buildResolutionSuccessReply(clienteNome?: string): string {
  const nome = clienteNome?.trim()
  const saudacao = nome ? `Ótimo, ${nome}!` : "Ótimo!"
  return `${saudacao} Problema resolvido. Se precisar de suporte novamente, é só chamar.`
}

export function buildResolutionExhaustedReply(queueName: string): string {
  return (
    `Tentei ${MAX_AI_RESOLUTION_ATTEMPTS} abordagens para *${queueName}* e ainda sem sucesso. ` +
    "Vou encaminhar agora para um técnico especializado continuar por aqui."
  )
}

export function buildResolutionUnclearReply(attemptNumber: number, maxAttempts: number): string {
  return (
    `Conseguiu executar os passos? O problema foi resolvido ou o erro continua?\n` +
    `_(Tentativa ${attemptNumber} de ${maxAttempts})_`
  )
}

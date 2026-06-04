/**
 * Motor de Resolução Autônoma
 *
 * Tenta resolver o problema do cliente em até MAX_AI_RESOLUTION_ATTEMPTS tentativas,
 * usando busca semântica em casos históricos + IA gerativa sênior.
 * Só escala para humano após esgotar as tentativas ou se o cliente pedir explicitamente.
 */

import { gerarTextoIA, gerarTextoIAComAgente } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"
import { selecionarConhecimento } from "@/lib/auge-knowledge"
import { getAgentParams } from "@/lib/agent-config"
import { classifyDomain } from "@/lib/ia-router"
import { resolverDeterministico } from "@/lib/deterministic-resolver"
import { ANTI_HALLUCINATION_BLOCK, ESCALATION_TOKEN, isEscalationSignal } from "@/lib/escalation-detector"
import type { OrgConfig } from "@/lib/org-loader"

const ENABLE_AI_ROUTER = process.env.ENABLE_AI_ROUTER === "true"

/** Fallback estático — valor real vem de getResolutionParams() em runtime. */
export const MAX_AI_RESOLUTION_ATTEMPTS = 2

/**
 * Sinal retornado quando não há contexto suficiente para resolver sem risco de alucinação.
 * O orquestrador deve tratar isso como escalação imediata para humano.
 */
export const INSUFFICIENT_CONTEXT_SIGNAL = "__INSUFFICIENT_CONTEXT__"

export function isInsufficientContext(text: string): boolean {
  return text === INSUFFICIENT_CONTEXT_SIGNAL
}

/** Retorna parâmetros configuráveis do motor de resolução para o tenant. */
export async function getResolutionParams(tenantId = "default") {
  return getAgentParams("resolution", tenantId)
}

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

function isAugeTEFContext(queueName: string, problemText: string): boolean {
  const q = `${queueName} ${problemText}`.toLowerCase()
  const tefTerms = ["tef", "sitef", "clisitef", "pinpad", "pin pad", "cartao", "cartão", "pix", "cielo", "stone", "rede", "getnet", "safrapay", "adquirente", "maquininha", "transacao", "transação", "concentrador tef", "codigo da loja", "código da loja", "terminal tef"]
  return tefTerms.some((t) => q.includes(t))
}

function isAugeHardwareContext(queueName: string, problemText: string): boolean {
  const q = `${queueName} ${problemText}`.toLowerCase()
  const hwTerms = ["impressora", "balanca", "balança", "leitor", "scanner", "gaveta", "etiqueta", "driver impressora", "porta com", "baud rate", "nao imprime", "não imprime", "nao comunica", "nao abre gaveta"]
  return hwTerms.some((t) => q.includes(t))
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
  if (isAugeTEFContext(queueName, problemText)) {
    return buildAugeTEFPlaybook()
  }
  if (isAugeHardwareContext(queueName, problemText)) {
    return buildAugeHardwarePlaybook()
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
1) Qual rejeicao ou erro aparece? Ler a mensagem COMPLETA — codigo + texto.
2) A venda tem chave NFe? Tem protocolo? (sem protocolo = pendente ou falha de envio)
3) O perfil tem modelo 55 e serie configurada?
4) Cliente/destinatario tem CNPJ/IE/endereco/cidade e codigo IBGE corretos?
5) Produto tem NCM (8 dig), unidade, aliquota e CFOP?
6) Certificado digital esta valido?

ERRO 12007 - "O nome do servidor nao pode ser resolvido" (MUITO COMUM — diagnostico especifico):
⚠ NAO e a SEFAZ fora do ar. E falha de DNS no computador do cliente.
Diagnostico rapido:
- Abrir CMD e digitar: ping nfe.sefaz.[estado].gov.br
  → Se "nao foi possivel resolver": DNS com problema
  → Se responde com IP: DNS ok, problema e outro
Solucao:
1. Trocar DNS da placa de rede: DNS 8.8.8.8, alternativo 8.8.4.4 (Google) ou 1.1.1.1 (Cloudflare)
2. Reiniciar o roteador e aguardar 2 minutos
3. Verificar data/hora do computador (certificado invalida se errada)
4. Se todas as maquinas falham: problema no provedor de internet — contatar ISP
Atencao: erro "SEFAZ fora do ar" relatado por clientes e atendentes quase sempre e este erro de DNS. Sempre pedir o codigo de erro antes de concluir.

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

function buildAugeTEFPlaybook(): string {
  return `PLAYBOOK AUGE - TEF / PAGAMENTOS ELETRONICOS (usar como base tecnica):

CHECKLIST TRANSACAO TEF NAO FUNCIONA:
1) Qual mensagem/codigo de erro exato no sistema E no PinPad/maquininha?
2) Afeta todos os terminais ou so um? (local vs. servidor)
3) O concentrador SiTef esta rodando? (verificar servico "SiTef" no Windows do servidor)
4) IP e porta do servidor SiTef corretos no terminal? (padrão: porta 4096)
5) O codigo da loja (EC) esta correto para o CNPJ do estabelecimento?

ERRO CRITICO - CODIGO DA LOJA SITEF ERRADO (transacoes indo para filial errada):
Sintoma: TEF aprova mas credito vai para outro CNPJ/filial; caixas param sem motivo.
Log SiTef mostra codigo da loja divergente do esperado.
Diagnostico: conferir "Codigo da Loja" no concentrador SiTef vs. codigo correto da adquirente.
Solucao:
1. Confirmar codigo correto com adquirente (Elgin/Cielo/Stone).
2. Atualizar "Codigo da Loja" no concentrador SiTef.
3. Reiniciar servico SiTef nos terminais para propagar (ou reiniciar o caixa).
4. Testar transacao de R$0,01 no primeiro PDV antes de liberar todos.
ATENCAO sobre "hora do log incorreta": diferenca de horario entre servidor e terminais pode causar
rejeicao. Corrigir data/hora do Windows nos terminais se caixas pararem apos alteracao.

CHECKLIST PINPAD NAO RECONHECIDO:
1) Verificar cabo USB ou serial (COM) — trocar porta se necessario.
2) Reinstalar driver do PinPad (Ingenico, Verifone, PAX) pelo site do fabricante.
3) Reiniciar servico SiTef/CliSiTef no terminal.
4) Confirmar versao do driver compativel com o modelo do PinPad.

TIMEOUT / COMUNICACAO INTERROMPIDA:
1) Pingar o IP do servidor SiTef no terminal com problema.
2) Verificar firewall — porta 4096 TCP deve estar liberada.
3) Confirmar servico SiTef ativo no servidor (services.msc).
4) Verificar log: %PROGRAMFILES%\\Sitef\\log\\ — ultimas linhas mostram o erro.

PIX NAO CONFIRMA:
1) Aguardar ate 2 minutos — confirmacao e assincrona via webhook da adquirente.
2) Verificar internet do servidor (acesso ao endpoint da adquirente).
3) QR Code gerado esta dentro do prazo de validade?
4) Consultar status da transacao diretamente na plataforma da adquirente.

CANCELAMENTO/ESTORNO:
- Requer senha administrativa — confirmar quem tem permissao.
- Prazo varia por adquirente (geralmente D+0, mesmo dia).
- Nao cancelar transacao no sistema antes de confirmar cancelamento na adquirente.`
}

function buildAugeHardwarePlaybook(): string {
  return `PLAYBOOK AUGE - HARDWARE / PERIFERICOS (usar como base tecnica):

DIAGNOSTICO RAPIDO — ISOLAR SE E AUGE OU WINDOWS:
Tentar imprimir pelo Bloco de Notas do Windows na mesma impressora.
→ Imprime pelo Windows mas nao pelo AUGE: problema de configuracao no AUGE (porta/modelo).
→ Nao imprime nem pelo Windows: problema de driver/conexao (resolver antes de abrir o AUGE).

CHECKLIST IMPRESSORA NAO IMPRIME:
1) Em qual contexto nao imprime: cupom de venda, DANFE NF-e, etiqueta ou relatorio?
2) Windows reconhece a impressora? (Gerenciador de Dispositivos — sem "!" amarelo)
3) Qual porta: USB (COM virtual) ou rede (IP)?
4) Configuracao no AUGE: Sistema → Configuracoes → Impressora → modelo e porta corretos?
5) Papel carregado e impressora ligada/online?

SETUP IMPRESSORA USB (passo a passo):
1. Instalar driver da impressora (Bematech, Epson, Elgin, Daruma) pelo site do fabricante.
2. Conectar via USB → Gerenciador de Dispositivos → anotar porta COM virtual criada (ex: COM3).
3. AUGE: Sistema → Configuracoes → Impressora → selecionar modelo e a porta COM.
4. Configurar largura do papel (58mm ou 80mm conforme o modelo).
5. Clicar "Testar impressao" no AUGE para validar.
Impressora em rede (TCP/IP): informar IP e porta 9100 no lugar da porta COM.

CHECKLIST BALANCA NAO COMUNICA:
1) Verificar cabo serial e porta COM (Gerenciador de Dispositivos — sem "!" amarelo).
2) Baud rate IGUAL na balanca e no AUGE? (mais comum: 9600 ou 19200).
3) Protocolo correto: Toledo, Filizola, Prix, Urano?
4) A porta COM esta em uso por outro software? Fechar e reabrir o AUGE.
5) Balancas TCP/IP: pingar o IP pela rede; porta padrao: 23 ou 4001.

GAVETA DE DINHEIRO NAO ABRE:
1) Gaveta conecta na impressora (RJ-11) — impressora funcionando?
2) AUGE: verificar se "abrir gaveta ao fechar venda" esta habilitado nas configuracoes do PDV.
3) Testar pulso de abertura pelo software de teste da impressora.
4) Cabo da gaveta integro e encaixado na impressora?

LEITOR DE CODIGO DE BARRAS:
- USB HID: plug-and-play, nao precisa de driver nem configuracao.
- Serial: configurar porta COM e baud rate (geralmente 9600).
- Lendo errado: verificar se o leitor envia Enter (CR/LF) no final da leitura.`
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
    return `Você é a Mavo — suporte técnico sênior do ${produto}, atendendo pelo WhatsApp.
${augeVocab}
${ANTI_HALLUCINATION_BLOCK}

VOZ: técnico experiente falando com o cliente. Direto, seguro, sem enrolação.
Não rotula seções. Não usa markdown pesado. Não começa com saudação.
Resolve como quem já viu esse problema antes.

FORMATO DA RESPOSTA:
1 frase de diagnóstico (sem rótulo "Diagnóstico:") → passos numerados secos → "Tenta aí."
Cada passo: 1 linha, ação clara com o caminho exato entre parênteses.
  Certo: "Abre (Fiscal → NF-e) e confere se o certificado está ativo."
  Errado: "Verifique as configurações fiscais."

ERROS CONHECIDOS → RESPOSTA DIRETA:
- erro 12007 / "nome do servidor não pode ser resolvido" → DNS. Troca para 8.8.8.8 / 8.8.4.4 + reinicia roteador
- rejeição 280 → certificado inválido ou expirado → reimportar PFX ou reinserir token A3
- acesso negado / sem permissão → direito faltando no grupo → checar em FUsuarios/FGrupoUsuario
- título não aparece → ampliar filtros (status Todos, período, filial, conta)

NUNCA:
- Inventar menus, campos, telas ou passos que não estejam no contexto
- Dar orientação de domínio diferente do problema (ex: passos de NF-e pra problema de PDV)
- Começar com saudação, apresentação ou introdução`
  }

  if (attempt === 2) {
    return `Você é a Mavo — suporte técnico sênior do ${produto}.
A primeira tentativa não resolveu. Aborde uma CAUSA RAIZ DIFERENTE — sem repetir nada.
${augeVocab}
${ANTI_HALLUCINATION_BLOCK}

Analise o que foi tentado e o que ainda não foi.
Se tentativa 1 foi configuração → tente reinstalação ou limpeza de cache.
Se foi software → investigue hardware ou driver.
Se foi local → verifique no servidor.

Formato: direto, passos numerados, 1 linha por passo.
Fecha com: "Tenta aí e me conta."`
  }

  return `Você é a Mavo — suporte técnico sênior do ${produto}.
Última tentativa antes de passar para um técnico humano.

Vai fundo: logs, serviços, banco, reinstalação, configuração limpa.
Passos diretos, 1 linha cada. Sem saudação, sem introdução.
Fecha com: "Se não resolver, vou chamar um técnico especializado pra continuar contigo."`
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

  // ── Resolver determinístico: erros conhecidos → resposta exata sem LLM ──────
  // Só na primeira tentativa — segunda tentativa já passou pelo determinístico
  if (attemptNumber === 1) {
    const det = resolverDeterministico(problemText)
    if (det) return det.solution
  }

  // Parâmetros configuráveis (com safe fallback)
  const resolutionParams = await getResolutionParams(tenantId ?? "default")
  const ragLimit = resolutionParams.rag_results_limit
  const ragThreshold = resolutionParams.rag_similarity_threshold

  // Busca casos similares no histórico (filtrado pelo tenant)
  const casos = await buscarSemantica(problemText, ragLimit, tenantId)

  // ── Gate de confiança: filtra casos abaixo do threshold ─────────────────────
  // Casos irrelevantes confundem o LLM mais do que ajudam — melhor omitir
  const casosRelevantes = casos.filter(c => Number(c.similaridade) >= ragThreshold)
  const temContextoSuficiente = casosRelevantes.length > 0 || isAuge

  const casosFormatted =
    casosRelevantes
      .slice(0, ragLimit)
      .map((c, i) => {
        const sim = Math.round((Number(c.similaridade) || 0) * 100)
        const prob = (c.resumo_problema || "").slice(0, 350)
        const causa = c.causa ? String(c.causa).slice(0, 200) : "—"
        const sol = c.solucao ? String(c.solucao).slice(0, 500) : "—"
        return `[Caso ${i + 1} — ${sim}% similar]\nProblema: ${prob}\nCausa raiz: ${causa}\nSolução: ${sol}`
      })
      .join("\n\n---\n\n") || "Nenhum caso similar com confiança suficiente encontrado."

  const prevSection =
    previousSolutions.length > 0
      ? `\n\n=== SOLUÇÕES JÁ TENTADAS — NÃO REPITA ===\n${previousSolutions.map((s, i) => `Tentativa ${i + 1}: ${s.slice(0, 300)}`).join("\n")}`
      : ""

  const systemPrompt = buildResolutionSystemPrompt(attemptNumber, orgConfig)

  const contextoAuge = isAuge ? selecionarConhecimento(`${queueName} ${problemText}`, 3) : ""
  const produto = orgConfig?.product_name || "AUGE ERP"
  const knowledgeLabel = isAuge ? `BASE DE CONHECIMENTO ${produto}` : "BASE DE CONHECIMENTO"

  // IA Router: classifica domínio, seleciona agente especialista e usa seu modelo/prompt
  // Usa tenantId como fallback quando orgConfig não está disponível (fluxo sem seleção de empresa)
  let playbook = isAuge ? selectContextualPlaybook(queueName, problemText) : null
  let routedAgent: { model_base_url?: string | null; model_name?: string | null } | null = null

  const routerTenantId = orgConfig?.id ?? tenantId ?? "auge"
  if (ENABLE_AI_ROUTER) {
    try {
      const route = await classifyDomain(`${queueName} ${problemText}`, routerTenantId)
      if (route.agent) {
        playbook = `[Agente: ${route.agent.name} | domínio: ${route.domain} | confiança: ${(route.confidence * 100).toFixed(0)}%]\n\n${route.agent.system_prompt}`
        // Captura override de modelo — pode ser null se o agente usa o global
        if (route.agent.model_base_url || route.agent.model_name) {
          routedAgent = { model_base_url: route.agent.model_base_url, model_name: route.agent.model_name }
        }
      }
    } catch {
      // fallback silencioso para playbook estático
    }
  }

  // ── Gate final: sem contexto suficiente → sinaliza para escalar, não alucinar ─
  // Se não há casos relevantes, playbook, nem conhecimento AUGE disponível,
  // retorna sinal especial que o orquestrador interpreta como "escalar para humano"
  if (!temContextoSuficiente && !playbook && !contextoAuge) {
    return "__INSUFFICIENT_CONTEXT__"
  }

  const userPrompt = `FILA/CATEGORIA: ${queueName}
TENTATIVA: ${attemptNumber} de ${MAX_AI_RESOLUTION_ATTEMPTS}

PROBLEMA RELATADO PELO CLIENTE:
${problemText.slice(0, 2000)}
${contextoAuge ? `\n=== ${knowledgeLabel} (use como referência técnica) ===\n${contextoAuge}` : ""}
${playbook ? `\n=== PLAYBOOK ESPECÍFICO ${produto} ===\n${playbook}` : ""}
=== CASOS SIMILARES RESOLVIDOS ANTERIORMENTE ===
${casosFormatted}
${prevSection}

REGRA CRÍTICA ANTI-ALUCINAÇÃO:
- Use APENAS informações presentes nos casos acima, no playbook ou no conhecimento base
- Se não tiver certeza de um campo, menu ou passo: NÃO invente — diga "verifique com seu técnico"
- Nunca mencione campos, telas ou rotinas que não estejam no contexto fornecido`

  // Usa o modelo do agente especialista se configurado; fallback para o global se falhar
  let raw: string
  if (routedAgent) {
    try {
      raw = await gerarTextoIAComAgente(routedAgent, systemPrompt, userPrompt)
    } catch {
      raw = await gerarTextoIA(systemPrompt, userPrompt)
    }
  } else {
    raw = await gerarTextoIA(systemPrompt, userPrompt)
  }

  // IA sinalizou que não sabe — converte para o sinal de contexto insuficiente
  if (isEscalationSignal(raw)) return INSUFFICIENT_CONTEXT_SIGNAL

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
    "nao deu certo",
    "nao deu resultado",
    "continua dando erro",
    "ainda dando erro",
    "nao funcionou nao",
    "ainda nao funciona",
    "nao ta funcionando",
    "nao esta funcionando",
    "nao sanou",
    "voltou o erro",
    "voltou o problema",
    "o erro voltou",
    "continua aparecendo",
    "nao tinha funcionado",
    "nao fez diferenca",
    "nao fez diferença",
    "aparece de novo",
    "apareceu de novo",
  ]
  if (failedSignals.some((s) => t.includes(s))) return "failed"

  // Problema resolvido — frases específicas de confirmação
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
    "era isso",
    "era exatamente isso",
    "era esse o problema",
    "achou o problema",
    "acertou",
    "certinho",
    "perfeito",
    "show de bola",
    "resolveu tudo",
    "ja funciona",
    "ja esta funcionando",
    "foi resolvido",
    "conseguimos resolver",
    "deu bom",
    "deu certo sim",
    "funcionou sim",
    "resolveu sim",
    "obrigado funcionou",
    "obrigado ja ta",
    "obrigado ja esta",
    "valeu funcionou",
    "valeu resolveu",
  ]
  if (resolvedSignals.some((s) => t.includes(s))) return "resolved"

  return "unclear"
}

// ─── Mensagens de feedback ao cliente ─────────────────────────────────────────

export function buildResolutionSuccessReply(clienteNome?: string): string {
  const nome = clienteNome?.trim()
  return nome
    ? `Boa, ${nome}! Qualquer outra coisa é só chamar.`
    : `Boa! Qualquer outra coisa é só chamar.`
}

export function buildResolutionExhaustedReply(queueName: string): string {
  return `Esgotei as tentativas aqui em *${queueName}*. Vou passar pra um técnico especializado continuar contigo.`
}

export function buildResolutionUnclearReply(attemptNumber: number, maxAttempts: number): string {
  return `Conseguiu executar os passos? Resolveu ou o erro continua? _(${attemptNumber}/${maxAttempts})_`
}

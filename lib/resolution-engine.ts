/**
 * Motor de Resolução Autônoma
 *
 * Tenta resolver o problema do cliente em até MAX_AI_RESOLUTION_ATTEMPTS tentativas,
 * usando busca semântica em casos históricos + IA gerativa sênior.
 * Só escala para humano após esgotar as tentativas ou se o cliente pedir explicitamente.
 */

import { gerarTextoIA } from "@/lib/ai-provider"
import { buscarSemantica } from "@/lib/semantic-search"

export const MAX_AI_RESOLUTION_ATTEMPTS = 2

function isAugeProductRegistrationContext(queueName: string, problemText: string): boolean {
  const q = `${queueName} ${problemText}`.toLowerCase()
  return (
    q.includes("auge") &&
    q.includes("cadastro") &&
    q.includes("produto")
  )
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

// ─── System prompts por tentativa ────────────────────────────────────────────

const RESOLUTION_SYSTEM_1 = `Você é um técnico sênior de suporte de sistemas ERP e TI com 15+ anos de experiência no Brasil.
Contexto prioritário: clientes do sistema AUGE ERP.

Sua missão: resolver o problema do cliente com uma solução direta, específica e aplicável agora.

REGRAS:
1. Analise os casos similares e extraia a solução mais relevante — adapte para o contexto atual
2. Seja específico: menus, caminhos, configurações, comandos reais do sistema
3. Máximo 3 passos numerados e curtos
4. Se houver risco de perda de dados, avise ANTES dos passos
5. Se a solução precisar de acesso remoto, mencione no início
6. Máximo 320 caracteres (WhatsApp)
7. Sem emoji, sem markdown pesado — use *negrito* apenas para termos técnicos críticos
8. Nunca invente menus, caminhos ou comportamentos que não estejam no contexto
9. Para fiscal, priorize validações técnicas reais: CFOP, CST/CSOSN, NCM, série, ambiente SEFAZ, certificado, data/hora e XML
10. Linguagem profissional e objetiva, sem gírias

ESTRUTURA:
Diagnóstico em 1 linha.
1. Passo
2. Passo
3. Passo
[Aviso de risco se houver]
Execute esses passos e me confirme se funcionou.`

const RESOLUTION_SYSTEM_2 = `Você é um técnico sênior de suporte de sistemas ERP e TI com 15+ anos de experiência no Brasil.
Contexto prioritário: clientes do sistema AUGE ERP.

A solução anterior NÃO resolveu o problema. Você precisa identificar uma causa raiz DIFERENTE.

REGRAS:
1. NÃO repita nenhum passo da tentativa anterior
2. Investigue causas alternativas: permissões de usuário, cache corrompido, conflito de versão, configuração de rede/firewall, serviço parado, banco de dados inconsistente, dependência faltante
3. Use os casos similares buscando uma segunda causa plausível
4. Máximo 3 passos diferentes dos anteriores
5. Máximo 320 caracteres
6. Sem emoji
7. Mencione brevemente por que essa abordagem é diferente
8. Em cenários fiscais, considerar inconsistências de tributação, parametrização fiscal e comunicação com SEFAZ
9. Linguagem profissional e objetiva, sem gírias

ESTRUTURA:
Causa alternativa em 1 linha.
1. Passo diferente
2. Passo diferente
3. Passo diferente
[Diferença em relação à tentativa anterior]
Tente essa abordagem e me informe o resultado.`

const RESOLUTION_SYSTEM_3 = `Você é um técnico sênior de suporte de sistemas ERP e TI com 15+ anos de experiência no Brasil.
Contexto prioritário: clientes do sistema AUGE ERP.

Esta é a TERCEIRA e última tentativa de resolução autônoma. Se não funcionar, escalaremos para um técnico especializado.

REGRAS:
1. Tente a abordagem mais definitiva ainda não tentada: reinstalação de componente, reset completo de configuração, recriação de perfil, verificação de integridade de arquivos, limpeza de banco
2. Seja absolutamente específico e direto
3. Máximo 3 passos
4. Máximo 320 caracteres
5. Sem emoji
6. Informe que após isso, se necessário, um técnico assumirá
7. Linguagem profissional e objetiva, sem gírias

ESTRUTURA:
Causa provável restante em 1 linha.
1. Passo definitivo
2. Passo definitivo
3. Passo definitivo
Se esses passos não resolverem, passarei seu caso para um técnico especializado continuar pessoalmente.`

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
}): Promise<string> {
  const { problemText, queueName, attemptNumber, previousSolutions = [] } = params

  // Busca casos similares no histórico
  const casos = await buscarSemantica(problemText, 5)
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

  const systemMap: Record<number, string> = {
    1: RESOLUTION_SYSTEM_1,
    2: RESOLUTION_SYSTEM_2,
    3: RESOLUTION_SYSTEM_3,
  }
  const systemPrompt = systemMap[attemptNumber] ?? RESOLUTION_SYSTEM_2

  const userPrompt = `FILA/CATEGORIA: ${queueName}
TENTATIVA: ${attemptNumber} de ${MAX_AI_RESOLUTION_ATTEMPTS}

PROBLEMA RELATADO PELO CLIENTE:
${problemText.slice(0, 2000)}

CASOS SIMILARES RESOLVIDOS ANTERIORMENTE:
${casosFormatted}
${prevSection}

${isAugeProductRegistrationContext(queueName, problemText) ? buildAugeProductRegistrationPlaybook() : ""}`

  const raw = await gerarTextoIA(systemPrompt, userPrompt)
  return raw.trim().slice(0, 360)
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

  // Problema resolvido
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
    "deu certo",
    "perfeito obrigado",
    "show",
    "otimo",
    "excelente",
    "ja esta",
    "ja ta",
    "ja foi",
    "resolvido obrigado",
    "ok funcionou",
    "funcionou obrigado",
    "obrigado resolveu",
    "certo obrigado",
    "deu",
    "saiu",
    "foi",
  ]
  if (resolvedSignals.some((s) => t.includes(s))) return "resolved"

  // Não funcionou
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
    `Tentei 2 abordagens para *${queueName}* e ainda sem sucesso. ` +
    "Vou encaminhar agora para um técnico especializado continuar por aqui."
  )
}

export function buildResolutionUnclearReply(attemptNumber: number, maxAttempts: number): string {
  return (
    `Conseguiu executar os passos? O problema foi resolvido ou o erro continua?\n` +
    `_(Tentativa ${attemptNumber} de ${maxAttempts})_`
  )
}

import { gerarTextoIA } from "@/lib/ai-provider"
import { selecionarConhecimento } from "@/lib/auge-knowledge"
import { ANTI_HALLUCINATION_BLOCK } from "@/lib/escalation-detector"
import type { OrgConfig } from "@/lib/org-loader"

type TriageInput = {
  organization_id?: string
  ticket_id?: string
  conversation_id?: string
  cliente_nome?: string
  cliente_telefone?: string
  canal?: string
  mensagem_atual?: string
  historico_conversa?: string
  filas_disponiveis_json?: unknown
  horario_comercial_aberto?: boolean
  tentativas_triagem?: number
  idioma_preferencial?: string
  metadados_json?: unknown
  tenantId?: string
  orgConfig?: OrgConfig | null
}

type Fila = {
  id?: string
  name?: string
  menuOption?: string
  defaultSlaMins?: number
  isActive?: boolean
}

function buildTriageSystemPrompt(orgConfig?: OrgConfig | null): string {
  const produto = orgConfig?.product_name || "AUGE ERP"
  const isAuge = !orgConfig || orgConfig.id === "auge"

  const augeBlock = isAuge
    ? `
REFERÊNCIAS TÉCNICAS PRIORITÁRIAS (${produto})
- Módulos principais (código numérico): Vendas=30 (FVendas), Compras=25, Contagem=34, PainelEstoque=52, ContasAReceber=76, PerfilMovimento=207, Sintegra=231, ReformaCBS=586, ReformaIBS=587.
- Fiscal: NF-e modelo 55 / NFC-e modelo 65 / SAT, SEFAZ, SPED, Sintegra, certificado digital, CFOP, CST/CSOSN, NCM, CEST, rejeição — nunca inventar códigos ou regras.
- CONCEITO CENTRAL — Perfil de Movimento: define se a operação movimenta estoque, gera financeiro e gera fiscal. Antes de diagnosticar venda/compra, perguntar qual perfil foi usado.
- NFe: chave = documento gerado; protocolo = autorizado pela SEFAZ; sem protocolo = pendente ou falha.
- Tabelas importantes: PESSOAS (clientes TIPO='C', fornecedores TIPO='F'), LANCC (lançamentos financeiros), CABVEN/ITEVEN (cabeçalho/itens de movimentos), MODULOS/DIREITOS (menu e permissões).
- Dados a coletar: filial, usuário/grupo, perfil de movimento, período, número do documento, cliente/fornecedor, produto, mensagem de erro exata.`
    : `
CONTEXTO DO SISTEMA
- Sistema: ${produto}
${orgConfig?.description ? `- Descrição: ${orgConfig.description}` : ""}
- Dados a coletar: módulo/funcionalidade afetada, mensagem de erro exata, impacto (total/parcial), usuário/área afetada.`

  return `Você é a IA de Triagem Técnica Sênior do WillTalk (WhatsApp), especialista em suporte do sistema ${produto}, hardware e TI no Brasil.

MISSÃO
Classificar o chamado com precisão cirúrgica, direcionar para a fila correta e extrair evidências técnicas suficientes para a próxima fase de resolução autônoma.

REGRAS ABSOLUTAS
1. Nunca invente dados técnicos, erros, módulos ou comportamentos.
2. Se faltarem dados críticos, faça UMA pergunta objetiva e específica — não faça múltiplas perguntas.
3. Classifique prioridade ALTA ou CRÍTICA quando: emissão fiscal bloqueada, sistema produtivo inoperante, banco de dados inacessível, equipamento de vendas parado.
4. Se o cliente pedir atendente/humano explicitamente → escalar imediatamente.
5. Resposta ao cliente: máx 220 caracteres, sem emoji, linguagem direta e cordial.
${ANTI_HALLUCINATION_BLOCK}
5.1 Use tom profissional consultivo (sem gírias), com precisão técnica.
6. Nunca solicite senha, token, certificado digital ou dados sensíveis.
7. Fora do horário comercial: adicione aviso curto no final.
8. Sempre mapear para uma fila ativa. Se não houver aderência clara, use a primeira fila ativa.
9. Retornar EXATAMENTE o JSON no schema abaixo — sem markdown, sem texto fora do JSON.

ESCALA DE PRIORIDADE
- critica: produção parada, emissão fiscal bloqueada, servidor inacessível, perda de dados em curso
- alta: funcionalidade principal comprometida, impacto em múltiplos usuários, SLA em risco
- media: funcionalidade parcial, workaround disponível, impacto isolado
- baixa: dúvida de uso, solicitação de configuração, melhoria

ESCALA DE SEVERIDADE
- S1: crítico — parada total de produção
- S2: alto — funcionalidade principal comprometida
- S3: médio — impacto parcial com workaround
- S4: baixo — informação ou melhoria
${augeBlock}

CRITÉRIOS DE SUFICIÊNCIA PARA TRIAGEM COMPLETA
Considere triagem_completed = true quando tiver TODOS:
- sintoma principal identificado
- impacto estimado (total/parcial/isolado)
- módulo, sistema ou equipamento afetado (mesmo aproximado)
Se faltar algum, faça UMA pergunta objetiva pedindo o item mais crítico.

REGRA DE TENTATIVAS
- Tente fechar a triagem em até 2 interações.
- Na 1ª interação sem dados suficientes: peça o campo mais crítico (erro literal ou impacto).
- Na 2ª interação sem fechamento: force human_handoff = true com prioridade alta.
- Nunca fique em loop pedindo os mesmos dados.

SCHEMA DE SAÍDA (OBRIGATÓRIO)
{
  "queue_id": "string|null",
  "prioridade": "baixa|media|alta|critica",
  "severidade": "S1|S2|S3|S4",
  "triage_completed": true,
  "should_reply": true,
  "reply_text": "string (máx 220 chars, sem emoji)",
  "human_handoff": false,
  "confidence": 0.0,
  "resumo_triagem": "string curto e técnico",
  "campos_faltantes": []
}`
}

function buildUserPrompt(input: TriageInput): string {
  const textoContexto = `${input.mensagem_atual || ""} ${input.historico_conversa || ""}`
  const isAuge = !input.tenantId || input.tenantId === "auge"
  const conhecimentoRelevante = isAuge ? selecionarConhecimento(textoContexto, 2) : ""
  const contextoBlock = conhecimentoRelevante
    ? `=== CONTEXTO TÉCNICO ${input.orgConfig?.product_name || "AUGE"} (use para classificar com precisão) ===\n${conhecimentoRelevante}\n=== FIM DO CONTEXTO ===\n\n`
    : ""

  return `Analise a entrada e retorne APENAS JSON válido no schema obrigatório.

${contextoBlock}

organization_id: ${input.organization_id || ""}
ticket_id: ${input.ticket_id || ""}
conversation_id: ${input.conversation_id || ""}
cliente_nome: ${input.cliente_nome || ""}
cliente_telefone: ${input.cliente_telefone || ""}
canal: ${input.canal || "whatsapp"}
mensagem_atual: ${input.mensagem_atual || ""}
historico_conversa: ${input.historico_conversa || ""}
filas_disponiveis_json: ${JSON.stringify(input.filas_disponiveis_json || [])}
horario_comercial_aberto: ${String(input.horario_comercial_aberto ?? true)}
tentativas_triagem: ${String(input.tentativas_triagem ?? 0)}
idioma_preferencial: ${input.idioma_preferencial || "pt-BR"}
metadados_json: ${JSON.stringify(input.metadados_json || {})}

Schema obrigatório:
{
  "queue_id": "string|null",
  "prioridade": "baixa|media|alta|critica",
  "severidade": "S1|S2|S3|S4",
  "triage_completed": true,
  "should_reply": true,
  "reply_text": "string",
  "human_handoff": false,
  "confidence": 0.0,
  "resumo_triagem": "string curto",
  "campos_faltantes": []
}`
}

function getFilaFallback(filas: Fila[]): string | null {
  const ativas = filas.filter((f) => f?.isActive !== false && !!f?.id)
  const suporteGeral = ativas.find((f) =>
    String(f.name || "").toLowerCase().includes("suporte geral"),
  )
  return (suporteGeral?.id || ativas[0]?.id || null) ?? null
}

function ensureReplyLimit(text: string): string {
  const t = String(text || "").trim()
  if (t.length <= 220) return t
  return `${t.slice(0, 217)}...`
}

function buildMissingInfoQuestion(camposFaltantes: string[]): string {
  const first = String(camposFaltantes[0] || "").trim()
  if (!first) {
    return "Perfeito, vou te ajudar com isso. Para eu direcionar certinho, me informe o módulo afetado e se o impacto está total ou parcial, por favor."
  }
  const mapa: Record<string, string> = {
    erro_literal:
      "Claro. Você pode me enviar a mensagem de erro exata que aparece na tela, por favor? Isso acelera bastante o diagnóstico.",
    impacto_operacional:
      "Perfeito. Só me confirme, por favor: o impacto está total (parou tudo) ou parcial?",
    modulo_ou_funcionalidade_afetada:
      "Entendi. Você pode me dizer qual módulo ou funcionalidade está afetado, por favor?",
  }
  return (
    mapa[first] ||
    "Perfeito. Para finalizar a triagem com segurança, me envie por favor o principal dado que está faltando no chamado."
  )
}

function buildInvestigationReply(attempt: number, outsideBusinessHours: boolean): string {
  const prefix =
    attempt <= 0
      ? "Entendi seu cenário e vou te ajudar por aqui. Para eu analisar com mais precisão, pode me enviar:"
      : "Obrigado pelo retorno. Para seguirmos com a próxima validação, pode me enviar agora:"
  const body =
    " 1) uma foto/print da tela com o erro, 2) a mensagem de erro exata, e 3) se o impacto está total ou parcial."
  const base = `${prefix}${body}`
  return outsideBusinessHours
    ? `${base} Estamos fora do horário comercial no momento, mas seu chamado já foi registrado e vamos seguir no próximo expediente.`
    : base
}

function safeFallback(input: TriageInput, filas: Fila[]) {
  const queueFallback = getFilaFallback(filas)
  const foraHorario = input.horario_comercial_aberto === false
  const tentativas = Number(input.tentativas_triagem || 0)
  const forcarHandoff = tentativas >= 2
  const baseReply =
    "Entendi seu cenário. Para classificar corretamente, me informe o módulo afetado e se a operação está totalmente parada ou parcial."
  return {
    queue_id: queueFallback,
    prioridade: forcarHandoff ? "alta" : "media",
    severidade: forcarHandoff ? "S2" : "S3",
    triage_completed: forcarHandoff,
    should_reply: true,
    reply_text: ensureReplyLimit(
      forcarHandoff
        ? "Entendi. Para evitar atraso, encaminhei seu chamado para atendimento humano com prioridade alta. O time segue por aqui em instantes."
        : foraHorario
        ? `${baseReply} Estamos fora do horário comercial no momento, mas seu chamado já foi registrado.`
        : baseReply,
    ),
    human_handoff: forcarHandoff,
    confidence: forcarHandoff ? 0.82 : 0.35,
    resumo_triagem: forcarHandoff
      ? "triagem automatica incompleta apos tentativas; escalado para humano"
      : (String(input.mensagem_atual || "").slice(0, 180) || "triagem inicial pendente"),
    campos_faltantes: forcarHandoff
      ? []
      : ["modulo_ou_funcionalidade_afetada", "impacto_operacional"],
  }
}

export async function gerarTriagemIA(input: TriageInput) {
  const filas = Array.isArray(input.filas_disponiveis_json)
    ? (input.filas_disponiveis_json as Fila[])
    : []
  const raw = await gerarTextoIA(buildTriageSystemPrompt(input.orgConfig), buildUserPrompt(input))
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return safeFallback(input, filas)
  try {
    const parsed = JSON.parse(match[0])
    const queueFallback = getFilaFallback(filas)
    const filaValida =
      filas.some((f) => f?.id && f.id === parsed?.queue_id && f?.isActive !== false)
        ? parsed.queue_id
        : queueFallback
    const foraHorario = input.horario_comercial_aberto === false
    const parsedCampos = Array.isArray(parsed?.campos_faltantes)
      ? parsed.campos_faltantes.map((x: unknown) => String(x)).slice(0, 8)
      : []
    const triageCompletedParsed = Boolean(parsed?.triage_completed)
    const replyBaseRaw = String(parsed?.reply_text || "").trim()
    const replyFallback = triageCompletedParsed
      ? "Perfeito! Triagem concluída. Já encaminhei seu chamado para o time responsável e vamos te atualizar por aqui."
      : buildMissingInfoQuestion(parsedCampos)
    const replyBase = replyBaseRaw || replyFallback
    const reply = ensureReplyLimit(
      foraHorario
        ? `${replyBase} Estamos fora do horário comercial no momento, mas seu chamado já foi registrado.`
        : replyBase,
    )
    const tentativas = Number(input.tentativas_triagem || 0)
    const maxTentativasAjuda = 2
    const emFaseInvestigacao = tentativas < maxTentativasAjuda && !Boolean(parsed?.human_handoff)
    const precisaForcarHandoff = (!filaValida || !triageCompletedParsed) && tentativas >= 2
    const camposInvestigacao =
      parsedCampos.length > 0
        ? parsedCampos
        : ["foto_ou_print_do_erro", "erro_literal", "impacto_operacional"]
    return {
      queue_id: filaValida || getFilaFallback(filas),
      prioridade: precisaForcarHandoff
        ? "alta"
        : (["baixa", "media", "alta", "critica"].includes(parsed?.prioridade)
        ? parsed.prioridade
        : "media"),
      severidade: precisaForcarHandoff
        ? "S2"
        : (["S1", "S2", "S3", "S4"].includes(parsed?.severidade)
        ? parsed.severidade
        : "S3"),
      triage_completed: precisaForcarHandoff ? true : emFaseInvestigacao ? false : triageCompletedParsed,
      should_reply: true,
      reply_text: precisaForcarHandoff
        ? "Obrigado pelas informações. Para agilizar a solução com segurança, encaminhei seu chamado para atendimento humano com prioridade alta. Nosso time vai seguir com você por aqui."
        : emFaseInvestigacao
          ? ensureReplyLimit(buildInvestigationReply(tentativas, foraHorario))
          : reply,
      human_handoff: precisaForcarHandoff ? true : emFaseInvestigacao ? false : Boolean(parsed?.human_handoff),
      confidence: precisaForcarHandoff
        ? 0.84
        : Math.max(0, Math.min(1, Number(parsed?.confidence || 0))),
      resumo_triagem: (precisaForcarHandoff
        ? "triagem incompleta apos tentativas; escalado para humano"
        : emFaseInvestigacao
          ? `triagem em investigacao (${tentativas + 1}/${maxTentativasAjuda}); coletando evidencias`
          : String(parsed?.resumo_triagem || "triagem registrada com dados recebidos")).slice(0, 220),
      campos_faltantes: precisaForcarHandoff
        ? []
        : emFaseInvestigacao
          ? camposInvestigacao
          : parsedCampos,
    }
  } catch {
    return safeFallback(input, filas)
  }
}


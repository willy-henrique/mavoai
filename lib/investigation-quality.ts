import { gerarTextoIA } from "@/lib/ai-provider"
import { logger } from "@/lib/logger"

export type InvestigationNivel = "adequado" | "insuficiente" | "fora_do_tema"

export type InvestigationEvalResult = {
  nivel: InvestigationNivel
  motivoCurto: string
  textoResposta: string
}

const EVAL_SYSTEM = `Você é um avaliador técnico sênior de suporte B2B no Brasil, com foco em suporte do sistema AUGE ERP.

Sua função: classificar se a mensagem do cliente contém evidência técnica SUFICIENTE para a próxima fase de resolução autônoma.

SAÍDA: SOMENTE JSON válido, sem markdown, sem texto extra:
{“nivel”:”adequado”|”insuficiente”|”fora_do_tema”,”motivoCurto”:”até 120 chars”,”textoResposta”:”pronta para WhatsApp”}

━━━ CRITÉRIOS DE CLASSIFICAÇÃO ━━━

[1] “adequado” — use quando a mensagem permite agir ou investigar com os casos históricos
Evidências válidas (basta UMA):
• Mensagem de erro literal (mesmo parcial)
• Tela do sistema, módulo ou aplicativo relacionado à demanda
• Foto de equipamento, painel, etiqueta, LED ou tela de erro
• Sintoma específico e coerente: “ao clicar em X aparece Y”, “desde ontem não abre”, “só na máquina Z”
• Descrição textual com contexto: módulo + o que ocorre + quando ocorre
• Passos já tentados com resultado
• Mensagem que já permite hipótese de diagnóstico, mesmo sem print
• No contexto AUGE: rotina/módulo citado (ex.: cadastro de produtos, fiscal, relatório, financeiro, TEF/PIX)
• No contexto fiscal: código de rejeição, CFOP/CST/CSOSN, operação, série/ambiente, ou erro de certificado/SEFAZ

[2] “insuficiente” — use quando há intenção de suporte mas faltam dados mínimos para agir
Exemplos típicos:
• “não funciona” / “está com problema” / “deu erro”
• Print genérico sem mensagem de erro visível
• Foto ilegível, cortada ou sem relação com a demanda
• Sem identificar sistema, módulo, equipamento, ou o que acontece concretamente

[3] “fora_do_tema” — use SOMENTE quando a mensagem claramente não é suporte técnico
Exemplos:
• Conversa pessoal, brincadeira, ofensa, mensagem comercial aleatória
• Sem qualquer relação com a demanda técnica selecionada
DÚVIDA entre insuficiente/fora_do_tema? Escolha “insuficiente” se a pessoa parece querer suporte.

━━━ REGRAS DE DECISÃO ━━━
• Analise texto + descrição de imagem juntos
• Se contradizerem: priorize a evidência técnica mais confiável
• Seja generoso: se houver qualquer sintoma técnico objetivo, classifique “adequado”
• Nunca invente erro, equipamento, tela, módulo ou procedimento
• Nunca prometa encaminhamento, visita, prazo ou correção
• Nunca use emoji ou markdown na textoResposta

━━━ REGRAS PARA motivoCurto ━━━
• Máx 120 caracteres, objetivo e natural
• Exemplo: “Informou erro literal e módulo afetado” / “Relato vago, sem detalhe técnico”

━━━ REGRAS PARA textoResposta ━━━
• Português do Brasil, cordial, profissional
• Tom consultivo e técnico, sem gírias e sem informalidade excessiva
• Pronta para enviar no WhatsApp — máx ~220 caracteres
• Varie o estilo; não repita frases engessadas
• “adequado”: reconheça brevemente, peça no máximo 1 complemento se realmente adicionar valor
• “insuficiente”: peça APENAS o item mais crítico que está faltando (1 pedido, não 3)
• “fora_do_tema”: redirecione educadamente para envio de detalhes técnicos
• Se cliente não puder enviar print: aceite descrição por texto; não insista na imagem
• Se cliente irritado: postura calma, objetiva, sem confronto
• Use no máximo 2 frases curtas
• Nunca diga que o problema foi resolvido nesta fase`

export function parseInvestigationEvalJson(raw: string): InvestigationEvalResult | null {
  let s = raw.trim()
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/im.exec(s)
  if (fence) s = fence[1].trim()
  const start = s.indexOf("{")
  const end = s.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    const o = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>
    const nivel = o.nivel
    if (nivel !== "adequado" && nivel !== "insuficiente" && nivel !== "fora_do_tema") {
      return null
    }
    const motivoCurto = String(o.motivoCurto || "").slice(0, 200)
    const textoResposta = String(o.textoResposta || "").trim()
    if (!textoResposta) return null
    return {
      nivel,
      motivoCurto,
      textoResposta: textoResposta.slice(0, 220),
    }
  } catch {
    return null
  }
}

export async function evaluateInvestigationTurn(params: {
  queueName: string
  userText: string
  imageAnalysis: string | null
}): Promise<InvestigationEvalResult> {
  const { queueName, userText, imageAnalysis } = params
  const userPrompt = `DEMANDA SELECIONADA PELO CLIENTE (categoria do chamado): "${queueName}"

TEXTO DESTA MENSAGEM:
${userText.trim() || "(sem texto — apenas mídia ou vazio)"}

${imageAnalysis ? `DESCRICAO / CONCLUSAO DA ANALISE VISUAL (ja feita):\n${imageAnalysis}\n` : "Nenhuma analise de imagem disponivel para este turno.\n"}

Classifique o turno e escreva textoResposta para o cliente.`

  try {
    const raw = await gerarTextoIA(EVAL_SYSTEM, userPrompt)
    const parsed = parseInvestigationEvalJson(raw)
    if (parsed) return parsed
    logger.warn("investigation_eval_unparseable", { preview: raw.slice(0, 200) })
  } catch (e) {
    logger.warn("investigation_eval_api_failed", {
      error: e instanceof Error ? e.message : String(e),
    })
  }

  return {
    nivel: "insuficiente",
    motivoCurto: "avaliacao indisponivel",
    textoResposta:
      "Não consegui validar sua mensagem agora. Envie um print da *tela do sistema* ou do equipamento relacionado a " +
      queueName +
      ", com a *mensagem de erro* visível se houver, ou descreva o sintoma em uma frase objetiva.",
  }
}

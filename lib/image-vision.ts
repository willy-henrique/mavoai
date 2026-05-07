import { logger } from "@/lib/logger"
import { GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"
import { isLikelyImagePayload } from "@/lib/vision-utils"

function getVisionApiBase(): string {
  const explicit = process.env.VISION_API_BASE_URL?.trim().replace(/\/$/, "")
  if (explicit) return explicit
  const aiBase = process.env.AI_BASE_URL?.trim().replace(/\/$/, "") || ""
  if (aiBase.includes("groq.com")) return aiBase
  if (aiBase.includes("api.x.ai")) return aiBase
  return "https://api.x.ai/v1"
}

/**
 * Chave válida por provedor: não enviar chave Groq (gsk_) para api.x.ai.
 */
function getVisionApiKey(): string {
  const base = getVisionApiBase()
  const fromEnv = (v: string | undefined) => String(v || "").trim()

  const dedicated = [
    process.env.VISION_API_KEY,
    process.env.XAI_API_KEY,
    process.env.WILLTALK_VISION_API_KEY,
    process.env.GROK_API_KEY,
  ]
  for (const c of dedicated) {
    const v = fromEnv(c)
    if (v) return v
  }

  const ai = fromEnv(process.env.AI_API_KEY)
  const openai = fromEnv(process.env.OPENAI_API_KEY)
  const emb = fromEnv(process.env.EMBEDDING_API_KEY)

  if (base.includes("groq.com")) {
    return ai || ""
  }

  if (base.includes("openai.com")) {
    return openai || (!ai.startsWith("gsk_") ? ai : "") || emb
  }

  // xAI (padrão): Groq gsk_ não funciona aqui
  if (ai && !ai.startsWith("gsk_")) return ai
  return openai && !openai.startsWith("gsk_") ? openai : ""
}

function getVisionModel(baseUrl: string): string {
  const fromEnv = process.env.WILLTALK_VISION_MODEL || process.env.VISION_MODEL
  if (fromEnv?.trim()) return fromEnv.trim()
  if (baseUrl.includes("groq.com")) return GROQ_LLAMA4_SCOUT_INSTRUCT
  if (baseUrl.includes("openai.com")) return "gpt-4o-mini"
  // Modelo de visão da xAI (nome comercial "Grok" na xAI — não é a API Groq)
  return "grok-2-vision-1212"
}

export async function analyzeImageForSupport(params: {
  mediaUrl: string | null | undefined
  mimeType: string | null | undefined
  inboundBody: string
  /** Fila/demanda escolhida (ex.: Balança - MGV) — ancora a leitura da imagem. */
  demandCategory?: string | null
}): Promise<string | null> {
  const { mediaUrl, mimeType, inboundBody, demandCategory } = params

  if (!mediaUrl || !isLikelyImagePayload(mediaUrl, mimeType)) {
    return null
  }

  const baseUrl = getVisionApiBase()
  const apiKey = getVisionApiKey()
  if (!apiKey) {
    logger.warn("vision_skipped_no_api_key", {
      baseUrl,
      hint: baseUrl.includes("groq.com")
        ? "Configure AI_API_KEY (gsk_) ou VISION_API_KEY para visao no Groq (Llama 4 Scout)."
        : baseUrl.includes("openai.com")
          ? "Configure OPENAI_API_KEY ou VISION_API_KEY para visao na OpenAI."
          : "Configure XAI_API_KEY ou VISION_API_KEY (chave Groq gsk_ nao serve na api.x.ai).",
    })
    return null
  }

  const model = getVisionModel(baseUrl)
  const userText = String(inboundBody || "").trim() || "Cliente enviou uma imagem (sem legenda)."
  const demand = String(demandCategory || "").trim() || "suporte tecnico"

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.15,
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content:
              "Voce e especialista em suporte tecnico B2B (Brasil). Analise a imagem com honestidade. " +
              `A DEMANDA DO CHAMADO e: "${demand}". A imagem deve ajudar a entender um problema relacionado a essa demanda. ` +
              "Se a imagem for so tela do WhatsApp, lista numerica de menu, conversa de bate-papo sem erro de sistema, ou captura que NAO mostra software/equipamento/erro da demanda, diga explicitamente que NAO ha evidencia tecnica da demanda e o que falta (ex.: print da tela do sistema, foto do equipamento com etiqueta, mensagem de erro). " +
              "Se houver evidencia util: formato (1) O que a imagem mostra em 1-2 frases, (2) 2 a 4 passos praticos alinhados a essa demanda, (3) pedir erro literal ou proximo print se persistir. " +
              "Nao invente modelo de equipamento ou erro que nao apareca. Nao peca dados sensiveis.",
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  `Demanda: ${demand}. Legenda ou texto do cliente: ${userText}`,
              },
              { type: "image_url", image_url: { url: mediaUrl } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(45_000),
    })

    const rawBody = await res.text()
    if (!res.ok) {
      logger.warn("vision_api_http_error", {
        status: res.status,
        baseUrl,
        model,
        bodyPreview: rawBody.slice(0, 400),
      })
      return null
    }

    let data: { choices?: Array<{ message?: { content?: string } }> }
    try {
      data = JSON.parse(rawBody) as { choices?: Array<{ message?: { content?: string } }> }
    } catch {
      logger.warn("vision_api_invalid_json", { baseUrl, preview: rawBody.slice(0, 200) })
      return null
    }

    const content = String(data?.choices?.[0]?.message?.content || "").trim()
    if (!content) {
      logger.warn("vision_api_empty_content", { baseUrl, model })
      return null
    }
    return content.slice(0, 900)
  } catch (error) {
    logger.warn("vision_image_analysis_failed", {
      error: error instanceof Error ? error.message : String(error),
      mediaUrl,
      baseUrl,
      model,
    })
    return null
  }
}

export interface ModelOption {
  id: string
  label: string
  /** true = modelos gratuitos sem custo por token */
  free?: boolean
}

export interface ProviderPreset {
  id: string
  label: string
  base_url: string
  /** env var que guarda a API key deste provider */
  env_key: string
  /** URL para criar a chave gratuita */
  signup_url: string
  compat: "openai"
  color: string
  models: ModelOption[]
}

/** Providers 100% gratuitos suportados pelo Mavo.AI. */
export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "groq",
    label: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    env_key: "GROQ_API_KEY",
    signup_url: "https://console.groq.com/keys",
    compat: "openai",
    color: "border-orange-200 bg-orange-50 text-orange-700",
    models: [
      { id: "llama-3.3-70b-versatile",                   label: "Llama 3.3 70B — forte e rápido",     free: true },
      { id: "openai/gpt-oss-120b",                       label: "GPT-OSS 120B — máxima qualidade",    free: true },
      { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout — rápido/multimodal",  free: true },
      { id: "llama-3.1-8b-instant",                      label: "Llama 3.1 8B — ultrarrápido",        free: true },
    ],
  },
  {
    id: "gemini",
    label: "Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    env_key: "GOOGLE_API_KEY",
    signup_url: "https://aistudio.google.com/apikey",
    compat: "openai",
    color: "border-blue-200 bg-blue-50 text-blue-700",
    models: [
      { id: "gemini-2.0-flash",      label: "Gemini 2.0 Flash — rápido",       free: true },
      { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite — leve",    free: true },
      { id: "gemini-1.5-flash",      label: "Gemini 1.5 Flash",                free: true },
      { id: "gemini-1.5-pro",        label: "Gemini 1.5 Pro — contexto longo", free: true },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    env_key: "OPENROUTER_API_KEY",
    signup_url: "https://openrouter.ai/settings/keys",
    compat: "openai",
    color: "border-emerald-200 bg-emerald-50 text-emerald-700",
    models: [
      { id: "meta-llama/llama-3.3-70b-instruct:free",    label: "Llama 3.3 70B (free)",    free: true },
      { id: "google/gemma-3-27b-it:free",                label: "Gemma 3 27B (free)",      free: true },
      { id: "mistralai/mistral-7b-instruct:free",        label: "Mistral 7B (free)",       free: true },
      { id: "microsoft/phi-4-reasoning:free",            label: "Phi-4 Reasoning (free)",  free: true },
      { id: "deepseek/deepseek-r1:free",                 label: "DeepSeek R1 (free)",      free: true },
    ],
  },
]

export interface FallbackEntry {
  /** id do provider em PROVIDER_PRESETS (groq | gemini | openrouter) */
  provider: string
  /** id do modelo daquele provider */
  model: string
}

/**
 * Cadeia de reserva padrão (quando o admin não configurou nada).
 * Estratégia: primeiro OUTROS modelos Groq (mesma chave, mas o limite diário do
 * Groq é POR MODELO — cota separada), depois provedores externos. Tudo grátis.
 */
export const DEFAULT_FALLBACKS: FallbackEntry[] = [
  { provider: "groq",       model: "meta-llama/llama-4-scout-17b-16e-instruct" },
  { provider: "groq",       model: "openai/gpt-oss-120b" },
  { provider: "gemini",     model: "gemini-2.0-flash" },
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
]

/** Detecta o provider pelo base_url salvo no agente. Null = custom/global. */
export function detectProvider(baseUrl: string | null | undefined): ProviderPreset | null {
  if (!baseUrl) return null
  try {
    const host = new URL(baseUrl).hostname
    return PROVIDER_PRESETS.find((p) => new URL(p.base_url).hostname === host) ?? null
  } catch {
    return null
  }
}

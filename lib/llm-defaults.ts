/**
 * IDs oficiais dos provedores (Groq / OpenAI-compat).
 * GPT-OSS 120B: modelo principal — reasoning avançado, contexto longo, via Groq.
 * Llama 4 Scout: fallback leve — multimodal, baixa latência.
 * @see https://console.groq.com/docs/models
 */
export const GROQ_GPT_OSS_120B = "openai/gpt-oss-120b"
export const GROQ_LLAMA4_SCOUT_INSTRUCT = "meta-llama/llama-4-scout-17b-16e-instruct"
/** Modelo rápido/barato para tarefas internas de classificação (não vão ao cliente). */
export const GROQ_LLAMA31_8B_INSTANT = "llama-3.1-8b-instant"

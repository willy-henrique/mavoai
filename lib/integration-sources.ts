export type IntegrationSourceConfig = {
  key: string
  name: string
  ingestPath: string
}

const SOURCE_ALIAS_MAP: Record<string, string> = {
  will_talk: "willtalk",
  mtalk: "mtalk",
  m_talk: "mtalk",
  mavo_gestao: "mavo_gestao",
  mavo_gestao_erp: "mavo_gestao",
  mavo_erp: "mavo_gestao",
}

export const SUPPORTED_INTEGRATION_SOURCES: IntegrationSourceConfig[] = [
  {
    key: "willtalk",
    name: "WillTalk",
    ingestPath: "/api/ingestao/willtalk",
  },
  {
    key: "mtalk",
    name: "MTalk",
    ingestPath: "/api/ingestao/mtalk",
  },
  {
    key: "mavo_gestao",
    name: "Mavo Gestao",
    ingestPath: "/api/ingestao/mavo-gestao",
  },
]

function toAsciiSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

export function normalizeSourceSystem(value: unknown, fallback = "external") {
  const raw = String(value || "").trim()
  if (!raw) return fallback

  const slug = toAsciiSlug(raw)
  return SOURCE_ALIAS_MAP[slug] || slug || fallback
}

export function getIntegrationSourceConfig(value: unknown) {
  const key = normalizeSourceSystem(value)
  return (
    SUPPORTED_INTEGRATION_SOURCES.find((source) => source.key === key) || {
      key,
      name: key
        .split("_")
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      ingestPath: "/api/ingestao/v1/events",
    }
  )
}

export function getIntegrationDisplayName(value: unknown) {
  return getIntegrationSourceConfig(value).name
}

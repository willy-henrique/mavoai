/**
 * lib/pii-sanitizer.ts
 *
 * Sanitização de PII (dados pessoais) para conformidade LGPD.
 * Remove/substitui CPF, CNPJ, e-mail, telefone e RG antes de
 * armazenar ou indexar textos de conversas e documentos.
 *
 * Uso: import { sanitizePII } from "@/lib/pii-sanitizer"
 *      const limpo = sanitizePII(textoOriginal)
 */

// ─── Padrões PII ───────────────────────────────────────────────────────────────

// CPF: 000.000.000-00 ou 00000000000 (11 dígitos)
const CPF_RE = /\b\d{3}[\s.]?\d{3}[\s.]?\d{3}[\s.-]?\d{2}\b/g

// CNPJ: 00.000.000/0000-00 ou 00000000000100 (14 dígitos)
const CNPJ_RE = /\b\d{2}[\s.]?\d{3}[\s.]?\d{3}[\s/]?\d{4}[\s-]?\d{2}\b/g

// E-mail
const EMAIL_RE = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g

// Telefone BR: (11) 99999-9999 | +55 11 99999-9999 | 11999999999
const TELEFONE_RE =
  /(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)(?:9\d{4}|\d{4})[\s-]?\d{4}\b/g

// RG: X.XXX.XXX-D (SP) ou variantes com 7-9 dígitos + dígito verificador
const RG_RE = /\b\d{1,2}[\s.]?\d{3}[\s.]?\d{3}[\s-]?\d{1}[A-Za-z]?\b/g

// ─── Ordem de aplicação ────────────────────────────────────────────────────────
// CNPJ antes de CPF (para evitar que os 14 dígitos do CNPJ sejam truncados como CPF).
// E-mail antes de telefone (para não interferir com domínios numéricos).

const RULES: Array<{ re: RegExp; label: string }> = [
  { re: CNPJ_RE,    label: "[CNPJ_OMITIDO]"    },
  { re: CPF_RE,     label: "[CPF_OMITIDO]"      },
  { re: EMAIL_RE,   label: "[EMAIL_OMITIDO]"    },
  { re: TELEFONE_RE, label: "[TELEFONE_OMITIDO]" },
  { re: RG_RE,      label: "[RG_OMITIDO]"       },
]

// ─── Função principal ──────────────────────────────────────────────────────────

/**
 * Substitui PII detectado por marcadores genéricos.
 * Não modifica o original — retorna nova string.
 */
export function sanitizePII(text: string): string {
  if (!text) return text
  let result = text
  for (const { re, label } of RULES) {
    // Resetar lastIndex para uso seguro com flag /g
    re.lastIndex = 0
    result = result.replace(re, label)
  }
  return result
}

/**
 * Detecta se o texto contém algum PII antes de sanitizar.
 * Útil para logging/auditoria.
 */
export function containsPII(text: string): boolean {
  if (!text) return false
  for (const { re } of RULES) {
    re.lastIndex = 0
    if (re.test(text)) return true
  }
  return false
}

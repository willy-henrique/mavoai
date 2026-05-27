/**
 * importar-docs-auge.mjs
 *
 * Importa todas as pastas de documentação do Auge/Tillit do Google Drive.
 * Roda o import-google-drive.mjs para cada pasta em sequência.
 *
 * Uso:
 *   node scripts/importar-docs-auge.mjs [--dry-run] [--tenant-id <TENANT>]
 */

import { execSync } from "child_process"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const bold   = (s) => `\x1b[1m${s}\x1b[0m`
const green  = (s) => `\x1b[32m${s}\x1b[0m`
const red    = (s) => `\x1b[31m${s}\x1b[0m`
const dim    = (s) => `\x1b[2m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`

const DRY_RUN = process.argv.includes("--dry-run")

const tenantIdx = process.argv.indexOf("--tenant-id")
const TENANT_ID = tenantIdx !== -1 ? process.argv[tenantIdx + 1] : "auge"

// ─── Pastas configuradas ──────────────────────────────────────────────────────

const PASTAS = [
  { label: "TillitPDV",           folder: "1MJ-a1suL8gu8ZsiY4UgUPo8SaTZ35N3B" },
  { label: "AugeWEB",             folder: "1g5q_BdNHNgm_zGO5lx0h11nBSx1jXm71" },
  { label: "TillitConcentrador",  folder: "1YA4OR_0gsTyW8AZGtfIxidO47FHegNBX" },
  { label: "AugePDV",             folder: "1Jqala0pOZk4LN5b_0YjbJLJ2_6u6Nnfl" },
  { label: "TillitIntegrador",    folder: "14fLt7YMPE4twr_KhYekYBb88DuVPcvgo" },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

const script = path.join(__dirname, "import-google-drive.mjs")
const resultados = []

console.log(bold("\n🚀 Importação completa — Documentação Auge/Tillit"))
console.log(dim(`   ${PASTAS.length} pastas · tenant: ${TENANT_ID}${DRY_RUN ? " · DRY-RUN" : ""}`))
console.log(dim("─".repeat(52)))

for (const pasta of PASTAS) {
  console.log(bold(`\n\n━━━ ${pasta.label} ━━━`))
  const args = [
    `--folder "${pasta.folder}"`,
    `--label "${pasta.label}"`,
    `--tenant-id "${TENANT_ID}"`,
    DRY_RUN ? "--dry-run" : "",
  ].filter(Boolean).join(" ")

  try {
    execSync(`node "${script}" ${args}`, { stdio: "inherit" })
    resultados.push({ label: pasta.label, ok: true })
  } catch {
    console.log(red(`\n✗ ${pasta.label} falhou.`))
    resultados.push({ label: pasta.label, ok: false })
  }
}

// ─── Resumo final ─────────────────────────────────────────────────────────────

console.log(bold("\n\n══════════════════════════════════════════════════════"))
console.log(bold("  Resumo Final"))
console.log(bold("══════════════════════════════════════════════════════"))
for (const r of resultados) {
  const icon = r.ok ? green("✓") : red("✗")
  console.log(`  ${icon} ${r.label}`)
}

const falhas = resultados.filter((r) => !r.ok).length
if (falhas === 0) {
  console.log(green("\n✅ Todas as pastas importadas com sucesso!\n"))
} else {
  console.log(yellow(`\n⚠  ${falhas} pasta(s) com erro — verifique o compartilhamento no Drive.\n`))
}

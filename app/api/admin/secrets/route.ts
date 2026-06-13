/**
 * GET/POST/DELETE /api/admin/secrets
 *
 * Gestão dos tokens/chaves do Mavo AI pelo painel.
 * Protegido pelo middleware (exige sessão admin).
 *
 * GET    → status de cada segredo: { set, masked, source }
 * POST   → salva novos valores no banco (vazios/máscara são ignorados)
 * DELETE → ?name=NOME remove o valor do banco (volta a valer a env var)
 */
import { NextResponse } from "next/server"
import { MANAGED_SECRETS, isManagedSecret, secretSource, type ManagedSecretName } from "@/lib/secret-store"
import { getSystemConfig, maskKey, saveSecrets, deleteSecret } from "@/lib/system-config-store"

export const dynamic = "force-dynamic"

function isUrlField(name: string) {
  return name.endsWith("_URL")
}

export async function GET() {
  const items: Record<string, unknown> = {}
  for (const name of Object.keys(MANAGED_SECRETS) as ManagedSecretName[]) {
    const dbVal = await getSystemConfig(`secret.${name}`)
    const effective = (dbVal && dbVal.trim()) || process.env[name] || ""
    const source = await secretSource(name)
    items[name] = {
      label: MANAGED_SECRETS[name].label,
      group: MANAGED_SECRETS[name].group,
      placeholder: MANAGED_SECRETS[name].placeholder,
      set: !!effective,
      source,
      // URLs não são segredo → mostra em claro; tokens/chaves → mascarado
      display: effective ? (isUrlField(name) ? effective : maskKey(effective)) : "",
    }
  }
  return NextResponse.json({ secrets: items })
}

export async function POST(request: Request) {
  let body: Record<string, string>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  // Aceita só nomes conhecidos (evita gravar lixo em system_config).
  const filtered: Record<string, string> = {}
  for (const [name, value] of Object.entries(body || {})) {
    if (isManagedSecret(name) && typeof value === "string") filtered[name] = value
  }

  try {
    await saveSecrets(filtered)
    return NextResponse.json({ ok: true, saved: Object.keys(filtered) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "internal_error", detail: msg }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  const name = new URL(request.url).searchParams.get("name") || ""
  if (!isManagedSecret(name)) {
    return NextResponse.json({ error: "secret_desconhecido" }, { status: 400 })
  }
  try {
    await deleteSecret(name)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: "internal_error", detail: msg }, { status: 500 })
  }
}

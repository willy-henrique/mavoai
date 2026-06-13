"use client"

import { useEffect, useState, useCallback } from "react"
import {
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

type SecretInfo = {
  label: string
  group: string
  placeholder: string
  set: boolean
  source: "db" | "env" | "none"
  display: string
}

type SecretsResponse = { secrets: Record<string, SecretInfo> }

const GROUP_LABELS: Record<string, { title: string; description: string }> = {
  ia: {
    title: "IA — Provedores externos",
    description: "Chaves dos provedores usados pelos agentes especialistas (a chave Groq/embeddings fica em Configurações → Modelos).",
  },
  seguranca: {
    title: "Segurança",
    description: "Token exigido nos webhooks de ingestão quando a autenticação está ativa.",
  },
  mtalk: {
    title: "MTalk (WhatsApp)",
    description: "Credenciais usadas para enviar respostas pelo MTalk.",
  },
  willtalk: {
    title: "WillTalk",
    description: "Credenciais da API direta do WillTalk.",
  },
}

const GROUP_ORDER = ["ia", "seguranca", "mtalk", "willtalk"]

function SourceBadge({ source }: { source: SecretInfo["source"] }) {
  if (source === "db")
    return <Badge className="border-emerald-200 bg-emerald-50 text-emerald-700">Salvo no painel</Badge>
  if (source === "env")
    return <Badge className="border-blue-200 bg-blue-50 text-blue-700">Variável de ambiente</Badge>
  return <Badge className="border-amber-200 bg-amber-50 text-amber-700">Não definido</Badge>
}

export function SecretsPanel() {
  const [secrets, setSecrets] = useState<Record<string, SecretInfo>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/secrets", { cache: "no-store" })
      if (!res.ok) throw new Error(`status ${res.status}`)
      const data: SecretsResponse = await res.json()
      setSecrets(data.secrets || {})
    } catch (e) {
      setFeedback({ ok: false, msg: "Não foi possível carregar os tokens." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const dirtyCount = Object.values(drafts).filter((v) => v.trim().length > 0).length

  async function handleSave() {
    const payload: Record<string, string> = {}
    for (const [name, val] of Object.entries(drafts)) {
      if (val.trim().length > 0) payload[name] = val.trim()
    }
    if (Object.keys(payload).length === 0) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/admin/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(`status ${res.status}`)
      setDrafts({})
      setFeedback({ ok: true, msg: "Tokens salvos. Efeito em até 30 segundos, sem redeploy." })
      await load()
    } catch {
      setFeedback({ ok: false, msg: "Erro ao salvar. Tente de novo." })
    } finally {
      setSaving(false)
    }
  }

  async function handleReset(name: string) {
    if (!confirm(`Remover o valor salvo de "${secrets[name]?.label}"? Volta a valer a variável de ambiente.`)) return
    setSaving(true)
    try {
      await fetch(`/api/admin/secrets?name=${encodeURIComponent(name)}`, { method: "DELETE" })
      await load()
      setFeedback({ ok: true, msg: "Valor removido — voltou para a variável de ambiente." })
    } catch {
      setFeedback({ ok: false, msg: "Erro ao remover." })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="size-4 animate-spin" /> Carregando tokens...
      </div>
    )
  }

  const names = Object.keys(secrets)
  const grouped = GROUP_ORDER.map((g) => ({
    group: g,
    items: names.filter((n) => secrets[n].group === g),
  })).filter((x) => x.items.length > 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <ShieldCheck className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Tokens & Chaves</p>
            <p className="text-xs text-slate-500">
              Editáveis aqui — o valor salvo no painel tem prioridade sobre a variável de ambiente.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={saving}>
            <RefreshCw className="size-4" /> Recarregar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving || dirtyCount === 0}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
            feedback.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          {feedback.msg}
        </div>
      )}

      {grouped.map(({ group, items }) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle className="text-base">{GROUP_LABELS[group]?.title ?? group}</CardTitle>
            <CardDescription>{GROUP_LABELS[group]?.description}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {items.map((name) => {
              const s = secrets[name]
              const isUrl = name.endsWith("_URL")
              return (
                <div key={name} className="grid gap-2 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-3.5 text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">{s.label}</span>
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{name}</code>
                    </div>
                    <SourceBadge source={s.source} />
                  </div>
                  {s.set && (
                    <p className="text-xs text-slate-500">
                      Atual: <span className="font-mono">{s.display}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      type={isUrl ? "text" : "password"}
                      autoComplete="off"
                      placeholder={s.set ? "Digite para substituir..." : s.placeholder}
                      value={drafts[name] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [name]: e.target.value }))}
                      className="h-9"
                    />
                    {s.source === "db" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-slate-400 hover:text-red-600"
                        title="Remover valor salvo (volta ao ambiente)"
                        onClick={() => handleReset(name)}
                        disabled={saving}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

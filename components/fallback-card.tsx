"use client"

import { useCallback, useEffect, useState } from "react"
import { Layers, Loader2, Save, Plus, Trash2, ArrowUp, ArrowDown, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Entry = { provider: string; model: string }
type Provider = { id: string; label: string; models: { id: string; label: string }[] }

export function FallbackCard() {
  const [fallbacks, setFallbacks] = useState<Entry[]>([])
  const [providers, setProviders] = useState<Provider[]>([])
  const [chaves, setChaves] = useState<Record<string, boolean>>({})
  const [usandoPadrao, setUsandoPadrao] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/admin/ai-fallbacks", { cache: "no-store" })
      const d = await r.json()
      setFallbacks(Array.isArray(d.fallbacks) ? d.fallbacks : [])
      setProviders(d.providers || [])
      setChaves(d.chaves || {})
      setUsandoPadrao(!!d.usando_padrao)
    } catch {
      setFeedback({ ok: false, msg: "Não foi possível carregar a reserva." })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const upd = (i: number, patch: Partial<Entry>) =>
    setFallbacks((f) => f.map((e, j) => (j === i ? { ...e, ...patch } : e)))
  const remove = (i: number) => setFallbacks((f) => f.filter((_, j) => j !== i))
  const move = (i: number, dir: -1 | 1) =>
    setFallbacks((f) => {
      const j = i + dir
      if (j < 0 || j >= f.length) return f
      const c = [...f]; [c[i], c[j]] = [c[j], c[i]]; return c
    })
  const add = () =>
    setFallbacks((f) => [...f, { provider: providers[0]?.id || "groq", model: "" }])

  async function salvar() {
    setSaving(true); setFeedback(null)
    try {
      const r = await fetch("/api/admin/ai-fallbacks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fallbacks: fallbacks.filter((e) => e.model.trim()) }),
      })
      if (!r.ok) throw new Error()
      setFeedback({ ok: true, msg: "Reserva salva. Efeito em até 30 segundos." })
      await load()
    } catch {
      setFeedback({ ok: false, msg: "Erro ao salvar a reserva." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Layers className="size-4" />
            </span>
            <div>
              <CardTitle className="text-base">Modelos de reserva (fallback)</CardTitle>
              <CardDescription>
                Se o modelo principal estourar o limite, a IA usa estes — na ordem abaixo. Dica: outro modelo do Groq tem cota diária separada (grátis).
              </CardDescription>
            </div>
          </div>
          {usandoPadrao && <Badge className="border-blue-200 bg-blue-50 text-blue-700">Padrão</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Carregando...</div>
        ) : (
          <>
            {fallbacks.length === 0 && (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">Nenhuma reserva — a IA depende só do modelo principal. Adicione ao menos uma.</p>
            )}
            {fallbacks.map((e, i) => {
              const prov = providers.find((p) => p.id === e.provider)
              const semChave = chaves[e.provider] === false
              return (
                <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-500">{i + 1}</span>
                  <select
                    value={e.provider}
                    onChange={(ev) => upd(i, { provider: ev.target.value })}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-emerald-400"
                  >
                    {providers.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                  <input
                    list={`models-${e.provider}`}
                    value={e.model}
                    onChange={(ev) => upd(i, { model: ev.target.value })}
                    placeholder="modelo (escolha ou digite)"
                    className="h-9 min-w-[200px] flex-1 rounded-md border border-slate-200 bg-white px-3 font-mono text-xs text-slate-800 outline-none focus:border-emerald-400"
                  />
                  {semChave && (
                    <Badge className="border-amber-200 bg-amber-50 text-amber-700 gap-1"><AlertTriangle className="size-3" /> sem chave</Badge>
                  )}
                  <div className="ml-auto flex items-center gap-0.5">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Subir"><ArrowUp className="size-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === fallbacks.length - 1} className="rounded p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30" title="Descer"><ArrowDown className="size-4" /></button>
                    <button onClick={() => remove(i)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Remover"><Trash2 className="size-4" /></button>
                  </div>
                </div>
              )
            })}

            {/* datalists de sugestão de modelos por provider */}
            {providers.map((p) => (
              <datalist key={p.id} id={`models-${p.id}`}>
                {p.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </datalist>
            ))}

            {feedback && (
              <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${feedback.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {feedback.ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}{feedback.msg}
              </div>
            )}

            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={add}><Plus className="size-4" /> Adicionar reserva</Button>
              <Button size="sm" onClick={salvar} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar reserva
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

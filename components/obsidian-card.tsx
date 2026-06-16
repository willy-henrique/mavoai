"use client"

import { useEffect, useState } from "react"
import { Network, Loader2, Save, Plug, RefreshCw, CheckCircle2, AlertTriangle, ScrollText } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Feedback = { ok: boolean; msg: string } | null

export function ObsidianCard() {
  const [apiUrl, setApiUrl] = useState("")
  const [token, setToken] = useState("")
  const [tokenMasked, setTokenMasked] = useState("")
  const [tokenSet, setTokenSet] = useState(false)
  const [category, setCategory] = useState("Obsidian")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState<"" | "test" | "sync">("")
  const [fb, setFb] = useState<Feedback>(null)

  async function load() {
    setLoading(true)
    try {
      const d = await (await fetch("/api/admin/obsidian", { cache: "no-store" })).json()
      setApiUrl(d.api_url || "")
      setCategory(d.category || "Obsidian")
      setTokenSet(!!d.token_set)
      setTokenMasked(d.token_masked || "")
    } catch {
      setFb({ ok: false, msg: "Não foi possível carregar a configuração." })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function salvar() {
    setSaving(true); setFb(null)
    try {
      const r = await fetch("/api/admin/obsidian", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_url: apiUrl, token: token || undefined, category }),
      })
      if (!r.ok) throw new Error()
      setToken("")
      setFb({ ok: true, msg: "Configuração salva." })
      await load()
    } catch {
      setFb({ ok: false, msg: "Erro ao salvar." })
    } finally {
      setSaving(false)
    }
  }

  async function rodar(dryRun: boolean) {
    setBusy(dryRun ? "test" : "sync"); setFb(null)
    try {
      const r = await fetch("/api/admin/obsidian/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun }),
      })
      const d = await r.json()
      if (!d.ok) {
        setFb({ ok: false, msg: `Falhou: ${d.error || "erro"}. (O Mavo precisa alcançar o Obsidian — rode de uma máquina na mesma rede/Radmin VPN.)` })
      } else if (dryRun) {
        setFb({ ok: true, msg: `Conexão OK — ${d.notas} nota(s) encontrada(s) no vault. Clique "Sincronizar" para indexar.` })
      } else {
        setFb({ ok: true, msg: `Sincronizado: ${d.inseridos} trecho(s) indexado(s), ${d.pulados} já existiam, ${d.erros} erro(s), de ${d.notas} nota(s).` })
      }
    } catch {
      setFb({ ok: false, msg: "Erro de conexão ao disparar a sincronização." })
    } finally {
      setBusy("")
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Network className="size-4" />
          </span>
          <div>
            <CardTitle className="text-base">Obsidian (segundo cérebro)</CardTitle>
            <CardDescription>
              Indexa o vault do Obsidian (plugin Local REST API) no RAG. Os logs de cada nota aparecem na aba Logs.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="size-4 animate-spin" /> Carregando...</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-slate-600">URL da API (IP da VPN + porta)</label>
                <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="http://26.150.97.90:27123" className="h-9 font-mono text-xs" />
              </div>
              <div className="grid gap-1.5">
                <label className="text-xs font-medium text-slate-600">Categoria padrão</label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Obsidian" className="h-9" />
              </div>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-slate-600">
                Token da API {tokenSet && <span className="text-emerald-600">(configurado: {tokenMasked})</span>}
              </label>
              <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={tokenSet ? "Digite para substituir..." : "chave do plugin Local REST API"} className="h-9 font-mono text-xs" />
            </div>

            {fb && (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${fb.ok ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"}`}>
                {fb.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                {fb.msg}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={salvar} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
              </Button>
              <Button variant="outline" size="sm" onClick={() => rodar(true)} disabled={busy !== ""}>
                {busy === "test" ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />} Testar conexão
              </Button>
              <Button size="sm" onClick={() => rodar(false)} disabled={busy !== ""}>
                {busy === "sync" ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Sincronizar agora
              </Button>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
                <ScrollText className="size-3.5" /> detalhes na aba Logs
              </span>
            </div>

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              A sincronização roda no servidor do Mavo e precisa <b>alcançar o Obsidian pela rede</b> (mesma Radmin VPN, plugin Local REST API ligado e porta liberada no firewall). Em produção (nuvem) isso não alcança a VPN — rode de um Mavo na mesma rede da VM, ou agende na própria VM.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

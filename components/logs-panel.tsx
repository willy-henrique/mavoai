"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, ScrollText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type LogRow = {
  id: string
  created_at: string
  canal: string
  status: string
  nivel: "ok" | "erro" | "info"
  cliente: string
  mensagem: string
  detalhe: string
}

const NIVEL_STYLE: Record<LogRow["nivel"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  erro: "border-red-200 bg-red-50 text-red-700",
  info: "border-slate-200 bg-slate-100 text-slate-600",
}

function quando(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    })
  } catch {
    return iso
  }
}

export function LogsPanel() {
  const [logs, setLogs] = useState<LogRow[]>([])
  const [resumo, setResumo] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [auto, setAuto] = useState(true)

  const load = useCallback(async () => {
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : ""
      const res = await fetch(`/api/admin/logs${qs}`, { cache: "no-store" })
      const data = await res.json()
      setLogs(Array.isArray(data.logs) ? data.logs : [])
      setResumo(data.resumo || {})
    } catch {
      /* silencioso */
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    if (!auto) return
    const t = setInterval(load, 15_000)
    return () => clearInterval(t)
  }, [auto, load])

  const statusChips = Object.entries(resumo).sort((a, b) => b[1] - a[1])

  return (
    <div className="space-y-4">
      {/* Resumo 24h + ações */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <ScrollText className="size-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Logs da IA</p>
            <p className="text-xs text-slate-500">Eventos de atendimento das últimas 24h — clique num status para filtrar.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="accent-emerald-500" />
            Auto (15s)
          </label>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="size-4" /> Recarregar
          </Button>
        </div>
      </div>

      {/* Chips de status (resumo 24h) */}
      {statusChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {statusFilter && (
            <button
              onClick={() => setStatusFilter("")}
              className="flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              <X className="size-3" /> limpar filtro
            </button>
          )}
          {statusChips.map(([st, n]) => (
            <button
              key={st}
              onClick={() => setStatusFilter(statusFilter === st ? "" : st)}
              className={`rounded-full border px-2.5 py-1 text-xs transition ${
                statusFilter === st
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {st} <span className="font-mono font-semibold">{n}</span>
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="size-4 animate-spin" /> Carregando logs...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">Nenhum log ainda{statusFilter ? ` para "${statusFilter}"` : ""}.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {logs.map((l) => (
                <div key={l.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex shrink-0 items-center gap-2 sm:w-64">
                    <Badge className={`${NIVEL_STYLE[l.nivel]} text-[10px]`}>{l.status}</Badge>
                    <span className="text-[11px] text-slate-400">{l.canal}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    {l.cliente && <span className="mr-2 text-xs font-medium text-slate-700">{l.cliente}</span>}
                    {l.mensagem && <span className="text-sm text-slate-700">{l.mensagem}</span>}
                    {l.detalhe && <p className="mt-0.5 truncate text-[11px] text-slate-400">{l.detalhe}</p>}
                  </div>
                  <span className="shrink-0 font-mono text-[11px] text-slate-400">{quando(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

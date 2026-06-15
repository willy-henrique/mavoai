"use client"

import { useCallback, useEffect, useState } from "react"
import { Activity, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Gauge } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type Limite = { limite: number | null; restante: number | null; reset: string | null }
type Status = {
  ok: boolean
  provider: string
  model: string
  status: "ok" | "atencao" | "critico" | "offline" | "sem_chave" | string
  erros_24h: number
  reserva?: string[]
  retry_after?: string | null
  detalhe_erro?: string | null
  limites?: { requisicoes: Limite; tokens: Limite }
}

const STATUS_UI: Record<string, { label: string; cls: string }> = {
  ok:       { label: "Operando normal",     cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  atencao:  { label: "Atenção — perto do limite", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  critico:  { label: "Crítico — limite quase/estourado", cls: "border-red-200 bg-red-50 text-red-700" },
  offline:  { label: "Provedor não respondeu", cls: "border-red-200 bg-red-50 text-red-700" },
  sem_chave:{ label: "Sem chave configurada", cls: "border-amber-200 bg-amber-50 text-amber-700" },
}

function Barra({ titulo, l, sufixo }: { titulo: string; l?: Limite; sufixo: string }) {
  if (!l || l.limite == null || l.restante == null) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-xs font-medium text-slate-600">{titulo}</p>
        <p className="mt-1 text-xs text-slate-400">Provedor não reporta este limite.</p>
      </div>
    )
  }
  const pct = Math.max(0, Math.min(100, (l.restante / l.limite) * 100))
  const cor = pct < 10 ? "bg-red-500" : pct < 25 ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-slate-600">{titulo}</p>
        <p className="text-xs text-slate-500">
          <span className="font-mono font-semibold text-slate-800">{l.restante.toLocaleString("pt-BR")}</span>
          {" / "}{l.limite.toLocaleString("pt-BR")} {sufixo}
        </p>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-2 rounded-full ${cor} transition-all`} style={{ width: `${pct}%` }} />
      </div>
      {l.reset && <p className="mt-1 text-[11px] text-slate-400">Renova em {l.reset}</p>}
    </div>
  )
}

export function AiHealthCard() {
  const [data, setData] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/ai-status", { cache: "no-store" })
      setData(await res.json())
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load]) // só no load + refresh manual (cada chamada consome 1 request)

  const sui = data ? (STATUS_UI[data.status] ?? { label: data.status, cls: "border-slate-200 bg-slate-100 text-slate-600" }) : null

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Gauge className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Saúde & Limites da IA</p>
              <p className="text-xs text-slate-500">
                {data ? `${data.provider} · ${data.model}` : "Provedor de IA"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {sui && (
              <Badge className={`${sui.cls} gap-1`}>
                {data?.status === "ok" ? <CheckCircle2 className="size-3" /> : <AlertTriangle className="size-3" />}
                {sui.label}
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              Verificar
            </Button>
          </div>
        </div>

        {loading && !data ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Consultando o provedor...
          </div>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Barra titulo="Requisições" l={data.limites?.requisicoes} sufixo="restantes" />
              <Barra titulo="Tokens" l={data.limites?.tokens} sufixo="restantes" />
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <Activity className="size-3.5 text-slate-400" />
                Erros nas últimas 24h:{" "}
                <span className={data.erros_24h > 0 ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"}>
                  {data.erros_24h}
                </span>
              </span>
              {data.retry_after && <span className="text-red-600">Aguardar {data.retry_after}s (limite atingido)</span>}
              <span className="flex items-center gap-1.5">
                Reserva (fallback):{" "}
                {data.reserva && data.reserva.length > 0 ? (
                  <span className="font-medium text-emerald-600">{data.reserva.join(", ")}</span>
                ) : (
                  <span className="font-medium text-amber-600">nenhuma configurada</span>
                )}
              </span>
            </div>

            {data.detalhe_erro && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {data.detalhe_erro}
              </p>
            )}

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
              Estes são os limites do plano atual do provedor. Quando as <b>requisições</b> ou os <b>tokens</b> chegam a zero,
              a IA para de responder até a renovação (mostrada acima). Se isso virar rotina, é sinal de aumentar o plano do
              provedor ou ativar um modelo de reserva.
            </p>
          </>
        ) : (
          <p className="text-sm text-slate-500">Não foi possível consultar o status da IA.</p>
        )}
      </CardContent>
    </Card>
  )
}

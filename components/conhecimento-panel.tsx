"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Search,
  RefreshCw,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Database,
  Lightbulb,
  Zap,
  ZapOff,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PAGE = 20

interface KnowledgeItem {
  id: string
  resumo_problema: string | null
  problema: string | null
  causa: string | null
  solucao: string | null
  canal: string | null
  categoria: string | null
  tenant_id: string | null
  data_atendimento: string | null
  updated_at: string | null
  tem_embedding: boolean
  preview: string | null
}

interface KnowledgeResponse {
  data: KnowledgeItem[]
  total: number
  limit: number
  offset: number
  canais: string[]
}

function fmtDate(s?: string | null) {
  if (!s) return "—"
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR")
}

export function ConhecimentoPanel() {
  const [buscaInput, setBuscaInput] = useState("")
  const [busca, setBusca] = useState("")
  const [canal, setCanal] = useState("todos")
  const [offset, setOffset] = useState(0)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [erroMsg, setErroMsg] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)

  const params = new URLSearchParams()
  if (busca) params.set("busca", busca)
  if (canal && canal !== "todos") params.set("canal", canal)
  params.set("limit", String(PAGE))
  params.set("offset", String(offset))
  const swrKey = `/api/knowledge?${params.toString()}`

  const { data, isLoading, mutate } = useSWR<KnowledgeResponse>(swrKey, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  })

  const items = data?.data ?? []
  const total = data?.total ?? 0
  const canais = data?.canais ?? []
  const pageNum = Math.floor(offset / PAGE) + 1
  const totalPages = Math.max(1, Math.ceil(total / PAGE))

  const aplicarBusca = () => {
    setOffset(0)
    setBusca(buscaInput.trim())
  }

  const trocarCanal = (c: string) => {
    setOffset(0)
    setCanal(c)
  }

  const remover = async (id: string) => {
    setDeletingId(id)
    setErroMsg(null)
    setOkMsg(null)
    try {
      const res = await fetch(`/api/knowledge/${id}`, { method: "DELETE" })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || `status ${res.status}`)
      setOkMsg("Item removido da base. A IA não vai mais usá-lo.")
      await mutate()
    } catch (e) {
      setErroMsg(`Não foi possível remover: ${e instanceof Error ? e.message : "erro"}`)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Busca + origem */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-5 w-5 text-emerald-600" />
            Curar a base de conhecimento
          </CardTitle>
          <CardDescription>
            Encontre e remova conhecimento errado, desatualizado ou duplicado. A remoção é
            permanente e tem efeito imediato na busca da IA.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por problema, solução ou trecho..."
                value={buscaInput}
                onChange={(e) => setBuscaInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && aplicarBusca()}
                className="pl-9"
              />
            </div>
            <Button onClick={aplicarBusca} className="gap-2">
              <Search className="h-4 w-4" />
              Buscar
            </Button>
            <Button variant="outline" onClick={() => mutate()} title="Atualizar" className="gap-2">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Filtro de origem */}
          {canais.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground mr-1">Origem:</span>
              {["todos", ...canais].map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={canal === c ? "default" : "outline"}
                  className="h-7 px-2.5 text-xs"
                  onClick={() => trocarCanal(c)}
                >
                  {c}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Mensagens */}
      {erroMsg && (
        <div className="flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{erroMsg}</p>
        </div>
      )}
      {okMsg && (
        <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
          {okMsg}
        </div>
      )}

      {/* Cabeçalho da lista + paginação */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {isLoading && !data ? "Carregando..." : `${total} item${total !== 1 ? "s" : ""} na base`}
          {busca ? ` · filtro: "${busca}"` : ""}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground tabular-nums">
            Pág. {pageNum}/{totalPages}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={offset === 0 || isLoading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            disabled={offset + PAGE >= total || isLoading}
            onClick={() => setOffset((o) => o + PAGE)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Lista */}
      {isLoading && !data ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-6 w-6" />
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center text-muted-foreground">
            <Database className="h-10 w-10 opacity-30" />
            <p className="text-sm">Nenhum item encontrado.</p>
            {busca && <p className="text-xs">Tente outro termo ou limpe o filtro de origem.</p>}
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => {
            const titulo =
              item.resumo_problema?.trim() ||
              item.problema?.trim() ||
              item.preview?.trim() ||
              "(sem título)"
            return (
              <Card key={item.id}>
                <CardContent className="flex flex-col gap-3 pt-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex flex-col gap-1.5">
                      <p className="text-sm font-medium leading-snug">{titulo}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.canal && (
                          <Badge variant="outline" className="text-[11px]">
                            {item.canal}
                          </Badge>
                        )}
                        {item.categoria && (
                          <Badge variant="secondary" className="text-[11px]">
                            {item.categoria}
                          </Badge>
                        )}
                        {item.tenant_id && (
                          <Badge variant="outline" className="text-[11px] font-mono">
                            {item.tenant_id}
                          </Badge>
                        )}
                        <Badge
                          className={`text-[11px] gap-1 ${
                            item.tem_embedding
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
                          }`}
                        >
                          {item.tem_embedding ? <Zap className="h-3 w-3" /> : <ZapOff className="h-3 w-3" />}
                          {item.tem_embedding ? "indexado" : "sem embedding"}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">
                          {fmtDate(item.updated_at || item.data_atendimento)}
                        </span>
                      </div>
                    </div>

                    {/* Remover */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950"
                          disabled={deletingId === item.id}
                        >
                          {deletingId === item.id ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remover este conhecimento?</AlertDialogTitle>
                          <AlertDialogDescription className="space-y-2">
                            <span className="block">
                              A IA deixa de usar este item nas respostas a partir da próxima busca.
                              <strong> Esta ação é permanente.</strong>
                            </span>
                            <span className="block rounded bg-muted p-2 text-xs text-foreground/80">
                              {titulo}
                            </span>
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remover(item.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Remover da base
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>

                  {item.solucao?.trim() && (
                    <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950/50">
                      <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-300">
                        <Lightbulb className="h-3.5 w-3.5" />
                        Solução
                      </p>
                      <p className="text-sm text-green-900 dark:text-green-100 line-clamp-4">
                        {item.solucao}
                      </p>
                    </div>
                  )}
                  {item.causa?.trim() && (
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium">Causa:</span> {item.causa}
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

"use client"

import { useMemo, useState } from "react"
import useSWR from "swr"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Spinner } from "@/components/ui/spinner"
import {
  Search,
  Sparkles,
  RefreshCw,
  MessageCircle,
  Monitor,
  Phone,
  Clock3,
  User,
  Tag,
  Ticket,
  AlertCircle,
  CheckCircle2,
  Hourglass,
  ChevronRight,
  BrainCircuit,
} from "lucide-react"
import type { Atendimento, Categoria } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface AtendimentosListProps {
  refreshKey?: number
}

type ConversationGroup = {
  key: string
  ticket_externo?: string | null
  cliente: string
  canal?: string | null
  tecnico: string
  data_atendimento: string
  categorias?: Atendimento["categorias"]
  processado: boolean
  resumo: string | null
  problema: string | null
  causa: string | null
  solucao: string | null
  entries: Atendimento[]
  texto_original: string
}

type ChatLine = {
  sender: "cliente" | "atendente" | "sistema"
  text: string
}

function parseChatLines(raw: string): ChatLine[] {
  const text = String(raw || "").trim()
  if (!text) return []
  const normalized = text.replace(/\r/g, "")
  const compact = normalized.replace(/\s+/g, " ").trim()
  const cleaned = compact
    .replace(/\[whatsapp\]\[ticket:[^\]]+\]/gi, "")
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, "")
    .replace(/\s+\|\s+/g, " | ")
    .trim()
  const parts = cleaned
    .split(/\s*\|\s*(?=cliente:|atendente:|sistema:)/i)
    .map((p) => p.trim())
    .filter(Boolean)
  const lines: ChatLine[] = []
  for (const part of parts) {
    const m = part.match(/^(cliente|atendente|sistema)\s*:\s*(.+)$/i)
    if (!m) continue
    const sender = m[1].toLowerCase() as ChatLine["sender"]
    const content = m[2].replace(/\s+/g, " ").trim()
    if (!content) continue
    lines.push({ sender, text: content })
  }
  if (lines.length > 0) return lines
  return [{ sender: "cliente", text: cleaned }]
}

function ChatBubbles({ texto }: { texto: string }) {
  const lines = parseChatLines(texto)
  if (!lines.length) {
    return (
      <p className="text-sm text-muted-foreground italic">Sem mensagens.</p>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, idx) => {
        const isCliente = line.sender === "cliente"
        const isAtendente = line.sender === "atendente"
        return (
          <div
            key={idx}
            className={`flex ${isCliente ? "justify-start" : "justify-end"}`}
          >
            <div
              className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ${
                isCliente
                  ? "bg-muted rounded-bl-sm"
                  : isAtendente
                    ? "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-100 rounded-br-sm"
                    : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-60 mb-0.5">
                {line.sender}
              </p>
              <p className="whitespace-pre-wrap wrap-break-word">{line.text}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CanalBadge({ canal }: { canal?: string | null }) {
  if (canal === "whatsapp") {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300 dark:text-green-400 dark:border-green-700 font-normal">
        <Phone className="h-3 w-3" /> WhatsApp
      </Badge>
    )
  }
  if (canal === "chat") {
    return (
      <Badge variant="outline" className="gap-1 text-xs font-normal">
        <MessageCircle className="h-3 w-3" /> Chat
      </Badge>
    )
  }
  if (canal) {
    return (
      <Badge variant="outline" className="gap-1 text-xs font-normal">
        <Monitor className="h-3 w-3" /> {canal}
      </Badge>
    )
  }
  return <span className="text-muted-foreground text-xs">—</span>
}

function StatusBadge({ group }: { group: ConversationGroup }) {
  if (group.processado && group.resumo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-800">
        <CheckCircle2 className="h-3 w-3" />
        Processado
      </span>
    )
  }
  if (group.processado && !group.resumo) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200 dark:bg-red-950 dark:text-red-300 dark:ring-red-800">
        <AlertCircle className="h-3 w-3" />
        Erro Groq
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800">
      <Hourglass className="h-3 w-3" />
      Pendente
    </span>
  )
}

function DetailSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function AtendimentoSheet({
  group,
  open,
  onOpenChange,
  onProcessar,
  processing,
}: {
  group: ConversationGroup | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onProcessar: (a: Atendimento) => void
  processing: string | null
}) {
  const [activeTab, setActiveTab] = useState<"conversa" | "analise">("conversa")

  if (!group) return null

  const lastEntry = group.entries[group.entries.length - 1]
  const isProcessing = processing === lastEntry?.id

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col p-0">
        {/* Sheet Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div className="flex flex-col gap-1 min-w-0">
              <SheetTitle className="text-base truncate">{group.cliente}</SheetTitle>
              <SheetDescription className="flex flex-wrap items-center gap-2 text-xs">
                <span className="flex items-center gap-1">
                  <Clock3 className="h-3 w-3" />
                  {formatDate(group.data_atendimento)}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {group.tecnico || "—"}
                </span>
                {group.ticket_externo && (
                  <span className="flex items-center gap-1">
                    <Ticket className="h-3 w-3" />
                    #{group.ticket_externo}
                  </span>
                )}
              </SheetDescription>
            </div>
            <StatusBadge group={group} />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-3">
            {(["conversa", "analise"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeTab === tab
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab === "conversa" ? "Conversa" : "Análise (Groq)"}
              </button>
            ))}
          </div>
        </SheetHeader>

        {/* Content */}
        <ScrollArea className="flex-1 px-5 py-4">
          {activeTab === "conversa" ? (
            <div className="flex flex-col gap-4">
              {group.categorias?.nome && (
                <div className="flex items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                  <Tag className="h-3 w-3" />
                  <span className="font-medium">{group.categorias.nome}</span>
                </div>
              )}
              <ChatBubbles texto={group.texto_original} />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {!group.processado ? (
                <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-10 text-center text-muted-foreground">
                  <BrainCircuit className="h-8 w-8 opacity-40" />
                  <p className="text-sm">
                    Este atendimento ainda não foi processado pelo Groq (extração estruturada).
                  </p>
                  <Button
                    size="sm"
                    onClick={() => onProcessar(lastEntry)}
                    disabled={isProcessing}
                  >
                    {isProcessing ? (
                      <Spinner className="mr-2 h-4 w-4" />
                    ) : (
                      <Sparkles className="mr-2 h-4 w-4" />
                    )}
                    {isProcessing ? "Processando..." : "Processar com Groq"}
                  </Button>
                </div>
              ) : (
                <>
                  {group.resumo && (
                    <DetailSection label="Resumo">
                      <div className="rounded-lg bg-muted p-3 text-sm leading-relaxed">
                        {group.resumo}
                      </div>
                    </DetailSection>
                  )}
                  <Separator />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <DetailSection label="Problema">
                      <div className="rounded-lg bg-red-50 p-3 text-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {group.problema || "—"}
                      </div>
                    </DetailSection>
                    <DetailSection label="Causa Raiz">
                      <div className="rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                        {group.causa || "—"}
                      </div>
                    </DetailSection>
                  </div>
                  <DetailSection label="Solução Aplicada">
                    <div className="rounded-lg bg-emerald-50 p-3 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 leading-relaxed">
                      {group.solucao || "—"}
                    </div>
                  </DetailSection>
                  <Separator />
                  <div className="flex justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onProcessar(lastEntry)}
                      disabled={isProcessing}
                    >
                      {isProcessing ? (
                        <Spinner className="mr-2 h-4 w-4" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      Reprocessar
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

export function AtendimentosList({ refreshKey }: AtendimentosListProps) {
  const [filters, setFilters] = useState({ busca: "", tecnico: "", categoria: "" })
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)
  const [selectedGroup, setSelectedGroup] = useState<ConversationGroup | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const queryParams = new URLSearchParams()
  if (filters.busca) queryParams.set("busca", filters.busca)
  if (filters.tecnico) queryParams.set("tecnico", filters.tecnico)
  if (filters.categoria) queryParams.set("categoria", filters.categoria)

  const { data, error, isLoading, mutate } = useSWR<{ data: Atendimento[]; total: number }>(
    `/api/atendimentos?${queryParams.toString()}&refresh=${refreshKey}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const { data: categoriasData } = useSWR<{ data: Categoria[] }>("/api/categorias", fetcher)

  const handleProcessar = async (atendimento: Atendimento) => {
    setProcessingId(atendimento.id)
    setProcessError(null)
    try {
      const res = await fetch("/api/atendimentos/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: atendimento.id, texto_original: atendimento.texto_original }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg =
          res.status === 429
            ? "Groq temporariamente indisponível (rate limit). Tente em ~15s."
            : body?.error || `Erro ${res.status}`
        setProcessError(msg)
      } else {
        await mutate()
        // Re-select the updated group
        setSelectedGroup((prev) =>
          prev
            ? { ...prev, processado: true }
            : prev
        )
      }
    } catch {
      setProcessError("Falha de rede ao processar")
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })

  const formatTime = (dateString: string) =>
    new Date(dateString).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })

  const groupedConversations = useMemo<ConversationGroup[]>(() => {
    const items = data?.data || []
    const map = new Map<string, Atendimento[]>()
    for (const item of items) {
      const key =
        item.ticket_externo?.trim() ||
        `${String(item.cliente || "").trim().toLowerCase()}|${String(item.canal || "").trim().toLowerCase()}`
      const list = map.get(key) || []
      list.push(item)
      map.set(key, list)
    }
    const groups: ConversationGroup[] = Array.from(map.entries()).map(([key, entries]) => {
      const sorted = [...entries].sort(
        (a, b) => new Date(a.data_atendimento).getTime() - new Date(b.data_atendimento).getTime()
      )
      const latest = sorted[sorted.length - 1]
      const mergedText = sorted
        .map((e) => String(e.texto_original || "").trim())
        .filter(Boolean)
        .join(" | ")
      return {
        key,
        ticket_externo: latest.ticket_externo,
        cliente: latest.cliente,
        canal: latest.canal,
        tecnico: latest.tecnico,
        data_atendimento: latest.data_atendimento,
        categorias: latest.categorias,
        processado: sorted.some((e) => e.processado),
        resumo: latest.resumo,
        problema: latest.problema,
        causa: latest.causa,
        solucao: latest.solucao,
        entries: sorted,
        texto_original: mergedText,
      }
    })
    return groups.sort(
      (a, b) => new Date(b.data_atendimento).getTime() - new Date(a.data_atendimento).getTime()
    )
  }, [data?.data])

  const openSheet = (group: ConversationGroup) => {
    setSelectedGroup(group)
    setSheetOpen(true)
  }

  const processedCount = groupedConversations.filter((g) => g.processado && g.resumo).length
  const pendingCount = groupedConversations.filter((g) => !g.processado).length

  return (
    <>
      <AtendimentoSheet
        group={selectedGroup}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        onProcessar={handleProcessar}
        processing={processingId}
      />

      <div className="flex flex-col gap-4">
        {/* Header row */}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Atendimentos</h2>
            <p className="text-sm text-muted-foreground">
              {groupedConversations.length} conversas &mdash;{" "}
              <span className="text-emerald-600 dark:text-emerald-400">{processedCount} processadas</span>
              {pendingCount > 0 && (
                <>, <span className="text-amber-600 dark:text-amber-400">{pendingCount} pendentes</span></>
              )}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => mutate()} className="self-start sm:self-auto">
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </div>

        {/* Error banner */}
        {processError && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {processError}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por cliente, problema, solução..."
              className="pl-9"
              value={filters.busca}
              onChange={(e) => setFilters({ ...filters, busca: e.target.value })}
            />
          </div>
          <Input
            placeholder="Filtrar por técnico"
            className="md:w-44"
            value={filters.tecnico}
            onChange={(e) => setFilters({ ...filters, tecnico: e.target.value })}
          />
          <Select
            value={filters.categoria}
            onValueChange={(value) =>
              setFilters({ ...filters, categoria: value === "all" ? "" : value })
            }
          >
            <SelectTrigger className="md:w-44">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categoriasData?.data?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <Spinner className="h-7 w-7" />
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 m-4 rounded-lg bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Erro ao carregar atendimentos
            </div>
          ) : !groupedConversations.length ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
              <MessageCircle className="h-8 w-8 opacity-30" />
              <p className="text-sm">Nenhum atendimento encontrado</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-27.5 pl-4">Canal</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="hidden md:table-cell">Técnico</TableHead>
                  <TableHead className="hidden lg:table-cell">Categoria</TableHead>
                  <TableHead className="hidden sm:table-cell w-30">Status Groq</TableHead>
                  <TableHead className="w-30">Data</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedConversations.map((group) => (
                  <TableRow
                    key={group.key}
                    className="cursor-pointer"
                    onClick={() => openSheet(group)}
                  >
                    <TableCell className="pl-4">
                      <CanalBadge canal={group.canal} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-medium text-sm">{group.cliente}</span>
                        {group.ticket_externo && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Ticket className="h-3 w-3" />
                            #{group.ticket_externo}
                          </span>
                        )}
                        {/* Show category inline on small screens */}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground lg:hidden">
                          {group.categorias?.nome ?? "Sem categoria"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="text-sm text-muted-foreground">
                        {group.tecnico || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {group.categorias?.nome ? (
                        <Badge variant="secondary" className="font-normal text-xs">
                          {group.categorias.nome}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <StatusBadge group={group} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">{formatDate(group.data_atendimento)}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(group.data_atendimento)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}

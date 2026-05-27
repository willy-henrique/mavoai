"use client"

import { useCallback, useRef, useState } from "react"
import useSWR from "swr"
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  FileText,
  Info,
  Loader2,
  PenLine,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Org {
  id: string
  display_name: string
  product_name: string
  description: string | null
  is_active: boolean
  created_at: string
}

interface KnowledgeStats {
  total: number
  with_embeddings: number
  by_category: { category: string; count: number }[]
}

interface ChunkPreview {
  titulo: string
  preview: string
  vectorized: boolean
}

interface TrainingResultData {
  label: string
  inserted: number
  skipped: number
  errors: number
  total_chunks: number
  chunks: ChunkPreview[]
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const EMPTY_FORM = {
  id: "",
  display_name: "",
  product_name: "",
  description: "",
  is_active: true,
}

const ACCEPTED = ".pdf,.md,.txt"
const PREVIEW_MAX = 5

// ─── Training result ──────────────────────────────────────────────────────────

function TrainingResult({
  result,
  onNavigateToCerebro,
}: {
  result: TrainingResultData
  onNavigateToCerebro?: () => void
}) {
  const [expanded, setExpanded] = useState(false)

  const { inserted, skipped, errors, total_chunks, chunks } = result
  const allSkipped = inserted === 0 && skipped > 0 && errors === 0
  const hasErrors = errors > 0
  const success = inserted > 0 && errors === 0
  const partial = inserted > 0 && errors > 0

  const status = allSkipped
    ? { icon: Info, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "Conteúdo já existia no Cérebro" }
    : hasErrors && inserted === 0
    ? { icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Falha no treinamento" }
    : partial
    ? { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Treinamento parcial" }
    : { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "IA treinada com sucesso" }

  const StatusIcon = status.icon
  const visibleChunks = expanded ? chunks : chunks.slice(0, PREVIEW_MAX)
  const hiddenCount = chunks.length - PREVIEW_MAX

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${status.bg}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <StatusIcon className={`size-4 shrink-0 ${status.color}`} />
          <span className={`text-sm font-semibold ${status.color}`}>{status.label}</span>
        </div>
        {onNavigateToCerebro && inserted > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs shrink-0 border-emerald-300 text-emerald-700 hover:bg-emerald-100"
            onClick={onNavigateToCerebro}
          >
            <Brain className="size-3 mr-1.5" />
            Ver no Cérebro
          </Button>
        )}
      </div>

      {/* Source label */}
      <div className="flex items-center gap-1.5 text-xs text-slate-600">
        <FileText className="size-3 shrink-0 text-slate-400" />
        <span className="truncate font-medium">{result.label}</span>
      </div>

      {/* Stats bar */}
      <div className="space-y-1.5">
        <Progress value={((inserted + skipped) / Math.max(total_chunks, 1)) * 100} className="h-1.5" />
        <div className="flex gap-3 text-xs">
          {inserted > 0 && (
            <span className="text-emerald-700 font-medium">
              ✓ {inserted} chunk{inserted !== 1 ? "s" : ""} aprendido{inserted !== 1 ? "s" : ""}
            </span>
          )}
          {skipped > 0 && <span className="text-slate-500">{skipped} já existia{skipped !== 1 ? "m" : ""}</span>}
          {errors > 0 && <span className="text-red-600">{errors} erro{errors !== 1 ? "s" : ""}</span>}
          <span className="ml-auto text-slate-400">{total_chunks} total</span>
        </div>
      </div>

      {/* Chunk previews — o que a IA aprendeu */}
      {chunks.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
            O que a IA aprendeu
          </p>
          <div className="space-y-2">
            {visibleChunks.map((ch, i) => (
              <div key={i} className="rounded-lg border border-white/80 bg-white/70 p-2.5 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-800 leading-tight">{ch.titulo}</span>
                  {ch.vectorized && (
                    <Badge className="ml-auto h-4 px-1 text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200 shrink-0">
                      <Zap className="size-2.5 mr-0.5" />vetor
                    </Badge>
                  )}
                  {!ch.vectorized && (
                    <Badge className="ml-auto h-4 px-1 text-[10px] bg-slate-100 text-slate-500 border-slate-200 shrink-0">
                      sem vetor
                    </Badge>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed line-clamp-3">{ch.preview}</p>
              </div>
            ))}
          </div>
          {hiddenCount > 0 && (
            <button
              className="text-xs text-slate-500 hover:text-slate-700 underline underline-offset-2"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Mostrar menos" : `Ver mais ${hiddenCount} chunk${hiddenCount !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Knowledge panel per org ──────────────────────────────────────────────────

type TrainTab = "upload" | "text"

function KnowledgePanel({ org, onNavigateToCerebro }: { org: Org; onNavigateToCerebro?: () => void }) {
  const { data: stats, isLoading: statsLoading, mutate: refreshStats } =
    useSWR<KnowledgeStats>(`/api/knowledge/stats?tenant_id=${org.id}`, fetcher)

  const { toast } = useToast()
  const fileRef = useRef<HTMLInputElement>(null)

  const [tab, setTab] = useState<TrainTab>("upload")
  const [category, setCategory] = useState("Importado")

  // Upload state
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<TrainingResultData | null>(null)

  // Text state
  const [textTitle, setTextTitle] = useState("")
  const [textBody, setTextBody] = useState("")
  const [savingText, setSavingText] = useState(false)
  const [textResult, setTextResult] = useState<TrainingResultData | null>(null)

  // ── Upload handlers ──────────────────────────────────────────────────────────

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true)
      setUploadResult(null)
      try {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("tenant_id", org.id)
        fd.append("category", category)
        const res = await fetch("/api/knowledge/upload", { method: "POST", body: fd })
        const data = await res.json()
        if (!res.ok) {
          toast({ title: `Erro: ${data.error || "falha no upload"}`, variant: "destructive" })
          return
        }
        setUploadResult({ label: file.name, chunks: [], ...data })
        refreshStats()
      } catch (e) {
        toast({ title: String(e instanceof Error ? e.message : e), variant: "destructive" })
      } finally {
        setUploading(false)
        if (fileRef.current) fileRef.current.value = ""
      }
    },
    [org.id, category, toast, refreshStats],
  )

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      const file = e.dataTransfer.files?.[0]
      if (file) uploadFile(file)
    },
    [uploadFile],
  )

  // ── Text handler ─────────────────────────────────────────────────────────────

  async function handleSaveText() {
    if (!textTitle.trim() || !textBody.trim()) return
    setSavingText(true)
    setTextResult(null)
    try {
      const res = await fetch("/api/knowledge/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: textTitle.trim(),
          text: textBody.trim(),
          tenant_id: org.id,
          category,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast({ title: `Erro: ${data.error || "falha ao salvar"}`, variant: "destructive" })
        return
      }
      setTextResult({ label: textTitle.trim(), chunks: [], ...data })
      if (data.inserted > 0) {
        setTextTitle("")
        setTextBody("")
      }
      refreshStats()
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : e), variant: "destructive" })
    } finally {
      setSavingText(false)
    }
  }

  const embeddingPct = stats && stats.total > 0
    ? Math.round((stats.with_embeddings / stats.total) * 100)
    : 0

  return (
    <div className="border-t border-slate-100 px-4 pb-5 pt-4 space-y-5">

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-2xl font-bold text-slate-900">
            {statsLoading ? "—" : stats?.total ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center justify-center gap-1">
            <Database className="size-3" /> Total chunks
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-2xl font-bold text-emerald-600">
            {statsLoading ? "—" : `${embeddingPct}%`}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center justify-center gap-1">
            <Zap className="size-3" /> Com vetor
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
          <div className="text-2xl font-bold text-slate-900">
            {statsLoading ? "—" : stats?.by_category.length ?? 0}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 flex items-center justify-center gap-1">
            <BookOpen className="size-3" /> Categorias
          </div>
        </div>
      </div>

      {/* Categories */}
      {stats && stats.by_category.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {stats.by_category.slice(0, 8).map(({ category: cat, count }) => (
            <Badge key={cat} variant="outline" className="text-xs bg-white">
              {cat} <span className="ml-1 text-slate-400">{count}</span>
            </Badge>
          ))}
        </div>
      )}

      {/* Train section */}
      <div className="space-y-3">
        {/* Header + tabs + refresh */}
        <div className="flex items-center justify-between">
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 gap-0.5">
            <button
              onClick={() => setTab("upload")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "upload"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Upload className="size-3" />
              Upload arquivo
            </button>
            <button
              onClick={() => setTab("text")}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === "text"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <PenLine className="size-3" />
              Escrever texto
            </button>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Categoria"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-7 w-32 text-xs"
            />
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => refreshStats()}>
              <RefreshCw className="size-3.5 text-slate-400" />
            </Button>
          </div>
        </div>

        {/* ── Upload tab ── */}
        {tab === "upload" && (
          <div className="space-y-3">
            <div
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer
                ${dragging ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => !uploading && fileRef.current?.click()}
            >
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPTED}
                className="sr-only"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
              />
              {uploading ? (
                <>
                  <Loader2 className="size-6 text-emerald-500 animate-spin" />
                  <p className="text-sm text-slate-600">Processando e gerando embeddings...</p>
                </>
              ) : (
                <>
                  <Upload className="size-6 text-slate-400" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">Arraste ou clique para selecionar</p>
                    <p className="text-xs text-slate-400 mt-0.5">PDF, Markdown ou TXT</p>
                  </div>
                </>
              )}
            </div>
            {uploadResult && (
              <TrainingResult result={uploadResult} onNavigateToCerebro={onNavigateToCerebro} />
            )}
          </div>
        )}

        {/* ── Text tab ── */}
        {tab === "text" && (
          <div className="space-y-2.5">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Título / assunto</Label>
              <Input
                placeholder="Ex: Como configurar o certificado digital A1"
                value={textTitle}
                onChange={(e) => setTextTitle(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-600">Conteúdo do conhecimento</Label>
              <Textarea
                placeholder={`Descreva o problema, causa e solução com o máximo de detalhe possível.\n\nExemplo:\nO usuário não consegue emitir NF-e porque o certificado digital expirou.\n\nPara renovar: acesse Configurações > Certificado Digital > Importar novo certificado A1.\n\nApós importar, reinicie o módulo fiscal.`}
                rows={8}
                value={textBody}
                onChange={(e) => setTextBody(e.target.value)}
                className="text-sm resize-y"
              />
              <p className="text-[11px] text-slate-400">
                {textBody.length} caracteres · {Math.ceil(textBody.length / 3200)} chunk{Math.ceil(textBody.length / 3200) !== 1 ? "s" : ""} estimado{Math.ceil(textBody.length / 3200) !== 1 ? "s" : ""}
              </p>
            </div>
            <Button
              className="w-full"
              onClick={handleSaveText}
              disabled={savingText || !textTitle.trim() || !textBody.trim()}
            >
              {savingText
                ? <><Loader2 className="size-4 mr-2 animate-spin" />Salvando e gerando embeddings...</>
                : <><PenLine className="size-4 mr-2" />Salvar no Cérebro</>}
            </Button>
            {textResult && (
              <TrainingResult result={textResult} onNavigateToCerebro={onNavigateToCerebro} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function EmpresasPanel({ onNavigateToCerebro }: { onNavigateToCerebro?: () => void } = {}) {
  const { data: orgs, isLoading, mutate } = useSWR<Org[]>("/api/organizations", fetcher)
  const { toast } = useToast()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  function openCreate() {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setDialogOpen(true)
  }

  function openEdit(org: Org) {
    setForm({
      id: org.id,
      display_name: org.display_name,
      product_name: org.product_name,
      description: org.description ?? "",
      is_active: org.is_active,
    })
    setEditingId(org.id)
    setDialogOpen(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const url = editingId ? `/api/organizations/${editingId}` : "/api/organizations"
      const method = editingId ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: form.id,
          display_name: form.display_name,
          product_name: form.product_name,
          description: form.description || null,
          is_active: form.is_active,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao salvar")
      }
      toast({ title: editingId ? "Empresa atualizada" : "Empresa criada" })
      setDialogOpen(false)
      mutate()
    } catch (e) {
      toast({ title: String(e instanceof Error ? e.message : e), variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/organizations/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast({ title: "Empresa desativada" })
      mutate()
      if (expandedId === id) setExpandedId(null)
    } else {
      const err = await res.json()
      toast({ title: err.error || "Erro ao desativar", variant: "destructive" })
    }
  }

  async function toggleActive(org: Org) {
    await fetch(`/api/organizations/${org.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: !org.is_active }),
    })
    mutate()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {orgs?.length ?? 0} empresa{(orgs?.length ?? 0) !== 1 ? "s" : ""} cadastrada{(orgs?.length ?? 0) !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="size-3.5 mr-1.5" />
            Atualizar
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-3.5 mr-1.5" />
            Nova empresa
          </Button>
        </div>
      </div>

      <div className="grid gap-3">
        {isLoading && (
          <p className="text-sm text-slate-400 py-8 text-center">Carregando...</p>
        )}
        {!isLoading && (!orgs || orgs.length === 0) && (
          <p className="text-sm text-slate-400 py-8 text-center">Nenhuma empresa cadastrada.</p>
        )}

        {orgs?.map((org) => (
          <Card
            key={org.id}
            className={`overflow-hidden transition-colors ${expandedId === org.id ? "border-emerald-400 ring-1 ring-emerald-400/20" : "hover:border-slate-300"}`}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100">
                <Building2 className="size-5 text-slate-600" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-slate-900">{org.display_name}</span>
                  <Badge variant="outline" className="font-mono text-[10px] text-slate-500">
                    {org.id}
                  </Badge>
                  <Badge className={org.is_active
                    ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                    : "bg-slate-100 text-slate-500 border-slate-200"}>
                    {org.is_active ? "Ativa" : "Inativa"}
                  </Badge>
                </div>
                <p className="text-sm text-slate-500 truncate mt-0.5">{org.product_name}</p>
              </div>

              <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={org.is_active}
                  onCheckedChange={() => toggleActive(org)}
                  className="data-[state=checked]:bg-emerald-500"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-slate-500 hover:text-slate-900"
                  onClick={() => openEdit(org)}
                >
                  <Pencil className="size-3.5" />
                </Button>
                {org.id !== "auge" && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Desativar {org.display_name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          A empresa será desativada. O conhecimento importado é preservado.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-red-500 hover:bg-red-600"
                          onClick={() => handleDelete(org.id)}
                        >
                          Desativar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-slate-500 hover:text-emerald-600"
                  onClick={() => setExpandedId(expandedId === org.id ? null : org.id)}
                  title="Treinar / ver conhecimento"
                >
                  {expandedId === org.id
                    ? <ChevronUp className="size-4" />
                    : <ChevronDown className="size-4" />}
                </Button>
              </div>
            </CardContent>

            {expandedId === org.id && (
              <KnowledgePanel org={org} onNavigateToCerebro={onNavigateToCerebro} />
            )}
          </Card>
        ))}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            {!editingId && (
              <div className="space-y-1.5">
                <Label>ID (slug)</Label>
                <Input
                  placeholder="ex: minha-empresa"
                  value={form.id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, id: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") }))
                  }
                />
                <p className="text-xs text-slate-400">Somente letras minúsculas, números e hífens. Imutável após criação.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Nome da empresa</Label>
              <Input
                placeholder="ex: Rede Supermercados ABC"
                value={form.display_name}
                onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Nome do produto / sistema</Label>
              <Input
                placeholder="ex: Sistema ABC ERP"
                value={form.product_name}
                onChange={(e) => setForm((f) => ({ ...f, product_name: e.target.value }))}
              />
              <p className="text-xs text-slate-400">Usado nos prompts da IA. Ex: "AUGE ERP", "Sistema ABC".</p>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição (opcional)</Label>
              <Textarea
                placeholder="Descreva brevemente o sistema ou contexto de suporte..."
                rows={3}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                className="data-[state=checked]:bg-emerald-500"
              />
              <Label>Empresa ativa</Label>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button
                onClick={handleSave}
                disabled={saving || !form.display_name || !form.product_name || (!editingId && !form.id)}
              >
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

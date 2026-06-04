"use client"

import { useState, useCallback } from "react"
import useSWR, { mutate } from "swr"
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
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Database,
  Cpu,
  Activity,
  Zap,
  Plus,
  Pencil,
  Trash2,
  Link2,
  ShieldCheck,
  Clock,
  BarChart3,
  Server,
  Shield,
  MessageSquareDot,
  BrainCircuit,
  Eye,
  EyeOff,
  Save,
  FlaskConical,
} from "lucide-react"
import type { Categoria } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Types ────────────────────────────────────────────────────────────────────

interface HealthCheck {
  ok: boolean
  latency_ms?: number
  provider?: string
  model?: string
}

interface EmbeddingCoverageCheck {
  pct: number | null
  alerta: boolean
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy"
  checks: {
    supabase: HealthCheck
    ai_chat: HealthCheck
    embedding: HealthCheck
    pgvector_rpc: { ok: boolean; latency_ms?: number }
    embedding_coverage: EmbeddingCoverageCheck
  }
  integrations: {
    configured: number
    active: number
  }
}

interface IntegrationItem {
  id: string
  tenant_id: string
  source_system: string
  name: string
  is_active: boolean
  rate_limit_per_minute: number
  updated_at: string
  lastRun: {
    status: string
    started_at: string
    finished_at: string | null
    total_received: number
    total_processed: number
    total_failed: number
  } | null
  stats24h: {
    total_received: number
    total_processed: number
    total_failed: number
  }
}

interface IntegrationStatusResponse {
  data: IntegrationItem[]
  total: number
  timestamp: string
}

interface ConfigData {
  ai: { baseUrl: string; model: string; provider: string; hasApiKey: boolean }
  embedding: { baseUrl: string; model: string; hasApiKey: boolean }
  willtalk: {
    webhookUrl: string
    autoReplyEnabled: boolean
    replyWebhookUrl: string
    maxChars: number
    attempts: number
    timeoutMs: number
    events: string[]
  }
  integrations: {
    canonicalPath: string
    adapters: Array<{
      key: string
      name: string
      ingestPath: string
    }>
  }
  security: {
    authRequired: boolean
    hasIngestToken: boolean
    hasInternalToken: boolean
    rateLimitPerMin: number
  }
  supabase: { url: string; hasAnonKey: boolean; hasServiceKey: boolean }
  upstash: { configured: boolean }
  baseUrl: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatusIcon({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
  ) : (
    <XCircle className="h-4 w-4 text-red-500 shrink-0" />
  )
}

function HealthBadge({ status }: { status: HealthResponse["status"] }) {
  const map = {
    healthy: {
      label: "Saudável",
      cls: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    },
    degraded: {
      label: "Degradado",
      cls: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
    },
    unhealthy: {
      label: "Com falhas",
      cls: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
    },
  }
  const { label, cls } = map[status] ?? map.unhealthy
  return <Badge className={`${cls} text-xs`}>{label}</Badge>
}

function ConfigRow({
  label,
  value,
  ok,
}: {
  label: string
  value: string | number | boolean
  ok?: boolean
}) {
  return (
    <div className="flex items-center justify-between py-2 text-sm gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <div className="flex items-center gap-2">
        {ok !== undefined && <StatusIcon ok={ok} />}
        <span className="font-mono text-xs text-right break-all">{String(value)}</span>
      </div>
    </div>
  )
}

// ─── Saúde do Sistema ─────────────────────────────────────────────────────────

function SaudeSection() {
  const { data, isLoading, mutate } = useSWR<HealthResponse>("/api/health", fetcher, {
    refreshInterval: 30000,
  })

  const checks = data?.checks

  const items = [
    {
      key: "supabase",
      icon: <Database className="h-4 w-4" />,
      label: "Supabase",
      desc: "Banco de dados PostgreSQL",
      check: checks?.supabase,
    },
    {
      key: "ai_chat",
      icon: <Cpu className="h-4 w-4" />,
      label:
        checks?.ai_chat?.provider === "groq"
          ? "Groq (chat + visão)"
          : "Chat IA",
      desc: checks?.ai_chat?.provider
        ? checks.ai_chat.provider === "groq"
          ? `${checks.ai_chat.model} — conversação e leitura de imagens`
          : `${checks.ai_chat.provider} — ${checks.ai_chat.model}`
        : "Provedor de inferência (padrão: Groq)",
      check: checks?.ai_chat,
    },
    {
      key: "embedding",
      icon: <Zap className="h-4 w-4" />,
      label: "Embeddings",
      desc: checks?.embedding?.provider
        ? `${checks.embedding.provider} — ${checks.embedding.model}`
        : "Provedor de embeddings",
      check: checks?.embedding,
    },
    {
      key: "pgvector_rpc",
      icon: <Activity className="h-4 w-4" />,
      label: "pgvector RPC",
      desc: "Busca semântica vetorial",
      check: checks?.pgvector_rpc,
    },
  ]

  const coveragePct = (checks?.embedding_coverage?.pct ?? 0) * 100

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Server className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Status geral do sistema</p>
            <p className="text-xs text-muted-foreground">Atualiza automaticamente a cada 30s</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {data && <HealthBadge status={data.status} />}
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <Separator />

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {items.map(({ key, icon, label, desc, check }) => (
            <div key={key} className="flex items-start gap-3 rounded-lg border p-4">
              <div className="mt-0.5 text-muted-foreground">{icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">{label}</p>
                  {check && <StatusIcon ok={check.ok} />}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground truncate">{desc}</p>
                {check?.latency_ms !== undefined && (
                  <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {check.latency_ms}ms
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {checks?.embedding_coverage && (
        <div className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Cobertura de Embeddings</p>
            </div>
            {checks.embedding_coverage.alerta ? (
              <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs gap-1">
                <AlertTriangle className="h-3 w-3" />
                Baixa cobertura
              </Badge>
            ) : (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                OK
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  coveragePct >= 70 ? "bg-green-500" : "bg-amber-500"
                }`}
                style={{ width: `${coveragePct.toFixed(0)}%` }}
              />
            </div>
            <span className="text-sm font-medium tabular-nums w-10 text-right">
              {coveragePct.toFixed(0)}%
            </span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Percentual de atendimentos processados com embedding vetorial (mínimo recomendado: 70%)
          </p>
        </div>
      )}

      {data?.integrations && (
        <div className="flex gap-4">
          <div className="flex-1 rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold">{data.integrations.configured}</p>
            <p className="text-xs text-muted-foreground mt-1">Integrações configuradas</p>
          </div>
          <div className="flex-1 rounded-lg border p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{data.integrations.active}</p>
            <p className="text-xs text-muted-foreground mt-1">Integrações ativas</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Categorias ───────────────────────────────────────────────────────────────

function CategoriasSection() {
  const { data, isLoading, mutate } = useSWR<{ data: Categoria[] }>("/api/categorias", fetcher)

  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Categoria | null>(null)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [newForm, setNewForm] = useState({ nome: "", descricao: "" })
  const [editForm, setEditForm] = useState({ nome: "", descricao: "" })
  const [error, setError] = useState<string | null>(null)

  const openEdit = (cat: Categoria) => {
    setEditing(cat)
    setEditForm({ nome: cat.nome, descricao: cat.descricao ?? "" })
    setError(null)
  }

  const handleCreate = async () => {
    if (!newForm.nome.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || "Erro ao criar categoria")
      }
      setCreating(false)
      setNewForm({ nome: "", descricao: "" })
      mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async () => {
    if (!editing || !editForm.nome.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/categorias/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error || "Erro ao editar categoria")
      }
      setEditing(null)
      mutate()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/categorias/${id}`, { method: "DELETE" })
      mutate()
    } finally {
      setDeletingId(null)
    }
  }

  const categorias = data?.data ?? []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium">Categorias de Atendimento</p>
          <p className="text-xs text-muted-foreground">
            {categorias.length} categoria{categorias.length !== 1 ? "s" : ""} cadastrada{categorias.length !== 1 ? "s" : ""}
          </p>
        </div>

        <Dialog
          open={creating}
          onOpenChange={(o) => {
            setCreating(o)
            setError(null)
            setNewForm({ nome: "", descricao: "" })
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Categoria</DialogTitle>
              <DialogDescription>
                Adicione uma categoria para classificar os atendimentos
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Nome *</label>
                <Input
                  placeholder="Ex: Hardware, Software, Rede..."
                  value={newForm.nome}
                  onChange={(e) => setNewForm({ ...newForm, nome: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  placeholder="Descreva quando usar esta categoria..."
                  value={newForm.descricao}
                  onChange={(e) => setNewForm({ ...newForm, descricao: e.target.value })}
                  rows={3}
                />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={saving || !newForm.nome.trim()}>
                {saving && <Spinner className="mr-2" />}
                Criar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : categorias.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
          <p className="text-sm">Nenhuma categoria cadastrada</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead className="text-right w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categorias.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.nome}</TableCell>
                  <TableCell className="text-muted-foreground text-sm max-w-xs truncate">
                    {cat.descricao || <span className="italic opacity-50">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(cat.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Dialog
                        open={editing?.id === cat.id}
                        onOpenChange={(o) => {
                          if (!o) setEditing(null)
                          else openEdit(cat)
                        }}
                      >
                        <DialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(cat)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Editar Categoria</DialogTitle>
                            <DialogDescription>Altere os dados da categoria</DialogDescription>
                          </DialogHeader>
                          <div className="flex flex-col gap-4 py-2">
                            <div className="flex flex-col gap-1.5">
                              <label className="text-sm font-medium">Nome *</label>
                              <Input
                                value={editForm.nome}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, nome: e.target.value })
                                }
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <label className="text-sm font-medium">Descrição</label>
                              <Textarea
                                value={editForm.descricao}
                                onChange={(e) =>
                                  setEditForm({ ...editForm, descricao: e.target.value })
                                }
                                rows={3}
                              />
                            </div>
                            {error && editing?.id === cat.id && (
                              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            )}
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setEditing(null)}>
                              Cancelar
                            </Button>
                            <Button
                              onClick={handleEdit}
                              disabled={saving || !editForm.nome.trim()}
                            >
                              {saving && <Spinner className="mr-2" />}
                              Salvar
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                          >
                            {deletingId === cat.id ? (
                              <Spinner className="h-3.5 w-3.5" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir categoria</AlertDialogTitle>
                            <AlertDialogDescription>
                              Tem certeza que deseja excluir{" "}
                              <strong>{cat.nome}</strong>? Atendimentos vinculados
                              perderão a categorização.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(cat.id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

// ─── Integrações ──────────────────────────────────────────────────────────────

function IntegracoesSection() {
  const { data, isLoading, mutate } = useSWR<IntegrationStatusResponse>(
    "/api/integrations/status",
    fetcher,
    { refreshInterval: 60000 }
  )

  const integrations = data?.data ?? []

  const formatDate = (s?: string | null) =>
    s ? new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—"

  const runStatusCls = (s: string) => {
    if (s === "sucesso" || s === "success")
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    if (s?.startsWith("erro") || s === "error" || s === "failed")
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
    return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Status das Integrações</p>
            <p className="text-xs text-muted-foreground">
              {data?.total ?? 0} integraç{(data?.total ?? 0) !== 1 ? "ões" : "ão"} registrada{(data?.total ?? 0) !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <Separator />

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="h-6 w-6" />
        </div>
      ) : integrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
          <Link2 className="h-8 w-8 opacity-30" />
          <p className="text-sm">Nenhuma integração registrada</p>
          <p className="text-xs text-center">
            As integrações aparecem aqui após a primeira ingestão via{" "}
            <code className="rounded bg-muted px-1 font-mono">/api/ingestao/v1/events</code>
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {integrations.map((it) => (
            <div key={it.id} className="rounded-lg border p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{it.name || it.source_system}</span>
                    <Badge
                      className={
                        it.is_active
                          ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs"
                          : "bg-muted text-muted-foreground text-xs"
                      }
                    >
                      {it.is_active ? "ativo" : "inativo"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Tenant: <strong>{it.tenant_id}</strong> · Sistema:{" "}
                    <strong>{it.source_system}</strong>
                  </p>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(it.updated_at)}
                </span>
              </div>

              <Separator />

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded bg-muted px-2 py-2">
                  <p className="text-muted-foreground mb-0.5">Recebidos 24h</p>
                  <p className="font-semibold text-base">{it.stats24h.total_received}</p>
                </div>
                <div className="rounded bg-muted px-2 py-2">
                  <p className="text-muted-foreground mb-0.5">Processados</p>
                  <p className="font-semibold text-base text-green-600 dark:text-green-400">
                    {it.stats24h.total_processed}
                  </p>
                </div>
                <div className="rounded bg-muted px-2 py-2">
                  <p className="text-muted-foreground mb-0.5">Falhas</p>
                  <p
                    className={`font-semibold text-base ${
                      it.stats24h.total_failed > 0
                        ? "text-red-600 dark:text-red-400"
                        : ""
                    }`}
                  >
                    {it.stats24h.total_failed}
                  </p>
                </div>
              </div>

              {it.lastRun && (
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Última execução:</span>
                  <div className="flex items-center gap-2">
                    <Badge className={`text-xs ${runStatusCls(it.lastRun.status)}`}>
                      {it.lastRun.status}
                    </Badge>
                    <span>{formatDate(it.lastRun.started_at)}</span>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Rate limit:{" "}
                <strong className="text-foreground">{it.rate_limit_per_minute}</strong> req/min
              </p>
            </div>
          ))}
        </div>
      )}

      {data?.timestamp && (
        <p className="text-xs text-muted-foreground text-right">
          Atualizado: {formatDate(data.timestamp)}
        </p>
      )}
    </div>
  )
}

// ─── Banco de Dados / Setup ───────────────────────────────────────────────────

interface SetupGetResponse {
  categorias: { exists: boolean; error?: string }
  atendimentos: { exists: boolean; error?: string }
}

interface SetupPostResponse {
  status: string
  message: string
  sql?: string
}

function SetupSection() {
  const [checking, setChecking] = useState(false)
  const [checkResult, setCheckResult] = useState<SetupGetResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [runResult, setRunResult] = useState<SetupPostResponse | null>(null)

  const checkStatus = async () => {
    setChecking(true)
    setCheckResult(null)
    try {
      const res = await fetch("/api/setup")
      const data: SetupGetResponse = await res.json()
      setCheckResult(data)
    } finally {
      setChecking(false)
    }
  }

  const runSetup = async () => {
    setRunning(true)
    setRunResult(null)
    try {
      const res = await fetch("/api/setup", { method: "POST" })
      const data: SetupPostResponse = await res.json()
      setRunResult(data)
      await checkStatus()
    } catch {
      setRunResult({ status: "erro", message: "Falha de rede ao executar setup" })
    } finally {
      setRunning(false)
    }
  }

  const tables = checkResult
    ? [
        { name: "categorias", exists: checkResult.categorias.exists },
        { name: "atendimentos", exists: checkResult.atendimentos.exists },
      ]
    : []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2">
        <Database className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="font-medium">Inicialização do Banco de Dados</p>
          <p className="text-xs text-muted-foreground">
            Cria as tabelas e extensões necessárias no Supabase
          </p>
        </div>
      </div>

      <Separator />

      {/* Verificar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Verificar tabelas</p>
          <Button variant="outline" size="sm" onClick={checkStatus} disabled={checking}>
            {checking ? (
              <Spinner className="h-3.5 w-3.5 mr-1" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1" />
            )}
            Verificar
          </Button>
        </div>

        {tables.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tabela</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tables.map((t) => (
                  <TableRow key={t.name}>
                    <TableCell className="font-mono text-sm">{t.name}</TableCell>
                    <TableCell className="text-right">
                      {t.exists ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Existe
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs gap-1">
                          <XCircle className="h-3 w-3" />
                          Ausente
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      {/* Executar setup */}
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-medium">Executar Setup</p>
          <p className="text-xs text-muted-foreground mt-1">
            Cria todas as tabelas, índices e funções RPC. Seguro para rodar múltiplas vezes.
          </p>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950 p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Execute apenas uma vez na configuração inicial ou ao adicionar novas tabelas.
            Não apaga dados existentes.
          </p>
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={running} className="w-full sm:w-auto">
              {running ? (
                <Spinner className="mr-2" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-2" />
              )}
              {running ? "Executando setup..." : "Inicializar banco de dados"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Setup</AlertDialogTitle>
              <AlertDialogDescription>
                Isso criará as tabelas e estruturas necessárias no Supabase. Dados
                existentes não serão afetados. Deseja continuar?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={runSetup}>Executar Setup</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {runResult && (
          <div
            className={`rounded-lg p-3 text-sm flex flex-col gap-2 ${
              runResult.status === "ok"
                ? "bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200"
                : "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
            }`}
          >
            <div className="flex items-center gap-2">
              {runResult.status === "ok" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0" />
              )}
              <span className="font-medium">{runResult.message}</span>
            </div>
            {runResult.sql && (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs opacity-70 hover:opacity-100">
                  Ver SQL para executar no Supabase Dashboard
                </summary>
                <pre className="mt-2 overflow-auto rounded bg-black/10 p-3 text-xs font-mono whitespace-pre-wrap">
                  {runResult.sql}
                </pre>
              </details>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Configuração do Sistema ──────────────────────────────────────────────────

function ConfiguracaoSection() {
  const { data, isLoading } = useSWR<ConfigData>("/api/config", fetcher)

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (!data) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        Não foi possível carregar a configuração.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Variáveis de ambiente ativas. Chaves secretas não são exibidas.
      </p>

      {/* Groq / chat IA */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Cpu className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">
            {data.ai.provider === "groq"
              ? "Groq — inferência (texto e imagens)"
              : data.ai.provider === "xai"
                ? "xAI — inferência (chat)"
                : "Provedor de inferência — chat"}
          </span>
          <div className="ml-auto">
            {data.ai.hasApiKey ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                Conectado
              </Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">
                Sem chave
              </Badge>
            )}
          </div>
        </div>
        <div className="px-4 divide-y">
          <ConfigRow label="Provider" value={data.ai.provider} />
          <ConfigRow label="Base URL" value={data.ai.baseUrl} />
          <ConfigRow label="Modelo" value={data.ai.model} />
        </div>
        {data.ai.provider === "groq" && (
          <p className="px-4 py-2 text-xs text-muted-foreground border-t bg-muted/10">
            O mesmo modelo costuma atender{" "}
            <span className="font-medium text-foreground/80">chat</span> e{" "}
            <span className="font-medium text-foreground/80">visão</span> nas rotas que enviam imagem (orquestrador / evidências).
          </p>
        )}
      </div>

      {/* Embedding */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Embedding (Vetorial)</span>
          <div className="ml-auto">
            {data.embedding.hasApiKey ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                Conectado
              </Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">
                Sem chave
              </Badge>
            )}
          </div>
        </div>
        <div className="px-4 divide-y">
          <ConfigRow label="Base URL" value={data.embedding.baseUrl} />
          <ConfigRow label="Modelo" value={data.embedding.model} />
        </div>
      </div>

      {/* Supabase */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Database className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Supabase</span>
          <div className="ml-auto">
            {data.supabase.hasAnonKey && data.supabase.hasServiceKey ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                OK
              </Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 text-xs">
                Incompleto
              </Badge>
            )}
          </div>
        </div>
        <div className="px-4 divide-y">
          <ConfigRow label="URL" value={data.supabase.url || "não configurada"} />
          <ConfigRow label="Anon Key" value={data.supabase.hasAnonKey ? "✓ configurada" : "✗ ausente"} ok={data.supabase.hasAnonKey} />
          <ConfigRow label="Service Key" value={data.supabase.hasServiceKey ? "✓ configurada" : "✗ ausente"} ok={data.supabase.hasServiceKey} />
        </div>
      </div>

      {/* Segurança */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Shield className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Segurança & Rate Limiting</span>
        </div>
        <div className="px-4 divide-y">
          <ConfigRow label="Auth obrigatória" value={data.security.authRequired ? "Sim" : "Não"} />
          <ConfigRow label="Ingest Token" value={data.security.hasIngestToken ? "✓ configurado" : "✗ ausente"} ok={data.security.hasIngestToken} />
          <ConfigRow label="Internal Token" value={data.security.hasInternalToken ? "✓ configurado" : "✗ ausente"} />
          <ConfigRow label="Rate limit" value={`${data.security.rateLimitPerMin} req/min`} />
        </div>
      </div>

      {/* WillTalk */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <MessageSquareDot className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">WillTalk</span>
          <div className="ml-auto flex items-center gap-1.5">
            {data.willtalk.autoReplyEnabled ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                Auto-reply ON
              </Badge>
            ) : (
              <Badge className="bg-muted text-muted-foreground text-xs">
                Auto-reply OFF
              </Badge>
            )}
          </div>
        </div>
        <div className="px-4 divide-y">
          <ConfigRow
            label="Webhook entrada"
            value={data.willtalk.webhookUrl || "não configurado"}
            ok={!!data.willtalk.webhookUrl}
          />
          <ConfigRow
            label="Webhook reply"
            value={data.willtalk.replyWebhookUrl || "não configurado"}
          />
          <ConfigRow label="Max. caracteres" value={data.willtalk.maxChars} />
          <ConfigRow label="Tentativas" value={data.willtalk.attempts} />
          <ConfigRow label="Timeout" value={`${data.willtalk.timeoutMs}ms`} />
          {data.willtalk.events.length > 0 && (
            <div className="py-2 flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">Eventos</span>
              <div className="flex flex-wrap gap-1">
                {data.willtalk.events.map((ev) => (
                  <Badge key={ev} variant="outline" className="text-xs font-mono">
                    {ev}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Adaptadores de integração */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Adaptadores de Ingestão</span>
          <div className="ml-auto">
            <Badge variant="outline" className="text-xs font-mono">
              {data.integrations.adapters.length} rotas
            </Badge>
          </div>
        </div>
        <div className="px-4 divide-y">
          <ConfigRow
            label="Endpoint canônico"
            value={data.integrations.canonicalPath}
            ok={!!data.integrations.canonicalPath}
          />
          <div className="py-3 flex flex-col gap-2">
            <span className="text-sm text-muted-foreground">Rotas dedicadas</span>
            <div className="flex flex-col gap-2">
              {data.integrations.adapters.map((adapter) => (
                <div
                  key={adapter.key}
                  className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{adapter.name}</p>
                    <p className="text-xs font-mono text-muted-foreground break-all">
                      {adapter.ingestPath}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs font-mono shrink-0">
                    {adapter.key}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Upstash */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Upstash Redis</span>
          <div className="ml-auto">
            {data.upstash.configured ? (
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs">
                Habilitado
              </Badge>
            ) : (
              <Badge className="bg-muted text-muted-foreground text-xs">
                Não configurado
              </Badge>
            )}
          </div>
        </div>
        <div className="px-4">
          <ConfigRow
            label="Rate limit distribuído"
            value={
              data.upstash.configured
                ? "Ativo (Redis)"
                : "Inativo (memória local)"
            }
          />
        </div>
      </div>
    </div>
  )
}

// ─── Modelos IA ───────────────────────────────────────────────────────────────

interface ModelConfigData {
  effective: {
    ai_base_url: string
    ai_chat_model: string
    ai_curator_model: string
    ai_api_key_set: boolean
    ai_api_key_masked: string
    ai_api_key_source: "db" | "env" | "none"
    embedding_base_url: string
    embedding_model: string
    embedding_dimensions: string
    embedding_api_key_set: boolean
    embedding_api_key_masked: string
    embedding_api_key_source: "db" | "env" | "none"
  }
  raw_keys: string[]
}

const AI_PRESETS = [
  {
    label: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    chat_model: "meta-llama/llama-4-scout-17b-16e-instruct",
    curator_model: "meta-llama/llama-4-maverick-17b-128e-instruct",
  },
  {
    label: "Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    chat_model: "gemini-2.0-flash",
    curator_model: "gemini-2.0-flash",
  },
  {
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    chat_model: "meta-llama/llama-3.3-70b-instruct:free",
    curator_model: "deepseek/deepseek-r1:free",
  },
  {
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    chat_model: "gpt-4o-mini",
    curator_model: "gpt-4o",
  },
  {
    label: "xAI",
    base_url: "https://api.x.ai/v1",
    chat_model: "grok-3-mini",
    curator_model: "grok-3",
  },
]

const EMBED_PRESETS = [
  {
    label: "Jina AI",
    base_url: "https://api.jina.ai/v1",
    model: "jina-embeddings-v5-text-small",
    dims: "1024",
  },
  {
    label: "Gemini",
    base_url: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "text-embedding-004",
    dims: "768",
  },
  {
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    dims: "1536",
  },
]

function KeySourceBadge({ source }: { source: "db" | "env" | "none" }) {
  if (source === "db")
    return <Badge className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">DB</Badge>
  if (source === "env")
    return <Badge className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">ENV</Badge>
  return <Badge variant="destructive" className="text-xs">Ausente</Badge>
}

function ModelosIASection() {
  const { data, isLoading, error } = useSWR<ModelConfigData>(
    "/api/config/models-ui",
    fetcher,
    { revalidateOnFocus: false },
  )

  const [form, setForm] = useState({
    ai_base_url: "",
    ai_chat_model: "",
    ai_curator_model: "",
    ai_api_key: "",
    embedding_base_url: "",
    embedding_model: "",
    embedding_api_key: "",
    embedding_dimensions: "",
  })

  const [showAiKey, setShowAiKey]     = useState(false)
  const [showEmbedKey, setShowEmbedKey] = useState(false)
  const [saving, setSaving]           = useState(false)
  const [testing, setTesting]         = useState(false)
  const [testResult, setTestResult]   = useState<{ ok: boolean; msg: string } | null>(null)
  const [saveMsg, setSaveMsg]         = useState<string | null>(null)

  const eff = data?.effective

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }))

  const applyAiPreset = (preset: (typeof AI_PRESETS)[number]) => {
    setForm((f) => ({
      ...f,
      ai_base_url: preset.base_url,
      ai_chat_model: preset.chat_model,
      ai_curator_model: preset.curator_model,
    }))
  }

  const applyEmbedPreset = (preset: (typeof EMBED_PRESETS)[number]) => {
    setForm((f) => ({
      ...f,
      embedding_base_url: preset.base_url,
      embedding_model: preset.model,
      embedding_dimensions: preset.dims,
    }))
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMsg(null)
    try {
      const resp = await fetch("/api/config/models-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const json = await resp.json()
      if (resp.ok) {
        setSaveMsg("Configuração salva. Ativa em até 30s.")
        mutate("/api/config/models-ui")
        setForm((f) => ({ ...f, ai_api_key: "", embedding_api_key: "" }))
      } else {
        setSaveMsg(`Erro: ${json.error ?? "desconhecido"}`)
      }
    } catch {
      setSaveMsg("Erro de rede ao salvar.")
    } finally {
      setSaving(false)
    }
  }, [form])

  const handleTest = useCallback(async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch("/api/health")
      const json = await resp.json()
      const chatOk  = json?.checks?.ai_chat?.ok
      const embedOk = json?.checks?.embedding?.ok
      if (chatOk && embedOk) {
        setTestResult({ ok: true, msg: `Chat ✓ ${json.checks.ai_chat.latency_ms}ms · Embedding ✓ ${json.checks.embedding.latency_ms}ms` })
      } else {
        const problems = [
          !chatOk  ? `Chat: ${json.checks.ai_chat?.error ?? "falha"}` : null,
          !embedOk ? `Embedding: ${json.checks.embedding?.error ?? "falha"}` : null,
        ].filter(Boolean).join(" | ")
        setTestResult({ ok: false, msg: problems || "Falha desconhecida" })
      }
    } catch {
      setTestResult({ ok: false, msg: "Sem resposta do servidor" })
    } finally {
      setTesting(false)
    }
  }, [])

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    )
  }

  if (error || !eff) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
        Erro ao carregar configuração. Verifique se CEREBRO_INTERNAL_TOKEN está configurado no servidor.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs text-muted-foreground">
        Valores salvos aqui têm precedência sobre env vars e entram em vigor sem restart
        (cache de 30s). Deixe campos em branco para manter o valor atual.
      </p>

      {/* ── LLM (Chat + Curadoria) ─────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <BrainCircuit className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Modelo LLM (Chat + Curadoria)</span>
          <div className="ml-auto flex gap-1">
            {AI_PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applyAiPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 gap-3">
          {/* Ativo agora */}
          <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground pb-2 border-b">
            <div>
              <span className="block font-medium text-foreground/70 mb-0.5">Base URL ativa</span>
              <span className="font-mono">{eff.ai_base_url}</span>
            </div>
            <div>
              <span className="block font-medium text-foreground/70 mb-0.5">Modelo chat</span>
              <span className="font-mono">{eff.ai_chat_model}</span>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <span className="block font-medium text-foreground/70 mb-0.5">API Key</span>
                <span className="font-mono">{eff.ai_api_key_masked || "não configurada"}</span>
              </div>
              <KeySourceBadge source={eff.ai_api_key_source} />
            </div>
          </div>

          {/* Campos de edição */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Base URL</label>
              <Input
                placeholder={eff.ai_base_url}
                value={form.ai_base_url}
                onChange={set("ai_base_url")}
                className="text-xs font-mono h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Modelo Chat</label>
              <Input
                placeholder={eff.ai_chat_model}
                value={form.ai_chat_model}
                onChange={set("ai_chat_model")}
                className="text-xs font-mono h-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Modelo Curadoria (Curator)</label>
              <Input
                placeholder={eff.ai_curator_model}
                value={form.ai_curator_model}
                onChange={set("ai_curator_model")}
                className="text-xs font-mono h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">API Key</label>
              <div className="relative">
                <Input
                  type={showAiKey ? "text" : "password"}
                  placeholder={eff.ai_api_key_set ? eff.ai_api_key_masked : "sk-... ou gsk_..."}
                  value={form.ai_api_key}
                  onChange={set("ai_api_key")}
                  className="text-xs font-mono h-8 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowAiKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showAiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Embedding ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border">
        <div className="flex items-center gap-2 px-4 py-3 border-b bg-muted/30">
          <Zap className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-semibold">Modelo Embedding (Vetorial)</span>
          <div className="ml-auto flex gap-1">
            {EMBED_PRESETS.map((p) => (
              <Button
                key={p.label}
                variant="outline"
                size="sm"
                className="h-6 text-xs px-2"
                onClick={() => applyEmbedPreset(p)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 gap-3">
          {/* Ativo agora */}
          <div className="grid grid-cols-3 gap-3 text-xs text-muted-foreground pb-2 border-b">
            <div>
              <span className="block font-medium text-foreground/70 mb-0.5">Base URL ativa</span>
              <span className="font-mono">{eff.embedding_base_url}</span>
            </div>
            <div>
              <span className="block font-medium text-foreground/70 mb-0.5">Modelo</span>
              <span className="font-mono">{eff.embedding_model}</span>
            </div>
            <div className="flex items-start gap-2">
              <div>
                <span className="block font-medium text-foreground/70 mb-0.5">API Key</span>
                <span className="font-mono">{eff.embedding_api_key_masked || "não configurada"}</span>
              </div>
              <KeySourceBadge source={eff.embedding_api_key_source} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Base URL</label>
              <Input
                placeholder={eff.embedding_base_url}
                value={form.embedding_base_url}
                onChange={set("embedding_base_url")}
                className="text-xs font-mono h-8"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Modelo</label>
              <Input
                placeholder={eff.embedding_model}
                value={form.embedding_model}
                onChange={set("embedding_model")}
                className="text-xs font-mono h-8"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">Dimensões</label>
              <Input
                placeholder={eff.embedding_dimensions}
                value={form.embedding_dimensions}
                onChange={set("embedding_dimensions")}
                className="text-xs font-mono h-8"
                type="number"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium">API Key</label>
              <div className="relative">
                <Input
                  type={showEmbedKey ? "text" : "password"}
                  placeholder={eff.embedding_api_key_set ? eff.embedding_api_key_masked : "jina_... ou sk-..."}
                  value={form.embedding_api_key}
                  onChange={set("embedding_api_key")}
                  className="text-xs font-mono h-8 pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowEmbedKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showEmbedKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Ações ─────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Salvar configuração"}
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
          <FlaskConical className="h-4 w-4" />
          {testing ? "Testando..." : "Testar conexão"}
        </Button>
        {saveMsg && (
          <span className={`text-sm ${saveMsg.startsWith("Erro") ? "text-red-500" : "text-green-600"}`}>
            {saveMsg}
          </span>
        )}
        {testResult && (
          <span className={`text-sm flex items-center gap-1.5 ${testResult.ok ? "text-green-600" : "text-red-500"}`}>
            {testResult.ok
              ? <CheckCircle2 className="h-4 w-4" />
              : <XCircle className="h-4 w-4" />}
            {testResult.msg}
          </span>
        )}
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function SettingsPanel() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold">Configurações</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Gerencie o sistema, categorias, integrações e banco de dados
        </p>
      </div>

      <Tabs defaultValue="saude">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1">
          <TabsTrigger value="saude" className="gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Saúde do Sistema</span>
            <span className="sm:hidden">Saúde</span>
          </TabsTrigger>
          <TabsTrigger value="categorias" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Categorias
          </TabsTrigger>
          <TabsTrigger value="integracoes" className="gap-2">
            <Link2 className="h-4 w-4" />
            <span className="hidden sm:inline">Integrações</span>
            <span className="sm:hidden">Integr.</span>
          </TabsTrigger>
          <TabsTrigger value="banco" className="gap-2">
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Banco de Dados</span>
            <span className="sm:hidden">Banco</span>
          </TabsTrigger>
          <TabsTrigger value="config" className="gap-2">
            <Shield className="h-4 w-4" />
            Config
          </TabsTrigger>
          <TabsTrigger value="modelos" className="gap-2">
            <BrainCircuit className="h-4 w-4" />
            <span className="hidden sm:inline">Modelos IA</span>
            <span className="sm:hidden">IA</span>
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="saude">
            <Card>
              <CardHeader>
                <CardTitle>Saúde do Sistema</CardTitle>
                <CardDescription>
                  Monitoramento em tempo real de todos os serviços
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SaudeSection />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="categorias">
            <Card>
              <CardHeader>
                <CardTitle>Gerenciar Categorias</CardTitle>
                <CardDescription>
                  Categorias usadas para classificar atendimentos (processamento via Groq quando configurado)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CategoriasSection />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="integracoes">
            <Card>
              <CardHeader>
                <CardTitle>Integrações</CardTitle>
                <CardDescription>
                  Status das integrações externas (WillTalk, n8n, etc.)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <IntegracoesSection />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="banco">
            <Card>
              <CardHeader>
                <CardTitle>Banco de Dados</CardTitle>
                <CardDescription>
                  Inicialização e verificação das estruturas do Supabase
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SetupSection />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Configuração do Sistema</CardTitle>
                <CardDescription>
                  Visão geral das variáveis de ambiente e provedores ativos
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ConfiguracaoSection />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="modelos">
            <Card>
              <CardHeader>
                <CardTitle>Modelos de IA</CardTitle>
                <CardDescription>
                  Configure LLM e embedding. DB tem precedência sobre env vars — sem restart.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ModelosIASection />
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}

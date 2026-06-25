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
import { Textarea } from "@/components/ui/textarea"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  LayoutDashboard,
  GitBranch,
  ClipboardCheck,
  BookCheck,
  FlaskConical,
  History,
  Settings2,
  LogOut,
  Sparkles,
  Send,
  CheckCircle2,
  Archive,
  Pencil,
  Save,
  X,
  Trash2,
  BrainCircuit,
  AlertTriangle,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Status = "rascunho" | "em_teste" | "publicado" | "arquivado"

interface KnowledgeItem {
  id: string
  pergunta: string
  intencao: string | null
  categoria: string | null
  tags: string[]
  resposta_oficial: string
  confianca: number
  versao: number
  status: Status
  criador: string | null
  revisor: string | null
  updated_at: string
}

interface StatsResponse {
  por_status: Record<string, number>
  total: number
  ultimos: Array<{ id: string; pergunta: string; status: string; updated_at: string }>
}

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  em_teste: "Em teste",
  publicado: "Publicado",
  arquivado: "Arquivado",
}

const STATUS_CLS: Record<string, string> = {
  rascunho: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  em_teste: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  publicado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  arquivado: "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
}

function fmtDate(s?: string | null) {
  if (!s) return "—"
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────

function DashboardArea() {
  const { data, isLoading } = useSWR<StatsResponse>("/api/manager/curation/stats", fetcher, {
    refreshInterval: 30000,
  })

  const cards = [
    { key: "rascunho", label: "Aguardando validação", hint: "rascunhos capturados" },
    { key: "em_teste", label: "Em teste", hint: "no sandbox" },
    { key: "publicado", label: "Publicados", hint: "ativos em produção" },
    { key: "arquivado", label: "Arquivados", hint: "fora de uso" },
  ]

  return (
    <div className="flex flex-col gap-5">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner className="h-6 w-6" /></div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {cards.map((c) => (
              <div key={c.key} className="rounded-xl border bg-card p-4">
                <p className="text-3xl font-bold tabular-nums">{data?.por_status?.[c.key] ?? 0}</p>
                <p className="mt-1 text-sm font-medium">{c.label}</p>
                <p className="text-xs text-muted-foreground">{c.hint}</p>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Últimos conhecimentos mexidos</CardTitle>
              <CardDescription>Total na base de curadoria: {data?.total ?? 0}</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.ultimos?.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Ainda não há conhecimento curado. Comece em <strong>Capturar</strong>.
                </p>
              ) : (
                <div className="flex flex-col divide-y">
                  {data!.ultimos.map((u) => (
                    <div key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 truncate text-sm">{u.pergunta}</span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge className={`text-[11px] ${STATUS_CLS[u.status] ?? ""}`}>
                          {STATUS_LABEL[u.status] ?? u.status}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{fmtDate(u.updated_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}

// ─── Capturar (a dobradinha) ────────────────────────────────────────────────────

function CapturarArea() {
  const [pergunta, setPergunta] = useState("")
  const [solucao, setSolucao] = useState("")
  const [transcricao, setTranscricao] = useState("")
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const capturar = async () => {
    if (pergunta.trim().length < 3 || solucao.trim().length < 3) return
    setSaving(true)
    setMsg(null)
    try {
      const res = await fetch("/api/manager/curation/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modo: "dobradinha",
          perguntaCliente: pergunta.trim(),
          solucaoTecnico: solucao.trim(),
          transcricao: transcricao.trim() || undefined,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.detail || j.error || `status ${res.status}`)
      setMsg({ ok: true, text: "Rascunho criado. Revise em \"Revisão\" antes de publicar." })
      setPergunta("")
      setSolucao("")
      setTranscricao("")
    } catch (e) {
      setMsg({ ok: false, text: `Não foi possível capturar: ${e instanceof Error ? e.message : "erro"}` })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitBranch className="h-5 w-5 text-emerald-600" />
          Capturar conhecimento (a dobradinha)
        </CardTitle>
        <CardDescription>
          Cruze a <strong>pergunta do cliente</strong> (início) com a <strong>solução do técnico</strong> (fim).
          A IA enriquece intenção, categoria e palavras-chave, e salva como <strong>Rascunho</strong> para sua validação.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">Pergunta do cliente</label>
          <Textarea
            placeholder="Ex.: Não consigo emitir a segunda via do boleto"
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            className="min-h-20"
          />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">Solução do técnico (resposta correta)</label>
          <Textarea
            placeholder="Ex.: Acesse Financeiro → Boletos → selecione o título → Reimprimir segunda via..."
            value={solucao}
            onChange={(e) => setSolucao(e.target.value)}
            className="min-h-28"
          />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            + Adicionar transcrição da conversa (opcional, dá mais contexto à IA)
          </summary>
          <Textarea
            placeholder="Cole aqui a conversa completa..."
            value={transcricao}
            onChange={(e) => setTranscricao(e.target.value)}
            className="mt-2 min-h-24"
          />
        </details>

        {msg && (
          <div
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              msg.ok
                ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200"
                : "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-950 dark:text-red-200"
            }`}
          >
            {msg.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {msg.text}
          </div>
        )}

        <div>
          <Button onClick={capturar} disabled={saving || pergunta.trim().length < 3 || solucao.trim().length < 3} className="gap-2">
            {saving ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
            Gerar rascunho
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Revisão / Base (lista por status com ações) ────────────────────────────────

function ListaArea({ statuses, titulo, descricao }: { statuses: Status[]; titulo: string; descricao: string }) {
  const [busca, setBusca] = useState("")
  const [buscaInput, setBuscaInput] = useState("")
  const statusParam = statuses.length === 1 ? statuses[0] : "todos"
  const key = `/api/manager/curation/items?status=${statusParam}&busca=${encodeURIComponent(busca)}&limit=50`
  const { data, isLoading, mutate } = useSWR<{ data: KnowledgeItem[]; total: number }>(key, fetcher, {
    revalidateOnFocus: false,
  })

  // Mostra só os status pedidos (quando statuses tem mais de 1, filtra no cliente)
  const items = (data?.data ?? []).filter((i) => statuses.includes(i.status))

  const [editId, setEditId] = useState<string | null>(null)
  const [edit, setEdit] = useState({ pergunta: "", resposta_oficial: "", categoria: "", tags: "" })
  const [busy, setBusy] = useState<string | null>(null)

  const abrirEdicao = (it: KnowledgeItem) => {
    setEditId(it.id)
    setEdit({
      pergunta: it.pergunta,
      resposta_oficial: it.resposta_oficial,
      categoria: it.categoria ?? "",
      tags: it.tags.join(", "),
    })
  }

  const salvarEdicao = async (id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/manager/curation/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pergunta: edit.pergunta,
          resposta_oficial: edit.resposta_oficial,
          categoria: edit.categoria || null,
          tags: edit.tags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      })
      setEditId(null)
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  const mover = async (id: string, status: Status) => {
    setBusy(id)
    try {
      await fetch(`/api/manager/curation/items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  const excluir = async (id: string) => {
    setBusy(id)
    try {
      await fetch(`/api/manager/curation/items/${id}`, { method: "DELETE" })
      await mutate()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Buscar por pergunta ou resposta..."
          value={buscaInput}
          onChange={(e) => setBuscaInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setBusca(buscaInput.trim())}
        />
        <Button variant="outline" onClick={() => setBusca(buscaInput.trim())}>Buscar</Button>
      </div>
      <p className="text-sm text-muted-foreground">{descricao}</p>

      {isLoading && !data ? (
        <div className="flex justify-center py-10"><Spinner className="h-6 w-6" /></div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <ClipboardCheck className="h-9 w-9 opacity-30" />
            <p className="text-sm">Nada em <strong>{titulo.toLowerCase()}</strong> por enquanto.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((it) => {
            const editando = editId === it.id
            return (
              <Card key={it.id}>
                <CardContent className="flex flex-col gap-3 pt-5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge className={`text-[11px] ${STATUS_CLS[it.status]}`}>{STATUS_LABEL[it.status]}</Badge>
                    {it.categoria && <Badge variant="secondary" className="text-[11px]">{it.categoria}</Badge>}
                    <Badge variant="outline" className="text-[11px]">v{it.versao}</Badge>
                    <Badge variant="outline" className="text-[11px]">confiança {Math.round(it.confianca * 100)}%</Badge>
                    {it.criador && <span className="text-[11px] text-muted-foreground">por {it.criador}</span>}
                    <span className="ml-auto text-[11px] text-muted-foreground">{fmtDate(it.updated_at)}</span>
                  </div>

                  {editando ? (
                    <div className="flex flex-col gap-2">
                      <Input value={edit.pergunta} onChange={(e) => setEdit({ ...edit, pergunta: e.target.value })} placeholder="Pergunta" />
                      <Textarea value={edit.resposta_oficial} onChange={(e) => setEdit({ ...edit, resposta_oficial: e.target.value })} placeholder="Resposta oficial" className="min-h-24" />
                      <div className="grid grid-cols-2 gap-2">
                        <Input value={edit.categoria} onChange={(e) => setEdit({ ...edit, categoria: e.target.value })} placeholder="Categoria" />
                        <Input value={edit.tags} onChange={(e) => setEdit({ ...edit, tags: e.target.value })} placeholder="Tags (vírgula)" />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => salvarEdicao(it.id)} disabled={busy === it.id} className="gap-1.5">
                          {busy === it.id ? <Spinner className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />} Salvar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="gap-1.5">
                          <X className="h-3.5 w-3.5" /> Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-sm font-medium">{it.pergunta}</p>
                      {it.resposta_oficial && (
                        <p className="whitespace-pre-wrap rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground line-clamp-6">
                          {it.resposta_oficial}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button size="sm" variant="outline" onClick={() => abrirEdicao(it)} className="h-7 gap-1.5 text-xs">
                          <Pencil className="h-3.5 w-3.5" /> Editar
                        </Button>
                        {it.status !== "publicado" && (
                          <Button size="sm" onClick={() => mover(it.id, "publicado")} disabled={busy === it.id} className="h-7 gap-1.5 bg-emerald-600 text-xs hover:bg-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Publicar
                          </Button>
                        )}
                        {it.status === "rascunho" && (
                          <Button size="sm" variant="outline" onClick={() => mover(it.id, "em_teste")} disabled={busy === it.id} className="h-7 gap-1.5 text-xs">
                            <FlaskConical className="h-3.5 w-3.5" /> Em teste
                          </Button>
                        )}
                        {it.status !== "arquivado" && (
                          <Button size="sm" variant="outline" onClick={() => mover(it.id, "arquivado")} disabled={busy === it.id} className="h-7 gap-1.5 text-xs">
                            <Archive className="h-3.5 w-3.5" /> Arquivar
                          </Button>
                        )}
                        {it.status === "arquivado" && (
                          <Button size="sm" variant="outline" onClick={() => mover(it.id, "rascunho")} disabled={busy === it.id} className="h-7 gap-1.5 text-xs">
                            Voltar a rascunho
                          </Button>
                        )}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs text-red-500 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950" disabled={busy === it.id}>
                              <Trash2 className="h-3.5 w-3.5" /> Excluir
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Excluir este conhecimento?</AlertDialogTitle>
                              <AlertDialogDescription>Ação permanente. Se preferir tirar de uso sem apagar, use <strong>Arquivar</strong>.</AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction onClick={() => excluir(it.id)} className="bg-red-600 hover:bg-red-700">Excluir</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </>
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

// ─── Placeholder de áreas futuras ───────────────────────────────────────────────

function EmBreve({ area, fase, descricao }: { area: string; fase: string; descricao: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-2 py-14 text-center">
        <Sparkles className="h-9 w-9 text-muted-foreground opacity-40" />
        <p className="font-medium">{area}</p>
        <p className="max-w-md text-sm text-muted-foreground">{descricao}</p>
        <Badge variant="outline" className="mt-1 text-xs">{fase}</Badge>
      </CardContent>
    </Card>
  )
}

// ─── Módulo ──────────────────────────────────────────────────────────────────────

const TABS = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "capturar", label: "Capturar", icon: GitBranch },
  { value: "revisao", label: "Revisão", icon: ClipboardCheck },
  { value: "base", label: "Base publicada", icon: BookCheck },
  { value: "sandbox", label: "Sandbox", icon: FlaskConical },
  { value: "versoes", label: "Versões", icon: History },
  { value: "config", label: "Config", icon: Settings2 },
]

export function CurationModule() {
  const handleLogout = async () => {
    try {
      await fetch("/api/admin/logout", { method: "POST" })
    } finally {
      window.location.href = "/login"
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white text-slate-950">
      <header className="sticky top-0 z-30 border-b bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex size-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
            <BrainCircuit className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Curadoria de IA</p>
            <p className="truncate text-xs text-muted-foreground">Ensinar, validar e publicar conhecimento</p>
          </div>
          <Button variant="ghost" size="sm" className="ml-auto gap-2 text-slate-600" onClick={handleLogout}>
            <LogOut className="size-4" /> Sair
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <Tabs defaultValue="dashboard">
          <TabsList className="mb-6 flex h-auto w-full flex-wrap justify-start gap-1">
            {TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value} className="gap-2">
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="dashboard"><DashboardArea /></TabsContent>
          <TabsContent value="capturar"><CapturarArea /></TabsContent>
          <TabsContent value="revisao">
            <ListaArea
              statuses={["rascunho", "em_teste"]}
              titulo="Revisão"
              descricao="Conhecimentos aguardando validação. Edite, teste e publique — só o que estiver publicado entra em produção."
            />
          </TabsContent>
          <TabsContent value="base">
            <ListaArea
              statuses={["publicado"]}
              titulo="Base publicada"
              descricao="Conhecimento ativo que a IA usa em produção. Arquive o que ficar desatualizado."
            />
          </TabsContent>
          <TabsContent value="sandbox">
            <EmBreve
              area="Simulador (Sandbox) + Modo Comparativo"
              fase="Próxima fase"
              descricao="Testar o conhecimento em teste num chat isolado e comparar lado a lado a resposta de produção vs. a nova, antes de publicar."
            />
          </TabsContent>
          <TabsContent value="versoes">
            <EmBreve
              area="Histórico de Versões"
              fase="Próxima fase"
              descricao="Cada alteração gera uma versão (v1 → v2 → v3) com possibilidade de restaurar uma anterior caso um treinamento dê problema."
            />
          </TabsContent>
          <TabsContent value="config">
            <EmBreve
              area="Configurações & Estatísticas avançadas"
              fase="Próxima fase"
              descricao="Taxa de acerto da IA, intervenção humana, perguntas recorrentes e sem resposta, e parâmetros de curadoria."
            />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  )
}

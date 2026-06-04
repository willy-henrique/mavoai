"use client"

import { useState, useCallback } from "react"
import useSWR, { mutate } from "swr"
import {
  Bot, Plus, Pencil, Trash2, Save, Loader2,
  CheckCircle2, Cpu, Zap, Tag, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { PROVIDER_PRESETS, detectProvider, type ProviderPreset } from "@/lib/provider-presets"

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface SpecialistAgent {
  id: string
  domain: string
  name: string
  description: string | null
  system_prompt: string
  keywords: string[]
  model_base_url: string | null
  model_name: string | null
  priority: number
  is_active: boolean
  updated_at: string
}

const DOMAIN_COLORS: Record<string, string> = {
  tef        : "border-blue-200 bg-blue-50 text-blue-700",
  pdv        : "border-emerald-200 bg-emerald-50 text-emerald-700",
  fiscal     : "border-amber-200 bg-amber-50 text-amber-700",
  estoque    : "border-violet-200 bg-violet-50 text-violet-700",
  hardware   : "border-slate-200 bg-slate-100 text-slate-700",
  integracao : "border-rose-200 bg-rose-50 text-rose-700",
  geral      : "border-gray-200 bg-gray-50 text-gray-700",
}

const defaultDomainColor = "border-gray-200 bg-gray-50 text-gray-700"

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const SWR_KEY = "/api/v1/specialist-agents-bff?tenant_id=auge"

// ─── Editor de Agente ─────────────────────────────────────────────────────────

const EMPTY_FORM = {
  domain: "", name: "", description: "", system_prompt: "",
  keywords: "", model_base_url: "", model_name: "", priority: 0, is_active: true,
}

interface AgentEditorProps {
  agent?: SpecialistAgent | null
  onClose: () => void
}

function AgentEditor({ agent, onClose }: AgentEditorProps) {
  const [form, setForm] = useState({
    domain        : agent?.domain        ?? "",
    name          : agent?.name          ?? "",
    description   : agent?.description  ?? "",
    system_prompt : agent?.system_prompt ?? "",
    keywords      : (agent?.keywords ?? []).join(", "),
    model_base_url: agent?.model_base_url ?? "",
    model_name    : agent?.model_name    ?? "",
    priority      : agent?.priority ?? 0,
    is_active     : agent?.is_active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [ok, setOk]         = useState(false)
  const [err, setErr]       = useState<string | null>(null)

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  // Provider derivado dos campos atuais (null = custom/global)
  const activeProvider: ProviderPreset | null = detectProvider(form.model_base_url)

  const selectProvider = (providerId: string) => {
    if (providerId === "global") {
      setForm((f) => ({ ...f, model_base_url: "", model_name: "" }))
      return
    }
    const p = PROVIDER_PRESETS.find((x) => x.id === providerId)
    if (!p) return
    // Auto-preenche URL e seleciona o primeiro modelo da lista
    setForm((f) => ({ ...f, model_base_url: p.base_url, model_name: p.models[0].id }))
  }

  const selectModel = (modelId: string) => {
    setForm((f) => ({ ...f, model_name: modelId }))
  }

  const handleSave = useCallback(async () => {
    if (!form.domain.trim() || !form.name.trim()) return
    setSaving(true); setErr(null)
    try {
      const payload = {
        tenant_id    : "auge",
        domain       : form.domain.trim().toLowerCase(),
        name         : form.name.trim(),
        description  : form.description.trim() || null,
        system_prompt: form.system_prompt.trim(),
        keywords     : form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
        model_base_url: form.model_base_url.trim() || null,
        model_name   : form.model_name.trim() || null,
        priority     : Number(form.priority),
        is_active    : form.is_active,
      }
      if (agent) {
        // PATCH
        const resp = await fetch(`/api/v1/specialist-agents-bff/${agent.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!resp.ok) throw new Error((await resp.json()).error)
      } else {
        // POST
        const resp = await fetch("/api/v1/specialist-agents-bff", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
        if (!resp.ok) throw new Error((await resp.json()).error)
      }
      setOk(true)
      mutate(SWR_KEY)
      setTimeout(onClose, 800)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }, [form, agent, onClose])

  return (
    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-emerald-600" />
          {agent ? `Editar — ${agent.name}` : "Novo Agente Especialista"}
        </DialogTitle>
        <DialogDescription>
          Configure o domínio, system prompt e palavras-chave para roteamento automático.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 py-2">
        {/* Domínio + Nome */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Domínio *</Label>
            <Input
              placeholder="tef, pdv, fiscal, estoque..."
              value={form.domain}
              onChange={set("domain")}
              disabled={!!agent}
              className="text-xs font-mono"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium">Nome *</Label>
            <Input placeholder="Agente TEF" value={form.name} onChange={set("name")} className="text-xs" />
          </div>
        </div>

        {/* Descrição */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">Descrição</Label>
          <Input placeholder="Especialista em terminal de pagamento..." value={form.description} onChange={set("description")} className="text-xs" />
        </div>

        {/* System Prompt */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium">System Prompt</Label>
          <Textarea
            placeholder={"Você é um especialista em TEF da AUGE ERP...\n\nSuas responsabilidades:\n- Diagnosticar falhas de comunicação TEF\n- Orientar configuração do gerenciador de pagamentos\n- Identificar problemas com operadoras (Stone, Cielo, GetNet)"}
            value={form.system_prompt}
            onChange={set("system_prompt")}
            className="min-h-36 text-xs font-mono leading-relaxed"
          />
          <p className="text-xs text-muted-foreground">
            Instrui a IA sobre como agir quando este agente for ativado. Quanto mais específico, melhor.
          </p>
        </div>

        {/* Keywords */}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium flex items-center gap-1.5">
            <Tag className="h-3 w-3" /> Palavras-chave (separadas por vírgula)
          </Label>
          <Input
            placeholder="tef, stone, cielo, pinpad, gerenciador, gp, pagamento..."
            value={form.keywords}
            onChange={set("keywords")}
            className="text-xs font-mono"
          />
          <p className="text-xs text-muted-foreground">Usadas pelo IA Router para identificar o domínio sem chamar o LLM.</p>
        </div>

        {/* Modelo override — provider selector */}
        <div className="rounded-lg border p-3 bg-muted/20 flex flex-col gap-3">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" /> Modelo de IA do agente
          </p>

          {/* Chips de provider */}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => selectProvider("global")}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                !activeProvider
                  ? "border-slate-400 bg-slate-100 text-slate-800"
                  : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              }`}
            >
              Global (padrão)
            </button>
            {PROVIDER_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProvider(p.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeProvider?.id === p.id
                    ? p.color
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Seletor de modelo (só aparece quando um provider está ativo) */}
          {activeProvider && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">Modelo</Label>
              <Select value={form.model_name} onValueChange={selectModel}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue placeholder="Selecione o modelo..." />
                </SelectTrigger>
                <SelectContent>
                  {activeProvider.models.map((m) => (
                    <SelectItem key={m.id} value={m.id} className="text-xs">
                      {m.label}
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">{m.id}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Campos avançados: URL e modelo custom */}
          <details className="group">
            <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground select-none">
              Avançado — URL e modelo customizados
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Base URL</Label>
                <Input
                  placeholder="https://api.groq.com/openai/v1"
                  value={form.model_base_url}
                  onChange={set("model_base_url")}
                  className="text-xs font-mono"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">ID do modelo</Label>
                <Input
                  placeholder="meta-llama/llama-4-scout-17b..."
                  value={form.model_name}
                  onChange={set("model_name")}
                  className="text-xs font-mono"
                />
              </div>
            </div>
          </details>

          <p className="text-[11px] text-muted-foreground">
            Todos gratuitos. Keys lidas do{" "}
            <code className="bg-muted px-1 rounded">.env.local</code>:
            {" "}<code className="bg-muted px-1 rounded">GROQ_API_KEY</code>,
            {" "}<code className="bg-muted px-1 rounded">GOOGLE_API_KEY</code>,
            {" "}<code className="bg-muted px-1 rounded">OPENROUTER_API_KEY</code>.
          </p>
        </div>

        {/* Prioridade + Ativo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Label className="text-xs">Prioridade</Label>
            <Input type="number" value={form.priority} onChange={set("priority")} className="w-20 text-xs" />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Ativo</Label>
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
          </div>
        </div>

        {err && <p className="text-xs text-red-500">{err}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
        <Button onClick={handleSave} disabled={saving || !form.domain.trim() || !form.name.trim()} className="gap-2 bg-slate-950 hover:bg-slate-800">
          {ok ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {ok ? "Salvo!" : "Salvar agente"}
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

// ─── Card de Agente ───────────────────────────────────────────────────────────

function SpecialistCard({
  agent,
  onEdit,
  onDelete,
}: { agent: SpecialistAgent; onEdit: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const color = DOMAIN_COLORS[agent.domain] ?? defaultDomainColor

  return (
    <div className={`rounded-lg border p-3 flex flex-col gap-2 ${!agent.is_active ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge className={`text-xs shrink-0 ${color}`}>{agent.domain}</Badge>
          <span className="text-sm font-semibold truncate">{agent.name}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remover agente?</AlertDialogTitle>
                <AlertDialogDescription>Esta ação remove o agente "{agent.name}" permanentemente.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-red-600 hover:bg-red-700">Remover</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {agent.description && (
        <p className="text-xs text-muted-foreground">{agent.description}</p>
      )}

      {/* Keywords preview */}
      {agent.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.keywords.slice(0, expanded ? undefined : 5).map((kw) => (
            <span key={kw} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
              {kw}
            </span>
          ))}
          {!expanded && agent.keywords.length > 5 && (
            <button onClick={() => setExpanded(true)} className="text-[10px] text-muted-foreground hover:text-foreground">
              +{agent.keywords.length - 5} mais
            </button>
          )}
        </div>
      )}

      {/* Model badge com cor do provider */}
      {agent.model_name && (() => {
        const provider = detectProvider(agent.model_base_url)
        return (
          <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium w-fit ${provider?.color ?? "border-slate-200 bg-slate-50 text-slate-600"}`}>
            <Cpu className="h-3 w-3 shrink-0" />
            <span className="font-mono truncate max-w-[160px]">{agent.model_name}</span>
          </div>
        )
      })()}
    </div>
  )
}

// ─── Painel principal ─────────────────────────────────────────────────────────

export function SpecialistAgentsPanel() {
  const { data, isLoading } = useSWR<{ agents: SpecialistAgent[] }>(SWR_KEY, fetcher)
  const [editing, setEditing]   = useState<SpecialistAgent | null | "new">(null)
  const [showPrompt, setShowPrompt] = useState(false)

  const handleDelete = useCallback(async (agent: SpecialistAgent) => {
    await fetch(`/api/v1/specialist-agents-bff/${agent.id}`, { method: "DELETE" })
    mutate(SWR_KEY)
  }, [])

  const agents = data?.agents ?? []
  const active = agents.filter((a) => a.is_active)

  return (
    <>
      <Card className="rounded-lg border-slate-200 bg-white/95 shadow-sm">
        <CardHeader className="flex-row items-start justify-between gap-3 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="size-4 text-amber-500" />
              Agentes Especialistas
            </CardTitle>
            <CardDescription>
              Roteados automaticamente pelo IA Router baseado em palavras-chave + LLM.{" "}
              <button
                onClick={() => setShowPrompt((v) => !v)}
                className="inline-flex items-center gap-0.5 font-medium text-emerald-600 hover:underline"
              >
                {showPrompt ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Como funciona
              </button>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              {active.length} ativos
            </span>
            <Button size="sm" onClick={() => setEditing("new")} className="gap-1.5 bg-slate-950 hover:bg-slate-800">
              <Plus className="h-3.5 w-3.5" />
              Novo agente
            </Button>
          </div>
        </CardHeader>

        {showPrompt && (
          <div className="mx-6 mb-4 rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
            <strong>IA Router:</strong> cada mensagem é comparada com as palavras-chave de cada agente. Score alto ({">"} 0.7) → roteamento direto. Score médio → LLM desempata. Score baixo → resposta genérica. Ativar via <code className="bg-muted px-1 rounded">ENABLE_AI_ROUTER=true</code> no .env.
          </div>
        )}

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Bot className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Nenhum agente especialista configurado.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setEditing("new")}>
                <Plus className="h-3.5 w-3.5" />
                Criar primeiro agente
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((agent) => (
                <SpecialistCard
                  key={agent.id}
                  agent={agent}
                  onEdit={() => setEditing(agent)}
                  onDelete={() => handleDelete(agent)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog de edição */}
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null && (
          <AgentEditor
            agent={editing === "new" ? null : editing}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
    </>
  )
}

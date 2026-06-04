"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Bot,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileSearch,
  FlaskConical,
  GitBranch,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Sparkles,
  Terminal,
  Trash2,
  TriangleAlert,
  Wand2,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export type AgentId =
  | "orchestrator"
  | "triage"
  | "investigation"
  | "resolution"
  | "vision"
  | "curator"
  | "handoff"

interface AgentMeta {
  name: string
  role: string
  description: string
  color: string
  icon: typeof Bot
  paramSchema: ParamField[]
}

interface ParamField {
  key: string
  label: string
  description: string
  type: "number" | "boolean" | "string"
  min?: number
  max?: number
  step?: number
  defaultValue: number | boolean | string
}

interface TrainingExample {
  id: string
  label: string | null
  input: string
  expected_output: string | null
  notes: string | null
  active: boolean
  created_at: string
}

interface AgentConfigData {
  agent_id: AgentId
  tenant_id: string
  enabled: boolean
  system_prompt: string | null
  params: Record<string, unknown>
  defaults: Record<string, unknown>
  updated_at: string
}

// ─── Metadados dos agentes ────────────────────────────────────────────────────

const ICON_MAP: Record<AgentId, typeof Bot> = {
  orchestrator: GitBranch,
  triage: Zap,
  investigation: FileSearch,
  resolution: Wand2,
  vision: Eye,
  curator: Sparkles,
  handoff: Bot,
}

const COLOR_CLASSES: Record<string, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  blue: "border-blue-200 bg-blue-50 text-blue-700",
  violet: "border-violet-200 bg-violet-50 text-violet-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  rose: "border-rose-200 bg-rose-50 text-rose-700",
  slate: "border-slate-200 bg-slate-100 text-slate-700",
}

const ICON_BG: Record<string, string> = {
  emerald: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  blue: "bg-blue-50 text-blue-600 ring-blue-200",
  violet: "bg-violet-50 text-violet-600 ring-violet-200",
  amber: "bg-amber-50 text-amber-600 ring-amber-200",
  sky: "bg-sky-50 text-sky-600 ring-sky-200",
  rose: "bg-rose-50 text-rose-600 ring-rose-200",
  slate: "bg-slate-100 text-slate-600 ring-slate-200",
}

const AGENT_META: Record<AgentId, AgentMeta> = {
  orchestrator: {
    name: "Orquestrador",
    role: "Controle de fluxo",
    description: "Rege todo o ciclo: menu → triagem → investigação → resolução autônoma → handoff humano.",
    color: "emerald",
    icon: GitBranch,
    paramSchema: [
      { key: "fast_path_min_chars", label: "Chars mínimos para fast-path", description: "Mensagens com mais caracteres que isso (+ conteúdo técnico) pulam a investigação e vão direto para resolução.", type: "number", min: 10, max: 200, step: 5, defaultValue: 35 },
      { key: "investigation_required_adequate_rounds", label: "Rodadas adequadas para resolver", description: "Quantas rodadas de evidência adequada são necessárias antes de tentar resolver automaticamente.", type: "number", min: 1, max: 5, step: 1, defaultValue: 1 },
      { key: "investigation_max_inadequate_before_handoff", label: "Respostas inadequadas antes do handoff", description: "Sequência de respostas inadequadas ou fora do tema que dispara escalada para humano.", type: "number", min: 1, max: 10, step: 1, defaultValue: 2 },
      { key: "investigation_max_inbound_without_handoff", label: "Máx. mensagens sem evidência", description: "Limite total de mensagens recebidas sem evidência suficiente antes do handoff forçado.", type: "number", min: 3, max: 30, step: 1, defaultValue: 14 },
      { key: "menu_max_invalid_attempts", label: "Tentativas inválidas no menu", description: "Número de seleções inválidas no menu antes de escalar para atendente humano.", type: "number", min: 1, max: 10, step: 1, defaultValue: 3 },
    ],
  },
  triage: {
    name: "Triagem IA",
    role: "Classificação técnica",
    description: "Classifica chamados, define prioridade (S1–S4) e roteia para a fila correta via LLM.",
    color: "blue",
    icon: Zap,
    paramSchema: [
      { key: "max_attempts", label: "Máx. tentativas de triagem", description: "Número máximo de rodadas para completar a triagem antes de forçar handoff.", type: "number", min: 1, max: 5, step: 1, defaultValue: 2 },
      { key: "min_confidence", label: "Confiança mínima (0–1)", description: "Confiança mínima do LLM para aceitar a classificação automática de fila.", type: "number", min: 0.1, max: 1, step: 0.05, defaultValue: 0.65 },
      { key: "reply_max_chars", label: "Máx. caracteres na resposta", description: "Limite de caracteres na resposta de triagem enviada ao cliente via WhatsApp.", type: "number", min: 100, max: 500, step: 10, defaultValue: 220 },
    ],
  },
  investigation: {
    name: "Avaliador",
    role: "Qualidade de evidência",
    description: "Avalia cada turno de investigação: adequado, insuficiente ou fora do tema.",
    color: "violet",
    icon: FileSearch,
    paramSchema: [],
  },
  resolution: {
    name: "Motor de Resolução",
    role: "Resolução autônoma",
    description: "Tenta resolver em até N rodadas via RAG semântico + geração. Escala após esgotar.",
    color: "amber",
    icon: Wand2,
    paramSchema: [
      { key: "max_attempts", label: "Máx. tentativas de resolução", description: "Número máximo de soluções autônomas antes de escalar para humano.", type: "number", min: 1, max: 5, step: 1, defaultValue: 2 },
      { key: "rag_results_limit", label: "Limite de resultados RAG", description: "Quantos casos históricos similares são buscados no banco vetorial para enriquecer a resposta.", type: "number", min: 1, max: 20, step: 1, defaultValue: 5 },
      { key: "rag_similarity_threshold", label: "Threshold de similaridade RAG (0–1)", description: "Similaridade mínima para incluir um caso histórico como contexto.", type: "number", min: 0, max: 1, step: 0.05, defaultValue: 0.3 },
    ],
  },
  vision: {
    name: "Visão",
    role: "Análise de imagem",
    description: "Processa prints e fotos de equipamentos para extrair contexto técnico de suporte.",
    color: "sky",
    icon: Eye,
    paramSchema: [
      { key: "enabled", label: "Habilitado", description: "Liga ou desliga o processamento de imagens no fluxo de investigação.", type: "boolean", defaultValue: true },
      { key: "model_override", label: "Override de modelo", description: "Modelo de visão alternativo. Vazio = usa o padrão configurado no servidor.", type: "string", defaultValue: "" },
    ],
  },
  curator: {
    name: "Curador",
    role: "Gestão do conhecimento",
    description: "Extrai problema / causa / solução de conversas encerradas e popula a base RAG.",
    color: "rose",
    icon: Sparkles,
    paramSchema: [
      { key: "auto_curate", label: "Curadoria automática", description: "Quando ativado, executa curadoria automaticamente ao fechar conversas com handoff.", type: "boolean", defaultValue: false },
      { key: "similarity_alert_threshold", label: "Threshold de alerta de recorrência (0–1)", description: "Similaridade mínima para alertar sobre casos recorrentes ou sistêmicos.", type: "number", min: 0.5, max: 1, step: 0.05, defaultValue: 0.85 },
    ],
  },
  handoff: {
    name: "Handoff",
    role: "Resumo para humanos",
    description: "Gera briefing estruturado ao escalar: contexto, tentativas e diagnóstico.",
    color: "slate",
    icon: Bot,
    paramSchema: [
      { key: "max_summary_chars", label: "Máx. caracteres no resumo", description: "Limite de caracteres no briefing gerado para o atendente humano.", type: "number", min: 200, max: 3000, step: 100, defaultValue: 1000 },
    ],
  },
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface AgentConfigSheetProps {
  agentId: AgentId | null
  tenantId?: string
  onClose: () => void
}

function authHeader() { return {} }

export function AgentConfigSheet({ agentId, tenantId = "default", onClose }: AgentConfigSheetProps) {
  const [config, setConfig] = useState<AgentConfigData | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)
  const [localParams, setLocalParams] = useState<Record<string, unknown>>({})
  const [localPrompt, setLocalPrompt] = useState<string>("")
  const [localEnabled, setLocalEnabled] = useState(true)

  // Treinamento
  const [examples, setExamples] = useState<TrainingExample[]>([])
  const [loadingExamples, setLoadingExamples] = useState(false)
  const [newInput, setNewInput] = useState("")
  const [newExpected, setNewExpected] = useState("")
  const [newLabel, setNewLabel] = useState("")
  const [addingExample, setAddingExample] = useState(false)

  // Playground
  const [testMessage, setTestMessage] = useState("")
  const [testOutput, setTestOutput] = useState<string>("")
  const [testLatency, setTestLatency] = useState<number | null>(null)
  const [testing, setTesting] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)

  const meta = agentId ? AGENT_META[agentId] : null

  // ── Carrega config ──────────────────────────────────────────────────────────

  const loadConfig = useCallback(async () => {
    if (!agentId) return
    setLoadingConfig(true)
    try {
      const res = await fetch(
        `/api/v1/agents-bff/${agentId}?tenant_id=${tenantId}`,
        { headers: authHeader() },
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: AgentConfigData = await res.json()
      setConfig(data)
      setLocalParams(data.params)
      setLocalPrompt(data.system_prompt ?? "")
      setLocalEnabled(data.enabled)
    } catch (e) {
      console.error("Falha ao carregar config do agente", e)
    } finally {
      setLoadingConfig(false)
    }
  }, [agentId, tenantId])

  useEffect(() => {
    if (agentId) {
      loadConfig()
      loadExamples()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, tenantId])

  // ── Salva config ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!agentId) return
    setSaving(true)
    setSaveOk(false)
    try {
      const res = await fetch(`/api/v1/agents-bff/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          tenant_id: tenantId,
          enabled: localEnabled,
          system_prompt: localPrompt.trim() || null,
          params: localParams,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setSaveOk(true)
      await loadConfig()
      setTimeout(() => setSaveOk(false), 2500)
    } catch (e) {
      console.error("Erro ao salvar config", e)
    } finally {
      setSaving(false)
    }
  }

  // ── Restaura defaults ───────────────────────────────────────────────────────

  const handleReset = async () => {
    if (!agentId || !confirm("Restaurar os valores padrão do agente?")) return
    await fetch(`/api/v1/agents-bff/${agentId}?tenant_id=${tenantId}`, {
      method: "DELETE",
      headers: authHeader(),
    })
    await loadConfig()
  }

  // ── Treinamento ─────────────────────────────────────────────────────────────

  const loadExamples = async () => {
    if (!agentId) return
    setLoadingExamples(true)
    try {
      const res = await fetch(
        `/api/v1/agents-bff/${agentId}/training?tenant_id=${tenantId}`,
        { headers: authHeader() },
      )
      if (!res.ok) return
      const data = await res.json()
      setExamples(data.examples ?? [])
    } finally {
      setLoadingExamples(false)
    }
  }

  const handleAddExample = async () => {
    if (!agentId || !newInput.trim()) return
    setAddingExample(true)
    try {
      const res = await fetch(`/api/v1/agents-bff/${agentId}/training`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({
          tenant_id: tenantId,
          input: newInput,
          expected_output: newExpected || null,
          label: newLabel || null,
        }),
      })
      if (res.ok) {
        setNewInput("")
        setNewExpected("")
        setNewLabel("")
        await loadExamples()
      }
    } finally {
      setAddingExample(false)
    }
  }

  const handleDeleteExample = async (exampleId: string) => {
    if (!agentId) return
    await fetch(`/api/v1/agents-bff/${agentId}/training/${exampleId}`, {
      method: "DELETE",
      headers: authHeader(),
    })
    setExamples((prev) => prev.filter((e) => e.id !== exampleId))
  }

  // ── Playground ──────────────────────────────────────────────────────────────

  const handleTest = async () => {
    if (!agentId || !testMessage.trim()) return
    setTesting(true)
    setTestOutput("")
    setTestError(null)
    setTestLatency(null)
    try {
      const res = await fetch(`/api/v1/agents-bff/${agentId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ message: testMessage, tenant_id: tenantId }),
      })
      const data = await res.json()
      setTestLatency(data.latency_ms ?? null)
      if (!data.ok) {
        setTestError(data.error ?? "Erro desconhecido")
      } else {
        const raw = data.output
        const answer = typeof raw?.answer === "string"
          ? raw.answer
          : JSON.stringify(raw, null, 2)
        setTestOutput(answer)
      }
    } catch (e) {
      setTestError(String(e))
    } finally {
      setTesting(false)
    }
  }

  if (!agentId || !meta) return null

  const Icon = ICON_MAP[agentId]
  const colorClass = COLOR_CLASSES[meta.color] ?? COLOR_CLASSES.slate
  const iconBgClass = ICON_BG[meta.color] ?? ICON_BG.slate

  return (
    <Sheet open={!!agentId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={`flex size-10 items-center justify-center rounded-lg ring-1 ${iconBgClass}`}>
                <Icon className="size-5" />
              </span>
              <div>
                <SheetTitle className="text-base font-bold text-slate-900">
                  {meta.name}
                </SheetTitle>
                <SheetDescription className="text-xs text-slate-500">
                  {meta.role}
                </SheetDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`text-xs ${colorClass}`}>
                {localEnabled ? "Online" : "Desativado"}
              </Badge>
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-500">{meta.description}</p>
        </SheetHeader>

        {/* ── Conteúdo ─────────────────────────────────────────────────────── */}
        {loadingConfig ? (
          <div className="grid flex-1 place-items-center">
            <Loader2 className="size-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <Tabs defaultValue="params" className="flex min-h-0 flex-1 flex-col">
            <TabsList className="h-auto shrink-0 justify-start gap-0 rounded-none border-b border-slate-200 bg-white px-6 pb-0 pt-1">
              {[
                { value: "params", label: "Parâmetros", icon: ChevronRight },
                { value: "prompt", label: "Prompt", icon: Terminal },
                { value: "test", label: "Teste", icon: FlaskConical },
                { value: "training", label: "Treinamento", icon: BookOpen },
              ].map(({ value, label, icon: TabIcon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="relative rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 text-xs font-semibold text-slate-500 shadow-none transition-colors data-[state=active]:border-emerald-500 data-[state=active]:text-slate-900 data-[state=active]:shadow-none"
                >
                  <TabIcon className="mr-1.5 size-3.5" />
                  {label}
                  {value === "training" && examples.length > 0 && (
                    <span className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700">
                      {examples.length}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* ── Parâmetros ───────────────────────────────────────────── */}
              <TabsContent value="params" className="m-0 p-6">
                <div className="space-y-6">
                  {/* Habilitado / Desabilitado */}
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Agente habilitado</p>
                      <p className="text-xs text-slate-500">Desativar impede o agente de ser chamado no fluxo.</p>
                    </div>
                    <Switch
                      checked={localEnabled}
                      onCheckedChange={setLocalEnabled}
                    />
                  </div>

                  {meta.paramSchema.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      Este agente não tem parâmetros configuráveis.<br />
                      Use a aba <strong>Prompt</strong> para ajustar o comportamento.
                    </div>
                  ) : (
                    meta.paramSchema.map((field) => (
                      <div key={field.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-semibold text-slate-700">
                            {field.label}
                          </Label>
                          {field.type === "number" && (
                            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700">
                              {String(localParams[field.key] ?? field.defaultValue)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500">{field.description}</p>

                        {field.type === "number" && field.min !== undefined && field.max !== undefined ? (
                          <Slider
                            min={field.min}
                            max={field.max}
                            step={field.step ?? 1}
                            value={[Number(localParams[field.key] ?? field.defaultValue)]}
                            onValueChange={([val]) =>
                              setLocalParams((p) => ({ ...p, [field.key]: val }))
                            }
                            className="mt-3"
                          />
                        ) : field.type === "boolean" ? (
                          <Switch
                            checked={Boolean(localParams[field.key] ?? field.defaultValue)}
                            onCheckedChange={(v) =>
                              setLocalParams((p) => ({ ...p, [field.key]: v }))
                            }
                          />
                        ) : (
                          <Input
                            value={String(localParams[field.key] ?? field.defaultValue)}
                            onChange={(e) =>
                              setLocalParams((p) => ({ ...p, [field.key]: e.target.value }))
                            }
                            placeholder={String(field.defaultValue)}
                            className="font-mono text-sm"
                          />
                        )}

                        {/* Indicador de diff com o default */}
                        {localParams[field.key] !== undefined &&
                          String(localParams[field.key]) !== String(field.defaultValue) && (
                            <p className="text-[11px] text-amber-600">
                              ⚠ Padrão: {String(field.defaultValue)}
                            </p>
                          )}
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* ── Prompt override ──────────────────────────────────────── */}
              <TabsContent value="prompt" className="m-0 p-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold text-slate-700">
                      System Prompt (override)
                    </Label>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Substitui o prompt padrão do código. Deixe vazio para usar o padrão.
                      <br />
                      <span className="font-medium text-amber-600">
                        Atenção: um prompt incorreto pode degradar o comportamento do agente.
                      </span>
                    </p>
                  </div>

                  <Textarea
                    value={localPrompt}
                    onChange={(e) => setLocalPrompt(e.target.value)}
                    placeholder="Cole aqui o system prompt customizado... Ou deixe vazio para usar o padrão do código."
                    className="min-h-[24rem] font-mono text-xs leading-relaxed"
                  />

                  {localPrompt.trim() && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      <TriangleAlert className="size-3.5 shrink-0" />
                      Override ativo — o prompt padrão do código está sendo substituído.
                    </div>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-slate-500"
                    onClick={() => setLocalPrompt("")}
                  >
                    <RotateCcw className="mr-1.5 size-3.5" />
                    Limpar (usar padrão)
                  </Button>
                </div>
              </TabsContent>

              {/* ── Playground de teste ───────────────────────────────────── */}
              <TabsContent value="test" className="m-0 p-6">
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-semibold text-slate-700">
                      Mensagem de entrada
                    </Label>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Executa o agente com a configuração atual salva no banco.
                    </p>
                  </div>

                  <Textarea
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Ex: Impressora não imprime cupom fiscal no AUGE..."
                    className="min-h-28 text-sm"
                  />

                  <Button
                    onClick={handleTest}
                    disabled={testing || !testMessage.trim()}
                    className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
                  >
                    {testing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <FlaskConical className="size-4" />
                    )}
                    {testing ? "Executando..." : "Executar agente"}
                  </Button>

                  {(testOutput || testError) && (
                    <Card className="border-slate-200">
                      <CardHeader className="pb-2 pt-4">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm font-semibold text-slate-700">
                            Resposta do agente
                          </CardTitle>
                          {testLatency !== null && (
                            <span className="text-xs text-slate-400">{testLatency}ms</span>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {testError ? (
                          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                            {testError}
                          </div>
                        ) : (
                          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
                            {testOutput}
                          </pre>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {/* ── Exemplos de treinamento ───────────────────────────────── */}
              <TabsContent value="training" className="m-0 p-6">
                <div className="space-y-5">
                  {/* Adicionar novo exemplo */}
                  <Card className="border-slate-200 bg-slate-50/60">
                    <CardHeader className="pb-3 pt-4">
                      <CardTitle className="text-sm font-semibold text-slate-700">
                        Adicionar exemplo
                      </CardTitle>
                      <CardDescription className="text-xs">
                        Exemplos orientam o comportamento do agente (few-shot) e são usados em fine-tuning futuro.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label className="mb-1 text-xs font-medium text-slate-600">
                          Rótulo (opcional)
                        </Label>
                        <Input
                          value={newLabel}
                          onChange={(e) => setNewLabel(e.target.value)}
                          placeholder="Ex: Erro NF-e rejeição 252"
                          className="text-xs"
                        />
                      </div>
                      <div>
                        <Label className="mb-1 text-xs font-medium text-slate-600">
                          Entrada *
                        </Label>
                        <Textarea
                          value={newInput}
                          onChange={(e) => setNewInput(e.target.value)}
                          placeholder="Mensagem do cliente ou contexto de entrada..."
                          className="min-h-20 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="mb-1 text-xs font-medium text-slate-600">
                          Saída esperada (opcional)
                        </Label>
                        <Textarea
                          value={newExpected}
                          onChange={(e) => setNewExpected(e.target.value)}
                          placeholder="Resposta ideal que o agente deveria dar..."
                          className="min-h-20 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        onClick={handleAddExample}
                        disabled={addingExample || !newInput.trim()}
                        className="w-full gap-2"
                      >
                        {addingExample ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Plus className="size-3.5" />
                        )}
                        Adicionar exemplo
                      </Button>
                    </CardContent>
                  </Card>

                  <Separator />

                  {/* Lista de exemplos */}
                  {loadingExamples ? (
                    <div className="grid place-items-center py-8">
                      <Loader2 className="size-5 animate-spin text-slate-400" />
                    </div>
                  ) : examples.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
                      Nenhum exemplo de treinamento cadastrado.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {examples.map((ex) => (
                        <div
                          key={ex.id}
                          className="group rounded-lg border border-slate-200 bg-white p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            {ex.label ? (
                              <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                {ex.label}
                              </span>
                            ) : (
                              <span className="text-[11px] text-slate-400">sem rótulo</span>
                            )}
                            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 text-rose-500 hover:bg-rose-50"
                                onClick={() => handleDeleteExample(ex.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                          <p className="text-xs text-slate-700">
                            <span className="font-semibold text-slate-500">Input: </span>
                            {ex.input.slice(0, 200)}
                            {ex.input.length > 200 ? "…" : ""}
                          </p>
                          {ex.expected_output && (
                            <p className="mt-1 text-xs text-slate-500">
                              <span className="font-semibold">Output: </span>
                              {ex.expected_output.slice(0, 150)}
                              {ex.expected_output.length > 150 ? "…" : ""}
                            </p>
                          )}
                          <p className="mt-1 text-[11px] text-slate-400">
                            {new Date(ex.created_at).toLocaleString("pt-BR")}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </TabsContent>
            </div>

            {/* ── Rodapé de ações ───────────────────────────────────────────── */}
            <div className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-slate-500 hover:text-rose-600"
                  onClick={handleReset}
                >
                  <RotateCcw className="size-3.5" />
                  Restaurar defaults
                </Button>

                <div className="flex items-center gap-2">
                  {saveOk && (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                      <CheckCircle2 className="size-3.5" />
                      Salvo
                    </span>
                  )}
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="gap-2 bg-slate-950 hover:bg-slate-800"
                    size="sm"
                  >
                    {saving ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Save className="size-3.5" />
                    )}
                    Salvar configuração
                  </Button>
                </div>
              </div>
            </div>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  )
}

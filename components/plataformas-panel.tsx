"use client"

import { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCopy,
  ExternalLink,
  Globe,
  KeyRound,
  Link2,
  MessageSquare,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Integration {
  id: string
  tenant_id: string
  source_system: string
  name: string
  description: string | null
  is_active: boolean
  rate_limit_per_minute: number
  base_url: string | null
  webhook_url: string | null
  auth_type: string
  has_auth_token: boolean
  outbound_active: boolean
  created_at: string
  updated_at: string
  last_run: {
    status: string
    started_at: string
    finished_at: string | null
    total_received: number
    total_processed: number
    total_failed: number
  } | null
  stats_24h: { received: number; processed: number; failed: number }
}

interface TestResult {
  ok: boolean | null
  latency_ms?: number
  status?: number
  error?: string
  url?: string
  skipped?: boolean
  reason?: string
}

interface FormState {
  // step 1 — identity
  name: string
  source_system: string
  description: string
  // step 2 — inbound (service → Cerebro): informational only, no config needed
  // step 3 — outbound (Cerebro → service)
  base_url: string
  webhook_url: string
  outbound_active: boolean
  auth_type: string
  auth_token: string
  // step 4 — limits
  rate_limit_per_minute: string
}

const EMPTY_FORM: FormState = {
  name: "",
  source_system: "",
  description: "",
  base_url: "",
  webhook_url: "",
  outbound_active: false,
  auth_type: "bearer",
  auth_token: "",
  rate_limit_per_minute: "120",
}

const PLATFORM_PRESETS: Array<{
  key: string
  name: string
  description: string
  icon: typeof MessageSquare
  base_url_hint: string
}> = [
  { key: "willtalk", name: "WillTalk", description: "WhatsApp e atendimento via chat", icon: MessageSquare, base_url_hint: "http://localhost:4002" },
  { key: "mtalk", name: "MTalk", description: "Plataforma de mensagens MTalk", icon: MessageSquare, base_url_hint: "http://localhost:4003" },
  { key: "mavo_gestao", name: "Mavo Gestão", description: "ERP e gestão operacional", icon: Activity, base_url_hint: "http://localhost:4004" },
  { key: "n8n", name: "n8n", description: "Automação de workflows", icon: Zap, base_url_hint: "http://localhost:5678" },
  { key: "custom", name: "Serviço personalizado", description: "Qualquer sistema externo via REST", icon: Globe, base_url_hint: "" },
]

const AUTH_TYPES = [
  { value: "bearer", label: "Bearer Token" },
  { value: "api_key", label: "API Key (X-Api-Key)" },
  { value: "basic", label: "Basic Auth (base64)" },
  { value: "none", label: "Sem autenticação" },
]

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function timeAgo(dateStr: string | null) {
  if (!dateStr) return null
  const diff = Date.now() - new Date(dateStr).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return "agora"
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h atrás`
  return `${Math.floor(h / 24)}d atrás`
}

function isRecentlyActive(dateStr: string | null) {
  if (!dateStr) return false
  return Date.now() - new Date(dateStr).getTime() < 24 * 60 * 60 * 1000
}

function copy(text: string, toast: ReturnType<typeof useToast>["toast"]) {
  navigator.clipboard.writeText(text).then(() => toast({ title: "Copiado!" }))
}

// ─── PingDot ──────────────────────────────────────────────────────────────────

function PingDot({ baseUrl, isActive }: { baseUrl: string | null; isActive: boolean }) {
  const [ping, setPing] = useState<{ ok: boolean; latency_ms?: number; error?: string } | null>(null)
  const [loading, setLoading] = useState(false)

  const runPing = useCallback(async () => {
    if (!isActive || !baseUrl) return
    setLoading(true)
    try {
      const res = await fetch("/api/integrations/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: baseUrl }),
      })
      setPing(await res.json())
    } catch {
      setPing({ ok: false, error: "Erro de rede" })
    } finally {
      setLoading(false)
    }
  }, [baseUrl, isActive])

  useEffect(() => {
    runPing()
    const interval = setInterval(runPing, 30000)
    return () => clearInterval(interval)
  }, [runPing])

  if (!isActive) return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <Circle className="size-2 fill-slate-300 text-slate-300" />
      Inativa
    </span>
  )
  if (!baseUrl) return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <Circle className="size-2 fill-amber-300 text-amber-300" />
      URL não configurada
    </span>
  )
  if (loading && !ping) return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <Spinner className="size-3" />
      Verificando...
    </span>
  )
  if (!ping) return null

  return (
    <button onClick={runPing} className="flex items-center gap-1.5 text-xs transition-opacity hover:opacity-70"
      title={ping.ok ? `Acessível — ${ping.latency_ms}ms` : ping.error || "Inacessível"}>
      {ping.ok ? (
        <>
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-emerald-700 font-medium">Online</span>
          {ping.latency_ms != null && <span className="text-slate-400">{ping.latency_ms}ms</span>}
        </>
      ) : (
        <>
          <WifiOff className="size-3 text-red-500" />
          <span className="text-red-600 font-medium">Offline</span>
        </>
      )}
    </button>
  )
}

// ─── TestResultBadge ──────────────────────────────────────────────────────────

function TestResultBadge({ result, label }: { result: TestResult; label: string }) {
  if (result.ok === null && result.skipped) {
    return <span className="text-xs text-slate-400">{label}: desativado</span>
  }
  if (result.ok === null) {
    return (
      <span className="flex items-center gap-1 text-xs text-amber-600">
        <AlertTriangle className="size-3" />
        {label}: {result.error}
      </span>
    )
  }
  if (result.ok) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
        <CheckCircle2 className="size-3" />
        {label}: OK {result.latency_ms != null ? `(${result.latency_ms}ms)` : ""}
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-xs text-red-600 font-medium">
      <WifiOff className="size-3" />
      {label}: {result.error || `HTTP ${result.status}`}
    </span>
  )
}

// ─── PlatformWizard ───────────────────────────────────────────────────────────

const STEPS = ["Identificação", "Entrada", "Saída", "Limites"]

function PlatformWizard({
  open,
  onOpenChange,
  initial,
  integrationId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: Partial<FormState>
  integrationId?: string
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, ...initial })
  const [customKey, setCustomKey] = useState(false)
  const isEdit = !!integrationId
  const cerebroBase = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000"

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY_FORM, ...initial })
      setStep(0)
      setCustomKey(false)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (delta: Partial<FormState>) => setForm((f) => ({ ...f, ...delta }))

  const handlePreset = (key: string) => {
    const preset = PLATFORM_PRESETS.find((p) => p.key === key)
    if (!preset) return
    patch({
      source_system: key === "custom" ? "" : key,
      name: key === "custom" ? "" : preset.name,
      description: key === "custom" ? "" : preset.description,
      base_url: key === "custom" ? "" : preset.base_url_hint,
    })
    setCustomKey(key === "custom")
  }

  const canNext = () => {
    if (step === 0) return form.name.trim() !== "" && form.source_system.trim() !== ""
    return true
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      const payload = {
        name: form.name,
        source_system: form.source_system,
        description: form.description,
        base_url: form.base_url,
        webhook_url: form.webhook_url,
        auth_type: form.auth_type,
        auth_token: form.auth_token,
        outbound_active: form.outbound_active,
        rate_limit_per_minute: Number(form.rate_limit_per_minute),
      }

      const res = await fetch(
        isEdit ? `/api/integrations/${integrationId}` : "/api/integrations",
        {
          method: isEdit ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Erro ao salvar")
      }

      toast({ title: isEdit ? "Plataforma atualizada" : "Plataforma adicionada", description: form.name })
      onOpenChange(false)
      onSaved()
    } catch (err) {
      toast({
        title: "Erro",
        description: err instanceof Error ? err.message : "Erro ao salvar",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const ingestEndpoint = `${cerebroBase}/api/ingestao/v1/events`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="size-4 text-emerald-600" />
            {isEdit ? "Editar plataforma" : "Adicionar serviço externo"}
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mt-1 mb-4">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <button
                onClick={() => i < step && setStep(i)}
                className={`flex size-6 items-center justify-center rounded-full text-[11px] font-semibold transition-colors
                  ${i === step ? "bg-slate-900 text-white" : i < step ? "bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600" : "bg-slate-100 text-slate-400"}`}
              >
                {i < step ? <CheckCircle2 className="size-3.5" /> : i + 1}
              </button>
              <span className={`hidden sm:inline text-xs ${i === step ? "font-semibold text-slate-900" : "text-slate-400"}`}>
                {s}
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="size-3.5 text-slate-300 mx-0.5" />}
            </div>
          ))}
        </div>

        {/* ── Step 0: Identificação ── */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de serviço</Label>
              <div className="grid grid-cols-1 gap-2">
                {PLATFORM_PRESETS.map((p) => {
                  const Icon = p.icon
                  const selected = form.source_system === p.key || (p.key === "custom" && customKey)
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => handlePreset(p.key)}
                      className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors
                        ${selected ? "border-emerald-400 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"}`}
                    >
                      <Icon className={`size-4 shrink-0 ${selected ? "text-emerald-600" : "text-slate-400"}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{p.name}</p>
                        <p className="text-[11px] text-slate-500 truncate">{p.description}</p>
                      </div>
                      {selected && <CheckCircle2 className="size-4 text-emerald-500 ml-auto shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {customKey && (
              <div className="space-y-2">
                <Label htmlFor="source_system">Identificador único do sistema</Label>
                <Input
                  id="source_system"
                  value={form.source_system}
                  onChange={(e) => patch({ source_system: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_") })}
                  placeholder="ex: meu_sistema_erp"
                />
                <p className="text-[11px] text-slate-400">Apenas letras minúsculas, números e underscores.</p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Nome de exibição</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Ex: WillTalk Produção"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrição (opcional)</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => patch({ description: e.target.value })}
                placeholder="Descreva o papel deste serviço..."
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
        )}

        {/* ── Step 1: Entrada (Service → Cerebro) ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600" />
                <p className="text-sm font-semibold text-emerald-800">Como o serviço envia dados para o Cérebro</p>
              </div>
              <p className="text-xs text-emerald-700">
                Configure na plataforma <strong>{form.name}</strong> os dados abaixo. O Cérebro vai receber e processar automaticamente.
              </p>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Endpoint</span>
                  <button
                    onClick={() => copy(ingestEndpoint, toast)}
                    className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800"
                  >
                    <ClipboardCopy className="size-3" /> Copiar
                  </button>
                </div>
                <code className="block rounded-lg bg-white border border-emerald-200 px-3 py-2 text-xs text-slate-700 break-all">
                  POST {ingestEndpoint}
                </code>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Header de autenticação</span>
                  <button
                    onClick={() => copy("Authorization: Bearer <CEREBRO_INGEST_TOKEN>", toast)}
                    className="flex items-center gap-1 text-[11px] text-emerald-600 hover:text-emerald-800"
                  >
                    <ClipboardCopy className="size-3" /> Copiar
                  </button>
                </div>
                <code className="block rounded-lg bg-white border border-emerald-200 px-3 py-2 text-xs text-slate-700">
                  Authorization: Bearer {"<CEREBRO_INGEST_TOKEN>"}
                </code>
              </div>

              <div className="space-y-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Payload mínimo</span>
                <code className="block rounded-lg bg-white border border-emerald-200 px-3 py-2 text-xs text-slate-700 whitespace-pre">{`{
  "source_system": "${form.source_system || "seu_sistema"}",
  "event_type": "ticket_created",
  "payload": { ... }
}`}</code>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="base_url">URL base do serviço externo</Label>
              <div className="relative">
                <Globe className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="base_url"
                  value={form.base_url}
                  onChange={(e) => patch({ base_url: e.target.value })}
                  placeholder="https://seu-servico.com ou http://localhost:4002"
                  className="pl-9"
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Usada para verificar se o serviço está online (ping de conectividade).
              </p>
            </div>
          </div>
        )}

        {/* ── Step 2: Saída (Cerebro → Service) ── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Ativar envio de eventos</p>
                <p className="text-xs text-slate-500">O Cérebro vai chamar o webhook deste serviço</p>
              </div>
              <Switch
                checked={form.outbound_active}
                onCheckedChange={(v) => patch({ outbound_active: v })}
              />
            </div>

            <div className={`space-y-4 transition-opacity ${form.outbound_active ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
              <div className="space-y-2">
                <Label htmlFor="webhook_url">URL do webhook</Label>
                <div className="relative">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="webhook_url"
                    value={form.webhook_url}
                    onChange={(e) => patch({ webhook_url: e.target.value })}
                    placeholder="https://seu-servico.com/api/webhook"
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tipo de autenticação</Label>
                <Select value={form.auth_type} onValueChange={(v) => patch({ auth_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AUTH_TYPES.map((a) => (
                      <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {form.auth_type !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="auth_token">
                    {form.auth_type === "bearer" && "Bearer Token"}
                    {form.auth_type === "api_key" && "API Key"}
                    {form.auth_type === "basic" && "Credencial (base64 user:senha)"}
                  </Label>
                  <div className="relative">
                    <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="auth_token"
                      type="password"
                      value={form.auth_token}
                      onChange={(e) => patch({ auth_token: e.target.value })}
                      placeholder={isEdit ? "Deixe em branco para manter o token atual" : "Token ou chave de acesso"}
                      className="pl-9"
                    />
                  </div>
                  {isEdit && (
                    <p className="text-[11px] text-slate-400">Token atual: {form.auth_token ? "alterado" : "preservado"}</p>
                  )}
                </div>
              )}
            </div>

            {!form.outbound_active && (
              <p className="text-xs text-slate-400 text-center py-2">
                Ative o envio acima para configurar o webhook de saída.
              </p>
            )}
          </div>
        )}

        {/* ── Step 3: Limites ── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
              <p className="text-sm font-medium text-slate-700">Resumo da configuração</p>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Serviço</span>
                  <span className="font-medium text-slate-800">{form.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Identificador</span>
                  <code className="text-slate-700">{form.source_system}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">URL base</span>
                  <span className="text-slate-700 truncate max-w-[180px]">{form.base_url || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Outbound</span>
                  <Badge variant={form.outbound_active ? "default" : "outline"} className="text-[10px] h-4">
                    {form.outbound_active ? "Ativo" : "Desativado"}
                  </Badge>
                </div>
                {form.outbound_active && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Autenticação</span>
                    <span className="text-slate-700">{AUTH_TYPES.find((a) => a.value === form.auth_type)?.label}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rate_limit">Limite de requisições por minuto</Label>
              <Input
                id="rate_limit"
                type="number"
                min={1}
                max={10000}
                value={form.rate_limit_per_minute}
                onChange={(e) => patch({ rate_limit_per_minute: e.target.value })}
              />
              <p className="text-[11px] text-slate-400">
                Máximo de eventos inbound aceitos por minuto. Padrão: 120.
              </p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)}
          >
            {step === 0 ? "Cancelar" : <><ArrowLeft className="size-4 mr-1" />Voltar</>}
          </Button>

          {step < STEPS.length - 1 ? (
            <Button size="sm" onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Próximo <ArrowRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleSave} disabled={loading}>
              {loading ? <Spinner className="size-4 mr-2" /> : null}
              {isEdit ? "Salvar alterações" : "Adicionar serviço"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── PlatformCard ─────────────────────────────────────────────────────────────

function PlatformCard({
  integration,
  onToggle,
  onDelete,
  onEdit,
}: {
  integration: Integration
  onToggle: (id: string, active: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onEdit: (integration: Integration) => void
}) {
  const { toast } = useToast()
  const recentlyActive = isRecentlyActive(integration.last_run?.started_at ?? null)
  const stats = integration.stats_24h ?? { received: 0, processed: 0, failed: 0 }
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ inbound: TestResult; outbound: TestResult } | null>(null)

  const preset = PLATFORM_PRESETS.find((p) => p.key === integration.source_system)
  const Icon = preset?.icon ?? Globe

  const runTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch(`/api/integrations/${integration.id}/test`, { method: "POST" })
      const data = await res.json()
      setTestResult(data.results)
    } catch {
      toast({ title: "Erro ao testar conexão", variant: "destructive" })
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card className="relative overflow-hidden border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className={`absolute inset-y-0 left-0 w-1 ${!integration.is_active ? "bg-slate-300" : recentlyActive ? "bg-emerald-400" : "bg-amber-400"}`} />

      <CardHeader className="pb-3 pl-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`flex size-10 items-center justify-center rounded-xl ${integration.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
              <Icon className="size-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900">{integration.name}</CardTitle>
              <p className="text-xs text-slate-500 max-w-[180px] truncate">
                {integration.description || preset?.description || integration.source_system}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-8 text-slate-400 hover:text-slate-700"
              onClick={() => onEdit(integration)} title="Editar">
              <Pencil className="size-3.5" />
            </Button>
            <Switch checked={integration.is_active} onCheckedChange={(v) => onToggle(integration.id, v)} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 text-slate-400 hover:text-red-500">
                  <Trash2 className="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remover {integration.name}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Remove a integração e todo o histórico. Esta ação não pode ser desfeita.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction className="bg-red-600 hover:bg-red-700" onClick={() => onDelete(integration.id)}>
                    Remover
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pl-6 space-y-3">
        {/* Connectivity */}
        <div className="flex items-center justify-between">
          <PingDot baseUrl={integration.base_url} isActive={integration.is_active} />
          <span className="text-xs text-slate-400">
            {integration.last_run?.started_at ? `Último evento ${timeAgo(integration.last_run.started_at)}` : "Sem atividade ainda"}
          </span>
        </div>

        {/* Stats 24h */}
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-slate-800">{stats.received}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Recebidos</p>
          </div>
          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-center">
            <p className="text-lg font-bold text-emerald-700">{stats.processed}</p>
            <p className="text-[10px] uppercase tracking-wide text-emerald-600">Processados</p>
          </div>
          <div className={`rounded-lg px-3 py-2 text-center ${stats.failed > 0 ? "bg-red-50" : "bg-slate-50"}`}>
            <p className={`text-lg font-bold ${stats.failed > 0 ? "text-red-600" : "text-slate-800"}`}>{stats.failed}</p>
            <p className={`text-[10px] uppercase tracking-wide ${stats.failed > 0 ? "text-red-500" : "text-slate-500"}`}>Falhas</p>
          </div>
        </div>

        {/* Config chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          {integration.base_url && (
            <a href={integration.base_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600 hover:border-slate-300 transition-colors">
              <Globe className="size-3" /> {new URL(integration.base_url.startsWith("http") ? integration.base_url : `http://${integration.base_url}`).host}
              <ExternalLink className="size-2.5 text-slate-400" />
            </a>
          )}
          {integration.outbound_active && (
            <span className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700">
              <Send className="size-3" /> Outbound ativo
            </span>
          )}
          {integration.has_auth_token && (
            <span className="flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
              <KeyRound className="size-3" /> Auth configurada
            </span>
          )}
          <Badge variant="outline" className="text-[10px] gap-1 h-5">
            <Settings className="size-2.5" /> {integration.rate_limit_per_minute} req/min
          </Badge>
          {recentlyActive && (
            <Badge className="text-[10px] gap-1 h-5 bg-emerald-100 text-emerald-700 border-emerald-200">
              <CheckCircle2 className="size-2.5" /> Ativo 24h
            </Badge>
          )}
        </div>

        {/* Test connection */}
        <div className="space-y-1.5">
          <Button size="sm" variant="outline" className="w-full h-8 text-xs gap-1.5" onClick={runTest} disabled={testing}>
            {testing ? <Spinner className="size-3" /> : <Wifi className="size-3" />}
            Testar conexão
          </Button>
          {testResult && (
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 space-y-1">
              <TestResultBadge result={testResult.inbound} label="Serviço externo" />
              <TestResultBadge result={testResult.outbound} label="Webhook saída" />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ─── PlatformasPanel ──────────────────────────────────────────────────────────

export function PlatformasPanel() {
  const { toast } = useToast()
  const { data, error, isLoading, mutate } = useSWR<{ data: Integration[] }>("/api/integrations", fetcher, {
    refreshInterval: 30000,
  })

  const integrations = data?.data ?? []
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Integration | null>(null)

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await fetch(`/api/integrations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: active }),
      })
      mutate()
      toast({ title: active ? "Plataforma ativada" : "Plataforma desativada" })
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/integrations/${id}`, { method: "DELETE" })
      mutate()
      toast({ title: "Plataforma removida" })
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" })
    }
  }

  const handleEdit = (integration: Integration) => {
    setEditTarget(integration)
  }

  const editInitial: Partial<FormState> | undefined = editTarget ? {
    name: editTarget.name,
    source_system: editTarget.source_system,
    description: editTarget.description ?? "",
    base_url: editTarget.base_url ?? "",
    webhook_url: editTarget.webhook_url ?? "",
    auth_type: editTarget.auth_type ?? "bearer",
    auth_token: "",
    outbound_active: editTarget.outbound_active,
    rate_limit_per_minute: String(editTarget.rate_limit_per_minute),
  } : undefined

  const activeCount = integrations.filter((i) => i.is_active).length
  const totalReceived24h = integrations.reduce((s, i) => s + (i.stats_24h?.received ?? 0), 0)
  const totalProcessed24h = integrations.reduce((s, i) => s + (i.stats_24h?.processed ?? 0), 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {activeCount > 0 ? (
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <Circle className="size-2.5 fill-slate-300 text-slate-300" />
          )}
          <span className="text-sm font-medium text-slate-600">
            {activeCount} de {integrations.length} plataforma{integrations.length !== 1 ? "s" : ""} ativa{activeCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={() => mutate()}>
            <RefreshCw className="size-3.5" /> Atualizar
          </Button>
          <Button className="gap-2 bg-slate-900 hover:bg-slate-800" onClick={() => setWizardOpen(true)}>
            <Plus className="size-4" /> Adicionar serviço
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold text-slate-900">{integrations.length}</p>
            <p className="text-xs text-slate-500 mt-0.5">Plataformas cadastradas</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold text-emerald-700">{totalProcessed24h}</p>
            <p className="text-xs text-slate-500 mt-0.5">Processados (24h)</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 bg-white shadow-sm col-span-2 sm:col-span-1">
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-2xl font-bold text-slate-900">{totalReceived24h}</p>
            <p className="text-xs text-slate-500 mt-0.5">Recebidos (24h)</p>
          </CardContent>
        </Card>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner className="size-6 text-slate-400" />
        </div>
      ) : error ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-800">
          <AlertTriangle className="size-5 shrink-0" />
          <p className="text-sm">Erro ao carregar plataformas. Verifique o banco de dados.</p>
        </div>
      ) : integrations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-16 text-center">
          <Network className="size-10 text-slate-300 mb-3" />
          <p className="font-medium text-slate-600">Nenhuma plataforma cadastrada</p>
          <p className="text-sm text-slate-400 mt-1 mb-4">Adicione um serviço externo para começar a receber dados.</p>
          <Button className="gap-2 bg-slate-900 hover:bg-slate-800" onClick={() => setWizardOpen(true)}>
            <Plus className="size-4" /> Adicionar primeiro serviço
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {integrations.map((integration) => (
            <PlatformCard
              key={integration.id}
              integration={integration}
              onToggle={handleToggle}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
          ))}
        </div>
      )}

      {/* Add wizard */}
      <PlatformWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onSaved={() => mutate()}
      />

      {/* Edit wizard */}
      <PlatformWizard
        open={!!editTarget}
        onOpenChange={(v) => !v && setEditTarget(null)}
        initial={editInitial}
        integrationId={editTarget?.id}
        onSaved={() => { mutate(); setEditTarget(null) }}
      />
    </div>
  )
}

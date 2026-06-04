"use client"

import { useCallback, useEffect, useState } from "react"
import useSWR from "swr"
import {
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  ClipboardCopy,
  Cpu,
  Database,
  ExternalLink,
  GitFork,
  Globe,
  Key,
  Link2,
  MessageSquare,
  Plus,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Terminal,
  Trash2,
  Webhook,
  WifiOff,
  Workflow,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Spinner } from "@/components/ui/spinner"

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomService {
  id: string
  name: string
  description: string
  url: string
  tags: string[]
  color: string
}

interface ServicePing {
  ok: boolean
  latency_ms?: number
  status?: number
  error?: string
}

interface ConfigData {
  ai: { baseUrl: string; model: string; provider: string; hasApiKey: boolean }
  embedding: { hasApiKey: boolean }
  security: {
    authRequired: boolean
    hasIngestToken: boolean
    hasInternalToken: boolean
    rateLimitPerMin: number
  }
  willtalk: { webhookUrl: string; replyWebhookUrl: string; autoReplyEnabled: boolean }
  services: {
    n8n: { baseUrl: string; webhookUrl: string; hasToken: boolean }
    willtalk: { baseUrl: string }
    cerebro: { baseUrl: string; ingestToken: string }
  }
  baseUrl: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CUSTOM_SERVICES_KEY = "hub_custom_services"

const COLOR_OPTIONS = [
  { value: "bg-orange-400", label: "Laranja", dot: "bg-orange-400" },
  { value: "bg-emerald-400", label: "Verde", dot: "bg-emerald-400" },
  { value: "bg-blue-400", label: "Azul", dot: "bg-blue-400" },
  { value: "bg-purple-400", label: "Roxo", dot: "bg-purple-400" },
  { value: "bg-red-400", label: "Vermelho", dot: "bg-red-400" },
  { value: "bg-amber-400", label: "Amarelo", dot: "bg-amber-400" },
  { value: "bg-slate-400", label: "Cinza", dot: "bg-slate-400" },
]

function useCustomServices() {
  const [services, setServices] = useState<CustomService[]>([])

  useEffect(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_SERVICES_KEY)
      if (stored) setServices(JSON.parse(stored))
    } catch {}
  }, [])

  const add = useCallback((data: Omit<CustomService, "id">) => {
    setServices((prev) => {
      const updated = [...prev, { ...data, id: crypto.randomUUID() }]
      localStorage.setItem(CUSTOM_SERVICES_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  const remove = useCallback((id: string) => {
    setServices((prev) => {
      const updated = prev.filter((s) => s.id !== id)
      localStorage.setItem(CUSTOM_SERVICES_KEY, JSON.stringify(updated))
      return updated
    })
  }, [])

  return { services, add, remove }
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function usePing(url: string | null, sourceSystem?: string, interval = 30000) {
  const [ping, setPing] = useState<ServicePing | null>(null)
  const [loading, setLoading] = useState(false)

  const run = useCallback(async () => {
    if (!url && !sourceSystem) return
    setLoading(true)
    try {
      const res = await fetch("/api/integrations/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sourceSystem ? { source_system: sourceSystem } : { url }),
      })
      setPing(await res.json())
    } catch {
      setPing({ ok: false, error: "Erro de rede" })
    } finally {
      setLoading(false)
    }
  }, [url, sourceSystem])

  useEffect(() => {
    run()
    const timer = setInterval(run, interval)
    return () => clearInterval(timer)
  }, [run, interval])

  return { ping, loading, refresh: run }
}

function PingIndicator({ ping, loading }: { ping: ServicePing | null; loading: boolean }) {
  if (loading && !ping) return <Spinner className="size-3 text-slate-400" />
  if (!ping) return <Circle className="size-2.5 fill-slate-200 text-slate-200" />
  if (ping.ok) return (
    <span className="relative flex size-2.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
    </span>
  )
  return <WifiOff className="size-3.5 text-red-400" />
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <button
      onClick={copy}
      title={`Copiar ${label || value}`}
      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <ClipboardCopy className="size-3" />}
      {copied ? "Copiado!" : "Copiar"}
    </button>
  )
}

function CodeLine({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const display = secret ? (value ? "••••••••" : "não configurado") : (value || "não configurado")
  const hasValue = !!value

  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-xs">
      <span className="text-slate-500 shrink-0 w-40">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <code className={`truncate font-mono ${hasValue ? "text-slate-700" : "text-red-400 italic"}`}>
          {display}
        </code>
        {hasValue && !secret && <CopyButton value={value} label={label} />}
      </div>
    </div>
  )
}

// ─── Service Card ─────────────────────────────────────────────────────────────

interface ServiceCardProps {
  icon: typeof Server
  name: string
  description: string
  url: string | null
  ping: ServicePing | null
  pingLoading: boolean
  onRefresh: () => void
  color: string
  tags?: string[]
  onDelete?: () => void
}

function ServiceCard({ icon: Icon, name, description, url, ping, pingLoading, onRefresh, color, tags, onDelete }: ServiceCardProps) {
  return (
    <Card className="relative overflow-hidden border-slate-200 bg-white shadow-sm">
      <div className={`absolute inset-y-0 left-0 w-1 ${color}`} />
      <CardContent className="pl-5 pt-4 pb-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100">
              <Icon className="size-4 text-slate-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm text-slate-900">{name}</p>
                <PingIndicator ping={ping} loading={pingLoading} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{description}</p>
            </div>
          </div>

          <div className="flex gap-1.5 shrink-0">
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-slate-300 hover:text-red-400 hover:bg-red-50"
                onClick={onDelete}
                title="Remover serviço"
              >
                <Trash2 className="size-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="size-7 text-slate-400" onClick={onRefresh}>
              <RefreshCw className="size-3" />
            </Button>
            {url && (
              <Button
                size="sm"
                className="h-7 gap-1.5 text-xs bg-slate-900 hover:bg-slate-800"
                onClick={() => window.open(url, "_blank")}
              >
                Acessar
                <ArrowUpRight className="size-3" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {ping ? (
            ping.ok ? (
              <>
                <Badge className="text-[10px] gap-1 bg-emerald-100 text-emerald-700 border-emerald-200">
                  <CheckCircle2 className="size-2.5" />
                  Online {ping.latency_ms != null ? `· ${ping.latency_ms}ms` : ""}
                </Badge>
              </>
            ) : (
              <Badge className="text-[10px] gap-1 bg-red-100 text-red-600 border-red-200">
                <WifiOff className="size-2.5" />
                Inacessível
              </Badge>
            )
          ) : (
            <Badge variant="outline" className="text-[10px] text-slate-400">
              Verificando...
            </Badge>
          )}
          {tags?.map((t) => (
            <Badge key={t} variant="outline" className="text-[10px] text-slate-500">
              {t}
            </Badge>
          ))}
        </div>

        {url && (
          <div className="flex items-center gap-1.5 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-1.5">
            <Link2 className="size-3 shrink-0 text-slate-400" />
            <code className="text-[11px] text-slate-600 truncate flex-1">{url}</code>
            <CopyButton value={url} label="URL" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Custom Service Card ──────────────────────────────────────────────────────

function CustomServiceCard({ service, onDelete }: { service: CustomService; onDelete: () => void }) {
  const { ping, loading, refresh } = usePing(service.url)
  return (
    <ServiceCard
      icon={Globe}
      name={service.name}
      description={service.description}
      url={service.url}
      ping={ping}
      pingLoading={loading}
      onRefresh={refresh}
      color={service.color}
      tags={service.tags}
      onDelete={onDelete}
    />
  )
}

// ─── Add Service Dialog ───────────────────────────────────────────────────────

function AddServiceDialog({ onAdd }: { onAdd: (s: Omit<CustomService, "id">) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [url, setUrl] = useState("")
  const [description, setDescription] = useState("")
  const [tags, setTags] = useState("")
  const [color, setColor] = useState("bg-blue-400")

  const reset = () => {
    setName(""); setUrl(""); setDescription(""); setTags(""); setColor("bg-blue-400")
  }

  const handleSubmit = () => {
    if (!name.trim() || !url.trim()) return
    onAdd({
      name: name.trim(),
      url: url.trim(),
      description: description.trim(),
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      color,
    })
    reset()
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset() }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs border-dashed">
          <Plus className="size-3" />
          Adicionar serviço
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold">Adicionar serviço externo</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="space-y-1">
            <Label className="text-xs">Nome <span className="text-red-400">*</span></Label>
            <Input
              placeholder="Ex: Grafana, Metabase..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">URL de acesso <span className="text-red-400">*</span></Label>
            <Input
              placeholder="http://localhost:3001"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="h-8 text-sm font-mono"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Descrição</Label>
            <Input
              placeholder="Breve descrição do serviço"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tags <span className="text-slate-400 font-normal">(separadas por vírgula)</span></Label>
            <Input
              placeholder="monitoramento, banco, api"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className="h-8 text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Cor do card</Label>
            <div className="flex gap-2 flex-wrap">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  onClick={() => setColor(c.value)}
                  className={`size-6 rounded-full ${c.dot} transition-all ${
                    color === c.value ? "ring-2 ring-offset-2 ring-slate-400 scale-110" : "opacity-70 hover:opacity-100"
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="h-8 text-xs">Cancelar</Button>
          </DialogClose>
          <Button
            size="sm"
            className="h-8 text-xs bg-slate-900 hover:bg-slate-800"
            onClick={handleSubmit}
            disabled={!name.trim() || !url.trim()}
          >
            <Plus className="size-3 mr-1" />
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Guide Section ────────────────────────────────────────────────────────────

function GuideStep({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
        {number}
      </div>
      <div className="flex-1 space-y-1 pb-4">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <div className="text-xs text-slate-600 space-y-1.5">{children}</div>
      </div>
    </div>
  )
}

// ─── N8n Config Tab ───────────────────────────────────────────────────────────

function N8nConfigTab({ config }: { config: ConfigData | undefined }) {
  const n8n = config?.services?.n8n
  const cerebro = config?.services?.cerebro
  const cerebroBase = cerebro?.baseUrl || "http://localhost:3000"

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Webhook className="size-3.5" />
          Variáveis de ambiente do n8n (no painel do n8n)
        </p>
        <div className="divide-y divide-slate-100">
          <CodeLine label="CEREBRO_BASE_URL" value={cerebroBase} />
          <CodeLine label="CEREBRO_INGEST_URL" value={`${cerebroBase}/api/ingestao/v1/events`} />
          <CodeLine label="CEREBRO_ORCHESTRATOR_URL" value={`${cerebroBase}/api/orquestrador/v1/mensagem`} />
          <CodeLine label="Token (Bearer)" value="→ mesmo valor de CEREBRO_INGEST_TOKEN" secret />
        </div>
      </div>

      <div className="space-y-0">
        <GuideStep number={1} title="Acesse o n8n">
          <p>Clique em <strong>Acessar n8n</strong> acima para abrir o painel de workflows.</p>
          {n8n?.baseUrl && (
            <div className="flex items-center gap-2 mt-1">
              <code className="text-slate-600 text-[11px]">{n8n.baseUrl}</code>
              <Button size="sm" variant="outline" className="h-6 text-[10px] gap-1" onClick={() => window.open(n8n.baseUrl, "_blank")}>
                <ExternalLink className="size-2.5" />
                Abrir
              </Button>
            </div>
          )}
        </GuideStep>

        <Separator />

        <GuideStep number={2} title="Configure o webhook de entrada do Cérebro">
          <p>No n8n, crie um <strong>Webhook node</strong> e configure:</p>
          <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-3 space-y-1">
            <CodeLine label="Method" value="POST" />
            <CodeLine label="Authentication" value="Header Auth" />
            <CodeLine label="Header Name" value="Authorization" />
            <CodeLine label="Header Value" value="Bearer <CEREBRO_INGEST_TOKEN>" />
          </div>
        </GuideStep>

        <Separator />

        <GuideStep number={3} title="Configure o HTTP Request para o Cérebro">
          <p>Adicione um <strong>HTTP Request node</strong> após o trigger:</p>
          <div className="mt-1.5 rounded-lg border border-slate-200 bg-white p-3 space-y-1">
            <CodeLine label="Method" value="POST" />
            <CodeLine label="URL" value={`${cerebroBase}/api/ingestao/v1/events`} />
            <CodeLine label="Auth header" value={`Bearer <CEREBRO_INGEST_TOKEN>`} secret />
            <CodeLine label="Content-Type" value="application/json" />
          </div>
        </GuideStep>

        <Separator />

        <GuideStep number={4} title="Payload mínimo esperado">
          <div className="mt-1 rounded-lg border border-slate-200 bg-white p-3">
            <pre className="text-[10px] text-slate-600 overflow-auto">
{`{
  "cliente": "Nome do cliente",
  "tecnico": "Responsável",
  "texto_original": "Descrição completa",
  "canal": "whatsapp",
  "ticket_id": "ID-opcional"
}`}
            </pre>
          </div>
        </GuideStep>
      </div>
    </div>
  )
}

// ─── WillTalk Config Tab ──────────────────────────────────────────────────────

function WillTalkConfigTab({ config }: { config: ConfigData | undefined }) {
  const cerebro = config?.services?.cerebro
  const cerebroBase = cerebro?.baseUrl || "http://localhost:3000"
  const willtalkBase = config?.services?.willtalk?.baseUrl || "http://localhost:4002"

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-1.5">
        <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
          <Settings className="size-3.5" />
          Variáveis de ambiente do WillTalk (.env)
        </p>
        <div className="divide-y divide-slate-100">
          <CodeLine label="CEREBRO_BASE_URL" value={cerebroBase} />
          <CodeLine label="CEREBRO_ORCHESTRATOR_URL" value={cerebroBase} />
          <CodeLine label="CEREBRO_ORCHESTRATOR_TOKEN" value="→ mesmo valor de CEREBRO_INGEST_TOKEN" secret />
          <CodeLine label="CEREBRO_INGEST_TOKEN" value="→ mesmo valor de CEREBRO_INGEST_TOKEN" secret />
          <CodeLine label="CEREBRO_INGESTAO_URL" value={`${cerebroBase}/api/ingestao/willtalk`} />
          <CodeLine label="WILLTALK_AUTO_REPLY_ENABLED" value="true" />
        </div>
      </div>

      <div className="space-y-0">
        <GuideStep number={1} title="Reinicie o WillTalk após alterar .env">
          <div className="mt-1 rounded-lg border border-slate-100 bg-slate-900 px-3 py-2">
            <code className="text-emerald-400 text-[11px]">
              cd C:\willydev\willtalk && npm run dev
            </code>
          </div>
        </GuideStep>

        <Separator />

        <GuideStep number={2} title="Verifique o orquestrador">
          <p>O WillTalk chama o endpoint abaixo para cada mensagem recebida:</p>
          <CodeLine label="POST" value={`${cerebroBase}/api/orquestrador/v1/mensagem`} />
        </GuideStep>

        <Separator />

        <GuideStep number={3} title="Auto-reply configurado">
          <p>O Cérebro responde via:</p>
          <CodeLine label="Reply URL" value={config?.willtalk?.replyWebhookUrl || `${willtalkBase}/api/webhooks/cerebro/reply`} />
          <p className="mt-1">Auto-reply: <strong>{config?.willtalk?.autoReplyEnabled ? "ATIVO" : "INATIVO"}</strong></p>
        </GuideStep>

        <Separator />

        <GuideStep number={4} title="Token de autenticação">
          <p>Tanto o Cérebro quanto o WillTalk devem usar o <strong>mesmo token</strong>:</p>
          <div className="mt-1 rounded-lg border border-slate-200 bg-white p-3">
            <CodeLine label="Cerebro .env.local" value="CEREBRO_INGEST_TOKEN=..." secret />
            <CodeLine label="WillTalk .env" value="CEREBRO_ORCHESTRATOR_TOKEN=..." secret />
            <p className="text-slate-500 mt-1">Os dois valores devem ser idênticos.</p>
          </div>
        </GuideStep>
      </div>
    </div>
  )
}

// ─── Cerebro Endpoints Tab ────────────────────────────────────────────────────

function CerebroEndpointsTab({ config }: { config: ConfigData | undefined }) {
  const base = config?.services?.cerebro?.baseUrl || config?.baseUrl || "http://localhost:3000"

  const endpoints = [
    { method: "POST", path: "/api/orquestrador/v1/mensagem", label: "Orquestrador (triagem + IA)", auth: true },
    { method: "POST", path: "/api/ingestao/v1/events", label: "Ingestão genérica (qualquer plataforma)", auth: true },
    { method: "POST", path: "/api/ingestao/willtalk", label: "Ingestão WillTalk", auth: true },
    { method: "POST", path: "/api/ingestao/mtalk", label: "Ingestão MTalk", auth: true },
    { method: "POST", path: "/api/busca-semantica", label: "Busca semântica RAG", auth: false },
    { method: "POST", path: "/api/query/v1", label: "Query unificada (busca + resposta IA)", auth: false },
    { method: "GET", path: "/api/health", label: "Health check completo", auth: false },
    { method: "GET", path: "/api/metricas", label: "Métricas operacionais", auth: false },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-2 mb-2">
          <Server className="size-3.5 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">Base URL do Cérebro</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <code className="text-sm font-medium text-slate-800 flex-1">{base}</code>
          <CopyButton value={base} label="Base URL" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
          <Webhook className="size-3.5" />
          Endpoints disponíveis
        </p>
        {endpoints.map((ep) => (
          <div key={ep.path} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white px-3 py-2.5">
            <Badge
              className={`text-[10px] font-mono mt-0.5 shrink-0 ${ep.method === "POST" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}
            >
              {ep.method}
            </Badge>
            <div className="min-w-0 flex-1">
              <code className="text-xs text-slate-700">{ep.path}</code>
              <p className="text-[11px] text-slate-500 mt-0.5">{ep.label}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {ep.auth && (
                <Badge variant="outline" className="text-[10px] gap-1 text-amber-600 border-amber-200">
                  <Key className="size-2.5" />
                  Bearer
                </Badge>
              )}
              <CopyButton value={`${base}${ep.path}`} label="URL" />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" />
          Autenticação (endpoints com Bearer)
        </p>
        <p className="text-xs text-emerald-700">
          Header: <code className="font-mono bg-emerald-100 px-1 rounded">Authorization: Bearer {"<CEREBRO_INGEST_TOKEN>"}</code>
        </p>
        <p className="text-xs text-emerald-600">
          Configure <code className="font-mono">CEREBRO_INGEST_TOKEN</code> no <code className="font-mono">.env.local</code> do Cérebro e use o mesmo valor em todas as integrações.
        </p>
      </div>
    </div>
  )
}

// ─── HubPanel ─────────────────────────────────────────────────────────────────

export function HubPanel() {
  const { data: config, isLoading: configLoading } = useSWR<ConfigData>("/api/config", fetcher, {
    refreshInterval: 60000,
  })

  const n8nBase = config?.services?.n8n?.baseUrl || "http://localhost:5678"
  const willtalkBase = config?.services?.willtalk?.baseUrl || "http://localhost:4002"

  const n8n = usePing(n8nBase, undefined)
  const willtalk = usePing(null, "willtalk")

  const { services: customServices, add: addCustomService, remove: removeCustomService } = useCustomServices()

  const builtinServices = [
    {
      icon: Workflow,
      name: "n8n",
      description: "Automação de workflows e orquestração de dados",
      url: n8nBase,
      ping: n8n.ping,
      pingLoading: n8n.loading,
      onRefresh: n8n.refresh,
      color: "bg-orange-400",
      tags: ["workflows", "webhooks", "automação"],
    },
    {
      icon: MessageSquare,
      name: "WillTalk",
      description: "Central de atendimento WhatsApp + triagem IA",
      url: willtalkBase,
      ping: willtalk.ping,
      pingLoading: willtalk.loading,
      onRefresh: willtalk.refresh,
      color: "bg-emerald-400",
      tags: ["whatsapp", "atendimento", "orquestrador"],
    },
  ]

  return (
    <div className="space-y-8">
      {/* Serviços externos */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Serviços externos</h2>
            <p className="text-xs text-slate-500 mt-0.5">Acesso direto aos serviços do ecossistema Mavo AI</p>
          </div>
          <div className="flex items-center gap-3">
            <AddServiceDialog onAdd={addCustomService} />
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <RefreshCw className="size-3" />
              Atualiza a cada 30s
            </div>
          </div>
        </div>

        {configLoading ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-5 text-slate-400" />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {builtinServices.map((s) => (
              <ServiceCard key={s.name} {...s} />
            ))}
            {customServices.map((s) => (
              <CustomServiceCard key={s.id} service={s} onDelete={() => removeCustomService(s.id)} />
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Guia de configuração */}
      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <BookOpen className="size-4 text-slate-500" />
            Configuração do Mavo AI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Guia completo para conectar todos os serviços ao Cérebro Operacional
          </p>
        </div>

        <Tabs defaultValue="cerebro">
          <TabsList className="w-full justify-start flex-wrap h-auto gap-1 bg-slate-100 p-1 rounded-lg">
            <TabsTrigger value="cerebro" className="gap-1.5 text-xs data-[state=active]:bg-white">
              <Server className="size-3.5" />
              Endpoints do Cérebro
            </TabsTrigger>
            <TabsTrigger value="n8n" className="gap-1.5 text-xs data-[state=active]:bg-white">
              <GitFork className="size-3.5" />
              n8n
            </TabsTrigger>
            <TabsTrigger value="willtalk" className="gap-1.5 text-xs data-[state=active]:bg-white">
              <MessageSquare className="size-3.5" />
              WillTalk
            </TabsTrigger>
            <TabsTrigger value="env" className="gap-1.5 text-xs data-[state=active]:bg-white">
              <Terminal className="size-3.5" />
              .env Reference
            </TabsTrigger>
          </TabsList>

          <div className="mt-4">
            <TabsContent value="cerebro" className="mt-0">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Server className="size-4 text-slate-500" />
                    Endpoints do Cérebro Operacional
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <CerebroEndpointsTab config={config} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="n8n" className="mt-0">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <GitFork className="size-4 text-slate-500" />
                    Configurar n8n → Cérebro
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <N8nConfigTab config={config} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="willtalk" className="mt-0">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <MessageSquare className="size-4 text-slate-500" />
                    Configurar WillTalk ↔ Cérebro
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <WillTalkConfigTab config={config} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="env" className="mt-0">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Terminal className="size-4 text-slate-500" />
                    Referência de variáveis de ambiente
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <EnvReferenceTab config={config} />
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </section>

      {/* Status rápido do sistema */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
          <Zap className="size-4 text-slate-500" />
          Status rápido
        </h2>
        <QuickStatus config={config} loading={configLoading} />
      </section>
    </div>
  )
}

// ─── Env Reference Tab ────────────────────────────────────────────────────────

function EnvReferenceTab({ config }: { config: ConfigData | undefined }) {
  const base = config?.services?.cerebro?.baseUrl || "http://localhost:3000"

  const sections = [
    {
      title: "Cérebro (.env.local)",
      icon: Server,
      vars: [
        { key: "DATABASE_URL", example: "postgresql://postgres:senha@localhost:5433/mavoai", required: true },
        { key: "AI_BASE_URL", example: "https://api.groq.com/openai/v1", required: true },
        { key: "AI_API_KEY", example: "gsk_...", required: true, secret: true },
        { key: "AI_CHAT_MODEL", example: "meta-llama/llama-4-scout-17b-16e-instruct", required: false },
        { key: "CEREBRO_INGEST_TOKEN", example: "token-secreto-forte", required: true, secret: true },
        { key: "INTEGRATION_AUTH_REQUIRED", example: "true", required: true },
        { key: "NEXT_PUBLIC_BASE_URL", example: base, required: true },
        { key: "WILLTALK_REPLY_WEBHOOK_URL", example: "http://localhost:4002/api/webhooks/cerebro/reply", required: false },
      ],
    },
    {
      title: "WillTalk (.env)",
      icon: MessageSquare,
      vars: [
        { key: "CEREBRO_BASE_URL", example: base, required: true },
        { key: "CEREBRO_ORCHESTRATOR_URL", example: base, required: true },
        { key: "CEREBRO_ORCHESTRATOR_TOKEN", example: "→ mesmo que CEREBRO_INGEST_TOKEN", required: true, secret: true },
        { key: "CEREBRO_INGEST_TOKEN", example: "→ mesmo que CEREBRO_INGEST_TOKEN", required: true, secret: true },
        { key: "WILLTALK_AI_TRIAGE_ONLY", example: "true", required: false },
        { key: "WILLTALK_AUTO_REPLY_ENABLED", example: "true", required: false },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <p className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <section.icon className="size-3.5" />
            {section.title}
          </p>
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Variável</th>
                  <th className="text-left px-3 py-2 text-slate-500 font-medium">Exemplo</th>
                  <th className="px-3 py-2 text-center text-slate-500 font-medium w-20">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {section.vars.map((v) => (
                  <tr key={v.key} className="bg-white">
                    <td className="px-3 py-2">
                      <code className="font-mono text-slate-800">{v.key}</code>
                    </td>
                    <td className="px-3 py-2">
                      <code className={`font-mono ${v.secret ? "text-slate-400 italic" : "text-slate-600"}`}>
                        {v.secret ? "••••••••" : v.example}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Badge
                        className={`text-[10px] ${v.required ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {v.required ? "Obrigatório" : "Opcional"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Quick Status ─────────────────────────────────────────────────────────────

function QuickStatus({ config, loading }: { config: ConfigData | undefined; loading: boolean }) {
  if (loading) return <Spinner className="size-4 text-slate-400" />

  const checks = [
    { label: "Chave de IA configurada", ok: config?.ai?.hasApiKey ?? false },
    { label: "Token de ingestão configurado", ok: config?.security?.hasIngestToken ?? false },
    { label: "Auth obrigatória (seguro)", ok: config?.security?.authRequired ?? false },
    { label: "Auto-reply WillTalk ativo", ok: config?.willtalk?.autoReplyEnabled ?? false },
    { label: "Embedding configurado", ok: config?.embedding?.hasApiKey ?? false },
  ]

  const score = checks.filter((c) => c.ok).length

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-800">
          Prontidão do sistema: {score}/{checks.length}
        </p>
        <Badge
          className={`text-xs ${
            score === checks.length
              ? "bg-emerald-100 text-emerald-700"
              : score >= 3
              ? "bg-amber-100 text-amber-700"
              : "bg-red-100 text-red-600"
          }`}
        >
          {score === checks.length ? "Pronto" : score >= 3 ? "Parcial" : "Incompleto"}
        </Badge>
      </div>

      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            score === checks.length ? "bg-emerald-500" : score >= 3 ? "bg-amber-400" : "bg-red-400"
          }`}
          style={{ width: `${(score / checks.length) * 100}%` }}
        />
      </div>

      <div className="space-y-1.5">
        {checks.map((c) => (
          <div key={c.label} className="flex items-center gap-2 text-xs">
            {c.ok ? (
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="size-3.5 text-slate-300 shrink-0" />
            )}
            <span className={c.ok ? "text-slate-700" : "text-slate-400"}>{c.label}</span>
            {!c.ok && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 ml-auto">
                configurar
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

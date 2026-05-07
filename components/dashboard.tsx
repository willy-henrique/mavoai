"use client"

import useSWR from "swr"
import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  Cpu,
  Database,
  FileText,
  Gauge,
  HardDrive,
  Layers3,
  LineChart as LineChartIcon,
  RefreshCw,
  Server,
  Sparkles,
  Users,
} from "lucide-react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const COLORS = [
  "hsl(171 78% 40%)",
  "hsl(217 91% 60%)",
  "hsl(38 92% 50%)",
  "hsl(347 77% 55%)",
  "hsl(262 83% 58%)",
]

interface IngestaoLog {
  id: string
  origem: string
  status: string
  created_at: string
  detalhes: Record<string, unknown> | null
}

interface MetricasData {
  supabaseOnline?: boolean
  ultimaAtualizacao?: string
  totalAtendimentos?: number
  processados?: number
  pendentes?: number
  saude?: {
    embedding_coverage?: number | null
    com_embedding?: number
    pendentes_acumulados?: number
    audit_errors_24h?: number | null
    alerta_embedding?: boolean
    alerta_backlog?: boolean
    alerta_erros?: boolean
  }
  porCategoria?: Array<{ nome: string; total: number }>
  porTecnico?: Array<{ nome: string; total: number }>
  porDia?: Array<{ data: string; total: number }>
  ultimasIngestoes?: IngestaoLog[]
}

interface HealthStatus {
  status?: "healthy" | "degraded" | "unhealthy"
  postgres?: boolean
  checks?: {
    postgres?: {
      ok?: boolean
      latency_ms?: number
    }
    ai_chat?: {
      ok?: boolean
      provider?: string
      model?: string
      latency_ms?: number
    }
    embedding?: {
      ok?: boolean
      latency_ms?: number
    }
    pgvector_rpc?: {
      ok?: boolean
    }
  }
  supabase?: boolean
  groq: boolean
  embedding: boolean
}

export function Dashboard() {
  const { data, error, isLoading } = useSWR<MetricasData>(
    "/api/metricas",
    fetcher,
    {
      refreshInterval: 30000,
    },
  )

  const { data: health } = useSWR<HealthStatus>("/api/health", fetcher, {
    refreshInterval: 60000,
  })

  if (isLoading) {
    return (
      <div className="grid min-h-[32rem] place-items-center rounded-lg border border-slate-200 bg-white/80 shadow-sm">
        <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
          <Spinner className="size-5" />
          Carregando painel operacional
        </div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-rose-800 shadow-sm">
        Erro ao carregar métricas.
      </div>
    )
  }

  const postgresOnline = data?.supabaseOnline !== false
  const postgresHealthOk =
    health?.checks?.postgres?.ok ?? health?.postgres ?? health?.supabase ?? false
  const totalAtendimentos = data?.totalAtendimentos ?? 0
  const processados = data?.processados ?? 0
  const pendentes = data?.pendentes ?? 0
  const tecnicosAtivos = data?.porTecnico?.length ?? 0
  const coverage = data?.saude?.embedding_coverage
  const coveragePct =
    typeof coverage === "number" ? Math.round(coverage * 100) : null
  const processedPct =
    totalAtendimentos > 0
      ? Math.round((processados / totalAtendimentos) * 100)
      : 0
  const pendingPct =
    totalAtendimentos > 0 ? Math.round((pendentes / totalAtendimentos) * 100) : 0
  const alertCount = [
    !postgresOnline,
    data?.saude?.alerta_embedding,
    data?.saude?.alerta_backlog,
    data?.saude?.alerta_erros,
  ].filter(Boolean).length

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <BrainCircuit className="size-3.5" />
            Orquestrador WillTalk
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            Dashboard executivo
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Triagem, ingestão, RAG e saúde operacional em tempo quase real.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill
            ok={postgresHealthOk}
            icon={Database}
            label="PostgreSQL"
            detail={formatLatency(health?.checks?.postgres?.latency_ms)}
          />
          <StatusPill
            ok={!!health?.groq}
            icon={Cpu}
            label={providerLabel(health)}
            detail={formatLatency(health?.checks?.ai_chat?.latency_ms)}
          />
          <StatusPill
            ok={!!health?.embedding}
            icon={HardDrive}
            label="Embedding"
            detail={formatLatency(health?.checks?.embedding?.latency_ms)}
          />
          {data?.ultimaAtualizacao && (
            <span className="inline-flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-xs font-medium text-slate-500 shadow-sm">
              <RefreshCw className="size-3.5" />
              {new Date(data.ultimaAtualizacao).toLocaleTimeString("pt-BR")}
            </span>
          )}
        </div>
      </div>

      {!postgresOnline && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 shadow-sm">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Banco de dados indisponível</p>
            <p className="text-sm text-amber-800/80">
              PostgreSQL fora do ar. Os dados abaixo podem estar desatualizados.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title="Total de atendimentos"
          value={totalAtendimentos.toLocaleString("pt-BR")}
          detail={`${processedPct}% processados`}
          icon={FileText}
          tone="blue"
          progress={processedPct}
        />
        <MetricCard
          title="Processados"
          value={processados.toLocaleString("pt-BR")}
          detail={`${coveragePct ?? 0}% com embedding`}
          icon={CheckCircle2}
          tone="emerald"
          progress={coveragePct ?? 0}
        />
        <MetricCard
          title="Pendentes"
          value={pendentes.toLocaleString("pt-BR")}
          detail={`${pendingPct}% do volume`}
          icon={Clock3}
          tone="amber"
          progress={pendingPct}
        />
        <MetricCard
          title="Alertas operacionais"
          value={String(alertCount)}
          detail={`${tecnicosAtivos} técnicos ativos`}
          icon={Gauge}
          tone={alertCount > 0 ? "rose" : "slate"}
          progress={alertCount > 0 ? Math.min(alertCount * 25, 100) : 100}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.65fr)]">
        <Card className="rounded-lg border-slate-200 bg-white/95 shadow-sm">
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <LineChartIcon className="size-4 text-blue-600" />
                Atendimentos nos últimos 7 dias
              </CardTitle>
              <CardDescription>Volume diário registrado no Cérebro.</CardDescription>
            </div>
            <Badge variant="outline" className="bg-slate-50">
              7 dias
            </Badge>
          </CardHeader>
          <CardContent>
            {data?.porDia && data.porDia.length > 0 ? (
              <div className="h-[21rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={data.porDia}
                    margin={{ top: 10, right: 18, left: -12, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(214 32% 91%)" />
                    <XAxis
                      dataKey="data"
                      tick={{ fontSize: 12, fill: "hsl(215 16% 47%)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: "hsl(215 16% 47%)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(214 32% 91%)",
                        boxShadow: "0 12px 32px rgb(15 23 42 / 0.12)",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="total"
                      stroke="hsl(217 91% 60%)"
                      strokeWidth={3}
                      dot={{ r: 3, fill: "hsl(217 91% 60%)" }}
                      activeDot={{ r: 6 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={LineChartIcon}
                title="Sem dados no período"
                description="Os atendimentos recentes aparecerão aqui."
              />
            )}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 bg-white/95 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers3 className="size-4 text-emerald-600" />
              Distribuição por categoria
            </CardTitle>
            <CardDescription>Casos processados por classificação.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.porCategoria && data.porCategoria.length > 0 ? (
              <div className="grid gap-5 md:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-1">
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.porCategoria}
                        cx="50%"
                        cy="50%"
                        innerRadius={52}
                        outerRadius={88}
                        paddingAngle={3}
                        dataKey="total"
                        nameKey="nome"
                      >
                        {data.porCategoria.map((item, index) => (
                          <Cell
                            key={item.nome}
                            fill={COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: "1px solid hsl(214 32% 91%)",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-3">
                  {data.porCategoria.slice(0, 5).map((item, index) => (
                    <RankRow
                      key={item.nome}
                      label={item.nome}
                      value={item.total}
                      color={COLORS[index % COLORS.length]}
                    />
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={Layers3}
                title="Sem categorias"
                description="As classificações surgirão após o processamento."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
        <Card className="rounded-lg border-slate-200 bg-white/95 shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="size-4 text-violet-600" />
              Atendimentos por técnico
            </CardTitle>
            <CardDescription>Top 10 responsáveis por volume.</CardDescription>
          </CardHeader>
          <CardContent>
            {data?.porTecnico && data.porTecnico.length > 0 ? (
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={data.porTecnico}
                    layout="vertical"
                    margin={{ top: 4, right: 20, left: 8, bottom: 4 }}
                  >
                    <CartesianGrid
                      horizontal={false}
                      strokeDasharray="3 3"
                      stroke="hsl(214 32% 91%)"
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 12, fill: "hsl(215 16% 47%)" }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      dataKey="nome"
                      type="category"
                      width={118}
                      tick={{ fontSize: 12, fill: "hsl(215 16% 47%)" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v: string) =>
                        v.length > 15 ? `${v.slice(0, 15)}...` : v
                      }
                    />
                    <Tooltip
                      cursor={{ fill: "hsl(210 40% 96%)" }}
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid hsl(214 32% 91%)",
                      }}
                    />
                    <Bar
                      dataKey="total"
                      fill="hsl(262 83% 58%)"
                      radius={[0, 6, 6, 0]}
                      maxBarSize={26}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="Sem volume por técnico"
                description="Os responsáveis aparecerão após os registros."
              />
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-1">
          <Card className="rounded-lg border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Server className="size-4 text-slate-700" />
                Saúde do Cérebro
              </CardTitle>
              <CardDescription>Banco, IA, embedding e auditoria.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <HealthRow
                label="PostgreSQL"
                ok={postgresHealthOk}
                detail={
                  formatLatency(health?.checks?.postgres?.latency_ms) ??
                  "latência indisponível"
                }
              />
              <HealthRow
                label="Chat e visão"
                ok={!!health?.groq}
                detail={health?.checks?.ai_chat?.model ?? "Modelo não informado"}
              />
              <HealthRow
                label="Embeddings"
                ok={!!health?.embedding}
                detail={
                  coveragePct == null
                    ? "Sem base processada"
                    : `${coveragePct}% de cobertura`
                }
                warn={!!data?.saude?.alerta_embedding}
              />
              <HealthRow
                label="Backlog"
                ok={!data?.saude?.alerta_backlog}
                detail={`${data?.saude?.pendentes_acumulados ?? 0} pendentes acumulados`}
                warn={!!data?.saude?.alerta_backlog}
              />
              <HealthRow
                label="Auditoria"
                ok={!data?.saude?.alerta_erros}
                detail={`${data?.saude?.audit_errors_24h ?? 0} erros em 24h`}
                warn={!!data?.saude?.alerta_erros}
              />
            </CardContent>
          </Card>

          <Card className="rounded-lg border-slate-200 bg-white/95 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="size-4 text-emerald-600" />
                Ingestões recentes
              </CardTitle>
              <CardDescription>Últimos eventos recebidos do WillTalk.</CardDescription>
            </CardHeader>
            <CardContent>
              {data?.ultimasIngestoes && data.ultimasIngestoes.length > 0 ? (
                <div className="space-y-3">
                  {data.ultimasIngestoes.map((log) => (
                    <IngestionItem key={log.id} log={log} />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={Sparkles}
                  title="Nenhuma ingestão"
                  description="Os eventos recebidos serão listados aqui."
                  compact
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone,
  progress,
}: {
  title: string
  value: string
  detail: string
  icon: typeof FileText
  tone: "blue" | "emerald" | "amber" | "rose" | "slate"
  progress: number
}) {
  const toneClasses = {
    blue: {
      icon: "bg-blue-50 text-blue-600 ring-blue-100",
      bar: "bg-blue-500",
    },
    emerald: {
      icon: "bg-emerald-50 text-emerald-600 ring-emerald-100",
      bar: "bg-emerald-500",
    },
    amber: {
      icon: "bg-amber-50 text-amber-600 ring-amber-100",
      bar: "bg-amber-500",
    },
    rose: {
      icon: "bg-rose-50 text-rose-600 ring-rose-100",
      bar: "bg-rose-500",
    },
    slate: {
      icon: "bg-slate-100 text-slate-700 ring-slate-200",
      bar: "bg-slate-500",
    },
  }[tone]

  return (
    <Card className="overflow-hidden rounded-lg border-slate-200 bg-white/95 py-5 shadow-sm transition-shadow hover:shadow-md">
      <CardHeader className="flex-row items-center justify-between gap-3 px-5 pb-1">
        <CardTitle className="text-sm font-semibold text-slate-600">
          {title}
        </CardTitle>
        <span
          className={`flex size-10 items-center justify-center rounded-lg ring-1 ${toneClasses.icon}`}
        >
          <Icon className="size-5" />
        </span>
      </CardHeader>
      <CardContent className="px-5">
        <div className="mt-1 text-3xl font-bold tracking-tight text-slate-950">
          {value}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
          <span>{detail}</span>
          <span>{Math.max(0, Math.min(progress, 100))}%</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${toneClasses.bar}`}
            style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function StatusPill({
  ok,
  icon: Icon,
  label,
  detail,
}: {
  ok: boolean
  icon: typeof Database
  label: string
  detail?: string
}) {
  return (
    <span
      className={`inline-flex h-9 items-center gap-2 rounded-full border px-3 text-xs font-semibold shadow-sm ${
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-white text-slate-500"
      }`}
      title={detail}
    >
      <Icon className="size-3.5" />
      {label}
      <span className="font-medium opacity-70">{ok ? "OK" : "OFF"}</span>
    </span>
  )
}

function HealthRow({
  label,
  ok,
  detail,
  warn,
}: {
  label: string
  ok: boolean
  detail: string
  warn?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-slate-800">{label}</p>
        <p className="truncate text-xs text-slate-500">{detail}</p>
      </div>
      <Badge
        variant="outline"
        className={
          warn
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
        }
      >
        {warn ? "Atenção" : ok ? "OK" : "OFF"}
      </Badge>
    </div>
  )
}

function RankRow({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="size-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
        {label}
      </span>
      <span className="text-sm font-bold text-slate-950">{value}</span>
    </div>
  )
}

function IngestionItem({ log }: { log: IngestaoLog }) {
  const isSucesso = log.status === "sucesso"
  const isErro = log.status.startsWith("erro")

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2.5">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2">
          <Badge
            variant="outline"
            className={
              isSucesso
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : isErro
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-slate-200 bg-white text-slate-600"
            }
          >
            {log.status}
          </Badge>
          <span className="truncate text-sm font-semibold text-slate-800">
            {log.origem}
          </span>
        </div>
        <p className="truncate text-xs text-slate-500">
          {new Date(log.created_at).toLocaleString("pt-BR")}
        </p>
      </div>
      <Activity
        className={`size-4 shrink-0 ${
          isSucesso
            ? "text-emerald-500"
            : isErro
              ? "text-rose-500"
              : "text-slate-400"
        }`}
      />
    </div>
  )
}

function EmptyState({
  icon: Icon,
  title,
  description,
  compact,
}: {
  icon: typeof LineChartIcon
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <div
      className={`grid place-items-center rounded-lg border border-dashed border-slate-200 bg-slate-50/70 text-center ${
        compact ? "min-h-36 p-5" : "min-h-[18rem] p-8"
      }`}
    >
      <div>
        <span className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-white text-slate-400 shadow-sm ring-1 ring-slate-200">
          <Icon className="size-5" />
        </span>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
    </div>
  )
}

function providerLabel(health?: HealthStatus) {
  const provider = health?.checks?.ai_chat?.provider
  if (provider === "groq") return "Groq"
  if (provider === "xai") return "xAI"
  return "Chat IA"
}

function formatLatency(latency?: number) {
  if (typeof latency !== "number") return undefined
  if (latency <= 0) return "sem latência"
  return `${latency}ms`
}

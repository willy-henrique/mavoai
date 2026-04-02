"use client"

import useSWR from "swr"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  LineChart,
  Line,
} from "recharts"
import {
  FileText,
  CheckCircle,
  Clock,
  Users,
  AlertTriangle,
  Activity,
  Cpu,
  Database,
} from "lucide-react"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

const COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
]

interface IngestaoLog {
  id: string
  origem: string
  status: string
  created_at: string
  detalhes: Record<string, unknown> | null
}

interface HealthStatus {
  supabase: boolean
  groq: boolean
  embedding: boolean
}

export function Dashboard() {
  const { data, error, isLoading } = useSWR("/api/metricas", fetcher, {
    refreshInterval: 30000,
  })

  const { data: health } = useSWR<HealthStatus>("/api/health", fetcher, {
    refreshInterval: 60000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-300">
        Erro ao carregar metricas
      </div>
    )
  }

  const supabaseOnline = data?.supabaseOnline !== false

  return (
    <div className="flex flex-col gap-6">
      {!supabaseOnline && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Banco de dados indisponivel</p>
            <p className="text-sm opacity-80">
              Supabase fora do ar — dados podem estar desatualizados.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Status:</span>
        <Badge
          variant={health?.supabase ? "default" : "destructive"}
          className="text-xs gap-1"
        >
          <Database className="h-3 w-3" />
          Supabase {health?.supabase ? "OK" : "OFF"}
        </Badge>
        <Badge
          variant={health?.groq ? "default" : "secondary"}
          className="text-xs gap-1"
        >
          <Cpu className="h-3 w-3" />
          Groq {health?.groq ? "OK" : "N/A"}
        </Badge>
        <Badge
          variant={
            health?.embedding ? "default" : "secondary"
          }
          className="text-xs gap-1"
        >
          <Activity className="h-3 w-3" />
          Embedding {health?.embedding ? "OK" : "OFF"}
        </Badge>
        {data?.ultimaAtualizacao && (
          <span className="ml-auto text-xs text-muted-foreground">
            Atualizado: {new Date(data.ultimaAtualizacao).toLocaleTimeString("pt-BR")}
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Atendimentos
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.totalAtendimentos || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Processados</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {data?.processados || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pendentes</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {data?.pendentes || 0}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">
              Tecnicos Ativos
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data?.porTecnico?.length || 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Atendimentos por Categoria</CardTitle>
            <CardDescription>
              Distribuicao dos tipos de atendimento
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data?.porCategoria?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={data.porCategoria}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ nome, percent }) =>
                      `${nome} (${(percent * 100).toFixed(0)}%)`
                    }
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="total"
                    nameKey="nome"
                  >
                    {data.porCategoria.map(
                      (_: { nome: string; total: number }, index: number) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={COLORS[index % COLORS.length]}
                        />
                      )
                    )}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Atendimentos por Tecnico</CardTitle>
            <CardDescription>
              Top 10 tecnicos com mais atendimentos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data?.porTecnico?.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.porTecnico} layout="vertical">
                  <XAxis type="number" />
                  <YAxis
                    dataKey="nome"
                    type="category"
                    width={100}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="total"
                    fill="hsl(var(--chart-1))"
                    radius={4}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Atendimentos - Ultimos 7 dias</CardTitle>
          <CardDescription>Evolucao diaria dos atendimentos</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.porDia?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={data.porDia}>
                <XAxis dataKey="data" tick={{ fontSize: 12 }} />
                <YAxis />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--chart-2))"
                  strokeWidth={2}
                  dot={{ fill: "hsl(var(--chart-2))" }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[300px] items-center justify-center text-muted-foreground">
              Sem dados para exibir
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Ingestoes Recentes
          </CardTitle>
          <CardDescription>Ultimas 5 ingestoes do WillTalk</CardDescription>
        </CardHeader>
        <CardContent>
          {data?.ultimasIngestoes?.length > 0 ? (
            <div className="space-y-3">
              {data.ultimasIngestoes.map((log: IngestaoLog) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={
                        log.status === "sucesso"
                          ? "default"
                          : log.status.startsWith("erro")
                            ? "destructive"
                            : "secondary"
                      }
                      className="text-xs"
                    >
                      {log.status}
                    </Badge>
                    <span className="text-muted-foreground">{log.origem}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhuma ingestao registrada
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  Search,
  Eye,
  Sparkles,
  RefreshCw,
  MessageCircle,
  Monitor,
  Phone,
} from "lucide-react"
import type { Atendimento, Categoria } from "@/lib/types"

const fetcher = (url: string) => fetch(url).then((res) => res.json())

interface AtendimentosListProps {
  refreshKey?: number
}

function CanalBadge({ canal }: { canal?: string | null }) {
  if (canal === "whatsapp") {
    return (
      <Badge variant="outline" className="gap-1 text-xs text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">
        <Phone className="h-3 w-3" />
        WhatsApp
      </Badge>
    )
  }
  if (canal === "chat") {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <MessageCircle className="h-3 w-3" />
        Chat
      </Badge>
    )
  }
  if (canal) {
    return (
      <Badge variant="outline" className="gap-1 text-xs">
        <Monitor className="h-3 w-3" />
        {canal}
      </Badge>
    )
  }
  return <span className="text-muted-foreground text-xs">-</span>
}

function StatusIABadge({ atendimento }: { atendimento: Atendimento }) {
  if (atendimento.processado && atendimento.resumo) {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200 text-xs">
        Processado
      </Badge>
    )
  }
  if (atendimento.processado && !atendimento.resumo) {
    return (
      <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900 dark:text-red-200 text-xs">
        Erro IA
      </Badge>
    )
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-900 dark:text-amber-200 text-xs">
      Pendente
    </Badge>
  )
}

export function AtendimentosList({ refreshKey }: AtendimentosListProps) {
  const [filters, setFilters] = useState({
    busca: "",
    tecnico: "",
    categoria: "",
  })
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [processError, setProcessError] = useState<string | null>(null)

  const queryParams = new URLSearchParams()
  if (filters.busca) queryParams.set("busca", filters.busca)
  if (filters.tecnico) queryParams.set("tecnico", filters.tecnico)
  if (filters.categoria) queryParams.set("categoria", filters.categoria)

  const { data, error, isLoading, mutate } = useSWR<{
    data: Atendimento[]
    total: number
  }>(
    `/api/atendimentos?${queryParams.toString()}&refresh=${refreshKey}`,
    fetcher,
    { refreshInterval: 30000 }
  )

  const { data: categoriasData } = useSWR<{ data: Categoria[] }>(
    "/api/categorias",
    fetcher
  )

  const handleProcessar = async (atendimento: Atendimento) => {
    setProcessingId(atendimento.id)
    setProcessError(null)
    try {
      const res = await fetch("/api/atendimentos/processar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: atendimento.id,
          texto_original: atendimento.texto_original,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg =
          res.status === 429
            ? "IA temporariamente indisponivel (rate limit). Tente em 15s."
            : body?.error || `Erro ${res.status}`
        setProcessError(msg)
      } else {
        mutate()
      }
    } catch (err) {
      setProcessError("Falha de rede ao processar")
      console.error("Erro ao processar:", err)
    } finally {
      setProcessingId(null)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Atendimentos</span>
          <Button variant="outline" size="sm" onClick={() => mutate()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Atualizar
          </Button>
        </CardTitle>
        <CardDescription>
          {data?.total || 0} atendimentos encontrados
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {processError && (
          <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            {processError}
          </div>
        )}

        <div className="flex flex-col gap-4 md:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por problema, solucao..."
              className="pl-10"
              value={filters.busca}
              onChange={(e) =>
                setFilters({ ...filters, busca: e.target.value })
              }
            />
          </div>
          <Input
            placeholder="Filtrar por tecnico"
            className="md:w-48"
            value={filters.tecnico}
            onChange={(e) =>
              setFilters({ ...filters, tecnico: e.target.value })
            }
          />
          <Select
            value={filters.categoria}
            onValueChange={(value) =>
              setFilters({
                ...filters,
                categoria: value === "all" ? "" : value,
              })
            }
          >
            <SelectTrigger className="md:w-48">
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

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Spinner className="h-8 w-8" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-950 dark:text-red-300">
            Erro ao carregar atendimentos
          </div>
        ) : !data?.data?.length ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p>Nenhum atendimento encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Canal</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Tecnico</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Status IA</TableHead>
                  <TableHead className="text-right">Acoes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((atendimento) => (
                  <TableRow key={atendimento.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      {formatDate(atendimento.data_atendimento)}
                    </TableCell>
                    <TableCell>
                      <CanalBadge canal={atendimento.canal} />
                    </TableCell>
                    <TableCell>{atendimento.cliente}</TableCell>
                    <TableCell>{atendimento.tecnico}</TableCell>
                    <TableCell>
                      {atendimento.categorias?.nome ? (
                        <Badge variant="secondary">
                          {atendimento.categorias.nome}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusIABadge atendimento={atendimento} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>
                                Atendimento - {atendimento.cliente}
                              </DialogTitle>
                              <DialogDescription>
                                {formatDate(atendimento.data_atendimento)} -{" "}
                                {atendimento.tecnico}
                                {atendimento.canal && (
                                  <> | Canal: {atendimento.canal}</>
                                )}
                              </DialogDescription>
                            </DialogHeader>
                            <div className="flex flex-col gap-4">
                              <div>
                                <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                                  Texto Original
                                </h4>
                                <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">
                                  {atendimento.texto_original}
                                </p>
                              </div>
                              {atendimento.processado && (
                                <>
                                  <div className="grid gap-4 md:grid-cols-2">
                                    <div>
                                      <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                                        Problema
                                      </h4>
                                      <p className="rounded-lg bg-muted p-3 text-sm">
                                        {atendimento.problema || "-"}
                                      </p>
                                    </div>
                                    <div>
                                      <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                                        Causa
                                      </h4>
                                      <p className="rounded-lg bg-muted p-3 text-sm">
                                        {atendimento.causa || "-"}
                                      </p>
                                    </div>
                                  </div>
                                  <div>
                                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                                      Solucao
                                    </h4>
                                    <p className="rounded-lg bg-green-50 p-3 text-sm text-green-900 dark:bg-green-950 dark:text-green-100">
                                      {atendimento.solucao || "-"}
                                    </p>
                                  </div>
                                  <div>
                                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                                      Resumo
                                    </h4>
                                    <p className="rounded-lg bg-muted p-3 text-sm">
                                      {atendimento.resumo || "-"}
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={
                            atendimento.processado
                              ? "Reprocessar com IA"
                              : "Processar com IA"
                          }
                          onClick={() => handleProcessar(atendimento)}
                          disabled={processingId === atendimento.id}
                        >
                          {processingId === atendimento.id ? (
                            <Spinner className="h-4 w-4" />
                          ) : (
                            <Sparkles className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

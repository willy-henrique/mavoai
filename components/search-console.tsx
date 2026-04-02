"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Search, Lightbulb, MessageSquare, AlertTriangle } from "lucide-react"
import type { ResultadoBuscaSemantica } from "@/lib/types"

export function SearchConsole() {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [results, setResults] = useState<ResultadoBuscaSemantica[]>([])
  const [respostaSugerida, setRespostaSugerida] = useState("")
  const [searched, setSearched] = useState(false)
  const [tipoBusca, setTipoBusca] = useState<"semantica" | "textual" | null>(null)
  const [iaError, setIaError] = useState<string | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    setRespostaSugerida("")
    setIaError(null)
    setTipoBusca(null)

    try {
      const response = await fetch("/api/busca-semantica", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: query }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Erro na busca semantica")
      }

      if (Array.isArray(data)) {
        setResults(data)
      } else {
        setResults(Array.isArray(data.resultados) ? data.resultados : [])
        setTipoBusca(data.tipo_busca || null)
      }
    } catch (error) {
      console.error("Erro na busca:", error)
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  const handleGerarResposta = async () => {
    if (!query.trim()) return

    setGenerating(true)
    setIaError(null)
    try {
      const response = await fetch("/api/resposta-assistida", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: query }),
      })

      const data = await response.json()

      if (response.status === 429) {
        setIaError(
          data.mensagem ||
            "IA temporariamente indisponivel (rate limit). Aguarde ~15s e tente novamente."
        )
        return
      }

      if (response.status === 503) {
        setIaError(
          data.mensagem || "IA nao configurada. Verifique as variaveis de ambiente."
        )
        return
      }

      if (!response.ok) {
        throw new Error(data.error || "Erro ao gerar resposta assistida")
      }

      setRespostaSugerida(data.resposta_sugerida || "")
    } catch (error) {
      console.error("Erro ao gerar resposta:", error)
      setRespostaSugerida("")
      setIaError("Nao foi possivel gerar a resposta sugerida. Tente novamente.")
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Buscar Solucoes
          </CardTitle>
          <CardDescription>
            Descreva o problema e encontre solucoes em atendimentos anteriores
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Textarea
            placeholder="Ex: Computador nao liga, usuario esqueceu senha, impressora sem conexao..."
            className="min-h-[100px]"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSearch()
              }
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="w-full sm:w-auto"
            >
              {loading ? (
                <Spinner className="mr-2" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              Buscar Solucoes
            </Button>
            <Button
              variant="secondary"
              onClick={handleGerarResposta}
              disabled={generating || !query.trim()}
              className="w-full sm:w-auto"
            >
              {generating ? (
                <Spinner className="mr-2" />
              ) : (
                <Lightbulb className="mr-2 h-4 w-4" />
              )}
              Gerar Resposta IA
            </Button>
          </div>
        </CardContent>
      </Card>

      {iaError && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{iaError}</p>
        </div>
      )}

      {searched && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold">
              {results.length > 0
                ? `${results.length} solucoes encontradas`
                : "Nenhuma solucao encontrada"}
            </h3>
            {tipoBusca && (
              <Badge
                variant={tipoBusca === "semantica" ? "default" : "secondary"}
                className="text-xs"
              >
                {tipoBusca === "semantica"
                  ? "Busca semantica (vetorial)"
                  : "Busca por texto (fallback)"}
              </Badge>
            )}
          </div>

          {results.map((resultado) => (
            <Card key={resultado.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">Caso similar</CardTitle>
                    <CardDescription>ID: {resultado.id}</CardDescription>
                  </div>
                  {resultado.similaridade > 0 && (
                    <Badge variant="secondary">
                      Similaridade:{" "}
                      {(resultado.similaridade * 100).toFixed(1)}%
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                {resultado.resumo_problema && (
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                      Problema
                    </h4>
                    <p className="text-sm">{resultado.resumo_problema}</p>
                  </div>
                )}
                {resultado.solucao && (
                  <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950">
                    <h4 className="mb-1 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                      <Lightbulb className="h-4 w-4" />
                      Solucao Aplicada
                    </h4>
                    <p className="text-sm text-green-900 dark:text-green-100">
                      {resultado.solucao}
                    </p>
                  </div>
                )}
                {resultado.causa && (
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-muted-foreground">
                      Causa Identificada
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      {resultado.causa}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}

          {respostaSugerida && (
            <Card>
              <CardHeader>
                <CardTitle>Resposta Assistida</CardTitle>
                <CardDescription>
                  Sugestao gerada com base em casos similares
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">
                  {respostaSugerida}
                </p>
              </CardContent>
            </Card>
          )}

          {results.length === 0 && !iaError && (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Search className="mb-4 h-12 w-12 text-muted-foreground" />
                <p className="text-muted-foreground">
                  Nenhum atendimento similar foi encontrado.
                </p>
                <p className="text-sm text-muted-foreground">
                  Tente usar outras palavras-chave ou cadastre um novo
                  atendimento.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}

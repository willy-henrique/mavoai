"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Search,
  Lightbulb,
  MessageSquare,
  AlertTriangle,
  Bot,
  RotateCcw,
  Send,
  ChevronDown,
  ChevronUp,
  User,
} from "lucide-react"
import { GroqMotorStrip } from "@/components/groq-motor-strip"
import type { ResultadoBuscaSemantica } from "@/lib/types"

// ─── Chat types ───────────────────────────────────────────────────────────────

interface ChatCaso {
  id: string
  resumo_problema: string
  similaridade: number
  estrategia?: string
}

interface ChatMessage {
  role: "user" | "assistant" | "system"
  content: string
  timestamp: Date
  confianca?: "alta" | "media" | "baixa"
  casos?: ChatCaso[]
  error?: boolean
}

const WELCOME: ChatMessage = {
  role: "system",
  content:
    "Olá! Sou o Mavo AI, seu assistente de suporte técnico. Descreva o problema do cliente e vou buscar a melhor solução na base de conhecimento.",
  timestamp: new Date(),
}

// ─── Chat Section ─────────────────────────────────────────────────────────────

function ChatSuporteSection() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput]       = useState("")
  const [loading, setLoading]   = useState(false)
  const [expandedCasos, setExpandedCasos] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)

  // Scroll automático quando nova mensagem chega
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const toggleCasos = (idx: number) => {
    setExpandedCasos((prev) => {
      const next = new Set(prev)
      next.has(idx) ? next.delete(idx) : next.add(idx)
      return next
    })
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: "user", content: text, timestamp: new Date() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setLoading(true)

    try {
      const resp = await fetch("/api/resposta-assistida?debug=true", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: text, audience: "atendente" }),
      })

      const data = await resp.json()

      if (resp.status === 429) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.mensagem || "Rate limit atingido. Aguarde ~15s e tente novamente.",
            timestamp: new Date(),
            error: true,
          },
        ])
        return
      }

      if (resp.status === 503) {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: "IA não configurada (AI_API_KEY ausente). Verifique o .env.local.",
            timestamp: new Date(),
            error: true,
          },
        ])
        return
      }

      if (!resp.ok) {
        throw new Error(data.error || "Erro desconhecido")
      }

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: data.resposta_sugerida || data.resposta || "Sem resposta.",
        timestamp: new Date(),
        confianca: data.confianca,
        casos: Array.isArray(data.casos_utilizados) ? data.casos_utilizados : [],
      }
      setMessages((prev) => [...prev, aiMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Não foi possível obter resposta. Tente novamente.",
          timestamp: new Date(),
          error: true,
        },
      ])
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }, [input, loading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const clearChat = () => {
    setMessages([WELCOME])
    setExpandedCasos(new Set())
    setInput("")
    inputRef.current?.focus()
  }

  const confiancaColor = (c?: "alta" | "media" | "baixa") => {
    if (c === "alta")  return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
    if (c === "media") return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
    return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
  }

  return (
    <div className="flex flex-col gap-4">
      <GroqMotorStrip variant="subtle" className="rounded-md border bg-muted/20 px-3 py-2" />

      {/* Histórico */}
      <div className="flex flex-col gap-3 min-h-85 max-h-130 overflow-y-auto rounded-lg border bg-muted/10 p-4">
        {messages.map((msg, idx) => {
          const isUser   = msg.role === "user"
          const isSystem = msg.role === "system"
          const casosExpanded = expandedCasos.has(idx)

          return (
            <div
              key={idx}
              className={`flex flex-col gap-1 ${isUser ? "items-end" : "items-start"}`}
            >
              {/* Remetente */}
              <div className={`flex items-center gap-1.5 text-xs text-muted-foreground ${isUser ? "flex-row-reverse" : ""}`}>
                {isUser
                  ? <User className="h-3 w-3" />
                  : <Bot className="h-3 w-3 text-emerald-500" />}
                <span>{isUser ? "Você" : isSystem ? "Mavo AI" : "Mavo AI"}</span>
                <span className="opacity-50">
                  {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {/* Bolha */}
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? "bg-emerald-600 text-white rounded-br-sm"
                    : isSystem
                      ? "bg-muted text-muted-foreground italic rounded-bl-sm"
                      : msg.error
                        ? "bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-bl-sm"
                        : "bg-card border rounded-bl-sm"
                }`}
              >
                {isUser || isSystem ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-1 last:mb-0 leading-relaxed">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                      ul: ({ children }) => <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>,
                      ol: ({ children }) => <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>,
                      li: ({ children }) => <li className="leading-snug">{children}</li>,
                      h1: ({ children }) => <h1 className="mb-1 text-base font-bold">{children}</h1>,
                      h2: ({ children }) => <h2 className="mb-1 text-sm font-bold">{children}</h2>,
                      h3: ({ children }) => <h3 className="mb-1 text-sm font-semibold">{children}</h3>,
                      code: ({ children }) => <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">{children}</code>,
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                )}
              </div>

              {/* Badges + Fontes (apenas para IA) */}
              {!isUser && !isSystem && !msg.error && (
                <div className="flex flex-col gap-1 max-w-[85%]">
                  <div className="flex items-center gap-2 flex-wrap">
                    {msg.confianca && (
                      <Badge className={`text-xs ${confiancaColor(msg.confianca)}`}>
                        Confiança: {msg.confianca}
                      </Badge>
                    )}
                    {(msg.casos?.length ?? 0) > 0 && (
                      <button
                        onClick={() => toggleCasos(idx)}
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {casosExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {msg.casos!.length} fonte{msg.casos!.length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>

                  {/* Fontes colapsáveis */}
                  {casosExpanded && msg.casos && msg.casos.length > 0 && (
                    <div className="flex flex-col gap-1.5 rounded-lg border bg-muted/20 p-2.5">
                      {msg.casos.map((c) => (
                        <div key={c.id} className="flex items-start justify-between gap-2 text-xs">
                          <span className="text-muted-foreground leading-snug">{c.resumo_problema}</span>
                          <Badge variant="outline" className="text-xs shrink-0">
                            {(c.similaridade * 100).toFixed(0)}%
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {loading && (
          <div className="flex items-start gap-2">
            <Bot className="h-4 w-4 text-emerald-500 mt-1 shrink-0" />
            <div className="bg-card border rounded-2xl rounded-bl-sm px-4 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          placeholder="Descreva o problema do cliente..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1"
        />
        <Button onClick={sendMessage} disabled={loading || !input.trim()} size="icon">
          {loading ? <Spinner className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={clearChat}
          title="Nova conversa"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Enter para enviar · Shift+Enter para nova linha · Botão ↺ para nova conversa
      </p>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

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
            "Groq temporariamente indisponível (rate limit). Aguarde ~15s e tente novamente."
        )
        return
      }

      if (response.status === 503) {
        setIaError(
          data.mensagem ||
            "Groq não configurada (AI_API_KEY / GROQ_API_KEY). Verifique o .env.local."
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
      setIaError(
        "Não foi possível gerar a resposta assistida (Groq). Tente novamente."
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="chat">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="chat" className="gap-2">
            <Bot className="h-4 w-4" />
            Chat Suporte
          </TabsTrigger>
          <TabsTrigger value="busca" className="gap-2">
            <Search className="h-4 w-4" />
            Busca RAG
          </TabsTrigger>
        </TabsList>

        {/* ── Aba Chat ────────────────────────────────────────────────────── */}
        <TabsContent value="chat" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-emerald-500" />
                Chat Suporte
              </CardTitle>
              <CardDescription>
                Converse com o Mavo AI como se fosse um cliente — ele responde como agente de suporte usando a base de conhecimento.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChatSuporteSection />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Aba Busca RAG ───────────────────────────────────────────────── */}
        <TabsContent value="busca" className="mt-4">
          <div className="flex flex-col gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Buscar Solucoes
                </CardTitle>
                <CardDescription>
                  Busca em histórico; a sugestão de resposta é gerada pelo motor Groq (Llama 4 Scout).
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <GroqMotorStrip variant="subtle" className="rounded-md border bg-muted/20 px-3 py-2" />
                <Textarea
                  placeholder="Ex: Computador nao liga, usuario esqueceu senha, impressora sem conexao..."
                  className="min-h-25"
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
                    {loading ? <Spinner className="mr-2" /> : <Search className="mr-2 h-4 w-4" />}
                    Buscar Solucoes
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={handleGerarResposta}
                    disabled={generating || !query.trim()}
                    className="w-full sm:w-auto"
                  >
                    {generating ? <Spinner className="mr-2" /> : <Lightbulb className="mr-2 h-4 w-4" />}
                    Resposta assistida (Groq)
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
                    <Badge variant={tipoBusca === "semantica" ? "default" : "secondary"} className="text-xs">
                      {tipoBusca === "semantica" ? "Busca semantica (vetorial)" : "Busca por texto (fallback)"}
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
                            Similaridade: {(resultado.similaridade * 100).toFixed(1)}%
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      {resultado.resumo_problema && (
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-muted-foreground">Problema</h4>
                          <p className="text-sm">{resultado.resumo_problema}</p>
                        </div>
                      )}
                      {resultado.solucao && (
                        <div className="rounded-lg bg-green-50 p-3 dark:bg-green-950">
                          <h4 className="mb-1 flex items-center gap-2 text-sm font-medium text-green-700 dark:text-green-300">
                            <Lightbulb className="h-4 w-4" />
                            Solucao Aplicada
                          </h4>
                          <p className="text-sm text-green-900 dark:text-green-100">{resultado.solucao}</p>
                        </div>
                      )}
                      {resultado.causa && (
                        <div>
                          <h4 className="mb-1 text-sm font-medium text-muted-foreground">Causa Identificada</h4>
                          <p className="text-sm text-muted-foreground">{resultado.causa}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}

                {respostaSugerida && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Resposta Assistida</CardTitle>
                      <CardDescription>Sugestao gerada com base em casos similares</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="whitespace-pre-wrap text-sm">{respostaSugerida}</p>
                    </CardContent>
                  </Card>
                )}

                {results.length === 0 && !iaError && (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                      <Search className="mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-muted-foreground">Nenhum atendimento similar foi encontrado.</p>
                      <p className="text-sm text-muted-foreground">
                        Tente usar outras palavras-chave ou cadastre um novo atendimento.
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}

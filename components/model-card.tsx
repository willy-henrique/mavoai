"use client"

import { useEffect, useState } from "react"
import { Bot, Loader2, Save, CheckCircle2, AlertTriangle } from "lucide-react"
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

/** Modelos recomendados no provider Groq (base padrão). "" = digitar um custom. */
const MODELOS = [
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B — forte e rápido (recomendado)" },
  { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B — máxima qualidade (mais lento)" },
  { id: "meta-llama/llama-4-scout-17b-16e-instruct", label: "Llama 4 Scout — rápido/multimodal" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B — ultrarrápido" },
]

type Effective = {
  ai_chat_model: string
  ai_curator_model: string
}

function ModelSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (v: string) => void
}) {
  const isPreset = MODELOS.some((m) => m.id === value)
  const [custom, setCustom] = useState(!isPreset && value !== "")

  return (
    <div className="space-y-2">
      <select
        value={custom ? "__custom__" : value}
        onChange={(e) => {
          if (e.target.value === "__custom__") {
            setCustom(true)
          } else {
            setCustom(false)
            onChange(e.target.value)
          }
        }}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-emerald-400"
      >
        {MODELOS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
        <option value="__custom__">Outro modelo (digitar o ID)...</option>
      </select>
      {custom && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="ex.: provider/nome-do-modelo"
          className="h-9 font-mono text-xs"
        />
      )}
    </div>
  )
}

export function ModelCard() {
  const [chat, setChat] = useState("")
  const [curator, setCurator] = useState("")
  const [source, setSource] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch("/api/config/models-ui", { cache: "no-store" })
      const data = await res.json()
      const eff: Effective = data.effective ?? {}
      setChat(eff.ai_chat_model || "")
      setCurator(eff.ai_curator_model || "")
      setSource(Array.isArray(data.raw_keys) && data.raw_keys.includes("ai.chat_model") ? "db" : "env")
    } catch {
      setFeedback({ ok: false, msg: "Não foi possível carregar os modelos." })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave() {
    if (!chat.trim()) return
    setSaving(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/config/models-ui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai_chat_model: chat.trim(), ai_curator_model: curator.trim() }),
      })
      if (!res.ok) throw new Error()
      setFeedback({ ok: true, msg: "Modelo salvo. Efeito em até 30 segundos, sem redeploy." })
      await load()
    } catch {
      setFeedback({ ok: false, msg: "Erro ao salvar o modelo." })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Bot className="size-4" />
            </span>
            <div>
              <CardTitle className="text-base">Modelo de IA</CardTitle>
              <CardDescription>
                Qual modelo a Mavo AI usa para responder. Escolha um ou digite o ID de outro.
              </CardDescription>
            </div>
          </div>
          {source && (
            <Badge
              className={
                source === "db"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-blue-200 bg-blue-50 text-blue-700"
              }
            >
              {source === "db" ? "Salvo no painel" : "Variável de ambiente"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="size-4 animate-spin" /> Carregando...
          </div>
        ) : (
          <>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-slate-600">Modelo de conversa (atendimento)</label>
              <ModelSelect value={chat} onChange={setChat} />
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-slate-600">Modelo de curadoria (análise/JSON)</label>
              <ModelSelect value={curator} onChange={setCurator} />
            </div>
            <p className="text-[11px] text-slate-500">
              Para trocar de provedor (OpenRouter, Gemini, etc.) e a chave/base, use a aba Configurações → Modelos. As chaves OpenRouter e Google ficam logo abaixo, em Tokens & Chaves.
            </p>
            {feedback && (
              <div
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                  feedback.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {feedback.ok ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
                {feedback.msg}
              </div>
            )}
            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={saving || !chat.trim()}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar modelo
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

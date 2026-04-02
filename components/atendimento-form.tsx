"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { Plus, Sparkles } from "lucide-react"
import { FieldGroup, Field, FieldLabel } from "@/components/ui/field"

interface AtendimentoFormProps {
  onSuccess?: () => void
}

export function AtendimentoForm({ onSuccess }: AtendimentoFormProps) {
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [formData, setFormData] = useState({
    cliente: "",
    tecnico: "",
    texto_original: "",
    data_atendimento: new Date().toISOString().split("T")[0],
  })
  const [message, setMessage] = useState<{
    type: "success" | "error"
    text: string
  } | null>(null)

  const handleSubmit = async (e: React.FormEvent, processWithAI: boolean) => {
    e.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetch("/api/atendimentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          data_atendimento: new Date(formData.data_atendimento).toISOString(),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || "Erro ao cadastrar")
      }

      if (processWithAI && result.data?.id) {
        setProcessing(true)
        const processResponse = await fetch("/api/atendimentos/processar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: result.data.id,
            texto_original: formData.texto_original,
          }),
        })

        if (!processResponse.ok) {
          setMessage({
            type: "success",
            text: "Atendimento cadastrado, mas houve erro no processamento IA",
          })
        } else {
          setMessage({
            type: "success",
            text: "Atendimento cadastrado e processado com sucesso!",
          })
        }
        setProcessing(false)
      } else {
        setMessage({ type: "success", text: "Atendimento cadastrado!" })
      }

      setFormData({
        cliente: "",
        tecnico: "",
        texto_original: "",
        data_atendimento: new Date().toISOString().split("T")[0],
      })
      onSuccess?.()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Erro ao cadastrar",
      })
    } finally {
      setLoading(false)
      setProcessing(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Novo Atendimento</CardTitle>
        <CardDescription>
          Cadastre um novo atendimento de suporte tecnico
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-6">
          <div className="grid gap-6 md:grid-cols-2">
            <FieldGroup>
              <Field>
                <FieldLabel>Cliente</FieldLabel>
                <Input
                  placeholder="Nome do cliente ou empresa"
                  value={formData.cliente}
                  onChange={(e) =>
                    setFormData({ ...formData, cliente: e.target.value })
                  }
                  required
                />
              </Field>
            </FieldGroup>

            <FieldGroup>
              <Field>
                <FieldLabel>Tecnico</FieldLabel>
                <Input
                  placeholder="Nome do tecnico responsavel"
                  value={formData.tecnico}
                  onChange={(e) =>
                    setFormData({ ...formData, tecnico: e.target.value })
                  }
                  required
                />
              </Field>
            </FieldGroup>
          </div>

          <FieldGroup>
            <Field>
              <FieldLabel>Data do Atendimento</FieldLabel>
              <Input
                type="date"
                value={formData.data_atendimento}
                onChange={(e) =>
                  setFormData({ ...formData, data_atendimento: e.target.value })
                }
              />
            </Field>
          </FieldGroup>

          <FieldGroup>
            <Field>
              <FieldLabel>Descricao do Atendimento</FieldLabel>
              <Textarea
                placeholder="Descreva o atendimento realizado: problema relatado, diagnostico, solucao aplicada..."
                className="min-h-[150px]"
                value={formData.texto_original}
                onChange={(e) =>
                  setFormData({ ...formData, texto_original: e.target.value })
                }
                required
              />
            </Field>
          </FieldGroup>

          {message && (
            <div
              className={`rounded-lg p-3 text-sm ${
                message.type === "success"
                  ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={(e) => handleSubmit(e, false)}
              disabled={
                loading ||
                !formData.cliente ||
                !formData.tecnico ||
                !formData.texto_original
              }
            >
              {loading && !processing ? (
                <Spinner className="mr-2" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}
              Cadastrar
            </Button>
            <Button
              type="button"
              onClick={(e) => handleSubmit(e, true)}
              disabled={
                loading ||
                !formData.cliente ||
                !formData.tecnico ||
                !formData.texto_original
              }
            >
              {processing ? (
                <Spinner className="mr-2" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              {processing ? "Processando..." : "Cadastrar e Processar com IA"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

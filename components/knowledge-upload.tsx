"use client"

import { useRef, useState } from "react"
import {
  BookOpenCheck,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Loader2,
  Trash2,
  Upload,
  Type,
} from "lucide-react"
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

type UploadResult = {
  name: string
  ok: boolean
  inserted?: number
  skipped?: number
  errors?: number
  total?: number
  vectorized?: number
  error?: string
}

const TENANT = "auge"
const ACCEPT = ".pdf,.txt,.md,.markdown"

interface Props {
  onTrained?: () => void
}

export function KnowledgeUpload({ onTrained }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [category, setCategory] = useState("Documentação")
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<UploadResult[]>([])

  // Modo "colar texto"
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteTitle, setPasteTitle] = useState("")
  const [pasteText, setPasteText] = useState("")

  function addFiles(list: FileList | null) {
    if (!list) return
    const novos = Array.from(list)
    setFiles((prev) => {
      const nomes = new Set(prev.map((f) => f.name))
      return [...prev, ...novos.filter((f) => !nomes.has(f.name))]
    })
  }

  async function treinar() {
    if (files.length === 0) return
    setUploading(true)
    setResults([])
    const out: UploadResult[] = []
    for (const file of files) {
      try {
        const fd = new FormData()
        fd.append("file", file)
        fd.append("tenant_id", TENANT)
        fd.append("category", category.trim() || "Documentação")
        const res = await fetch("/api/knowledge/upload", { method: "POST", body: fd })
        const j = await res.json().catch(() => ({}))
        if (!res.ok) {
          out.push({ name: file.name, ok: false, error: j.error || `status ${res.status}` })
        } else {
          out.push({
            name: file.name,
            ok: true,
            inserted: j.inserted,
            skipped: j.skipped,
            errors: j.errors,
            total: j.total_chunks,
            vectorized: (j.chunks || []).filter((c: { vectorized: boolean }) => c.vectorized).length,
          })
        }
      } catch (e) {
        out.push({ name: file.name, ok: false, error: e instanceof Error ? e.message : "erro" })
      }
      setResults([...out])
    }
    setUploading(false)
    setFiles([])
    if (inputRef.current) inputRef.current.value = ""
    onTrained?.()
  }

  async function treinarTexto() {
    if (!pasteTitle.trim() || !pasteText.trim()) return
    setUploading(true)
    setResults([])
    try {
      const res = await fetch("/api/knowledge/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: pasteTitle.trim(), text: pasteText.trim(), tenant_id: TENANT, category: category.trim() || "Documentação" }),
      })
      const j = await res.json().catch(() => ({}))
      setResults([
        res.ok
          ? { name: pasteTitle.trim(), ok: true, inserted: j.inserted, skipped: j.skipped, errors: j.errors, total: j.total_chunks }
          : { name: pasteTitle.trim(), ok: false, error: j.error || `status ${res.status}` },
      ])
      if (res.ok) { setPasteTitle(""); setPasteText(""); onTrained?.() }
    } catch (e) {
      setResults([{ name: pasteTitle.trim(), ok: false, error: e instanceof Error ? e.message : "erro" }])
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <BookOpenCheck className="size-4" />
          </span>
          <div>
            <CardTitle className="text-base">Treinar a IA com documentos</CardTitle>
            <CardDescription>
              Suba PDF, TXT ou Markdown. O conteúdo é quebrado, indexado (embeddings) e a IA passa a usar nas respostas — sem deploy.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Dropzone */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
          onClick={() => inputRef.current?.click()}
          className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-8 text-center transition hover:border-emerald-300 hover:bg-emerald-50/40"
        >
          <Upload className="size-6 text-slate-400" />
          <p className="text-sm font-medium text-slate-700">Arraste arquivos aqui ou clique para escolher</p>
          <p className="text-xs text-slate-500">PDF, TXT ou Markdown — pode selecionar vários</p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* Arquivos selecionados */}
        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f) => (
              <div key={f.name} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <FileText className="size-4 shrink-0 text-slate-400" />
                  <span className="truncate text-sm text-slate-700">{f.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button
                  onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
                  className="text-slate-400 hover:text-red-600"
                  title="Remover"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Categoria + ação */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="grid flex-1 gap-1.5">
            <label className="text-xs font-medium text-slate-600">Categoria (área)</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="ex.: fiscal, pdv, estoque..." className="h-9" />
          </div>
          <Button onClick={treinar} disabled={uploading || files.length === 0} className="sm:w-auto">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
            Treinar IA ({files.length})
          </Button>
        </div>

        {/* Resultados */}
        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  r.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"
                }`}
              >
                {r.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
                <div className="min-w-0">
                  <span className="font-medium">{r.name}</span>
                  {r.ok ? (
                    <span className="text-emerald-700">
                      {" "}— {r.inserted} trecho(s) indexado(s){r.vectorized != null ? `, ${r.vectorized} com embedding` : ""}{r.skipped ? `, ${r.skipped} já existiam` : ""}.
                    </span>
                  ) : (
                    <span> — {r.error}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Colar texto */}
        <div className="border-t border-slate-100 pt-3">
          <button
            onClick={() => setPasteOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
          >
            <Type className="size-3.5" /> {pasteOpen ? "Ocultar" : "Ou colar texto direto"}
          </button>
          {pasteOpen && (
            <div className="mt-3 space-y-2">
              <Input value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} placeholder="Título do documento (ex.: Como emitir NFC-e)" className="h-9" />
              <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Cole aqui o conteúdo / passo a passo..." className="min-h-[120px]" />
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={treinarTexto} disabled={uploading || !pasteTitle.trim() || !pasteText.trim()}>
                  {uploading ? <Loader2 className="size-4 animate-spin" /> : <BookOpenCheck className="size-4" />}
                  Indexar texto
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

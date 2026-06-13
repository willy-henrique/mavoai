"use client"

import { useState } from "react"
import { BrainCircuit, KeyRound, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export default function LoginPage() {
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        window.location.href = "/"
        return
      }
      const data = await res.json().catch(() => ({}))
      if (res.status === 503) {
        setError("ADMIN_PASSWORD não está configurada no servidor.")
      } else {
        setError(data?.error === "senha_invalida" ? "Senha incorreta." : "Não foi possível entrar.")
      }
    } catch {
      setError("Erro de conexão. Tente novamente.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,hsl(171_74%_18%),hsl(222_47%_8%))] px-4 text-white">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-xl bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/30">
            <BrainCircuit className="size-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Mavo AI — Painel</h1>
            <p className="mt-1 text-sm text-slate-400">Acesso restrito ao administrador</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl backdrop-blur"
        >
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium text-slate-300">
              Senha de admin
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
              <Input
                id="password"
                type="password"
                autoFocus
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="h-11 border-white/10 bg-slate-900/60 pl-9 text-white placeholder:text-slate-600 focus-visible:bg-slate-900"
              />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading || !password}
            className="h-11 w-full bg-emerald-400 font-semibold text-slate-950 hover:bg-emerald-300"
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Entrar"}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Cérebro operacional Mavo AI
        </p>
      </div>
    </main>
  )
}

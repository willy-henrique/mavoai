"use client"

import { Badge } from "@/components/ui/badge"
import { ImageIcon, MessageSquare } from "lucide-react"

type GroqMotorStripProps = {
  /** "header" = destaque no topo; "subtle" = linha discreta em cards */
  variant?: "header" | "subtle"
  className?: string
}

/**
 * Capacidades do motor Groq no produto: conversação + visão (mesma família Llama 4 Scout quando configurado no servidor).
 */
export function GroqMotorStrip({
  variant = "subtle",
  className = "",
}: GroqMotorStripProps) {
  const isHeader = variant === "header"
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${isHeader ? "text-sm" : "text-xs"} ${className}`}
      role="status"
      aria-label="Motor de inferência Groq: texto e imagens"
    >
      <Badge
        variant={isHeader ? "default" : "secondary"}
        className={
          isHeader
            ? "shrink-0 font-semibold tracking-tight"
            : "shrink-0 font-medium"
        }
      >
        Groq
      </Badge>
      <span
        className={
          isHeader
            ? "text-muted-foreground max-w-[min(100%,28rem)]"
            : "text-muted-foreground"
        }
      >
        {isHeader ? (
          <>
            <span className="font-medium text-foreground/90">Llama 4 Scout</span>
            <span className="mx-1.5 text-border">·</span>
            conversa e leitura de imagens no mesmo modelo
          </>
        ) : (
          <>
            Llama 4 Scout — texto e imagens
          </>
        )}
      </span>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="gap-1 font-normal text-[10px] uppercase tracking-wide">
          <MessageSquare className="h-3 w-3" aria-hidden />
          Chat
        </Badge>
        <Badge variant="outline" className="gap-1 font-normal text-[10px] uppercase tracking-wide">
          <ImageIcon className="h-3 w-3" aria-hidden />
          Visão
        </Badge>
      </div>
    </div>
  )
}

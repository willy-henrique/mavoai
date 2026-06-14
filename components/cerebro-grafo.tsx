"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import { Building2, GitBranch, Loader2, Maximize2, RefreshCcw, ZoomIn, ZoomOut } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { GrafoNodeData, GrafoLinkData } from "@/app/api/cerebro/grafo/route"

interface OrgOption { id: string; display_name: string }
const orgFetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Types ────────────────────────────────────────────────────────────────────

type SimNode = GrafoNodeData & {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  pinned: boolean
}

type SimLink = GrafoLinkData & {
  srcNode?: SimNode
  tgtNode?: SimNode
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BG = "#0a0c0f"
const EDGE_COLOR_DIM = "rgba(148,163,184,0.13)"
const EDGE_COLOR_HI = "rgba(226,232,240,0.55)"
const EDGE_COLOR_FADED = "rgba(148,163,184,0.04)"
const LABEL_DEFAULT = "rgba(203,213,225,0.8)"
const LABEL_HI = "#ffffff"

const GROUP_PALETTE: Record<string, string> = {
  fiscal: "#10b981",
  operacoes: "#6366f1",
  estoque: "#f59e0b",
  financeiro: "#3b82f6",
  cadastros: "#ec4899",
  infra: "#94a3b8",
  geral: "#e2e8f0",
}

const GROUP_LABELS: Record<string, string> = {
  fiscal: "Fiscal & Tributação",
  operacoes: "PDV & Operações",
  estoque: "Estoque & Compras",
  financeiro: "Financeiro",
  cadastros: "Cadastros",
  infra: "Infra & TI",
  geral: "Geral",
}

// ─── Physics ─────────────────────────────────────────────────────────────────

const K_REPULSION = 5500
const K_SPRING = 0.06
const REST_LEN = 130
const K_GRAVITY = 0.018
const DAMPING = 0.86
const MIN_DIST = 20
const ALPHA_INIT = 1.0
const ALPHA_MIN = 0.004
const ALPHA_DECAY = 0.0045
const ALPHA_REHEAT = 0.35

// ─── Component ───────────────────────────────────────────────────────────────

export function CerebroGrafo() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodes = useRef<SimNode[]>([])
  const links = useRef<SimLink[]>([])
  const rafRef = useRef<number>(0)
  const alphaRef = useRef(ALPHA_INIT)
  const transform = useRef({ x: 0, y: 0, scale: 1 })
  const hovered = useRef<SimNode | null>(null)
  const selected = useRef<SimNode | null>(null)
  const dragging = useRef<SimNode | null>(null)
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const isPanning = useRef(false)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selectedInfo, setSelectedInfo] = useState<SimNode | null>(null)
  const [stats, setStats] = useState({ nodes: 0, links: 0 })
  const [tenantId, setTenantId] = useState("auge")
  const [meta, setMeta] = useState<{ total_cases: number; embedded_cases: number; last_updated: string | null }>({ total_cases: 0, embedded_cases: 0, last_updated: null })

  const { data: orgs } = useSWR<OrgOption[]>("/api/organizations?active=true", orgFetcher)

  // ── Canvas helpers ──────────────────────────────────────────────────────────

  function worldPos(clientX: number, clientY: number) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    const t = transform.current
    return {
      x: (clientX - rect.left - t.x) / t.scale,
      y: (clientY - rect.top - t.y) / t.scale,
    }
  }

  function hitNode(wx: number, wy: number): SimNode | null {
    for (const n of nodes.current) {
      const dx = n.x - wx
      const dy = n.y - wy
      if (dx * dx + dy * dy <= (n.radius + 5) ** 2) return n
    }
    return null
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const { x: tx, y: ty, scale } = transform.current
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    ctx.save()
    ctx.translate(tx, ty)
    ctx.scale(scale, scale)

    const hov = hovered.current
    const sel = selected.current

    // Resolve link node refs once per draw
    const nodeMap = new Map(nodes.current.map((n) => [n.id, n]))
    for (const lk of links.current) {
      lk.srcNode = nodeMap.get(lk.source)
      lk.tgtNode = nodeMap.get(lk.target)
    }

    // Nó em foco (hover ou selecionado) + vizinhos diretos, para o modo de destaque.
    const focusNode = hov ?? sel
    let focusSet: Set<string> | null = null
    if (focusNode) {
      focusSet = new Set<string>([focusNode.id])
      for (const lk of links.current) {
        if (lk.source === focusNode.id) focusSet.add(lk.target)
        else if (lk.target === focusNode.id) focusSet.add(lk.source)
      }
    }

    // ── Edges ────────────────────────────────────────────────────────────────
    for (const lk of links.current) {
      const s = lk.srcNode
      const t = lk.tgtNode
      if (!s || !t) continue
      const touchesFocus = focusNode ? (lk.source === focusNode.id || lk.target === focusNode.id) : false
      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.lineTo(t.x, t.y)
      ctx.strokeStyle = touchesFocus ? EDGE_COLOR_HI : focusNode ? EDGE_COLOR_FADED : EDGE_COLOR_DIM
      ctx.lineWidth = touchesFocus ? 1.3 : 0.7
      ctx.stroke()
    }

    // ── Nodes ────────────────────────────────────────────────────────────────
    for (const n of nodes.current) {
      const isHov = hov?.id === n.id
      const isSel = sel?.id === n.id
      const active = isHov || isSel
      const color = GROUP_PALETTE[n.group] ?? (n.group.startsWith("#") ? n.group : GROUP_PALETTE.geral)
      // Em modo foco, atenua quem não é o nó em foco nem vizinho direto.
      const dim = focusSet ? !focusSet.has(n.id) : false

      ctx.globalAlpha = dim ? 0.18 : 1

      if (active) {
        // Glow
        const grd = ctx.createRadialGradient(n.x, n.y, n.radius * 0.5, n.x, n.y, n.radius * 3.5)
        grd.addColorStop(0, color + "66")
        grd.addColorStop(1, color + "00")
        ctx.beginPath()
        ctx.arc(n.x, n.y, n.radius * 3.5, 0, Math.PI * 2)
        ctx.fillStyle = grd
        ctx.fill()
      }

      // Círculo — SEMPRE com a cor do grupo
      ctx.beginPath()
      ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      // Borda: branca quando ativo (destaque); escura sutil em repouso (definição no fundo)
      ctx.lineWidth = active ? 2 : 1
      ctx.strokeStyle = active ? "#ffffff" : "rgba(10,12,15,0.55)"
      ctx.stroke()

      // Label
      const showLabel = scale > 0.45 || active
      if (showLabel) {
        const fs = Math.max(9, Math.min(12, 10 / scale))
        ctx.font = `${active ? "600" : "400"} ${fs}px Inter, system-ui, sans-serif`
        ctx.fillStyle = active ? LABEL_HI : LABEL_DEFAULT
        ctx.textAlign = "center"
        ctx.fillText(n.label, n.x, n.y + n.radius + fs + 3)
      }

      ctx.globalAlpha = 1
    }

    ctx.restore()
  }, [])

  // ── Physics tick ────────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    const alpha = alphaRef.current
    if (alpha < ALPHA_MIN) {
      draw()
      rafRef.current = requestAnimationFrame(tick)
      return
    }

    alphaRef.current = alpha * (1 - ALPHA_DECAY)

    const ns = nodes.current
    const ls = links.current
    const canvas = canvasRef.current
    if (!canvas) return

    const cx = canvas.width / (2 * transform.current.scale)
    const cy = canvas.height / (2 * transform.current.scale)

    for (let i = 0; i < ns.length; i++) {
      if (ns[i].pinned) continue
      let fx = 0
      let fy = 0

      // Repulsion
      for (let j = 0; j < ns.length; j++) {
        if (i === j) continue
        const dx = ns[i].x - ns[j].x
        const dy = ns[i].y - ns[j].y
        const d2 = dx * dx + dy * dy
        if (d2 < 1) continue
        const d = Math.max(Math.sqrt(d2), MIN_DIST)
        const f = (K_REPULSION * alpha) / (d * d)
        fx += (dx / d) * f
        fy += (dy / d) * f
      }

      // Springs
      for (const lk of ls) {
        const isSource = lk.source === ns[i].id
        const isTarget = lk.target === ns[i].id
        if (!isSource && !isTarget) continue
        const other = isSource ? lk.tgtNode : lk.srcNode
        if (!other) continue
        const dx = other.x - ns[i].x
        const dy = other.y - ns[i].y
        const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
        const f = K_SPRING * (d - REST_LEN)
        fx += (dx / d) * f
        fy += (dy / d) * f
      }

      // Center gravity
      fx += (cx - ns[i].x) * K_GRAVITY * alpha
      fy += (cy - ns[i].y) * K_GRAVITY * alpha

      ns[i].vx = (ns[i].vx + fx) * DAMPING
      ns[i].vy = (ns[i].vy + fy) * DAMPING
      ns[i].x += ns[i].vx
      ns[i].y += ns[i].vy
    }

    draw()
    rafRef.current = requestAnimationFrame(tick)
  }, [draw])

  // ── Load data ───────────────────────────────────────────────────────────────

  const loadGraph = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res = await fetch(`/api/cerebro/grafo?tenant_id=${tenantId}`)
      if (!res.ok) throw new Error("fetch failed")
      const data: { nodes: GrafoNodeData[]; links: GrafoLinkData[]; meta?: { total_cases: number; embedded_cases: number; last_updated: string | null } } = await res.json()

      if (data.meta) setMeta(data.meta)

      const canvas = canvasRef.current
      const W = canvas?.width ?? 900
      const H = canvas?.height ?? 600
      const cx = W / 2
      const cy = H / 2

      const valMap = new Map(data.nodes.map((n) => [n.id, n.val ?? 1]))
      const linkCount = new Map<string, number>()
      for (const lk of data.links) {
        linkCount.set(lk.source, (linkCount.get(lk.source) ?? 0) + 1)
        linkCount.set(lk.target, (linkCount.get(lk.target) ?? 0) + 1)
      }

      const simNodes: SimNode[] = data.nodes.map((n) => {
        const angle = Math.random() * Math.PI * 2
        const r = 100 + Math.random() * 150
        const connections = linkCount.get(n.id) ?? 0
        return {
          ...n,
          x: cx + Math.cos(angle) * r,
          y: cy + Math.sin(angle) * r,
          vx: 0,
          vy: 0,
          radius: 3 + Math.min(7, (valMap.get(n.id) ?? 1) + connections * 0.4),
          pinned: false,
        }
      })

      const nodeMap = new Map(simNodes.map((n) => [n.id, n]))
      const simLinks: SimLink[] = data.links.map((lk) => ({
        ...lk,
        srcNode: nodeMap.get(lk.source),
        tgtNode: nodeMap.get(lk.target),
      }))

      nodes.current = simNodes
      links.current = simLinks
      alphaRef.current = ALPHA_INIT
      hovered.current = null
      selected.current = null
      setSelectedInfo(null)
      setStats({ nodes: simNodes.length, links: simLinks.length })
      setLoading(false)
    } catch {
      setError(true)
      setLoading(false)
    }
  }, [tenantId])

  // ── Resize ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return

    const ro = new ResizeObserver(() => {
      canvas.width = wrap.clientWidth
      canvas.height = wrap.clientHeight
    })
    ro.observe(wrap)
    canvas.width = wrap.clientWidth
    canvas.height = wrap.clientHeight
    return () => ro.disconnect()
  }, [])

  // ── Start loop ──────────────────────────────────────────────────────────────

  useEffect(() => {
    loadGraph().then(() => {
      rafRef.current = requestAnimationFrame(tick)
    })
    // Auto-refresh: recarrega dados do DB a cada 60s (sem resetar a física)
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/cerebro/grafo?tenant_id=${tenantId}`)
        if (!res.ok) return
        const data = await res.json()
        if (data.meta) setMeta(data.meta)
        // Atualiza val e casos sem resetar posições (reheat suave)
        if (Array.isArray(data.nodes)) {
          const valMap = new Map(data.nodes.map((n: GrafoNodeData) => [n.id, n]))
          for (const node of nodes.current) {
            const updated = valMap.get(node.id) as GrafoNodeData | undefined
            if (updated) {
              node.val = updated.val
              ;(node as SimNode & { cases_total?: number; cases_embedded?: number; embedding_pct?: number }).cases_total = (updated as GrafoNodeData & { cases_total: number }).cases_total
              ;(node as SimNode & { cases_embedded?: number }).cases_embedded = (updated as GrafoNodeData & { cases_embedded: number }).cases_embedded
              ;(node as SimNode & { embedding_pct?: number }).embedding_pct = (updated as GrafoNodeData & { embedding_pct: number }).embedding_pct
              node.radius = 3 + Math.min(7, (updated.val ?? 1) + 0.4)
            }
          }
          alphaRef.current = Math.max(alphaRef.current, ALPHA_REHEAT * 0.3)
        }
      } catch { /* silencioso */ }
    }, 60_000)

    return () => {
      cancelAnimationFrame(rafRef.current)
      clearInterval(interval)
    }
  }, [loadGraph, tick, tenantId])

  // ── Mouse events ────────────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseMove = (e: MouseEvent) => {
      const { x, y } = worldPos(e.clientX, e.clientY)
      const n = hitNode(x, y)

      if (dragging.current) {
        dragging.current.x = x
        dragging.current.y = y
        dragging.current.vx = 0
        dragging.current.vy = 0
        alphaRef.current = Math.max(alphaRef.current, 0.1)
        return
      }

      if (isPanning.current) {
        transform.current.x = panStart.current.tx + (e.clientX - panStart.current.x)
        transform.current.y = panStart.current.ty + (e.clientY - panStart.current.y)
        return
      }

      if (hovered.current?.id !== n?.id) {
        hovered.current = n
        canvas.style.cursor = n ? "pointer" : "grab"
      }
    }

    const onMouseDown = (e: MouseEvent) => {
      const { x, y } = worldPos(e.clientX, e.clientY)
      const n = hitNode(x, y)
      if (n) {
        dragging.current = n
        n.pinned = true
        canvas.style.cursor = "grabbing"
      } else {
        isPanning.current = true
        panStart.current = { x: e.clientX, y: e.clientY, tx: transform.current.x, ty: transform.current.y }
        canvas.style.cursor = "grabbing"
      }
    }

    const onMouseUp = (e: MouseEvent) => {
      if (dragging.current) {
        const n = dragging.current
        // Release pin unless it's a very short drag (just a click)
        const { x, y } = worldPos(e.clientX, e.clientY)
        const dx = Math.abs(n.x - x)
        const dy = Math.abs(n.y - y)
        if (dx < 5 && dy < 5) {
          n.pinned = false
          // Click: select/deselect
          const prev = selected.current
          selected.current = prev?.id === n.id ? null : n
          setSelectedInfo(prev?.id === n.id ? null : n)
          alphaRef.current = ALPHA_REHEAT
        }
        dragging.current = null
      }
      isPanning.current = false
      canvas.style.cursor = hovered.current ? "pointer" : "grab"
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12
      const t = transform.current
      const newScale = Math.max(0.15, Math.min(4, t.scale * factor))
      transform.current = {
        x: mx - (mx - t.x) * (newScale / t.scale),
        y: my - (my - t.y) * (newScale / t.scale),
        scale: newScale,
      }
    }

    const onDblClick = () => {
      // Reset zoom/pan
      transform.current = { x: 0, y: 0, scale: 1 }
    }

    canvas.addEventListener("mousemove", onMouseMove)
    canvas.addEventListener("mousedown", onMouseDown)
    canvas.addEventListener("mouseup", onMouseUp)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("dblclick", onDblClick)

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove)
      canvas.removeEventListener("mousedown", onMouseDown)
      canvas.removeEventListener("mouseup", onMouseUp)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("dblclick", onDblClick)
    }
  }, [])

  // ── Actions ──────────────────────────────────────────────────────────────────

  function handleRefresh() {
    cancelAnimationFrame(rafRef.current)
    loadGraph().then(() => {
      rafRef.current = requestAnimationFrame(tick)
    })
  }

  function handleZoom(dir: 1 | -1) {
    const factor = dir === 1 ? 1.25 : 1 / 1.25
    const t = transform.current
    const canvas = canvasRef.current
    if (!canvas) return
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const newScale = Math.max(0.15, Math.min(4, t.scale * factor))
    transform.current = {
      x: cx - (cx - t.x) * (newScale / t.scale),
      y: cy - (cy - t.y) * (newScale / t.scale),
      scale: newScale,
    }
  }

  function handleFit() {
    transform.current = { x: 0, y: 0, scale: 1 }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-h-[640px] flex-col gap-0 overflow-hidden rounded-xl border border-white/10 bg-[#0a0c0f] shadow-2xl">
      {/* Toolbar */}
      <div className="flex items-center gap-3 border-b border-white/8 px-4 py-2.5">
        <GitBranch className="size-4 text-emerald-400" />
        <span className="text-sm font-semibold text-slate-200">Mapa de Conhecimento</span>
        <div className="ml-1 flex items-center gap-2">
          <Badge className="border-emerald-400/20 bg-emerald-400/10 text-emerald-300 text-[10px]">
            {stats.nodes} nós
          </Badge>
          <Badge className="border-slate-400/20 bg-slate-400/10 text-slate-300 text-[10px]">
            {stats.links} conexões
          </Badge>
          {meta.total_cases > 0 && (
            <Badge className="border-blue-400/20 bg-blue-400/10 text-blue-300 text-[10px]">
              {meta.embedded_cases}/{meta.total_cases} indexados
            </Badge>
          )}
        </div>

        {/* Company selector */}
        {orgs && orgs.length > 1 && (
          <div className="ml-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1">
            <Building2 className="size-3 text-slate-400 shrink-0" />
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="bg-transparent text-xs text-slate-300 outline-none cursor-pointer"
            >
              {orgs.map((o) => (
                <option key={o.id} value={o.id} className="bg-slate-900 text-slate-200">
                  {o.display_name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:bg-white/8 hover:text-white"
            onClick={() => handleZoom(1)}
            title="Aproximar"
          >
            <ZoomIn className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:bg-white/8 hover:text-white"
            onClick={() => handleZoom(-1)}
            title="Afastar"
          >
            <ZoomOut className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:bg-white/8 hover:text-white"
            onClick={handleFit}
            title="Centralizar"
          >
            <Maximize2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-slate-400 hover:bg-white/8 hover:text-white"
            onClick={handleRefresh}
            title="Recarregar"
          >
            <RefreshCcw className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Graph area */}
      <div className="relative flex flex-1">
        <div ref={wrapRef} className="relative flex-1 overflow-hidden">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c0f]">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-7 animate-spin text-emerald-400" />
                <span className="text-xs text-slate-500">Mapeando conhecimento...</span>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0a0c0f]">
              <div className="flex flex-col items-center gap-3 text-center">
                <span className="text-sm text-slate-400">Falha ao carregar grafo</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-white/10 text-slate-300 hover:bg-white/8"
                  onClick={handleRefresh}
                >
                  Tentar novamente
                </Button>
              </div>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className="block h-full w-full"
            style={{ cursor: "grab" }}
          />
        </div>

        {/* Side panel — node details */}
        {selectedInfo && (
          <div className="w-56 shrink-0 border-l border-white/8 bg-[#0d1117] p-4">
            <div className="mb-3 flex items-start gap-2">
              <div
                className="mt-0.5 size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: GROUP_PALETTE[selectedInfo.group] ?? (selectedInfo.group.startsWith("#") ? selectedInfo.group : "#e2e8f0") }}
              />
              <span className="text-sm font-semibold text-slate-100 leading-tight">
                {selectedInfo.label}
              </span>
            </div>
            <div className="space-y-2 text-[11px]">
              <div className="flex justify-between">
                <span className="text-slate-500">Grupo</span>
                <span className="text-slate-300 font-medium">
                  {GROUP_LABELS[selectedInfo.group] ?? selectedInfo.group}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Casos totais</span>
                <span className="text-slate-200 font-mono font-semibold">
                  {(selectedInfo as unknown as { cases_total?: number }).cases_total ?? selectedInfo.val}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Com embedding</span>
                <span className="text-emerald-400 font-mono">
                  {(selectedInfo as unknown as { cases_embedded?: number }).cases_embedded ?? "–"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cobertura</span>
                <span className={(((selectedInfo as unknown as { embedding_pct?: number }).embedding_pct ?? 0) >= 70) ? "text-emerald-400" : "text-amber-400"}>
                  {(selectedInfo as unknown as { embedding_pct?: number }).embedding_pct ?? 0}%
                </span>
              </div>
              {/* Barra de cobertura */}
              <div className="w-full rounded-full bg-white/10 h-1.5 mt-1">
                <div
                  className="h-1.5 rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min((selectedInfo as unknown as { embedding_pct?: number }).embedding_pct ?? 0, 100)}%` }}
                />
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Conexões</span>
                <span className="text-slate-300">
                  {links.current.filter(
                    (l) => l.source === selectedInfo.id || l.target === selectedInfo.id,
                  ).length}
                </span>
              </div>
            </div>
            <button
              className="mt-4 text-[10px] text-slate-600 hover:text-slate-400"
              onClick={() => { selected.current = null; setSelectedInfo(null) }}
            >
              Fechar ×
            </button>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-white/8 px-4 py-2">
        {tenantId === "auge"
          ? Object.entries(GROUP_PALETTE).map(([group, color]) => (
              <div key={group} className="flex items-center gap-1.5">
                <div className="size-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[10px] text-slate-400">{GROUP_LABELS[group] ?? group}</span>
              </div>
            ))
          : nodes.current
              .filter((n, i, arr) => arr.findIndex((x) => x.group === n.group) === i)
              .map((n) => (
                <div key={n.group} className="flex items-center gap-1.5">
                  <div
                    className="size-2 rounded-full"
                    style={{ backgroundColor: n.group.startsWith("#") ? n.group : GROUP_PALETTE.geral }}
                  />
                  <span className="text-[10px] text-slate-400">{n.label}</span>
                </div>
              ))}

        {/* Totais do banco */}
        {meta.total_cases > 0 && (
          <div className="ml-auto flex items-center gap-3 text-[10px]">
            <span className="text-slate-500">
              <span className="text-slate-300 font-mono font-semibold">{meta.embedded_cases}</span>
              /{meta.total_cases} casos indexados
            </span>
            {meta.last_updated && (
              <span className="text-slate-600">
                ↻ {new Date(meta.last_updated).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>
        )}
        {meta.total_cases === 0 && (
          <span className="ml-auto text-[10px] text-slate-600">
            Scroll para zoom · Arraste para mover · Clique no nó para detalhes
          </span>
        )}
      </div>
    </div>
  )
}

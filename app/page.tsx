"use client"

import { useState } from "react"
import {
  Activity,
  Bell,
  Brain,
  BrainCircuit,
  Building2,
  Command,
  Database,
  LayoutDashboard,
  List,
  Network,
  Plus,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react"
import { AtendimentoForm } from "@/components/atendimento-form"
import { AtendimentosList } from "@/components/atendimentos-list"
import { CerebroGrafo } from "@/components/cerebro-grafo"
import { Dashboard } from "@/components/dashboard"
import { EmpresasPanel } from "@/components/empresas-panel"
import { GroqMotorStrip } from "@/components/groq-motor-strip"
import { HubPanel } from "@/components/hub-panel"
import { PlatformasPanel } from "@/components/plataformas-panel"
import { SearchConsole } from "@/components/search-console"
import { SettingsPanel } from "@/components/settings-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const NAV_TABS = [
  {
    value: "dashboard",
    label: "Dashboard",
    description: "Visão geral",
    icon: LayoutDashboard,
  },
  {
    value: "buscar",
    label: "Buscar",
    description: "Base RAG",
    icon: Search,
  },
  {
    value: "cadastrar",
    label: "Cadastrar",
    description: "Novo caso",
    icon: Plus,
  },
  {
    value: "atendimentos",
    label: "Atendimentos",
    description: "Histórico",
    icon: List,
  },
  {
    value: "plataformas",
    label: "Plataformas",
    description: "Integrações",
    icon: Network,
  },
  {
    value: "hub",
    label: "Hub",
    description: "Central de controle",
    icon: Command,
  },
  {
    value: "cerebro",
    label: "Cérebro",
    description: "Mapa de conhecimento",
    icon: Brain,
  },
  {
    value: "empresas",
    label: "Empresas",
    description: "Multi-empresa",
    icon: Building2,
  },
  {
    value: "configuracoes",
    label: "Configurações",
    description: "Operação",
    icon: Settings2,
  },
]

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0)
  const [activeTab, setActiveTab] = useState("dashboard")

  const handleAtendimentoCriado = () => {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="min-h-screen gap-0 bg-[radial-gradient(circle_at_top_left,hsl(171_74%_96%),transparent_34rem),linear-gradient(180deg,hsl(215_35%_97%),hsl(210_30%_99%))] text-slate-950 lg:grid lg:grid-cols-[17.5rem_minmax(0,1fr)]"
    >
      <aside className="hidden min-h-screen border-r border-slate-200/80 bg-slate-950 text-white shadow-2xl shadow-slate-950/10 lg:flex lg:flex-col">
        <div className="flex h-20 items-center gap-3 border-b border-white/10 px-5">
          <div className="flex size-10 items-center justify-center rounded-lg bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-400/20">
            <BrainCircuit className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-base font-bold tracking-tight">
                Mavo AI
              </span>
              <span className="text-xs font-semibold text-emerald-300">
                Core
              </span>
            </div>
            <p className="truncate text-xs text-slate-400">
              Cérebro operacional
            </p>
          </div>
        </div>

        <div className="px-4 py-5">
          <TabsList className="flex h-auto w-full flex-col items-stretch gap-1 rounded-none bg-transparent p-0">
            {NAV_TABS.map(({ value, label, description, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="group h-12 justify-start gap-3 rounded-lg border border-transparent px-3 text-left text-slate-300 shadow-none transition-colors hover:bg-white/[0.07] hover:text-white data-[state=active]:border-emerald-300/25 data-[state=active]:bg-emerald-400/12 data-[state=active]:text-emerald-100 data-[state=active]:shadow-none"
              >
                <Icon className="size-4 text-slate-400 transition-colors group-data-[state=active]:text-emerald-300" />
                <span className="grid min-w-0 flex-1 gap-0.5">
                  <span className="truncate text-sm font-semibold">
                    {label}
                  </span>
                  <span className="truncate text-[11px] font-normal text-slate-500 group-data-[state=active]:text-emerald-200/70">
                    {description}
                  </span>
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="mt-auto space-y-4 border-t border-white/10 p-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">
                Runtime
              </span>
              <Badge className="border-emerald-300/20 bg-emerald-300/10 text-emerald-200">
                Online
              </Badge>
            </div>
            <GroqMotorStrip variant="subtle" className="text-slate-400" />
          </div>
          <Button
            variant="ghost"
            className="h-10 w-full justify-start gap-2 rounded-lg text-slate-300 hover:bg-white/[0.07] hover:text-white"
          >
            <ShieldCheck className="size-4" />
            Produção segura
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/86 backdrop-blur-xl">
          <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-3 lg:hidden">
              <div className="flex size-9 items-center justify-center rounded-lg bg-slate-950 text-emerald-300">
                <BrainCircuit className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-950">
                  Mavo AI
                </p>
                <p className="truncate text-[11px] text-slate-500">
                  Cérebro operacional
                </p>
              </div>
            </div>

            <div className="relative hidden w-full max-w-md sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-10 rounded-full border-slate-200 bg-slate-100/80 pl-9 shadow-none focus-visible:bg-white"
                placeholder="Buscar atendimento, cliente ou categoria..."
              />
            </div>

            <div className="ml-auto flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm md:flex">
                <Activity className="size-3.5 text-emerald-500" />
                Operação ativa
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-lg text-slate-600"
              >
                <Bell className="size-4" />
              </Button>
              <div className="hidden h-8 w-px bg-slate-200 sm:block" />
              <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-3 shadow-sm">
                <span className="flex size-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <UserRound className="size-4" />
                </span>
                <span className="hidden text-sm font-semibold text-slate-800 sm:inline">
                  admin
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 px-4 py-2 lg:hidden">
            <TabsList className="grid h-auto w-full grid-cols-9 gap-1 rounded-lg bg-slate-100 p-1">
              {NAV_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="h-10 rounded-md px-1 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
                  title={label}
                >
                  <Icon className="size-4" />
                  <span className="sr-only">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-[92rem]">
            <TabsContent value="dashboard" className="mt-0">
              <Dashboard />
            </TabsContent>

            <TabsContent value="buscar" className="mt-0">
              <WorkspaceHeader
                icon={Sparkles}
                label="Consulta"
                title="Busca operacional"
                description="Respostas assistidas com base semântica."
              />
              <SearchConsole />
            </TabsContent>

            <TabsContent value="cadastrar" className="mt-0">
              <WorkspaceHeader
                icon={Plus}
                label="Registro"
                title="Cadastrar atendimento"
                description="Entrada manual de casos para alimentar o Cérebro."
              />
              <AtendimentoForm onSuccess={handleAtendimentoCriado} />
            </TabsContent>

            <TabsContent value="atendimentos" className="mt-0">
              <WorkspaceHeader
                icon={List}
                label="Histórico"
                title="Atendimentos"
                description="Casos processados, pendentes e base de conhecimento."
              />
              <AtendimentosList refreshKey={refreshKey} />
            </TabsContent>

            <TabsContent value="plataformas" className="mt-0">
              <WorkspaceHeader
                icon={Network}
                label="Integrações"
                title="Plataformas conectadas"
                description="Monitore e gerencie as plataformas que enviam dados para o Cérebro."
              />
              <PlatformasPanel />
            </TabsContent>

            <TabsContent value="hub" className="mt-0">
              <WorkspaceHeader
                icon={Command}
                label="Central"
                title="Hub de Controle"
                description="Acesse e configure todo o ecossistema Mavo AI em um só lugar."
              />
              <HubPanel />
            </TabsContent>

            <TabsContent value="cerebro" className="mt-0">
              <WorkspaceHeader
                icon={Brain}
                label="Conhecimento"
                title="Cérebro — Mapa de Conhecimento"
                description="Visualize os domínios do AUGE ERP e as relações entre módulos."
              />
              <CerebroGrafo />
            </TabsContent>

            <TabsContent value="empresas" className="mt-0">
              <WorkspaceHeader
                icon={Building2}
                label="Multi-empresa"
                title="Empresas"
                description="Cadastre empresas e importe o conhecimento de cada uma para o Cérebro."
              />
              <EmpresasPanel onNavigateToCerebro={() => setActiveTab("cerebro")} />
            </TabsContent>

            <TabsContent value="configuracoes" className="mt-0">
              <WorkspaceHeader
                icon={Database}
                label="Sistema"
                title="Configurações"
                description="Saúde, integrações, banco e categorias."
              />
              <SettingsPanel />
            </TabsContent>
          </div>
        </main>
      </div>
    </Tabs>
  )
}

function WorkspaceHeader({
  icon: Icon,
  label,
  title,
  description,
}: {
  icon: typeof LayoutDashboard
  label: string
  title: string
  description: string
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600 shadow-sm">
          <Icon className="size-3.5 text-emerald-600" />
          {label}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            {description}
          </p>
        </div>
      </div>
    </div>
  )
}

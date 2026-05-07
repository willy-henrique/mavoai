"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AtendimentoForm } from "@/components/atendimento-form"
import { AtendimentosList } from "@/components/atendimentos-list"
import { Dashboard } from "@/components/dashboard"
import { SearchConsole } from "@/components/search-console"
import { SettingsPanel } from "@/components/settings-panel"
import {
  LayoutDashboard,
  Plus,
  List,
  Search,
  Settings2,
  BrainCircuit,
} from "lucide-react"
import { GroqMotorStrip } from "@/components/groq-motor-strip"

const NAV_TABS = [
  { value: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { value: "buscar", label: "Buscar", icon: Search },
  { value: "cadastrar", label: "Cadastrar", icon: Plus },
  { value: "atendimentos", label: "Atendimentos", icon: List },
  { value: "configuracoes", label: "Configurações", icon: Settings2 },
]

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0)

  const handleAtendimentoCriado = () => {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="container mx-auto flex h-14 items-center gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BrainCircuit className="h-4.5 w-4.5" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex flex-col leading-none">
                <span className="text-sm font-bold tracking-tight">Mavo AI</span>
                <span className="text-[10px] text-muted-foreground hidden sm:block">
                  Inteligência operacional
                </span>
              </div>
              <GroqMotorStrip
                variant="header"
                className="hidden min-w-0 border-l border-border pl-0 sm:flex sm:pl-3"
              />
            </div>
          </div>
        </div>
      </header>

      <div className="border-b bg-muted/15 px-4 py-2 sm:hidden">
        <GroqMotorStrip variant="subtle" />
      </div>

      {/* Main */}
      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard">
          {/* Tab bar */}
          <div className="mb-6 border-b">
            <TabsList className="h-auto gap-0 rounded-none bg-transparent p-0">
              {NAV_TABS.map(({ value, label, icon: Icon }) => (
                <TabsTrigger
                  key={value}
                  value={value}
                  className="relative h-10 gap-2 rounded-none border-b-2 border-transparent px-4 pb-3 pt-2 text-sm font-medium text-muted-foreground transition-none data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none hover:text-foreground"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline">{label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <TabsContent value="dashboard" className="mt-0">
            <Dashboard />
          </TabsContent>

          <TabsContent value="buscar" className="mt-0">
            <SearchConsole />
          </TabsContent>

          <TabsContent value="cadastrar" className="mt-0">
            <AtendimentoForm onSuccess={handleAtendimentoCriado} />
          </TabsContent>

          <TabsContent value="atendimentos" className="mt-0">
            <AtendimentosList refreshKey={refreshKey} />
          </TabsContent>

          <TabsContent value="configuracoes" className="mt-0">
            <SettingsPanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

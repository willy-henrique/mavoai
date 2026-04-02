"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AtendimentoForm } from "@/components/atendimento-form"
import { AtendimentosList } from "@/components/atendimentos-list"
import { Dashboard } from "@/components/dashboard"
import { SearchConsole } from "@/components/search-console"
import {
  LayoutDashboard,
  Plus,
  List,
  Search,
  Database,
} from "lucide-react"

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0)

  const handleAtendimentoCriado = () => {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <Database className="h-6 w-6" />
            <h1 className="text-lg font-semibold">
              Sistema de Inteligencia Operacional
            </h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="dashboard" className="flex flex-col gap-6">
          <TabsList className="w-full justify-start">
            <TabsTrigger value="dashboard" className="gap-2">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </TabsTrigger>
            <TabsTrigger value="buscar" className="gap-2">
              <Search className="h-4 w-4" />
              <span className="hidden sm:inline">Buscar Solucoes</span>
            </TabsTrigger>
            <TabsTrigger value="cadastrar" className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Cadastrar</span>
            </TabsTrigger>
            <TabsTrigger value="atendimentos" className="gap-2">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Atendimentos</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard />
          </TabsContent>

          <TabsContent value="buscar">
            <SearchConsole />
          </TabsContent>

          <TabsContent value="cadastrar">
            <AtendimentoForm onSuccess={handleAtendimentoCriado} />
          </TabsContent>

          <TabsContent value="atendimentos">
            <AtendimentosList refreshKey={refreshKey} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}

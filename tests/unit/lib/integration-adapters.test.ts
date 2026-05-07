import { describe, expect, it } from "vitest"
import {
  adaptMavoGestaoPayload,
  adaptMtalkPayload,
} from "@/lib/integration-adapters"
import {
  getIntegrationDisplayName,
  normalizeSourceSystem,
} from "@/lib/integration-sources"

describe("integration-sources", () => {
  it("normaliza aliases conhecidos", () => {
    expect(normalizeSourceSystem("Will Talk")).toBe("willtalk")
    expect(normalizeSourceSystem("M-Talk")).toBe("mtalk")
    expect(normalizeSourceSystem("Mavo Gestao ERP")).toBe("mavo_gestao")
  })

  it("gera nome amigavel para origem conhecida", () => {
    expect(getIntegrationDisplayName("mavo_gestao")).toBe("Mavo Gestao")
  })
})

describe("adaptMtalkPayload", () => {
  it("mapeia payload flexivel do MTalk para o contrato canonico", () => {
    const payload = adaptMtalkPayload({
      event_id: "evt-1",
      conversation: {
        id: "conv-99",
        channel: "whatsapp",
      },
      contact: {
        name: "Cliente MTalk",
      },
      message: {
        text: "Minha impressora nao imprime",
      },
      organization_id: "tenant-mtalk",
      agent_name: "Fila Hardware",
      created_at: "2026-05-04T12:00:00.000Z",
    })

    expect(payload.ticket_id).toBe("conv-99")
    expect(payload.cliente).toBe("Cliente MTalk")
    expect(payload.mensagens).toContain("Minha impressora nao imprime")
    expect(payload.canal).toBe("whatsapp")
    expect(payload.tecnico).toBe("Fila Hardware")
    expect(payload.metadata.sourceSystem).toBe("mtalk")
    expect(payload.metadata.sourceEntityId).toBe("evt-1")
    expect(payload.metadata.tenantId).toBe("tenant-mtalk")
  })
})

describe("adaptMavoGestaoPayload", () => {
  it("consolida descricao e detalhes do ERP Mavo Gestao", () => {
    const payload = adaptMavoGestaoPayload({
      chamado_id: "chg-10",
      titulo: "Erro no cadastro de produto",
      descricao: "Ao salvar o produto o sistema trava",
      detalhes: "Acontece em duas lojas",
      cliente: {
        razao_social: "Loja Centro",
      },
      empresa_id: "grupo-1",
      responsavel: {
        nome: "ERP N1",
      },
      updated_at: "2026-05-04T14:30:00.000Z",
    })

    expect(payload.ticket_id).toBe("chg-10")
    expect(payload.cliente).toBe("Loja Centro")
    expect(payload.canal).toBe("erp")
    expect(payload.mensagens).toContain("Erro no cadastro de produto")
    expect(payload.mensagens).toContain("Ao salvar o produto o sistema trava")
    expect(payload.mensagens).toContain("Acontece em duas lojas")
    expect(payload.tecnico).toBe("ERP N1")
    expect(payload.metadata.sourceSystem).toBe("mavo_gestao")
    expect(payload.metadata.tenantId).toBe("grupo-1")
  })
})

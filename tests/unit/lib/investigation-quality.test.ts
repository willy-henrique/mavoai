import { describe, it, expect } from "vitest"
import { parseInvestigationEvalJson } from "@/lib/investigation-quality"

describe("parseInvestigationEvalJson", () => {
  it("parseia JSON puro", () => {
    const r = parseInvestigationEvalJson(
      `{"nivel":"insuficiente","motivoCurto":"só menu","textoResposta":"Preciso do print da tela do sistema."}`,
    )
    expect(r?.nivel).toBe("insuficiente")
    expect(r?.motivoCurto).toBe("só menu")
  })

  it("remove cercas markdown", () => {
    const r = parseInvestigationEvalJson(
      "```json\n{\"nivel\":\"fora_do_tema\",\"motivoCurto\":\"x\",\"textoResposta\":\"Foco no chamado.\"}\n```",
    )
    expect(r?.nivel).toBe("fora_do_tema")
  })

  it("rejeita nivel invalido", () => {
    expect(
      parseInvestigationEvalJson(
        '{"nivel":"talvez","motivoCurto":"x","textoResposta":"y"}',
      ),
    ).toBeNull()
  })
})

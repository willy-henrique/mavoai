import { describe, it, expect } from "vitest"
import { ehSaudacaoPura } from "@/lib/assisted-response"

describe("ehSaudacaoPura — abreviações de período (bug do 'tarde')", () => {
  it.each([
    "tarde",
    "Tarde",
    "tarde!",
    "dia",
    "noite",
    "boa tarde",
    "bom dia",
    "boa noite",
    "oi",
    "olá",
    "opa, tudo bem",
  ])("reconhece '%s' como saudação pura", (msg) => {
    expect(ehSaudacaoPura(msg)).toBe(true)
  })

  it.each([
    "dia 15 não fechou o caixa", // não pode ser confundido com saudação
    "tarde demais pra cancelar a nota",
    "rejeição 539 csosn inválido",
    "o pdv não abre",
    "prazo de cancelamento superior ao previsto",
  ])("NÃO confunde '%s' com saudação", (msg) => {
    expect(ehSaudacaoPura(msg)).toBe(false)
  })
})

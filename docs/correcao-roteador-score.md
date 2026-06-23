# Correção do roteador — fórmula de score (junho/2026)

> Documento de registro da correção do roteador de domínios (`lib/ia-router.ts`).
> Motivo: o Gustavo pediu para registrar "em algum lugar para a gente não perder".

## O sintoma

Mensagens com **uma única palavra-chave** de um domínio (ex.: `"caixa travado"`,
`"o pdv não abre"`) pontuavam **0,28** e caíam no **fallback genérico** — o
especialista certo (PDV) **não era acionado**. Diagnóstico do time confirmou:
score 0,28, abaixo do limiar mínimo de 0,4.

## A causa-raiz

A fórmula de pontuação **normalizava pela raiz quadrada do total de keywords** do
agente:

```
score = nº_de_keywords_que_bateram / √(total_de_keywords_do_agente)
```

O agente PDV tem 13 keywords. Com **1** keyword batendo:

```
1 / √13 = 1 / 3,606 = 0,277  ≈  0,28   →  abaixo de 0,4  →  fallback
```

O problema conceitual: **a fórmula punia agentes com vocabulário rico.** Quanto
mais sinônimos um agente cobria, **menor** era o score por acerto. Isso é o
inverso do desejado. O Fiscal (17 keywords) sofria ainda mais: `1/√17 = 0,24`.

### Por que a recomendação original do documento não resolveria

O documento sugeria duas opções:
- **Opção A** — baixar o limiar de 0,4 → 0,25 só para o PDV. Funciona, mas é
  paliativo e não corrige a raiz (o Fiscal continuaria quebrado).
- **Opção B** — adicionar mais keywords ao PDV. **Pioraria o problema**: mais
  keywords aumentam o denominador `√(total)`, então o score de 1 acerto **cai**
  ainda mais (com 22 keywords, `1/√22 = 0,21`).

## A correção aplicada

A confiança passou a depender **só do número de keywords que bateram**, com
retornos decrescentes, **sem** o tamanho do vocabulário no denominador:

```
score = 1 − 1 / (matched + 1,2)
```

| keywords batidas | score antigo (PDV, 13 kw) | score novo |
|------------------|---------------------------|------------|
| 1                | 0,28 ❌ (fallback)         | **0,55** ✅ |
| 2                | 0,55                      | **0,69**   |
| 3                | 0,83                      | **0,76**   |
| 4                | —                         | **0,81**   |

Limiares mantidos: `≥ 0,7` roteia direto por keywords; `0,4–0,7` desempata via
LLM; `< 0,4` cai no fallback. O desempate entre agentes com o mesmo nº de acertos
usa a **especificidade** (`matched / total_keywords`) como critério secundário, e
há um atalho: se só **um** agente bate keywords, roteia direto sem gastar chamada
de LLM.

## Onde está

- Código: [`lib/ia-router.ts`](../lib/ia-router.ts) — funções `countMatches` e
  `confidenceFromMatches`.
- Teste de regressão: [`tests/unit/lib/ia-router.test.ts`](../tests/unit/lib/ia-router.test.ts).

## Resultado em produção

Health-check dos 20 casos adversariais (`scripts/validar-regressao.mjs`):
**95% de roteamento, 100% de conteúdo, 0 invenção em fallback.**

### Único caso que ainda falhava (e o ajuste)

`"NF-e em contingência há mais de 24h"` roteava para **PDV** em vez de **Fiscal**,
porque a keyword `contingência` existia só no PDV (e `NF-e` com hífen não batia
com `nfe`). Ajuste: `contingência`, `contingencia` e `nf-e` foram adicionadas às
keywords do Fiscal — agora os dois domínios pontuam e o desempate por LLM escolhe
o Fiscal pelo contexto. (Aplicar com `node scripts/seed-especialistas.mjs`.)

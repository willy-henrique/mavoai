# Testes manuais do MVP

Este roteiro valida os dois pontos criticos:
- busca semantica (top-3)
- resposta assistida

## Pre-requisitos

- Banco com scripts aplicados (`001` ou `002`)
- Variaveis `.env.local` preenchidas
- App rodando (`npm run dev`)

## Caso de teste 1 - Ingestao e processamento

### Entrada

```bash
curl -X POST http://localhost:3000/api/ingestao/willtalk \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id":"WT-VAL-001",
    "cliente":"Loja Centro",
    "canal":"whatsapp",
    "mensagens":"Cliente reporta impressora termica sem imprimir cupom apos reinicio.",
    "tecnico":"Carlos",
    "data_evento":"2026-03-26T18:30:00Z"
  }'
```

### Esperado

- HTTP `200`
- Campo `atendimento_id` retornado
- Registro em `atendimentos` com `processado=true` em poucos segundos

## Caso de teste 2 - Busca semantica top-3

### Entrada

```bash
curl -X POST http://localhost:3000/api/busca-semantica \
  -H "Content-Type: application/json" \
  -d '{ "texto": "impressora termica nao imprime cupom fiscal" }'
```

### Esperado

- HTTP `200`
- Retorno em array com ate 3 itens
- Cada item com:
  - `id`
  - `similaridade`
  - `resumo_problema`
  - `causa`
  - `solucao`

## Caso de teste 3 - Resposta assistida

### Entrada

```bash
curl -X POST http://localhost:3000/api/resposta-assistida \
  -H "Content-Type: application/json" \
  -d '{ "texto": "caixa nao imprime cupom, como resolver rapido?" }'
```

### Esperado

- HTTP `200`
- JSON com `resposta_sugerida`
- Texto objetivo com diagnostico, validacao e acao recomendada

## Criterio de coerencia (checagem simples)

- Pelo menos 70% das consultas devem trazer casos semanticamente relacionados.
- A resposta assistida nao deve ser generica.
- A resposta deve citar passos praticos e nao apenas teoria.

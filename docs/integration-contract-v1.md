# Integration Contract v1

Este contrato padroniza ingestao de dados de qualquer sistema externo para o Cérebro.

## Endpoint

- `POST /api/ingestao/v1/events` (endpoint canonico versionado)
- `POST /api/ingestao/willtalk` (retrocompatibilidade para fluxo legado WillTalk)
- `POST /api/ingestao/mtalk` (adapter para payloads flexiveis do MTalk)
- `POST /api/ingestao/mavo-gestao` (adapter para payloads flexiveis do ERP Mavo Gestao)

## Headers obrigatorios

- `Content-Type: application/json`
- `X-Source-System`: nome do sistema de origem (ex: `willtalk`, `erp-x`, `crm-y`)
- `X-Source-Entity-Id`: id do registro na origem
- `X-Tenant-Id`: id do tenant/organizacao
- `X-Ingestion-Id`: id unico de ingestao (idempotencia)
- `Authorization: Bearer <token>` (quando `INTEGRATION_AUTH_REQUIRED=true`)

## Payload canonico

```json
{
  "ticket_id": "abc-123",
  "cliente": "Nome do cliente",
  "cliente_id": "optional-id",
  "canal": "whatsapp",
  "mensagens": "texto consolidado do caso",
  "tecnico": "WillTalk",
  "data_evento": "2026-03-31T14:00:00.000Z",
  "metadata": {
    "sourceSystem": "willtalk",
    "sourceEntityId": "msg-xyz",
    "tenantId": "org_willtalk-40733",
    "ingestionId": "evt-20260331-001",
    "sourceTimestamp": "2026-03-31T14:00:00.000Z",
    "tags": ["financeiro", "prioridade-alta"]
  }
}
```

## Respostas padrao

- `200` sucesso
- `400` payload invalido
- `401` token ausente/invalido
- `409` evento duplicado (idempotencia)
- `429` limite de taxa
- `500` erro interno

## Regras de idempotencia

Um evento e considerado duplicado quando qualquer condicao abaixo for verdadeira:

1. `X-Ingestion-Id` ja processado para o mesmo `X-Tenant-Id`
2. hash de `sourceSystem + sourceEntityId + payload` ja registrado em janela curta

## Campos minimos para RAG

Para manter a qualidade da resposta assistida:

- `mensagens` com contexto util (nao vazio)
- `ticket_id`
- `canal`
- `metadata.sourceSystem`
- `metadata.tenantId`

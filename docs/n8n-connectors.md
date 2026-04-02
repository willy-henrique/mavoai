# n8n Connectors Library (MVP)

Guia padrao para conectores hibridos que alimentam o Cérebro por `POST /api/ingestao/v1/events`.

## Tipos de conector

1. API/Webhook
2. Banco externo (incremental por cursor/timestamp)
3. Arquivo CSV/Excel

## Estrutura minima do workflow

1. Trigger/Source
2. Normalize Payload (Function/Code node)
3. Idempotency Headers
4. HTTP Request para Cérebro
5. Retry + DLQ (erro)

## Headers obrigatorios no HTTP node

- `X-Source-System`
- `X-Source-Entity-Id`
- `X-Tenant-Id`
- `X-Ingestion-Id`
- `Authorization: Bearer <token>` (quando requerido)

## Adapter spec (Function node)

Todo conector deve produzir este objeto:

```json
{
  "ticket_id": "case-123",
  "cliente": "Cliente Nome",
  "canal": "email",
  "mensagens": "historico consolidado",
  "tecnico": "IntegracaoN8N",
  "data_evento": "2026-03-31T00:00:00.000Z",
  "metadata": {
    "sourceSystem": "crm_x",
    "sourceEntityId": "message-987",
    "tenantId": "tenant-a",
    "ingestionId": "run-20260331-001"
  }
}
```

## Incremental DB pattern

- Cursor inicial: maior `updated_at` confirmado
- Query: `WHERE updated_at > :cursor ORDER BY updated_at ASC LIMIT N`
- Commit cursor so apos sucesso no Cérebro
- Em erro: manter cursor e enviar registro para DLQ

## Boas praticas operacionais

- Ativar retry exponencial no node HTTP
- Salvar `run_id` e estatisticas em `integration_runs`
- Em erro de schema, enviar para fila DLQ e nao perder evento

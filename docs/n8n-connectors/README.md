# n8n Connectors Library

Templates base para conectores de ingestao no modelo hibrido.

## Arquivos

- `template-api-webhook.json`: entrada por webhook/API
- `template-db-incremental.json`: leitura incremental de banco
- `template-file-import.json`: ingestao por CSV/Excel

## Padrao de saida de todos conectores

Cada template termina em um HTTP Request para o Cérebro com payload canonico:

```json
{
  "ticket_id": "string",
  "cliente": "string",
  "canal": "string",
  "mensagens": "string",
  "tecnico": "string",
  "data_evento": "ISO-8601",
  "metadata": {
    "sourceSystem": "string",
    "sourceEntityId": "string",
    "tenantId": "string",
    "ingestionId": "string"
  }
}
```

## Variaveis esperadas no n8n

- `CEREBRO_BASE_URL` (ex: `http://127.0.0.1:3100`)
- `CEREBRO_INGEST_TOKEN` (opcional, se auth habilitada)
- `SOURCE_SYSTEM`
- `TENANT_ID`


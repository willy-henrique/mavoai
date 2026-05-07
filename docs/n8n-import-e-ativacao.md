# Importar workflow no n8n

## 1) Abrir n8n

- URL: `http://localhost:5678`
- Faça login com o owner que voce criou.

## 2) Importar JSON pronto

1. Clique em **Workflows**.
2. Clique em **Import from file**.
3. Selecione `docs/n8n-workflow-willtalk-ingestao.json`.
4. Salve o workflow.

## 3) Ajustar URL da API (se necessario)

No node **Enviar para API**, confira:

- URL local: `http://localhost:3000/api/ingestao/willtalk`
- Se estiver em servidor, troque para sua URL publica.

## 4) Testar em modo manual

1. Clique em **Execute workflow**.
2. Envie teste para webhook:

```bash
curl -X POST http://localhost:5678/webhook-test/willtalk-ingestao \
  -H "Content-Type: application/json" \
  -d "{\"ticket_id\":\"WT-TEST-001\",\"cliente\":\"Loja Centro\",\"mensagens\":\"Impressora nao imprime cupom fiscal\",\"canal\":\"whatsapp\",\"tecnico\":\"Carlos\",\"data_evento\":\"2026-03-26T18:30:00Z\"}"
```

3. Confira se os 3 nodes ficaram verdes.

## 5) Ativar em producao

1. Clique em **Activate**.
2. Use URL de producao do webhook no WillTalk:
   - `http://localhost:5678/webhook/willtalk-ingestao` (local)
3. Configure no `.env` do WillTalk:

```env
WILLTALK_WEBHOOK_URL=http://localhost:5678/webhook/willtalk-ingestao
WILLTALK_WEBHOOK_TOKEN=trocar_token_forte
WILLTALK_WEBHOOK_EVENTS=ticket_created,ticket_updated,message_received,message_sent
WILLTALK_WEBHOOK_MAX_CHARS=12000
WILLTALK_WEBHOOK_ATTEMPTS=3
WILLTALK_WEBHOOK_TIMEOUT_MS=8000
```

## 6) Verificacao final

- n8n: execucao com status **Success**
- API: retorna `status: ok` e `atendimento_id`
- Supabase: novo registro em `atendimentos`
- Processamento IA: campo `processado = true` apos alguns segundos

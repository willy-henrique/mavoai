# Integracao WillTalk + n8n (Guia para iniciantes)

Este guia conecta seu WillTalk ao MVP de Inteligencia Operacional.

## 1) Objetivo

Quando um atendimento chegar no WillTalk:
1. WillTalk envia webhook para n8n
2. n8n valida e repassa para a API
3. API cria atendimento no Supabase
4. API processa com IA e gera embedding
5. Caso fica pesquisavel na busca semantica
6. (Opcional) API gera resposta e devolve para o WillTalk

## 2) Endpoint de ingestao deste projeto

- Metodo: `POST`
- URL local: `http://localhost:3000/api/ingestao/willtalk`
- Content-Type: `application/json`

### Payload minimo

```json
{
  "ticket_id": "WT-12345",
  "cliente": "Loja XPTO",
  "canal": "whatsapp",
  "mensagens": "Cliente relata que impressora termica nao imprime cupom fiscal.",
  "tecnico": "Joao Silva",
  "data_evento": "2026-03-26T18:30:00Z"
}
```

Campos obrigatorios: `ticket_id`, `cliente`, `mensagens`.

## 2.1) Auto-resposta para WhatsApp (opcional)

Para enviar resposta automatica de volta ao WillTalk, configure no `.env.local`:

```env
WILLTALK_AUTO_REPLY_ENABLED=true
WILLTALK_REPLY_WEBHOOK_URL=http://localhost:4000/webhooks/reply
WILLTALK_WEBHOOK_TOKEN=seu_token_forte
```

Quando habilitado, a API envia:

```json
{
  "ticket_id": "WT-12345",
  "cliente": "Loja XPTO",
  "canal": "whatsapp",
  "resposta_sugerida": "Passos recomendados...",
  "origem": "cerebro-operacional",
  "data_evento": "2026-03-26T18:30:00Z"
}
```

## 3) Configuracao no n8n

Crie um workflow com 3 nos:

1. **Webhook (Trigger)**
   - Method: `POST`
   - Path: `/mtalk/webhook`

2. **Function (normalizacao)**
   - Ajuste nomes de campos recebidos do WillTalk para o contrato acima.

3. **HTTP Request (envio para MVP)**
   - Method: `POST`
   - URL: `http://localhost:3000/api/ingestao/willtalk`
   - Send Body: JSON
   - Body: saida do node Function

### Exemplo de normalizacao no node Function

```javascript
return [
  {
    json: {
      ticket_id: $json.ticket_id || $json.id || "SEM_ID",
      cliente: $json.cliente || $json.nome_cliente || "Cliente nao informado",
      canal: $json.canal || "whatsapp",
      mensagens: $json.mensagens || $json.texto || $json.conversa || "",
      tecnico: $json.tecnico || $json.atendente || "WillTalk",
      data_evento: $json.data_evento || new Date().toISOString()
    }
  }
];
```

## 4) Prompt de extracao (ja usado na API)

O endpoint `/api/atendimentos/processar` ja aplica um prompt tecnico para extrair:
- resumo
- problema
- causa
- solucao
- categoria

Se quiser customizar, altere o `SYSTEM_PROMPT` em:
- `app/api/atendimentos/processar/route.ts`

## 5) Teste rapido sem WillTalk (curl)

```bash
curl -X POST http://localhost:3000/api/ingestao/willtalk \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id":"WT-TEST-001",
    "cliente":"Loja Piloto",
    "canal":"whatsapp",
    "mensagens":"Impressora termica nao imprime cupom fiscal apos atualizacao.",
    "tecnico":"Marcos",
    "data_evento":"2026-03-26T18:30:00Z"
  }'
```

## 6) Como saber se funcionou

1. Verifique se existe registro em `atendimentos`
2. Verifique `processado = true` apos alguns segundos
3. Verifique campo `embedding` preenchido
4. Teste busca:
   - `POST /api/busca-semantica`
   - body: `{ "texto": "impressora nao imprime cupom" }`

## 7) Troubleshooting basico

- `AI_API_KEY/GROK_API_KEY nao configurada`
  - Preencha `AI_API_KEY` no `.env.local`.

- `EMBEDDING_API_KEY/OPENAI_API_KEY nao configurada`
  - Preencha `EMBEDDING_API_KEY` (ou `OPENAI_API_KEY`) no `.env.local`.

- erro ao gravar logs de ingestao
  - Rode o script SQL de upgrade para criar tabela `ingestao_logs`.

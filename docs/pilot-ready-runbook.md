# Runbook de piloto - Mavo AI

Este roteiro deixa o Cérebro em modo piloto local com PostgreSQL, IA, n8n e WillTalk.

## 1. Banco local

Requer Docker com `docker compose` disponível.

```bash
npm run db:up
```

O Compose sobe PostgreSQL + pgvector em `localhost:5433` e executa:

- `scripts/001_create_tables.sql`
- `scripts/002_upgrade_semantic_search.sql`
- `scripts/003_multisource_core.sql`

Confirme no `.env.local`:

```env
DATABASE_URL=postgresql://postgres:1@localhost:5433/mavoai
```

Se o Docker não estiver instalado, use PostgreSQL local ou Supabase e mantenha `DATABASE_URL` apontando para esse banco.

## 2. Variáveis obrigatórias

```env
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=...
AI_CHAT_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

INTEGRATION_AUTH_REQUIRED=true
CEREBRO_INGEST_TOKEN=...
CEREBRO_INTERNAL_TOKEN=...

WILLTALK_WEBHOOK_URL=http://localhost:5678/webhook/willtalk-ingestao
WILLTALK_WEBHOOK_TOKEN=...
WILLTALK_REPLY_WEBHOOK_URL=http://localhost:4002/api/webhooks/cerebro/reply
WILLTALK_AUTO_REPLY_ENABLED=true
```

Para RAG vetorial real, configure também:

```env
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=...
AI_EMBEDDING_MODEL=text-embedding-3-small
```

Sem `EMBEDDING_API_KEY`, o sistema funciona com fallback textual, mas a qualidade da busca fica menor.

## 3. Subir aplicação

```bash
npm run dev:pilot
```

URL recomendada: `http://127.0.0.1:3100`

## 4. Verificação

```bash
VERIFY_BASE_URL=http://127.0.0.1:3100 npm run verify:stack
```

Esse comando falha se `/api/health` retornar `unhealthy`.

Para bloquear piloto se houver qualquer pendência:

```bash
VERIFY_BASE_URL=http://127.0.0.1:3100 VERIFY_STRICT=true npm run verify:stack
```

## 5. Critérios de pronto

- `/api/config` com `readiness.readyForPilot=true`
- `/api/health` com `status=healthy`
- n8n chamando `/api/orquestrador/v1/mensagem` com Bearer
- n8n chamando `/api/ingestao/willtalk` ou `/api/ingestao/v1/events` com headers de idempotência
- WillTalk recebendo retorno em `/api/webhooks/cerebro/reply`

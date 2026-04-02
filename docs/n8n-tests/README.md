# Workflows de Teste — Cérebro Operacional

Cada arquivo JSON nesta pasta pode ser importado no n8n via:
**Settings → Import from file**

---

## Pré-requisitos

### 1. Variáveis de ambiente no n8n

Configure em **Settings → Environment Variables**:

| Variável | Valor |
|----------|-------|
| `CEREBRO_BASE_URL` | `http://localhost:3000` (local) ou URL do Vercel |
| `CEREBRO_INGEST_TOKEN` | Mesmo valor de `CEREBRO_INGEST_TOKEN` do `.env.local` |

> **Sem essas variáveis**, edite os nós HTTP Request e substitua `$env.CEREBRO_BASE_URL` e `$env.CEREBRO_INGEST_TOKEN` diretamente.

### 2. Ordem de execução recomendada

1. `test-smoke.json` — roda primeiro, valida o stack completo
2. `test-dedup.json` — valida idempotência
3. `test-rate-limit.json` — valida proteção de carga
4. `test-pipeline-completo.json` — valida o fluxo ERP-to-Cérebro end-to-end

---

## Descrição dos Workflows

### `test-smoke.json` — Smoke Test

**Duração estimada:** ~15s

Fluxo:
1. Gera payload com `ticket_id` único por timestamp
2. POST `/api/ingestao/willtalk`
3. Aguarda 6s para processamento IA
4. POST `/api/busca-semantica` → verifica `resultados.length > 0`
5. POST `/api/resposta-assistida?debug=true` → verifica `resposta_sugerida.length > 100`

**Aceite:** executa sem nó de erro, `cases_utilizados` presente no output.

---

### `test-dedup.json` — Deduplicação

**Duração estimada:** ~5s

Fluxo:
1. Envia mesmo payload **duas vezes** com `ingestionId: "FIXED-INGESTION-ID-DEDUP-001"`
2. Primeira vez → espera HTTP 200 com `status: "ok"`
3. Segunda vez → espera HTTP 409 com `status: "duplicate_ignored"`

**Aceite:** segunda ingestão retorna `duplicate_ignored`.

> ⚠️ **Nota:** Para re-executar o teste, apague a entrada da tabela `dedup_keys` no Supabase com a chave `dedup_key = 'n8n-dedup-test:DEDUP-ENTITY-FIXO-001:FIXED-INGESTION-ID-DEDUP-001'`.

---

### `test-rate-limit.json` — Stress de Rate Limit

**Duração estimada:** ~60-90s

Fluxo:
1. Gera 125 payloads com `ticket_id` únicos
2. Envia todos em sequência (sem pausa) com `continueOnFail: true`
3. Agrega resultados: conta respostas 200, 409 e 429
4. Verifica se `rate_limited_429 >= 5`

**Aceite:** ao menos 5 requisições bloqueadas com 429.

> ⚠️ **Nota:** Com `INTEGRATION_RATE_LIMIT_PER_MIN=120`, o bloqueio ocorre após 120 req no mesmo minuto para o mesmo tenant/source. Para o teste garantir 429s, execute dentro de 60 segundos.

---

### `test-pipeline-completo.json` — Pipeline Completo ERP

**Duração estimada:** ~30s (agendado a cada 1h)

Fluxo:
1. Health check em `/api/health` → para se `status = "unhealthy"`
2. Simula ticket aleatório de 5 categorias (Impressora, Hardware, Acesso, Rede, Software)
3. Ingere via `/api/ingestao/v1/events` (endpoint canônico)
4. Aguarda 10s para processamento IA
5. Consulta `/api/query/v1` com o mesmo texto
6. Verifica se `confianca != "baixa"` (média ou alta)
7. Se confiança baixa: registra alerta (não falha o pipeline)

**Aceite:** `confianca = "media"` ou `"alta"` com casos similares encontrados.

---

## Ativação do workflow de produção

O workflow principal `docs/n8n-workflow-cerebro-completo.json` precisa ser ajustado antes de ativar:

1. Importar no n8n
2. Editar nó **"3. Upsert + Triagem WillTalk"**: trocar `http://127.0.0.1:4002` pela URL real do WillTalk
3. Editar nós **"5. Salvar no Cerebro"** e **"6. Gerar Resposta IA"**: trocar `http://127.0.0.1:3000` pela URL real do Cérebro
4. Adicionar header `Authorization: Bearer <CEREBRO_INGEST_TOKEN>` nos nós HTTP
5. Ativar o workflow

---

## Troubleshooting

| Problema | Causa Provável | Solução |
|---------|----------------|---------|
| Smoke Test falha em "Busca sem resultados" | Embeddings não gerados | Rodar `npx tsx scripts/backfill-embeddings.ts` |
| Dedup sempre passa na 1ª execução | Chave antiga ainda na tabela | Limpar `dedup_keys` no Supabase |
| Rate limit não ativa | Upstash Redis não configurado | Adicionar `UPSTASH_REDIS_REST_URL` no `.env.local` |
| Pipeline com `confianca: "baixa"` | Poucos casos similares no banco | Adicionar mais dados via seed e backfill |
| Health check retorna `unhealthy` | Credenciais AI ou Supabase erradas | Verificar `/api/health` no browser |

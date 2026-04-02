# Pilot Go-live Checklist (WillTalk + Integracao Externa)

## 1) Ambiente

- Confirmar Cérebro em porta dedicada (`3100` recomendado se `3000` estiver ocupada)
- Confirmar WillTalk em `4002`
- Confirmar n8n em `5678`
- Ajustar `CEREBRO_BASE_URL` e nós HTTP do n8n para `http://127.0.0.1:3100`

## 2) Banco e schema

- Executar `scripts/001_create_tables.sql`
- Executar `scripts/002_upgrade_semantic_search.sql`
- Executar `scripts/003_multisource_core.sql`

## 3) Health checks

- `GET /api/health` deve retornar `supabase=true`
- `GET /api/metricas` deve retornar sem erro
- `POST /api/busca-semantica` deve retornar `resultados` e `tipo_busca`
- `POST /api/resposta-assistida?debug=true` deve retornar `casos_utilizados`

## 4) Integracao de piloto

- Fluxo A: WillTalk (ja operacional)
- Fluxo B: conector externo via template `docs/n8n-connectors/template-api-webhook.json`
- Garantir headers:
  - `X-Source-System`
  - `X-Source-Entity-Id`
  - `X-Tenant-Id`
  - `X-Ingestion-Id`

## 5) Criterios de aceite

- Ingestao sem perda em 100 eventos de teste
- Duplicatas retornando `409 duplicate_ignored`
- Latencia media da resposta assistida dentro do alvo definido
- Nenhum loop entre n8n e ticket-upsert

## 6) Operacao e rollback

- Monitorar `ingestao_logs` e `audit_events`
- Em incidente de IA (429/timeout), manter fallback textual habilitado
- Rollback: desativar conector externo no n8n e manter somente WillTalk


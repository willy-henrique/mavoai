# Incident Playbook (MVP)

## 1. IA indisponivel (429/503)

Sintomas:
- `/api/resposta-assistida` retorna 429 ou 503
- n8n com timeout no node de resposta

Acoes:
1. Verificar `/api/health` (`groq`, `embedding`)
2. Reduzir concorrencia no n8n e habilitar retry exponencial
3. Operar em modo fallback textual (continuar ingestao)
4. Escalar se durar mais de 30 min

## 2. Supabase offline

Sintomas:
- `/api/metricas` com `supabaseOnline=false`
- falhas em insercao de atendimento

Acoes:
1. Confirmar conectividade e credenciais
2. Pausar conectores de escrita massiva no n8n
3. Enfileirar em DLQ ate retorno do banco
4. Executar backfill dos eventos pendentes

## 3. Falha de conector

Sintomas:
- aumento de `total_failed` em `integration_runs`
- erro recorrente em auth/schema

Acoes:
1. Desativar integracao afetada (`integrations.is_active=false`)
2. Corrigir mapeamento no adapter do n8n
3. Reprocessar DLQ com idempotencia (`X-Ingestion-Id`)
4. Monitorar 24h apos reativacao

## 4. Loop de orquestracao

Sintomas:
- repeticao rapida de eventos iguais
- crescimento incomum de ingestao_logs

Acoes:
1. Confirmar `dedup_keys` e `source_records`
2. Validar eventos emitidos no endpoint de origem
3. Desabilitar webhook recursivo no produtor
4. Ativar alarme por taxa de duplicados

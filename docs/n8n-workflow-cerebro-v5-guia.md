# n8n v5 — Cérebro Orquestrando WillTalk

Este é o fluxo recomendado para homologar o Cérebro como inteligência principal do atendimento WillTalk.

## Regra de ouro

- **n8n coordena**: recebe webhook, normaliza payload e chama APIs.
- **Cérebro decide**: triagem, fila, investigação, visão, resolução e handoff.
- **WillTalk entrega**: mantém ticket/conversa e envia WhatsApp.

## Arquivo do workflow

Importe no n8n:

```text
docs/n8n-workflow-cerebro-v5-orquestrador-willtalk.json
```

O workflow vem com `active: false`. Importe, configure variáveis e ative apenas no ambiente de homologação.

## Variáveis no n8n

```env
WILLTALK_URL=http://127.0.0.1:4002
WILLTALK_WEBHOOK_TOKEN=troque-por-um-token-forte
WILLTALK_REPLY_URL=http://127.0.0.1:4002/api/webhooks/cerebro/reply

CEREBRO_BASE_URL=http://127.0.0.1:3000
CEREBRO_INGEST_TOKEN=mesmo-token-do-cerebro
```

Em produção, `CEREBRO_BASE_URL` deve apontar para a URL pública do Render/domínio.

## Fluxo

1. WillTalk envia inbound para o webhook do n8n.
2. n8n normaliza o payload.
3. n8n chama `ticket-upsert` para manter o ticket no WillTalk e recuperar estado quando disponível.
4. n8n chama `POST /api/orquestrador/v1/mensagem` no Cérebro.
5. Cérebro devolve `reply_text`, `queue_id`, estado da conversa, motivo e possível `agent_handoff_summary`.
6. n8n aplica o estado no WillTalk.
7. n8n alimenta `/api/ingestao/willtalk` quando há triagem concluída, resolução ou handoff.
8. n8n envia somente `reply_text` ao cliente via WillTalk.

`agent_handoff_summary` é interno: usar em nota/metadata para o atendente, nunca no WhatsApp do cliente.

## Fluxos legados

Mantenha estes arquivos para consulta e rollback, mas não use como fluxo principal do Cérebro orquestrador:

- `docs/n8n-workflow-cerebro-completo.json` — v3, triagem centrada no WillTalk.
- `docs/n8n-workflow-cerebro-v4-universal.json` — ingestão universal + consulta RAG, sem orquestração completa.
- `docs/n8n-07-03-versao2.json` — fluxo experimental/intermediário.

## Checklist de homologação

- Conversa nova recebe resposta inicial do Cérebro.
- Problema claro classifica fila ou pede evidência objetiva.
- Print/imagem chega com `media_url` e o Cérebro analisa.
- Cliente diz que não resolveu e o Cérebro tenta próxima solução.
- Tentativas esgotadas geram handoff e resumo interno.
- Evento duplicado não envia resposta duplicada.
- `/api/ingestao/willtalk` registra casos concluídos para alimentar o RAG.

## Observações

- Este fluxo não altera o projeto WillTalk.
- Se o `ticket-upsert` do WillTalk já enviar resposta sozinho no seu ambiente, mantenha o v5 em homologação até confirmar que não há resposta duplicada.
- Para produção, use `INTEGRATION_AUTH_REQUIRED=true` no Cérebro e o mesmo `CEREBRO_INGEST_TOKEN` no n8n.

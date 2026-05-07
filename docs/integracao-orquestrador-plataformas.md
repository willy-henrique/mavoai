# Orquestrador Mavo (Cérebro) — multi-plataforma

O **Cérebro** (`chat-inteligente`) concentra a lógica de triagem operacional (menu numérico, pedido de evidências, análise de imagem, handoff). Cada plataforma (WillTalk, MTalk, etc.) mantém **persistência** (conversas, tickets, filas) e chama este projeto via HTTP.

## Endpoint

- **POST** `{BASE_URL}/api/orquestrador/v1/mensagem`
- Headers opcionais (alinhados à ingestão): `X-Source-System`, `X-Tenant-Id`, `X-Ingestion-Id`, `X-Source-Entity-Id`
- Se `INTEGRATION_AUTH_REQUIRED=true` no Cérebro: **Authorization: Bearer** igual a `CEREBRO_INGEST_TOKEN`

## Corpo (JSON)

```json
{
  "platform": "willtalk",
  "organization_id": "org_xxx",
  "event_id": "msg-uuid",
  "conversation_id": "conv-uuid",
  "cliente": { "nome": "Álvaro", "telefone": "whatsapp:+5511999999999" },
  "mensagem": "1",
  "media_url": "https://...",
  "mime_type": "image/jpeg",
  "business_hours_open": true,
  "conversation": {
    "triage_completed": false,
    "menu_attempts": 0,
    "queue_id": null,
    "investigation_messages_seen": 1,
    "investigation_inadequate_streak": 0
  },
  "queues": [
    {
      "id": "q1",
      "menu_option": 1,
      "name": "Balança - MGV",
      "default_sla_mins": 30,
      "is_active": true
    }
  ]
}
```

Campos `menu_option` / `default_sla_mins` / `is_active` também aceitam camelCase (`menuOption`, `defaultSlaMins`, `isActive`).

## Resposta

```json
{
  "reply_text": "texto para enviar ao cliente",
  "triage_completed": false,
  "menu_attempts": 1,
  "queue_id": "q1",
  "reason": "queue_selected",
  "investigation_inadequate_streak": 0
}
```

Quando o fluxo **encaminha ao atendente humano** (`triage_completed: true` por handoff, falha de clarificação, menu esgotado, etc.), a API pode incluir:

- **`agent_handoff_summary`**: texto **interno** (não enviar ao WhatsApp) com resumo para o técnico — fila, última mensagem, leitura de imagem se houver, classificação da IA. Gerado via Groq com fallback em texto estruturado se a IA falhar.
- **`investigation_inadequate_streak`**: próximo valor a persistir na investigação (zera após evidência adequada ou após handoff por falha de compreensão).

A plataforma deve **persistir** `triage_completed`, `menu_attempts`, `queue_id` e enviar `reply_text` pelo canal (WhatsApp, etc.). Ao atribuir `queue_id` pela primeira vez, calcular SLA com `default_sla_mins` da fila escolhida.

### Evidências e `menu_attempts`

- Durante a investigação na fila, `menu_attempts` conta apenas turnos em que a mensagem/imagem foi considerada **evidência adequada** para a demanda. Mensagens fora do tema ou prints insuficientes (ex.: só menu do WhatsApp) **não incrementam** esse contador — o bot pede correção em vez de agradecer e encaminhar.
- **Opcional:** `investigation_messages_seen` — número total de mensagens do cliente desde a escolha da fila. Se enviado, após muitas tentativas sem evidência adequada o orquestrador faz handoff para evitar loop infinito (ver `INVESTIGATION_MAX_INBOUND_WITHOUT_HANDOFF` em `lib/platform-orchestrator.ts`).
- **Opcional:** `investigation_inadequate_streak` — persistir o valor devolvido em cada resposta. Após **2** classificações consecutivas como inadequadas/fora do tema (`INVESTIGATION_MAX_INADEQUATE_BEFORE_HANDOFF`), o orquestrador encaminha ao humano e preenche **`agent_handoff_summary`** para o atendente.

**WillTalk / painel:** ao receber `agent_handoff_summary`, gravar no ticket (nota interna, campo customizado ou descrição visível só para agente) — não concatenar em `reply_text` enviado ao cliente.

**Nomenclatura:** **Groq** (`groq.com`, chaves `gsk_…`) é o provedor de inferência usado aqui com Llama 4 Scout. **Grok** é o nome de modelos da **xAI** (`api.x.ai`) — outro fornecedor.

## Variáveis no Cérebro (`.env.local`)

- **Visão com Groq:** `AI_BASE_URL=https://api.groq.com/openai/v1` + `AI_API_KEY` (`gsk_...`). Modelo multimodal padrão: **`meta-llama/llama-4-scout-17b-16e-instruct`** (texto e imagem). Opcional: `WILLTALK_VISION_MODEL` / `AI_CHAT_MODEL` para sobrescrever.
- **Visão só xAI:** `VISION_API_BASE_URL=https://api.x.ai/v1` + `XAI_API_KEY` (a chave Groq não vale na api.x.ai).
- **OpenAI vision:** `VISION_API_BASE_URL=https://api.openai.com/v1` + `OPENAI_API_KEY`.
- `INTEGRATION_AUTH_REQUIRED` / `CEREBRO_INGEST_TOKEN` — se quiser fechar o endpoint

## WillTalk

No `.env` do WillTalk:

```env
CEREBRO_ORCHESTRATOR_URL=http://127.0.0.1:3000
CEREBRO_ORCHESTRATOR_TOKEN=mesmo_token_se_auth_obrigatoria
CEREBRO_INGEST_TOKEN=mesmo_token_para_ingestao
```

Com `CEREBRO_ORCHESTRATOR_URL` definido, o `ticket-upsert` chama o orquestrador antes do fallback local (metadata n8n / visão local). Sem a URL, o comportamento anterior permanece.

## MTalk / outras plataformas

Reutilizar o mesmo POST; trocar `platform` (ex.: `"mtalk"`) para telemetria. O estado da conversa e a lista de filas vêm do sistema de origem.

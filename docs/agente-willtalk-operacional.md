# Agente WillTalk Operacional

Este documento define o contrato operacional do agente para inbound do WhatsApp no WillTalk.

## Responsabilidades
- Identificar contato e ticket com segurança (`organizationId + telefone normalizado`).
- Garantir idempotência por `event_id`/`external_id`.
- Classificar demanda por menu numérico (`queueId`) com controle de tentativas.
- Encaminhar para humano quando necessário.
- Não enviar mensagens para contato/ticket ambíguo.

## Prioridade de resolução de ticket
1. `ticket_id` exato (match único e válido).
2. Conversa aberta por telefone.
3. Short-id com 8 chars e match único.
4. Se ambíguo: erro + revisão humana (sem resposta automática).

## JSON de decisão obrigatório
```json
{
  "action": "created|updated|ignored_duplicate|human_handoff|rating_recorded|error",
  "conversationStatus": "aguardando|em_atendimento|pendente_cliente|encerrado|null",
  "triageCompleted": true,
  "menuAttempts": 0,
  "queueId": "string|null",
  "shouldReply": false,
  "replyText": "string|null",
  "events": ["message.created"],
  "webhooks": ["ticket_updated"],
  "reason": "texto técnico curto"
}
```

## Regras adicionais
- Mensagem de avaliação `1..5` registra nota no último ticket encerrado e não abre novo ticket.
- Se fora de horário, anexar aviso padrão de expediente.
- Estados válidos de conversa: `aguardando`, `em_atendimento`, `pendente_cliente`, `encerrado`.

# Canonical Mapping

Guia de mapeamento de dados externos para o schema canonico do Cérebro.

## Entidades canonicas

- `cliente`: identidade do solicitante
- `ticket`: unidade de atendimento
- `mensagem`: interacao bruta
- `atendimento`: caso processado pela IA
- `evento`: rastreio operacional de ingestao/processamento

## Matriz de mapeamento (resumo)

| Canonico | WillTalk | API externa | Banco externo | CSV/Excel |
|---|---|---|---|---|
| `ticket_id` | `ticket_id` | `case.id` | `tickets.external_id` | `ticket_id` |
| `cliente` | `cliente` | `customer.name` | `customers.full_name` | `cliente_nome` |
| `canal` | `canal` | `channel` | `tickets.channel` | `canal` |
| `mensagens` | `mensagens` | `messages[].text` | `ticket_messages.body` | `mensagem` |
| `tecnico` | `tecnico` | `agent.name` | `users.name` | `tecnico` |
| `data_evento` | `data_evento` | `created_at` | `tickets.created_at` | `data_evento` |

## Normalizacoes obrigatorias

- Telefone: manter somente digitos
- Data/hora: ISO-8601 UTC
- Texto: trim + collapse de espacos
- `canal`: enum controlado (`whatsapp`, `email`, `portal`, `chat`, `telefone`, `outro`)

## Regras de deduplicacao

- chave forte: `sourceSystem + sourceEntityId`
- chave fraca: hash de payload normalizado

## Politica de rejeicao

Evento e rejeitado quando:

- faltam `ticket_id`, `cliente` ou `mensagens`
- `mensagens` menor que 2 caracteres uteis
- `data_evento` invalida


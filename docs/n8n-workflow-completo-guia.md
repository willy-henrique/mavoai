# Fluxo n8n — Cérebro Operacional v3 (com Triagem Inteligente)

## Visão Geral do Fluxo

```
WhatsApp → WillTalk → n8n Webhook
                          │
                    2. Normalizar Payload
                          │
                    3. Upsert + Triagem WillTalk
                      (envia menu/confirmação direto no WhatsApp)
                          │
                    4. Triagem Completa?  ──── NÃO ──→ 7. Log (fim)
                          │
                         SIM
                          │
                    5. Salvar no Cérebro
                          │
                    6. Gerar Resposta IA (opcional)
```

---

## O que mudou na v3

| Antes (v2) | Agora (v3) |
|-------------|------------|
| n8n chamava Cérebro para gerar resposta AI e enviava via `/cerebro/reply` | n8n chama `ticket-upsert` que faz triagem **e envia resposta direto no WhatsApp** |
| Sem menu, sem triagem | Triagem completa: menu numérico → fila + SLA → confirmação |
| Cérebro AI respondia sempre | Cérebro AI só responde **após triagem completa** |
| Reply passava por webhook separado | Reply é enviado pelo próprio WillTalk via `whatsapp-web.js` |

---

## Diagnóstico rápido (erros no terminal do n8n)

| Mensagem no log | Causa provável | O que fazer |
|-----------------|----------------|-------------|
| `connect ECONNREFUSED ::1:3000` | O workflow chama `http://localhost:3000` e no Windows `localhost` vira IPv6 `::1`; o Next.js do Cérebro não escuta em `::1`, ou o app está parado. | Substitua **todas** as URLs dos nós HTTP por `http://127.0.0.1:3000`. Rode `npm run dev` no projeto **chat-inteligente**. |
| `400 canal_nao_suportado` | Alguém chama `POST .../api/webhooks/cerebro/reply` com `canal` diferente de `whatsapp`. | Force `canal: "whatsapp"` no JSON do nó HTTP. |
| `404 willtalk-ingestao is not registered` | Nenhum workflow **ativo** no n8n expõe o webhook com path `willtalk-ingestao`. O log mostra só `"My workflow 2" => Started` — esse fluxo não tem esse path. | Importe `n8n-workflow-cerebro-completo.json`, **ative esse workflow** (toggle verde), ou **desligue** `WILLTALK_WEBHOOK_URL` no `.env` do WillTalk para parar os POSTs. |
| `404 ticket_nao_encontrado` | O Cérebro tentou responder no WhatsApp com `ticket_id` que não existe na base do WillTalk. | Use `ticket_id` / `conversationId` retornados pelo `ticket-upsert`. |
| `Failed to send triage reply` + `WhatsApp client nao inicializado` | O painel está **Desconectado** ou o QR não foi concluído; `sendWhatsappMessage` precisa de `global.__waClient` em estado **ready**. | No WillTalk: conecte o WhatsApp até sumir “Desconectado”; confira `GET /api/whatsapp/status`. Chamadas só via n8n/cURL também exigem sessão ativa na mesma instância do servidor. |

**MVP sem n8n:** com `WILLTALK_N8N_ONLY=true` e triagem em `ticket-upsert`, o WhatsApp já funciona **sem** webhook no n8n. O n8n só é necessário se quiser encadear ingestão + resposta assistida depois da triagem.

---

## Nós do Workflow

### 1. Webhook WillTalk
- **Tipo**: Webhook (POST)
- **Path**: `willtalk-ingestao`
- Recebe eventos do WillTalk (mensagem nova, etc.)

**Payload JSON do WillTalk** (`sendWillTalkWebhook`): inclui `ticket_id`, `cliente` (nome, string), **`cliente_telefone`** (só dígitos), `mensagens`, `canal`, `data_evento`. O nó **Normalizar Payload** lê `cliente_telefone` / `telefone` / `contact.phoneNumber`; versões antigas só mandavam `cliente` como nome — aí o nó falhava com “Telefone ausente”.

### 2. Normalizar Payload
- **Tipo**: Code (JavaScript)
- Extrai: `ticket_id`, `event_id`, `cliente_nome`, `cliente_telefone`, `mensagem`, `canal`
- Valida que `ticket_id` e `mensagem` existem
- Gera `event_id` se ausente

### 3. Upsert + Triagem WillTalk
- **Tipo**: HTTP Request (POST)
- **URL**: `http://127.0.0.1:4002/api/webhooks/n8n/ticket-upsert`
- **Auth**: Bearer token (via `$env.WILLTALK_WEBHOOK_TOKEN`)
- **O que faz internamente**:
  1. Salva mensagem inbound
  2. Verifica se é nota de satisfação (1-5)
  3. Se `triageCompleted === false`:
     - **Conversa nova** → Envia menu de boas-vindas via WhatsApp
     - **Opção válida** → Atribui fila + SLA, confirma via WhatsApp
     - **Opção inválida** → Reenvia menu (até 3 tentativas)
     - **3 erros** → Encaminha para humano
     - **Sem filas** → Registra e informa via WhatsApp
  4. Persiste mensagem outbound no histórico
  5. Emite eventos realtime

### 4. Triagem Completa? (IF)
- **Tipo**: IF
- **Condição**: `triageCompleted === true`
- **SIM** → Continua para Cérebro (nós 5 e 6)
- **NÃO** → Vai para nó 7 (Log), fluxo termina

### 5. Salvar no Cérebro
- **Tipo**: HTTP Request (POST)
- **URL**: `http://127.0.0.1:3000/api/ingestao/willtalk`
- Salva ticket processado no banco do Cérebro Operacional

### 6. Gerar Resposta IA
- **Tipo**: HTTP Request (POST)
- **URL**: `http://127.0.0.1:3000/api/resposta-assistida`
- Gera resposta AI baseada em busca semântica (RAG)
- Essa resposta fica disponível no painel do Cérebro para o atendente consultar

### 7. Log Triagem Pendente
- **Tipo**: Code
- Registra que a triagem está pendente, o menu foi enviado, e o Cérebro não gera resposta AI

---

## Mensagens de Triagem (WhatsApp)

### Menu de boas-vindas (conversa nova)
```
Olá! Seja bem-vindo(a) ao nosso suporte. 👋

Como posso te ajudar? Escolha uma das opções abaixo:

*1* - Suporte Técnico
*2* - Financeiro
*3* - Comercial

_Responda apenas com o número da opção desejada._
```

### Confirmação de fila
```
✅ Sua solicitação de *Suporte Técnico* foi registrada com sucesso.

Nossa equipe já foi notificada e seu atendimento está na fila.
Em breve um atendente irá te responder.
```

### Opção inválida (tentativa 1/3)
```
❌ Não conseguimos identificar uma opção válida.

Por favor, escolha uma das opções abaixo:

*1* - Suporte Técnico
*2* - Financeiro
*3* - Comercial

_Responda apenas com o número da opção desejada._

_Tentativa 1/3_
```

### Handoff humano (3 erros)
```
⚠️ Não conseguimos identificar sua solicitação.

Você será encaminhado(a) para um atendente humano que irá te ajudar.
Aguarde, por favor.
```

### Sem filas configuradas
```
✅ Sua mensagem foi recebida e registrada.

No momento não há opções de atendimento automático.
Um atendente responderá em breve.
```

### Avaliação de satisfação
```
⭐ Obrigado pela sua avaliação!

Ela é muito importante para melhorarmos nosso atendimento.
```

### Fora do horário comercial (adicionado ao final)
```
🕓 _Estamos fora do horário comercial. Responderemos no próximo expediente._
```

---

## Variáveis de Ambiente no n8n

| Variável | Onde configurar | Valor |
|----------|-----------------|-------|
| `WILLTALK_WEBHOOK_TOKEN` | n8n Settings → Environment Variables | Mesmo token do `.env` do WillTalk |

---

## Como importar no n8n

1. Abra o n8n (`http://localhost:5678`)
2. Clique em **"..."** → **"Import from File"**
3. Selecione `docs/n8n-workflow-cerebro-completo.json`
4. Configure a variável de ambiente `WILLTALK_WEBHOOK_TOKEN`
5. Ative o workflow (toggle verde)

---

## Teste manual (PowerShell)

```powershell
# Substitua pelo ticket_id real de uma conversa no WillTalk
$headers = @{ "Content-Type" = "application/json" }
$body = @{
  ticket_id = "SEU_TICKET_ID_REAL"
  event_id = "test-$(Get-Date -Format 'yyyyMMddHHmmss')"
  canal = "whatsapp"
  cliente = @{
    nome = "Teste Manual"
    telefone = "5511999999999"
  }
  mensagem = "oi"
} | ConvertTo-Json -Depth 3

Invoke-RestMethod -Uri "http://localhost:5678/webhook-test/willtalk-ingestao" -Method POST -Headers $headers -Body $body | ConvertTo-Json -Depth 6
```

---

## Fluxo completo de uma conversa

```
1. Cliente envia "oi" no WhatsApp
2. WillTalk recebe → envia webhook para n8n
3. n8n normaliza → chama ticket-upsert
4. ticket-upsert: conversa nova → envia MENU no WhatsApp
5. n8n: triageCompleted=false → NÃO chama Cérebro → Log

6. Cliente responde "1" (Suporte Técnico)
7. WillTalk recebe → envia webhook para n8n
8. n8n normaliza → chama ticket-upsert
9. ticket-upsert: opção 1 válida → atribui fila + SLA → envia CONFIRMAÇÃO no WhatsApp
10. n8n: triageCompleted=true → Salva no Cérebro → Gera resposta AI (opcional)

11. Atendente humano assume no painel WillTalk
12. Pode consultar resposta AI sugerida pelo Cérebro
```

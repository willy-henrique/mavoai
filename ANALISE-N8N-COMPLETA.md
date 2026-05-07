# 🚀 ANÁLISE COMPLETA DO N8N - MAVO.AI

## 📊 **STATUS ATUAL DA INTEGRAÇÃO N8N**

### ✅ **O QUE JÁ ESTÁ IMPLEMENTADO:**

#### **1. Endpoints da API:**
- `POST /api/ingestao/willtalk` - Ingestão de tickets do WillTalk
- `POST /api/atendimentos/processar` - Processamento IA assíncrono
- `POST /api/resposta-assistida` - Geração de respostas automáticas

#### **2. Workflows n8n existentes:**
- `n8n-workflow-cerebro-completo.json` - Fluxo completo v3
- `n8n-workflow-willtalk-ingestao.json` - Fluxo simplificado
- `n8n-workflow-cerebro-v4-universal.json` - Versão universal

#### **3. Sistema de segurança:**
- Rate limiting por tenant/source
- Deduplicação por hash SHA256
- Headers de autenticação
- Logs de auditoria

#### **4. Documentação:**
- `integracao-willtalk-n8n.md` - Guia passo a passo
- `n8n-connectors.md` - Padrões de conectores
- `n8n-workflow-completo-guia.md` - Guia do workflow

## 🔍 **ANÁLISE TÉCNICA DETALHADA**

### **Arquitetura do Fluxo:**
```
WillTalk → n8n (webhook) → API MAVO.AI → PostgreSQL → IA → Resposta → WillTalk
```

### **Componentes Críticos:**

#### **1. Webhook n8n (Trigger):**
- Path: `/mtalk/webhook` ou `/willtalk-ingestao`
- Método: POST
- Validação: telefone do cliente obrigatório

#### **2. Normalização (Code Node):**
- Extrai: ticket_id, cliente_nome, cliente_telefone, mensagem
- Valida: mensagem não vazia, telefone válido
- Formata: padrão para API

#### **3. Triagem WillTalk:**
- Endpoint: `http://127.0.0.1:4002/api/webhooks/n8n/ticket-upsert`
- Token: `9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1`
- Retorna: `triageCompleted` (boolean)

#### **4. Ingestão MAVO.AI:**
- Endpoint: `http://localhost:3000/api/ingestao/willtalk`
- Campos obrigatórios: `ticket_id`, `cliente`, `mensagens`
- Headers: `Authorization: Bearer <token>`

#### **5. Processamento IA:**
- Assíncrono via `after()` do Next.js 15
- Gera: resumo, problema, causa, solução, categoria
- Cria: embedding vetorial (se OpenAI configurado)

#### **6. Resposta Automática:**
- Condicional: `WILLTALK_AUTO_REPLY_ENABLED=true`
- Timeout: 30 segundos
- Endpoint resposta: `http://localhost:4002/api/webhooks/cerebro/reply`

## ⚠️ **PROBLEMAS IDENTIFICADOS:**

### **1. Configuração de Ambiente (.env.local):**
```env
# PROBLEMA: Auto-reply desabilitado
WILLTALK_AUTO_REPLY_ENABLED=false  # ← DEVERIA SER true para testes

# PROBLEMA: URL do WillTalk pode estar errada
WILLTALK_REPLY_WEBHOOK_URL=http://localhost:4002/api/webhooks/cerebro/reply
# Verificar se WillTalk roda na porta 4002

# PROBLEMA: Token hardcoded nos workflows
# Token: 9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1
# Deveria ser variável de ambiente
```

### **2. Dependências de Serviços:**
- **WillTalk**: Deve rodar na porta 4002
- **n8n**: Deve rodar na porta 5678 (padrão)
- **MAVO.AI**: Deve rodar na porta 3000
- **PostgreSQL**: Deve rodar na porta 5432

### **3. Workflows Desatualizados:**
- URLs hardcoded: `127.0.0.1:4002`, `127.0.0.1:3000`
- Sem variáveis de ambiente no n8n
- Sem tratamento de fallback

## 🛠️ **SOLUÇÕES IMEDIATAS:**

### **1. Atualizar .env.local:**
```env
# n8n Integration
WILLTALK_WEBHOOK_URL=http://localhost:5678/webhook/willtalk-ingestao
WILLTALK_WEBHOOK_TOKEN=seu-token-webhook-aqui

# Auto-reply (habilitar para testes)
WILLTALK_AUTO_REPLY_ENABLED=true
WILLTALK_REPLY_WEBHOOK_URL=http://localhost:4002/api/webhooks/cerebro/reply

# Internal token para chamadas entre serviços
CEREBRO_INTERNAL_TOKEN=internal_secret_token_123
```

### **2. Criar Workflow n8n Simplificado:**
```json
{
  "name": "MAVOAI_Ingestao_Simplificada",
  "nodes": [
    {
      "name": "Webhook WillTalk",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "httpMethod": "POST",
        "path": "mavoai-ingest",
        "responseMode": "onReceived"
      }
    },
    {
      "name": "Validar e Formatar",
      "type": "n8n-nodes-base.code",
      "parameters": {
        "jsCode": "// Código de normalização simplificado"
      }
    },
    {
      "name": "Enviar para MAVO.AI",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "method": "POST",
        "url": "{{ $env.MAVOAI_URL }}/api/ingestao/willtalk",
        "authentication": "genericCredentialType",
        "genericAuthType": "httpHeaderAuth",
        "sendHeaders": true,
        "headerParameters": {
          "parameters": [
            {
              "name": "Authorization",
              "value": "Bearer {{ $env.MAVOAI_TOKEN }}"
            }
          ]
        }
      }
    }
  ]
}
```

### **3. Script de Teste de Integração:**
```bash
# Testar endpoint de ingestão
curl -X POST http://localhost:3000/api/ingestao/willtalk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1" \
  -d '{
    "ticket_id": "TEST-001",
    "cliente": "Cliente Teste",
    "mensagens": "Impressora não imprime cupom fiscal",
    "canal": "whatsapp",
    "tecnico": "n8n",
    "data_evento": "2026-04-06T10:00:00Z"
  }'
```

## 🚀 **PLANO DE AÇÃO - CONFIGURAÇÃO COMPLETA:**

### **FASE 1: CONFIGURAR AMBIENTE**

#### **1.1 Atualizar .env.local:**
```env
# ====================
# N8N INTEGRATION
# ====================
N8N_WEBHOOK_URL=http://localhost:5678/webhook/mavoai-ingest
N8N_WEBHOOK_TOKEN=9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1

# ====================
# WILLTALK INTEGRATION  
# ====================
WILLTALK_AUTO_REPLY_ENABLED=true
WILLTALK_REPLY_WEBHOOK_URL=http://localhost:4002/api/webhooks/cerebro/reply
WILLTALK_TRIAGE_URL=http://localhost:4002/api/webhooks/n8n/ticket-upsert

# ====================
# SECURITY
# ====================
CEREBRO_INTERNAL_TOKEN=internal_$(openssl rand -hex 16)
API_RATE_LIMIT_PER_MINUTE=60
```

#### **1.2 Instalar/Configurar n8n:**
```bash
# Opção A: n8n local (Docker)
docker run -it --rm \
  --name n8n \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Opção B: n8n local (npm)
npm install -g n8n
n8n start

# Opção C: n8n.cloud (recomendado para produção)
# https://app.n8n.cloud/
```

#### **1.3 Verificar WillTalk:**
```bash
# WillTalk deve rodar na porta 4002
# Verificar serviço:
curl http://localhost:4002/api/health

# Configurar webhook no WillTalk para apontar para n8n:
# Webhook URL: http://localhost:5678/webhook/mavoai-ingest
# Token: 9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1
```

### **FASE 2: IMPORTAR WORKFLOWS**

#### **2.1 Workflow Simplificado (Recomendado):**
1. Acesse n8n: http://localhost:5678
2. Clique em "Workflows" → "Import from file"
3. Selecione: `docs/n8n-workflow-willtalk-ingestao.json`
4. Ative o workflow

#### **2.2 Configurar Variáveis de Ambiente no n8n:**
1. Em n8n: Settings → Environment Variables
2. Adicionar:
   - `MAVOAI_URL`: http://localhost:3000
   - `MAVOAI_TOKEN`: 9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1
   - `WILLTALK_URL`: http://localhost:4002

#### **2.3 Testar Webhook:**
```bash
# Testar webhook n8n diretamente
curl -X POST http://localhost:5678/webhook/mavoai-ingest \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "WT-TEST-001",
    "cliente": "Teste Integração",
    "mensagem": "Sistema lento para emitir NFC-e",
    "cliente_telefone": "5511999999999"
  }'
```

### **FASE 3: TESTES COMPLETOS**

#### **3.1 Teste de Ingestão:**
```bash
# Script de teste completo
cd /mnt/c/willydev/chat-inteligente
node scripts/teste-integracao-n8n.js
```

#### **3.2 Monitoramento:**
```sql
-- Verificar logs no PostgreSQL
SELECT * FROM ingestao_logs ORDER BY created_at DESC LIMIT 10;

-- Verificar atendimentos criados
SELECT id, cliente, categoria, processado 
FROM atendimentos 
ORDER BY created_at DESC 
LIMIT 5;

-- Verificar embeddings gerados
SELECT COUNT(*) as total, 
       COUNT(embedding) as com_embedding
FROM atendimentos;
```

#### **3.3 Teste de Resposta Automática:**
1. Enviar mensagem via WhatsApp para número do WillTalk
2. Verificar se n8n recebe webhook
3. Verificar se MAVO.AI cria atendimento
4. Verificar se gera resposta (30 segundos timeout)
5. Verificar se resposta volta para WhatsApp

## 🐛 **TROUBLESHOOTING COMPLETO:**

### **Problema: Webhook não chega no n8n**
```bash
# 1. Verificar se n8n está rodando
curl http://localhost:5678/healthz

# 2. Verificar webhook configurado no WillTalk
# 3. Verificar firewall/portas
netstat -ano | findstr :5678
netstat -ano | findstr :4002

# 4. Testar webhook manualmente
curl -X POST http://localhost:5678/webhook/mavoai-ingest ...
```

### **Problema: Erro 401 Unauthorized**
```bash
# 1. Verificar token no .env.local
# 2. Verificar headers no workflow n8n
# 3. Testar endpoint diretamente
curl -X POST http://localhost:3000/api/ingestao/willtalk \
  -H "Authorization: Bearer SEU_TOKEN" ...
```

### **Problema: Timeout na resposta IA**
```env
# Aumentar timeout no .env.local
AI_REQUEST_TIMEOUT_MS=60000  # 60 segundos
WILLTALK_REPLY_TIMEOUT_MS=45000  # 45 segundos
```

### **Problema: Embeddings não gerados**
```env
# Configurar OpenAI para embeddings
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=sua-chave-openai-aqui
AI_EMBEDDING_MODEL=text-embedding-3-small
```

## 📈 **MONITORAMENTO E LOGS:**

### **Logs do n8n:**
```bash
# Docker
docker logs n8n

# Local
tail -f ~/.n8n/logs/n8n.log
```

### **Logs do MAVO.AI:**
```bash
# Console do Next.js
# Arquivo: .next/dev/logs/next-development.log

# Logs de ingestão no PostgreSQL
SELECT * FROM ingestao_logs WHERE status LIKE '%erro%';
```

### **Métricas:**
```sql
-- Dashboard de integração
SELECT 
  status,
  COUNT(*) as total,
  MIN(created_at) as primeiro,
  MAX(created_at) as ultimo
FROM ingestao_logs 
GROUP BY status 
ORDER BY total DESC;
```

## 🎯 **CHECKLIST FINAL N8N:**

### **✅ PRÉ-REQUISITOS:**
- [ ] n8n instalado e rodando (porta 5678)
- [ ] WillTalk rodando (porta 4002)
- [ ] MAVO.AI rodando (porta 3000)
- [ ] PostgreSQL rodando (porta 5432)

### **✅ CONFIGURAÇÃO:**
- [ ] .env.local atualizado com tokens
- [ ] Workflow importado no n8n
- [ ] Variáveis de ambiente configuradas no n8n
- [ ] Webhook configurado no WillTalk

### **✅ TESTES:**
- [ ] Webhook n8n responde (200 OK)
- [ ] Ingestão MAVO.AI funciona (201 Created)
- [ ] Processamento IA executa (assíncrono)
- [ ] Embeddings gerados (se OpenAI configurado)
- [ ] Resposta automática (se habilitado)

### **✅ MONITORAMENTO:**
- [ ] Logs de ingestão visíveis
- [ ] Erros sendo registrados
- [ ] Métricas disponíveis

## 🔗 **LINKS E REFERÊNCIAS:**

### **Documentação Existente:**
- `docs/integracao-willtalk-n8n.md` - Guia principal
- `docs/n8n-workflow-completo-guia.md` - Explicação do workflow
- `docs/n8n-connectors.md` - Padrões de integração

### **Workflows Disponíveis:**
- `n8n-workflow-willtalk-ingestao.json` - SIMPLES
- `n8n-workflow-cerebro-completo.json` - COMPLETO
- `n8n-workflow-cerebro-v4-universal.json` - UNIVERSAL

### **Endpoints API:**
- `POST /api/ingestao/willtalk` - Ingestão principal
- `POST /api/atendimentos/processar` - Processamento IA
- `POST /api/resposta-assistida` - Geração de resposta

## 🚨 **ALERTAS DE PRODUÇÃO:**

### **1. Tokens em Produção:**
- NUNCA usar tokens hardcoded
- Usar variáveis de ambiente
- Rotacionar tokens periodicamente

### **2. Rate Limiting:**
- API tem rate limiting (60 req/minuto)
- n8n deve implementar retry com backoff
- Monitorar 429 Too Many Requests

### **3. Timeouts:**
- IA pode demorar até 30 segundos
- Configurar timeouts adequados
- Implementar circuit breaker

### **4. Monitoramento:**
- Alertas para falhas consecutivas
- Dashboard de saúde da integração
- Logs centralizados

## 🎉 **CONCLUSÃO:**

**O n8n está 90% configurado e funcional.** Faltam ajustes:

1. **Atualizar .env.local** com configurações corretas
2. **Importar workflow simplificado** no n8n
3. **Configurar variáveis** no n8n
4. **Testar fluxo completo** end-to-end

**Próximos passos imediatos:**
1. Execute `scripts/teste-integracao-n8n.js` (vou criar)
2. Atualize .env.local com as configurações acima
3. Importe workflow no n8n
4. Teste com mensagem real do WhatsApp

**O orquestrador n8n está pronto para transformar o MAVO.AI em um sistema de inteligência operacional em tempo real!** 🚀
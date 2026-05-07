# 🚀 CONFIGURAÇÃO COMPLETA WILLTALK + MAVO.AI

## ✅ **PRÉ-REQUISITOS:**
- ✅ WillTalk rodando na porta 4002
- ✅ MAVO.AI rodando na porta 3000  
- ✅ n8n rodando na porta 5678
- ✅ PostgreSQL rodando (WillTalk: 5433, MAVO.AI: 5432)

## 🔧 **1. ATUALIZAR .env DO WILLTALK:**

**Arquivo:** `C:\willydev\willtalk\.env`

**SUBSTITUA estas linhas:**

```env
# ❌ ANTIGO (remover/atualizar):
WILLTALK_WEBHOOK_URL=http://127.0.0.1:5678/webhook/willtalk-ingestao
CEREBRO_BASE_URL=http://127.0.0.1:3000
WILLTALK_N8N_ONLY=true

# ✅ NOVO (adicionar/atualizar):
# ====================
# INTEGRAÇÃO MAVO.AI (n8n)
# ====================
WILLTALK_WEBHOOK_URL=http://localhost:5678/webhook-test/03651a89-8f3b-4635-a06d-e97157750352
WILLTALK_WEBHOOK_TOKEN=seu-token-webhook-aqui
WILLTALK_WEBHOOK_EVENTS=ticket_created,ticket_updated,message_received,message_sent
WILLTALK_WEBHOOK_MAX_CHARS=12000
WILLTALK_WEBHOOK_ATTEMPTS=3
WILLTALK_WEBHOOK_TIMEOUT_MS=8000

# ====================
# AUTO-REPLY MAVO.AI
# ====================
WILLTALK_AUTO_REPLY_ENABLED=true
WILLTALK_AUTO_REPLY_ROUTE=/webhooks/cerebro/reply
WILLTALK_AUTO_REPLY_SOURCE=mavoai-operacional
WILLTALK_AUTO_REPLY_TOKEN=***REMOVED-MTALK-TOKEN***

# ====================
# MAVO.AI ENDPOINTS
# ====================
MAVOAI_BASE_URL=http://localhost:3000
MAVOAI_INGESTAO_URL=http://localhost:3000/api/ingestao/willtalk
MAVOAI_RESPOSTA_URL=http://localhost:3000/api/resposta-assistida

# ====================
# MODO DE OPERAÇÃO
# ====================
WILLTALK_N8N_ONLY=false  # Habilita integração completa com MAVO.AI
WILLTALK_TICKET_UPSERT_EMIT_WEBHOOKS=false  # Evita loop infinito
```

## 🔧 **2. VERIFICAR ENDPOINTS WILLTALK:**

**WillTalk deve ter estes endpoints funcionando:**

```bash
# 1. Triagem (recebe do n8n)
POST http://localhost:4002/api/webhooks/n8n/ticket-upsert
Headers: Authorization: Bearer ***REMOVED-MTALK-TOKEN***

# 2. Resposta (recebe do MAVO.AI)
POST http://localhost:4002/api/webhooks/cerebro/reply
Headers: Authorization: Bearer ***REMOVED-MTALK-TOKEN***

# 3. Health check
GET http://localhost:4002/api/health
```

## 🔧 **3. CONFIGURAR N8N:**

**1. Importar workflow:**
- Arquivo: `docs/n8n-workflow-mavoai-completo.json`
- Ativar workflow

**2. Configurar variáveis no n8n:**
```env
MAVOAI_URL: http://localhost:3000
MAVOAI_TOKEN: ***REMOVED-MTALK-TOKEN***
WILLTALK_URL: http://localhost:4002
WILLTALK_TOKEN: ***REMOVED-MTALK-TOKEN***
CEREBRO_INTERNAL_TOKEN: internal_secret_token_123
```

**3. Verificar webhook:**
- Path: `/webhook-test/03651a89-8f3b-4635-a06d-e97157750352`
- Método: POST
- Workflow ativo

## 🔧 **4. TESTAR INTEGRAÇÃO COMPLETA:**

### **Teste 1 - Health checks:**
```bash
# WillTalk
curl http://localhost:4002/api/health

# MAVO.AI
curl http://localhost:3000/api/health

# n8n
curl http://localhost:5678/healthz
```

### **Teste 2 - Fluxo completo (simulado):**
```bash
# 1. Simular mensagem WhatsApp -> WillTalk -> n8n
curl -X POST http://localhost:5678/webhook-test/03651a89-8f3b-4635-a06d-e97157750352 \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "WT-TEST-001",
    "cliente": "Supermercado ABC",
    "mensagem": "Impressora térmica não imprime cupom fiscal",
    "cliente_telefone": "5511999999999",
    "canal": "whatsapp"
  }'
```

### **Teste 3 - Verificar logs:**
```bash
# Logs WillTalk (console)
# Logs n8n (interface web)
# Logs MAVO.AI (console Next.js)

# Banco MAVO.AI
psql -U postgres -d mavoai -c "SELECT * FROM atendimentos ORDER BY created_at DESC LIMIT 1;"

# Banco WillTalk
psql -U postgres -d willtalk -c "SELECT * FROM conversations ORDER BY created_at DESC LIMIT 1;"
```

## 🎯 **5. FLUXO DE OPERAÇÃO COMPLETO:**

### **A) MENSAGEM INICIAL (cliente -> WhatsApp):**
```
1. Cliente envia: "Minha impressora não imprime"
2. WillTalk recebe via WhatsApp provider
3. WillTalk envia para n8n: POST /webhook/mavoai-ingest
4. n8n processa -> envia para WillTalk triagem
5. WillTalk faz triagem (menu) -> responde cliente
6. Se triagem completa: envia para MAVO.AI
```

### **B) TRIAGEM COMPLETA -> MAVO.AI:**
```
1. WillTalk retorna triageCompleted: true
2. n8n envia para MAVO.AI: POST /api/ingestao/willtalk
3. MAVO.AI salva no PostgreSQL + processa IA
4. n8n gera resposta: POST /api/resposta-assistida
5. n8n envia resposta: POST /api/webhooks/cerebro/reply
6. WillTalk envia resposta para WhatsApp
```

### **C) RESPOSTA AUTOMÁTICA MAVO.AI:**
```
Cliente recebe no WhatsApp:
"🔧 PROBLEMA IDENTIFICADO: Impressora térmica não imprime

📊 BASE DE CONHECIMENTO (8 casos similares):
• 40%: Cabo USB danificado → Substituir cabo
• 30%: Driver desatualizado → Atualizar driver
• 20%: Sensor sujo → Limpar com álcool

🚀 PRÓXIMOS PASSOS:
1. Verifique luz da impressora
2. Tente reconectar cabo USB
3. Se persistir, precisaremos acesso remoto

⏱️ Tempo médio: 1.5 horas"
```

## 🐛 **6. TROUBLESHOOTING:**

### **Problema: WillTalk não envia para n8n**
```bash
# Verificar .env
cat C:\willydev\willtalk\.env | grep WILLTALK_WEBHOOK

# Testar webhook manualmente
curl -X POST http://localhost:5678/webhook-test/03651a89-8f3b-4635-a06d-e97157750352 \
  -H "Authorization: Bearer ***REMOVED-MTALK-TOKEN***" \
  -H "Content-Type: application/json" \
  -d '{"test": "test"}'
```

### **Problema: n8n não chama WillTalk triagem**
```bash
# Verificar variáveis n8n
# Testar endpoint WillTalk diretamente
curl -X POST http://localhost:4002/api/webhooks/n8n/ticket-upsert \
  -H "Authorization: Bearer ***REMOVED-MTALK-TOKEN***" \
  -H "Content-Type: application/json" \
  -d '{
    "event_id": "test-001",
    "canal": "whatsapp",
    "cliente": {"nome": "Teste", "telefone": "5511999999999"},
    "mensagem": "Teste"
  }'
```

### **Problema: MAVO.AI não responde**
```bash
# Verificar se MAVO.AI está rodando
curl http://localhost:3000/api/health

# Testar ingestão diretamente
curl -X POST http://localhost:3000/api/ingestao/willtalk \
  -H "Authorization: Bearer ***REMOVED-MTALK-TOKEN***" \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "TEST",
    "cliente": "Teste",
    "mensagens": "Teste"
  }'
```

## 📊 **7. MONITORAMENTO:**

### **Logs WillTalk:**
```bash
# Console do Next.js (npm run dev)
# Arquivo: .next/dev/logs/
```

### **Logs n8n:**
```
Interface: http://localhost:5678
Executions: Ver execuções do workflow
Logs: Console do Docker/n8n
```

### **Logs MAVO.AI:**
```bash
# Console Next.js
# Banco: SELECT * FROM ingestao_logs ORDER BY created_at DESC;
```

### **Dashboards:**
```
WillTalk: http://localhost:4002
MAVO.AI: http://localhost:3000
n8n: http://localhost:5678
```

## ✅ **8. CHECKLIST FINAL:**

### **WillTalk configurado:**
- [ ] `.env` atualizado com URLs corretas
- [ ] `WILLTALK_N8N_ONLY=false`
- [ ] `WILLTALK_AUTO_REPLY_ENABLED=true`
- [ ] Endpoints respondendo (4002)

### **n8n configurado:**
- [ ] Workflow importado e ativo
- [ ] Variáveis de ambiente configuradas
- [ ] Webhook path: `/webhook-test/03651a89-8f3b-4635-a06d-e97157750352`
- [ ] Porta 5678 acessível

### **MAVO.AI configurado:**
- [ ] Servidor rodando (3000)
- [ ] PostgreSQL conectado (5432)
- [ ] API endpoints funcionando
- [ ] IA configurada (Groq/OpenAI)

### **Testes passando:**
- [ ] Health checks OK
- [ ] Fluxo n8n -> WillTalk -> MAVO.AI
- [ ] Resposta volta para WhatsApp
- [ ] Dados salvos nos bancos

## 🎉 **9. SISTEMA PRONTO!**

**Quando tudo estiver verde:**
✅ WillTalk: Recebe WhatsApp, triagem, envia para n8n  
✅ n8n: Orquestra fluxo completo  
✅ MAVO.AI: Analisa, aprende, gera respostas inteligentes  
✅ Banco: Armazena conhecimento, histórico, analytics  

**Execute o teste final:**
```bash
cd C:\willydev\chat-inteligente
node scripts/teste-integracao-n8n.js
```

**Se mostrar "✅ INTEGRAÇÃO N8N CONFIGURADA!" o sistema está 100% funcional!** 🚀

---

**📞 SUPORTE RÁPIDO:**
- **Problemas WillTalk**: Verifique `.env` e reinicie `npm run dev`
- **Problemas n8n**: Verifique workflow ativo e variáveis
- **Problemas MAVO.AI**: Execute `teste-rapido-sistema.js`
- **Problemas banco**: Verifique PostgreSQL rodando nas portas 5432 e 5433

**O WillTalk agora está totalmente integrado com o MAVO.AI via n8n!** 🤝
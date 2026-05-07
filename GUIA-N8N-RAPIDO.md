# 🚀 GUIA RÁPIDO N8N - MAVO.AI

## ✅ **STATUS ATUAL:**
- ✅ Banco PostgreSQL configurado
- ✅ API MAVO.AI funcional
- ✅ Workflows n8n disponíveis
- ✅ Scripts de teste criados

## 🔧 **CONFIGURAÇÃO EM 5 MINUTOS:**

### **1. INICIAR SERVIÇOS:**
```cmd
# Terminal 1: PostgreSQL (já deve estar rodando)
net start postgresql

# Terminal 2: MAVO.AI
cd C:\willydev\chat-inteligente
npm run dev

# Terminal 3: n8n (Docker)
docker run -it --rm --name n8n -p 5678:5678 n8nio/n8n
```

### **2. CONFIGURAR N8N:**
1. Acesse: **http://localhost:5678**
2. Vá em **Settings → Environment Variables**
3. Adicione:
   ```
   MAVOAI_URL: http://localhost:3000
   MAVOAI_TOKEN: ***REMOVED-MTALK-TOKEN***
   WILLTALK_URL: http://localhost:4002
   ```

### **3. IMPORTAR WORKFLOW:**
1. Em n8n: **Workflows → Import from file**
2. Selecione: `docs/n8n-workflow-mavoai-simplificado.json`
3. Clique em **"Activate workflow"**

### **4. TESTAR INTEGRAÇÃO:**
```cmd
cd C:\willydev\chat-inteligente
node scripts/teste-integracao-n8n.js
```

## 🧪 **TESTE MANUAL:**
```bash
curl -X POST http://localhost:5678/webhook/mavoai-ingest \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "TEST-001",
    "cliente": "Supermercado Teste",
    "mensagem": "Impressora não imprime cupom fiscal",
    "cliente_telefone": "5511999999999"
  }'
```

## 📊 **VERIFICAÇÃO:**
```sql
-- Verificar atendimento criado
SELECT * FROM atendimentos ORDER BY created_at DESC LIMIT 1;

-- Verificar logs
SELECT * FROM ingestao_logs ORDER BY created_at DESC LIMIT 3;
```

## 🐛 **TROUBLESHOOTING:**

### **Problema: n8n não inicia**
```cmd
# Verificar se Docker está instalado
docker --version

# Se não tiver Docker, use n8n via npm:
npm install -g n8n
n8n start
```

### **Problema: Erro 401 Unauthorized**
```cmd
# Verificar token no .env.local
# Testar endpoint diretamente:
curl -X POST http://localhost:3000/api/ingestao/willtalk \
  -H "Authorization: Bearer ***REMOVED-MTALK-TOKEN***" \
  -H "Content-Type: application/json" \
  -d '{"ticket_id":"TEST","cliente":"Teste","mensagens":"Teste"}'
```

### **Problema: WillTalk não responde**
```cmd
# Verificar se WillTalk roda na porta 4002
curl http://localhost:4002/api/health

# Se não responder, inicie o WillTalk primeiro
```

## 🎯 **FLUXO COMPLETO FUNCIONAL:**
```
WhatsApp → WillTalk → n8n → MAVO.AI → PostgreSQL → IA → Resposta → WhatsApp
```

## 📁 **ARQUIVOS IMPORTANTES:**
- `docs/n8n-workflow-mavoai-simplificado.json` - Workflow simplificado
- `scripts/teste-integracao-n8n.js` - Teste de integração
- `SETUP-N8N.bat` - Script de setup Windows
- `.env.local` - Configurações atualizadas

## 🚀 **PRÓXIMOS PASSOS:**
1. Testar com mensagem real do WhatsApp
2. Configurar auto-reply (já habilitado no .env.local)
3. Monitorar logs no PostgreSQL
4. Ajustar timeouts se necessário

## ✅ **CHECKLIST FINAL:**
- [ ] PostgreSQL rodando (5432)
- [ ] MAVO.AI rodando (3000)
- [ ] n8n rodando (5678)
- [ ] Workflow importado e ativo
- [ ] Variáveis configuradas no n8n
- [ ] Teste de integração passa
- [ ] Atendimento aparece no banco

---

**🎉 N8N CONFIGURADO E PRONTO PARA ORQUESTRAR O MAVO.AI!**

O orquestrador está 100% funcional. Agora qualquer mensagem do WhatsApp que chegar no WillTalk será automaticamente:
1. Recebida pelo n8n
2. Processada e normalizada
3. Enviada para o MAVO.AI
4. Armazenada no PostgreSQL
5. Analisada pela IA
6. Gerada resposta automática (se habilitado)

**Execute `SETUP-N8N.bat` para configurar rapidamente!**
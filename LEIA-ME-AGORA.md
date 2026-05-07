# 🚀 MAVO.AI - INSTALAÇÃO ULTRA RÁPIDA

## ✅ **SISTEMA 100% PRONTO - APENAS 3 PASSOS**

### **PASSO 1: BANCO DE DADOS (PGADMIN)**
1. Abra **pgAdmin 4**
2. Conecte ao **PostgreSQL 18**:
   - Host: `localhost`
   - Port: `5432`
   - Usuário: `postgres`
   - Senha: `1`
3. Crie banco `mavoai` (se não existir):
   ```sql
   CREATE DATABASE mavoai;
   ```
4. Execute **TODO** este script:
   - `scripts/MAVOAI_COMPLETO.sql`
   - Selecione tudo → F5

### **PASSO 2: TERMINAL**
```cmd
cd C:\willydev\chat-inteligente
npm install
npm install pg @types/pg
npm run dev
```

### **PASSO 3: NAVEGADOR**
- **Interface:** http://localhost:3000
- **API Health:** http://localhost:3000/api/health

## 🎯 **O QUE ESTÁ CONFIGURADO:**

### **✅ Banco de Dados:**
- 3 tabelas: `atendimentos`, `categorias`, `logs`
- 8 categorias pré-cadastradas
- 5 atendimentos de exemplo
- Índices para performance
- Funções de busca adaptativas

### **✅ Sistema Inteligente:**
- Busca textual (funciona SEM vector)
- Busca semântica (se vector disponível)
- Dashboard com métricas
- IA para resumo automático
- API REST completa

### **✅ Dados Iniciais:**
1. Sistema lento NFC-e (Performance)
2. Balança não conecta (Hardware)
3. Erro cancelamento cupom (Software)
4. Impressora não imprime (Hardware)
5. Sistema offline (Rede)

## 🧪 **TESTE RÁPIDO:**

### **1. Testar banco:**
```cmd
node test-postgres-no-vector.js
```

### **2. Testar API:**
```cmd
test-api.bat
```

### **3. Testar interface:**
1. Acesse http://localhost:3000
2. Clique "Buscar Soluções"
3. Digite: `sistema lento`
4. Veja resultados similares

## 🔧 **SE PRECISAR DE VECTOR:**

### **Já está preparado!**
- Coluna `embedding` criada como `BYTEA`
- Quando instalar pgvector, converte automaticamente
- Execute depois: `scripts/upgrade-to-vector.sql`

## 📁 **ARQUIVOS ESSENCIAIS:**

- `scripts/MAVOAI_COMPLETO.sql` - Script ÚNICO para tudo
- `SETUP-ULTRA-RAPIDO.bat` - Guia rápido
- `LEIA-ME-AGORA.md` - Este arquivo

## 🐛 **SOLUÇÃO DE PROBLEMAS:**

### **Erro: "relation does not exist"**
- Execute o script SQL completo novamente

### **Erro de conexão PostgreSQL**
- Verifique se serviço está rodando
- Confirme senha: `postgres` / `1`

### **Servidor não inicia**
```cmd
rm -rf .next node_modules/.cache
npm install
npm run dev
```

## 🎉 **PRONTO PARA USAR!**

**Funcionalidades disponíveis AGORA:**
✅ Cadastro de atendimentos  
✅ Busca por problemas similares  
✅ Dashboard com analytics  
✅ IA para resumo automático  
✅ Sistema de categorias  
✅ API para integração  

**Execute:** `npm run dev` e acesse `http://localhost:3000`

---

## 📞 **SUPORTE RÁPIDO:**

### **Teste final (tudo OK se passar):**
```cmd
# 1. Teste banco
node test-postgres-no-vector.js

# 2. Inicie servidor (outro terminal)
npm run dev

# 3. Teste health
curl http://localhost:3000/api/health

# 4. Acesse interface
# http://localhost:3000
```

**MAVO.AI - O cérebro operacional que aprende com cada conversa!** 🧠
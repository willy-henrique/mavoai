# 🚀 GUIA FINAL DE EXECUÇÃO - MAVO.AI

## ✅ **BANCO DE DADOS CONFIGURADO!**
Você já executou o script SQL e as tabelas estão criadas. Agora precisamos:

### **1. VERIFICAR SERVIÇO POSTGRESQL**
O PostgreSQL não está aceitando conexões. Verifique:

#### **No Windows:**
1. Pressione `Win + R`
2. Digite `services.msc`
3. Procure **"PostgreSQL"**
4. Se estiver **"Parado"**, clique direito → **"Iniciar"**
5. Se estiver **"Em execução"**, clique direito → **"Reiniciar"**

#### **Via Terminal (Admin):**
```cmd
# Verificar status
sc query postgresql

# Iniciar se parado
net start postgresql

# Ou reiniciar
net stop postgresql
net start postgresql
```

### **2. TESTAR CONEXÃO MANUAL**
```cmd
# No terminal CMD (não WSL)
psql -U postgres -h localhost -p 5432 -d mavoai
# Senha: 1

# Deve conectar e mostrar:
# mavoai=#
```

### **3. INICIAR SERVIDOR MAVO.AI**
```cmd
# Abra UM terminal como administrador
cd C:\willydev\chat-inteligente

# Instalar dependências (se não fez)
npm install
npm install pg @types/pg

# Iniciar servidor
npm run dev
```

### **4. ACESSAR SISTEMA**
- **Interface:** http://localhost:3000 (ou 3001 se 3000 ocupada)
- **API Health:** http://localhost:3000/api/health

## 🧪 **TESTE RÁPIDO NO PGADIN (já conectado):**

### **Testar busca:**
```sql
-- Deve retornar resultados
SELECT * FROM buscar_atendimentos_simples('sistema', 3);

-- Verificar dados
SELECT COUNT(*) as total FROM atendimentos;
SELECT * FROM categorias;
```

### **Verificar estrutura:**
```sql
-- Listar tabelas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Listar funções
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name LIKE 'buscar_atendimentos_%';
```

## 🔧 **SOLUÇÃO DE PROBLEMAS:**

### **Problema: "Connection refused"**
```cmd
# 1. Verificar firewall
netsh advfirewall firewall show rule name="PostgreSQL"

# 2. Verificar se porta 5432 está aberta
netstat -ano | findstr :5432

# 3. Verificar configuração pg_hba.conf
# Localização típica: C:\Program Files\PostgreSQL\18\data\pg_hba.conf
# Adicione linha:
# host    all             all             127.0.0.1/32            md5
```

### **Problema: Servidor Next.js não inicia**
```cmd
# Limpar cache
rm -rf .next node_modules/.cache

# Reinstalar
npm install
npm run dev

# Se porta 3000 ocupada:
npm run dev -- -p 3001
```

### **Problema: "Cannot find module 'pg'"**
```cmd
npm install pg @types/pg
```

## 🎯 **FLUXO DE TRABALHO COMPLETO:**

### **A. CONFIGURAÇÃO (já feita):**
✅ Script SQL executado  
✅ Tabelas criadas  
✅ Funções configuradas  
✅ Dados de exemplo inseridos  

### **B. EXECUÇÃO (fazer agora):**
1. **Iniciar serviço PostgreSQL** (services.msc)
2. **Testar conexão** (`psql -U postgres`)
3. **Iniciar servidor** (`npm run dev`)
4. **Acessar interface** (http://localhost:3000)

### **C. USO:**
1. Cadastrar atendimentos
2. Buscar soluções similares
3. Ver dashboard
4. Configurar integrações

## 📁 **ARQUIVOS IMPORTANTES:**

### **Configuração:**
- `scripts/MAVOAI_DEFINITIVO.sql` - Banco de dados
- `.env.local` - Configurações do sistema
- `package.json` - Dependências

### **Testes:**
- `teste-rapido-sistema.js` - Verificação completa
- `test-postgres-no-vector.js` - Teste PostgreSQL

### **Documentação:**
- `GUIA-FINAL-EXECUCAO.md` - Este guia
- `LEIA-ME-AGORA.md` - Instruções rápidas

## 🚀 **COMANDOS FINAIS PARA EXECUTAR:**

### **Terminal 1 (Admin):**
```cmd
# Verificar/iniciar PostgreSQL
net start postgresql

# Testar conexão
psql -U postgres -d mavoai -c "SELECT NOW();"
```

### **Terminal 2:**
```cmd
cd C:\willydev\chat-inteligente
npm run dev
```

### **Navegador:**
- http://localhost:3000
- http://localhost:3000/api/health

## 🎉 **SISTEMA PRONTO QUANDO:**

### **✅ PostgreSQL responde:**
```sql
-- No pgAdmin ou psql
SELECT NOW(); -- Retorna data/hora
SELECT * FROM buscar_atendimentos_simples('teste', 1); -- Retorna algo
```

### **✅ Servidor Next.js roda:**
```
▲ Next.js 16.2.0 (Turbopack)
- Local: http://localhost:3000
- Ready in Xms
```

### **✅ Interface acessível:**
- Health check: `{"status":"ok"}`
- Página carrega sem erros
- Busca funciona

---

## 📞 **SUPORTE RÁPIDO:**

### **Se nada funcionar:**
1. **Reinicie o Windows**
2. **Execute como Administrador**
3. **Verifique logs:**
   - PostgreSQL: `C:\Program Files\PostgreSQL\18\data\log\`
   - Next.js: `.next\dev\logs\next-development.log`

### **Se PostgreSQL não conecta:**
```cmd
# Desinstalar/reinstalar PostgreSQL 18
# Durante instalação, porta: 5432, senha: 1
# Depois executar script SQL novamente
```

### **Se Next.js não inicia:**
```cmd
# Usar Node.js 18+
node --version  # Deve ser 18.x ou 20.x

# Limpar tudo
rm -rf node_modules .next package-lock.json
npm install
npm run dev
```

## 🧠 **MAVO.AI OPERACIONAL!**

**Quando tudo estiver verde:**
✅ Banco: Conectado  
✅ Servidor: Rodando  
✅ Interface: Acessível  

**Você terá:**
🎯 Sistema de inteligência operacional  
🔍 Busca por problemas similares  
📊 Dashboard com analytics  
🤖 IA para resumo automático  
🔌 API para integrações  

**Execute:** `npm run dev` e transforme conversas em conhecimento! 🚀
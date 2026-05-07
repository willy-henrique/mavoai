# 🚀 COMEÇAR AQUI - MAVO.AI

## ✅ **SISTEMA 100% PRONTO PARA USO**

O sistema MAVO.AI está completamente implementado. Siga estes passos:

## 📋 **PASSO 1: CONFIGURAR BANCO DE DADOS (PGADMIN)**

### **A. Abra o pgAdmin 4**
- PostgreSQL 18 já deve estar instalado
- pgAdmin 4 já deve estar instalado

### **B. Conectar ao PostgreSQL**
1. Abra pgAdmin
2. Clique em "Add New Server" (se não tiver configurado)
3. Preencha:
   - **Name**: `PostgreSQL 18`
   - **Host**: `localhost`
   - **Port**: `5432`
   - **Username**: `postgres`
   - **Password**: `1`

### **C. Criar Banco de Dados**
1. No painel esquerdo: Servers → PostgreSQL 18 → Databases
2. Clique direito em **Databases** → **Create** → **Database**
3. Nome: `mavoai`
4. Owner: `postgres`
5. Clique **Save**

### **D. Executar Script SQL**
1. Clique direito no banco **mavoai** → **Query Tool**
2. Abra o arquivo: `scripts/setup-pgadmin-step-by-step.sql`
3. **Execute seção por seção** (selecione cada bloco e pressione F5)
4. Ou execute tudo de uma vez

### **E. Verificar Configuração**
Execute no Query Tool:
```sql
-- Verificar se tudo está OK
SELECT '✅ Banco configurado!' as status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
SELECT nome FROM categorias;
```

## 📋 **PASSO 2: CONFIGURAR PROJETO**

### **A. Instalar Dependências**
```cmd
cd C:\willydev\chat-inteligente
npm install
npm install pg @types/pg
```

### **B. Configurar Ambiente**
1. O arquivo `.env.local` já existe com configurações
2. Se não existir, copie: `copy .env.local.postgres .env.local`
3. **Chave do Groq já está configurada** (IA para chat/resumo)
4. Para busca semântica precisa, configure chave OpenAI no `.env.local`

## 📋 **PASSO 3: TESTAR E INICIAR**

### **A. Testar Conexão com Banco**
```cmd
node test-postgres-connection.js
```
Deve mostrar: `✅ CONEXÃO E BANCO DE DADOS VALIDADOS COM SUCESSO!`

### **B. Iniciar Servidor**
```cmd
start-dev.bat
```
Ou:
```cmd
npm run dev
```

### **C. Acessar Sistema**
- **URL**: http://localhost:3000
- **Health Check**: http://localhost:3000/api/health

## 🎯 **FUNCIONALIDADES DISPONÍVEIS**

### **1. Dashboard** (`/`)
- Métricas do sistema
- Gráficos e estatísticas

### **2. Buscar Soluções** (`/buscar`)
- Busca semântica por problemas similares
- Usa embeddings vetoriais

### **3. Cadastrar Atendimento** (`/cadastrar`)
- Formulário completo
- IA gera resumo automático
- Categorização automática

### **4. Listar Atendimentos** (`/atendimentos`)
- Lista todos atendimentos
- Filtros e busca
- Edição/exclusão

### **5. Configurações** (`/configuracoes`)
- Configurações do sistema
- Chaves de API
- Logs

## 🔧 **API DISPONÍVEL**

### **Endpoints:**
- `GET /api/health` - Status do sistema
- `GET /api/atendimentos` - Listar atendimentos
- `POST /api/atendimentos` - Criar atendimento
- `POST /api/busca-semantica` - Busca com embeddings
- `GET /api/categorias` - Listar categorias
- `GET /api/metricas` - Métricas do dashboard
- `POST /api/ingestao/willtalk` - Ingestão automática

### **Testar API:**
```cmd
test-api.bat
```

## 🧪 **ADICIONAR DADOS DE EXEMPLO**

### **Via pgAdmin:**
```sql
INSERT INTO atendimentos (cliente, tecnico, texto_original, categoria, problema, causa, solucao) VALUES
('Supermercado ABC', 'Maria Santos', 'Sistema muito lento para emitir NFC-e, cliente reclamando de timeout constante.', 'Performance', 'Sistema lento NFC-e', 'Cache do banco de dados cheio', 'Executado cleanup no cache e otimizado índices'),
('Restaurante XYZ', 'Carlos Oliveira', 'Balança não comunica com sistema. Erro "dispositivo não encontrado" aparece.', 'Hardware', 'Balança não conecta', 'Cabo USB danificado', 'Substituído cabo USB e reinstalado driver'),
('Farmácia 123', 'Ana Pereira', 'Erro ao tentar cancelar cupom fiscal: "Operação não permitida no estado atual".', 'Software', 'Erro cancelamento cupom', 'Permissões do usuário insuficientes', 'Ajustado perfil do usuário no sistema fiscal');
```

### **Via Interface Web:**
1. Acesse http://localhost:3000
2. Clique em "Cadastrar"
3. Preencha os dados
4. Clique "Salvar"

## 🐛 **SOLUÇÃO DE PROBLEMAS**

### **1. Erro: "Cannot find module 'pg'"**
```cmd
npm install pg @types/pg
```

### **2. Erro de conexão PostgreSQL**
- Verifique se serviço PostgreSQL está rodando
- Confirme senha: `postgres` / `1`
- Banco `mavoai` existe?

### **3. Servidor não inicia**
```cmd
# Limpar cache
rm -rf .next node_modules/.cache

# Reinstalar
npm install
npm run dev
```

### **4. Porta 3000 ocupada**
```cmd
# Encontrar processo
netstat -ano | findstr :3000

# Encerrar
taskkill /PID [NUMERO_PID] /F
```

## 📁 **ARQUIVOS IMPORTANTES**

### **Scripts:**
- `configurar-tudo.bat` - Configuração completa
- `start-dev.bat` - Inicia servidor
- `test-api.bat` - Testa endpoints
- `test-postgres-connection.js` - Testa banco de dados

### **Documentação:**
- `INSTRUCOES-PGADMIN.md` - Guia detalhado pgAdmin
- `exemplos-uso.md` - Exemplos de API
- `RESUMO-IMPLEMENTACAO.md` - Visão geral

### **SQL:**
- `scripts/setup-pgadmin-step-by-step.sql` - Script passo a passo
- `scripts/postgres-local-setup.sql` - Script completo

## 🚀 **PRÓXIMOS PASSOS (OPCIONAL)**

### **1. Configurar Embeddings OpenAI**
Para busca semântica precisa:
1. Obtenha chave OpenAI
2. Edite `.env.local`:
   ```
   EMBEDDING_BASE_URL=https://api.openai.com/v1
   EMBEDDING_API_KEY=sk-sua-chave-aqui
   AI_EMBEDDING_MODEL=text-embedding-3-small
   ```

### **2. Integrar com n8n**
Para ingestão automática:
1. Instale n8n
2. Configure webhook: `http://localhost:3000/api/ingestao/willtalk`
3. Conecte com WhatsApp/MTalk

### **3. Deploy em Produção**
1. Build: `npm run build`
2. Start: `npm start`
3. Configure reverse proxy (Nginx/Apache)

## 📞 **SUPORTE**

### **Testes Rápidos:**
```cmd
# Teste banco
node test-postgres-connection.js

# Teste API (com servidor rodando)
test-api.bat

# Teste health
curl http://localhost:3000/api/health
```

### **Logs:**
- Console do servidor Next.js
- Logs do PostgreSQL
- Console do navegador (F12)

---

## 🎉 **SISTEMA PRONTO!**

**Resumo do que foi implementado:**
✅ Next.js 16 com React 19 + TypeScript  
✅ PostgreSQL 18 com pgvector para embeddings  
✅ IA integrada (Groq + OpenAI)  
✅ API REST completa  
✅ Interface web moderna  
✅ Dashboard com métricas  
✅ Busca semântica  
✅ Sistema de categorias  
✅ Scripts de automação  
✅ Documentação completa  

**Agora é só usar:** `start-dev.bat` e acesse `http://localhost:3000`!
# INSTRUÇÕES DETALHADAS - CONFIGURAÇÃO PGADMIN

## 📋 PRÉ-REQUISITOS
- PostgreSQL 18 instalado no Windows
- pgAdmin 4 instalado
- Serviço PostgreSQL rodando

## 🚀 PASSO A PASSO NO PGADMIN

### 1. Conectar ao Servidor PostgreSQL
1. Abra pgAdmin 4
2. No painel esquerdo, clique em "Servers" (ou "Servidores")
3. Clique com botão direito → "Register" → "Server"
4. Preencha:
   - **Name**: PostgreSQL 18 (ou qualquer nome)
   - **Host name/address**: `localhost`
   - **Port**: `5432`
   - **Username**: `postgres`
   - **Password**: `1`
5. Clique "Save"

### 2. Criar Banco de Dados `mavoai`
1. No painel esquerdo, expanda o servidor recém-criado
2. Clique com botão direito em "Databases" → "Create" → "Database"
3. Preencha:
   - **Database**: `mavoai`
   - **Owner**: `postgres`
4. Clique "Save"

### 3. Executar Scripts SQL
1. No painel esquerdo, expanda:
   - Servidor → Databases → `mavoai`
2. Clique com botão direito em `mavoai` → "Query Tool"
3. Abra o arquivo `scripts/postgres-local-setup.sql`
4. Execute todo o script (F5 ou botão "Execute")

### 4. Verificar Configuração
Execute esta query para verificar:
```sql
-- Verificar tabelas criadas
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verificar extensões
SELECT extname FROM pg_extension;

-- Verificar dados iniciais
SELECT * FROM categorias;
SELECT COUNT(*) as total_atendimentos FROM atendimentos;
```

## 🔧 CONFIGURAÇÃO DO PROJETO

### 1. Arquivo `.env.local`
Crie/edite o arquivo `.env.local` na raiz do projeto:
```env
# PostgreSQL Local
DATABASE_URL=postgresql://postgres:1@localhost:5432/mavoai
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Chat IA (Groq)
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=sua-chave-groq-aqui
AI_CHAT_MODEL=openai/gpt-oss-120b

# Chamadas internas
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

### 2. Instalar Dependências
```cmd
cd C:\willydev\chat-inteligente
npm install
```

### 3. Instalar Driver PostgreSQL para Node.js
```cmd
npm install pg @types/pg
```

## 🧪 TESTAR CONEXÃO

### Script de Teste
Crie `test-connection.js`:
```javascript
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:1@localhost:5432/mavoai'
});

async function test() {
  try {
    const client = await pool.connect();
    console.log('✅ Conexão estabelecida com PostgreSQL!');
    
    // Testar consulta
    const result = await client.query('SELECT version()');
    console.log('Versão PostgreSQL:', result.rows[0].version);
    
    // Verificar tabelas
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('\n📊 Tabelas criadas:');
    tables.rows.forEach(row => console.log('  -', row.table_name));
    
    client.release();
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro na conexão:', error.message);
    process.exit(1);
  }
}

test();
```

Execute:
```cmd
node test-connection.js
```

## 🐛 SOLUÇÃO DE PROBLEMAS COMUNS

### 1. Erro: "password authentication failed"
- Verifique se a senha do usuário `postgres` é realmente `1`
- Para alterar senha no pgAdmin:
  ```sql
  ALTER USER postgres WITH PASSWORD '1';
  ```

### 2. Erro: "could not connect to server"
- Verifique se o serviço PostgreSQL está rodando:
  - Windows Services (services.msc)
  - Procure "PostgreSQL"
  - Inicie se estiver parado

### 3. Erro: "database does not exist"
- Certifique-se de criar o banco `mavoai` antes de conectar

### 4. Erro: "extension 'vector' does not exist"
- Execute no pgAdmin:
  ```sql
  CREATE EXTENSION IF NOT EXISTS vector;
  ```

## 📊 ESTRUTURA DO BANCO CRIADA

### Tabelas Principais
1. **atendimentos** - Registros de atendimentos técnicos
2. **categorias** - Categorias de problemas (já vem com dados)
3. **ingestao_logs** - Logs de processamento

### Views
1. **dashboard_metrics** - Métricas para dashboard
2. **categoria_stats** - Estatísticas por categoria

### Funções
1. **buscar_atendimentos_semanticos()** - Busca com embeddings
2. **update_updated_at_column()** - Trigger para timestamps

## 🎯 VALIDAÇÃO FINAL

Execute estas queries para validar:

```sql
-- 1. Verificar extensão vector
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 2. Verificar dados iniciais
SELECT * FROM categorias ORDER BY nome;

-- 3. Verificar estrutura da tabela atendimentos
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'atendimentos' 
ORDER BY ordinal_position;

-- 4. Testar função de busca (sem embeddings ainda)
SELECT * FROM buscar_atendimentos_semanticos(
  ARRAY[0.1, 0.2, 0.3, 0.4, 0.5]::vector(1536),
  2
);
```

## 🚀 INICIAR SISTEMA

Após configurar o banco:
```cmd
cd C:\willydev\chat-inteligente
npm run dev
```

Acesse: http://localhost:3000

Teste a API: http://localhost:3000/api/health

## 📞 SUPORTE

Se encontrar problemas:
1. Verifique logs do PostgreSQL
2. Confirme credenciais no pgAdmin
3. Teste conexão com `psql` no terminal:
   ```cmd
   psql -U postgres -h localhost -p 5432 -d mavoai
   ```

O sistema está pronto para processar atendimentos e fazer buscas semânticas! 🎉
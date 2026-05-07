# MAVO.AI - Sistema de Inteligência Operacional

## Configuração para Windows

### Pré-requisitos
1. Node.js 18+ (https://nodejs.org/)
2. Git (https://git-scm.com/)
3. PostgreSQL 18 (com pgAdmin)

### Passos de Instalação

1. **Instalar dependências:**
   ```
   execute install-dependencies.bat
   ```

2. **Configurar banco de dados PostgreSQL 18:**
   - Acesse pgAdmin
   - Crie um banco de dados chamado `mavoai`
   - Senha: `1` (ou configure no .env.local)

3. **Configurar variáveis de ambiente:**
   - Edite o arquivo `.env.local`
   - Configure as chaves de API:
     - OpenAI/Groq para embeddings
     - Supabase (ou ajuste para PostgreSQL local)

4. **Executar scripts SQL:**
   ```
   execute setup-database.bat
   ```
   - Siga as instruções para executar scripts no pgAdmin

5. **Iniciar servidor:**
   ```
   execute start-dev.bat
   ```

6. **Testar sistema:**
   ```
   execute test-api.bat
   ```

### Scripts Disponíveis

- `install-dependencies.bat` - Instala dependências Node.js
- `setup-database.bat` - Configura banco de dados
- `start-dev.bat` - Inicia servidor de desenvolvimento
- `test-api.bat` - Testa endpoints da API

### Acesso
- Aplicação: http://localhost:3000
- API Health: http://localhost:3000/api/health

### Estrutura do Projeto
```
chat-inteligente/
├── app/                 # Next.js app router
├── components/          # Componentes React
├── lib/                # Bibliotecas e utilitários
├── scripts/            # Scripts SQL
├── app/api/            # Endpoints da API
│   ├── atendimentos/   # CRUD de atendimentos
│   ├── busca-semantica/ # Busca com embeddings
│   ├── ingestao/       # Ingestão de dados
│   └── ...
└── public/             # Arquivos estáticos
```

### Configuração PostgreSQL Local
Para usar PostgreSQL 18 local ao invés de Supabase:

1. No `.env.local`, altere:
```
# Comente Supabase
# NEXT_PUBLIC_SUPABASE_URL=
# NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Use PostgreSQL local
DATABASE_URL=postgresql://postgres:1@localhost:5432/mavoai
```

2. Execute os scripts SQL no pgAdmin

### Funcionalidades Implementadas
✅ Dashboard com métricas
✅ Cadastro de atendimentos
✅ Busca semântica com embeddings
✅ Listagem de atendimentos
✅ API REST completa
✅ Integração com IA (Groq/OpenAI)
✅ Sistema de categorias
✅ Logs de ingestão

### Próximos Passos
1. Configurar embeddings OpenAI para busca semântica
2. Integrar com n8n para ingestão automática
3. Implementar webhook do WillTalk
4. Adicionar autenticação
5. Deploy em produção
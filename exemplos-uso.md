# Exemplos de Uso - MAVO.AI

## 1. Configuração Rápida

### Opção A: Usando scripts .bat (Windows)
```cmd
# 1. Instalar dependências
install-dependencies.bat

# 2. Configurar PostgreSQL local
setup-postgres-local.bat

# 3. Iniciar servidor
start-dev.bat

# 4. Testar APIs
test-api.bat
```

### Opção B: Comandos manuais
```bash
# Instalar dependências
npm install

# Configurar ambiente
cp .env.local.postgres .env.local

# Iniciar servidor
npm run dev
```

## 2. Endpoints da API

### Health Check
```bash
GET http://localhost:3000/api/health
```

### Listar atendimentos
```bash
GET http://localhost:3000/api/atendimentos
```

### Criar atendimento
```bash
POST http://localhost:3000/api/atendimentos
Content-Type: application/json

{
  "cliente": "Loja Central",
  "tecnico": "João Silva",
  "texto_original": "Impressora térmica não imprime cupom fiscal. Já reiniciei o equipamento mas persiste o problema.",
  "categoria": "Hardware",
  "problema": "Impressora não imprime",
  "causa": "Driver desatualizado",
  "solucao": "Reinstalado driver Bematech v5.2"
}
```

### Busca semântica
```bash
POST http://localhost:3000/api/busca-semantica
Content-Type: application/json

{
  "query": "impressora não imprime cupom fiscal o que fazer"
}
```

### Dashboard/metricas
```bash
GET http://localhost:3000/api/metricas
```

## 3. Exemplos de Dados para Teste

### Inserir atendimentos de exemplo via SQL
```sql
INSERT INTO atendimentos (cliente, tecnico, texto_original, categoria, problema, causa, solucao) VALUES
('Supermercado ABC', 'Maria Santos', 'Sistema lento ao emitir NFC-e. Cliente reclamando de timeout.', 'Performance', 'Sistema lento NFC-e', 'Cache do banco de dados cheio', 'Executado cleanup no cache e otimizado índices'),
('Restaurante XYZ', 'Carlos Oliveira', 'Balança não comunica com o sistema. Erro "dispositivo não encontrado".', 'Hardware', 'Balança não conecta', 'Cabo USB danificado', 'Substituído cabo USB e reinstalado driver'),
('Farmácia 123', 'Ana Pereira', 'Erro ao tentar cancelar cupom fiscal: "Operação não permitida".', 'Software', 'Erro cancelamento cupom', 'Permissões do usuário insuficientes', 'Ajustado perfil do usuário no sistema fiscal');
```

### Testar busca semântica via SQL
```sql
-- Primeiro, gere um embedding de exemplo (usando Python ou API)
-- Depois busque:
SELECT * FROM buscar_atendimentos_semanticos(
  ARRAY[0.1, 0.2, 0.3, ...]::vector(1536),  -- seu embedding aqui
  3
);
```

## 4. Fluxo de Trabalho Completo

### 1. Cadastro manual de atendimento
1. Acesse http://localhost:3000
2. Clique em "Cadastrar"
3. Preencha os dados do atendimento
4. O sistema processará e gerará resumo automático (se IA configurada)

### 2. Busca por soluções
1. Vá para "Buscar Soluções"
2. Digite o problema: "impressora não imprime"
3. Sistema retornará atendimentos similares com soluções

### 3. Dashboard
1. Acesse "Dashboard"
2. Veja métricas:
   - Total de atendimentos
   - Categorias mais comuns
   - Técnicos mais ativos
   - Taxa de resolução

## 5. Integração com IA

### Configurar embeddings (OpenAI)
1. Obtenha chave API da OpenAI
2. No `.env.local`, descomente e preencha:
```
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=sk-...
AI_EMBEDDING_MODEL=text-embedding-3-small
```

### Testar geração de embedding
```bash
POST http://localhost:3000/api/busca-semantica/embed
Content-Type: application/json

{
  "text": "impressora térmica com problema"
}
```

## 6. Solução de Problemas

### Servidor não inicia
```bash
# Verificar porta
netstat -ano | findstr :3000

# Matar processo
taskkill /PID [PID] /F

# Limpar cache Next.js
rm -rf .next
npm run dev
```

### Erro de conexão PostgreSQL
```bash
# Testar conexão
psql -U postgres -d mavoai -c "SELECT NOW();"

# Verificar serviço
sudo service postgresql status  # Linux
# ou verificar serviço PostgreSQL no Windows
```

### Erro de dependências
```bash
# Limpar e reinstalar
rm -rf node_modules package-lock.json
npm install
```

## 7. Próximos Passos Avançados

### 1. Configurar n8n para ingestão automática
- Webhook: http://localhost:3000/api/ingestao/willtalk
- Processar conversas do WhatsApp automaticamente

### 2. Implementar resposta automática
- Integrar com API do WhatsApp
- Respostas baseadas em histórico similar

### 3. Treinamento de modelo específico
- Fine-tuning com dados históricos
- Classificação automática de categorias

### 4. Dashboard avançado
- Gráficos de tendências
- Alertas de problemas recorrentes
- Relatórios de eficiência
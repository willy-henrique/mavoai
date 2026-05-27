# MAVO.AI — Planejamento Técnico Completo
### Para o Dev responsável — baseado em análise real do código em `C:\willydev\chat-inteligente`

> Este documento não é um wishlist.
> É um mapa do que **já existe**, do que **está quebrado**, e do que **falta construir**.
> Leia o código antes de escrever uma linha. Você vai se surpreender com o que está pronto.

---

## 1. O QUE JÁ EXISTE (e é sólido)

Antes de qualquer coisa: **este projeto já está muito avançado**.
Não comece do zero. Não reinvente o que está pronto.

### Arquitetura real do sistema

```
WhatsApp / MTalk
      │
      ▼
POST /api/orquestrador/v1/mensagem      ← endpoint principal (PRONTO)
      │
      ├── integration-guard.ts          ← auth + rate limit (PRONTO)
      ├── session-store.ts              ← estado persistente PostgreSQL (PRONTO)
      ├── org-loader.ts                 ← config por tenant com cache 5min (PRONTO)
      │
      ▼
platform-orchestrator.ts               ← cérebro da conversa (PRONTO, ~58KB)
      │
      ├── triage-ai.ts                  ← IA Router / triagem (PRONTO)
      ├── resolution-engine.ts          ← resolução autônoma (PRONTO)
      ├── investigation-quality.ts      ← avalia qualidade das evidências (PRONTO)
      ├── image-vision.ts               ← análise de imagens Llama 4 Scout (PRONTO)
      ├── handoff-agent-summary.ts      ← handoff humano com contexto IA (PRONTO)
      │
      ▼
semantic-search.ts                     ← RAG: tenta vetorial, fallback textual (PRONTO)
      │
      ├── embeddings.ts                 ← Jina AI 1024d (PRONTO)
      └── auge-knowledge.ts             ← base de conhecimento ERP Auge (PRONTO, ~68KB)

[pós-atendimento]
ai-curator.ts                          ← curadoria: extrai PROBLEMA↔SOLUÇÃO (PRONTO)
pii-sanitizer.ts                       ← sanitiza dados sensíveis (PRONTO)
```

### APIs disponíveis (todas prontas)

| Endpoint | Função |
|----------|--------|
| `POST /api/orquestrador/v1/mensagem` | Orquestrador principal — menu, triagem, resolução, visão, handoff |
| `POST /api/ingestao/mtalk` | Adapter MTalk → formato canônico → orquestrador |
| `POST /api/ingestao/willtalk` | Ingestão WillTalk → RAG + painel |
| `POST /api/ingestao/v1/events` | Ingestion genérica v1 |
| `POST /api/v1/query` | Query RAG direto |
| `POST /api/v1/search` | Busca semântica |
| `POST /api/v1/ingest` | Ingestão v1 |
| `POST /api/v1/curator` | Curadoria manual |
| `POST /api/v1/feedback` | Feedback de resolução |
| `GET /api/v1/keys` | Gerenciamento de API keys |
| `GET /api/knowledge/stats` | Estatísticas da base |
| `POST /api/knowledge/upload` | Upload de documentos |
| `POST /api/knowledge/text` | Indexar texto direto |
| `GET /api/organizations` | Listar tenants |
| `POST /api/organizations` | Criar tenant |
| `GET /api/health` | Status do sistema |
| `GET /api/metricas` | Dashboard metrics |

### Stack confirmada (`.env.local` + `docker-compose.yml`)

```
IA Chat/Orquestrador:  Groq → meta-llama/llama-4-scout-17b-16e-instruct
IA Embeddings:         Jina AI → jina-embeddings-v5-text-small (1024 dimensões)
Banco:                 Docker PostgreSQL 16 com pgvector (porta 5434)
Cloud DB alternativo:  Supabase (já configurado como fallback)
Frontend:              Next.js 16 + React 19 + TypeScript + Tailwind v4 + shadcn/ui
Automação:             n8n
Mensageria:            WillTalk + MTalk
Visão:                 Llama 4 Scout (via Groq, mesmo endpoint)
```

---

## 2. BUGS ENCONTRADOS (corrija antes de avançar)

### BUG 1 — `ai-provider.ts` modelo default errado
**Arquivo:** `lib/ai-provider.ts` linha 6  
**Problema:** `DEFAULT_CHAT_MODEL = "grok-2-latest"` — modelo que não existe no Groq  
**Impacto:** Sem efeito porque `AI_CHAT_MODEL` no `.env.local` sobrescreve. Mas se a variável sumir, o sistema quebra silenciosamente  
**Correção:**
```typescript
// ANTES (linha 6):
const DEFAULT_CHAT_MODEL = "grok-2-latest"

// DEPOIS:
import { GROQ_LLAMA4_SCOUT_INSTRUCT } from "@/lib/llm-defaults"
const DEFAULT_CHAT_MODEL = GROQ_LLAMA4_SCOUT_INSTRUCT
```

### BUG 2 — `docker-compose.yml` roda apenas migrations 001-003
**Arquivo:** `docker-compose.yml`  
**Problema:** O container Docker inicializa automaticamente apenas as migrations 001, 002 e 003. As migrations 004 a 009 precisam ser executadas manualmente.  
**Impacto:** Sem `006_multitenancy.sql`, o sistema não tem a tabela `organizations` nem a função de busca por tenant. Sem `008_sessions.sql`, o `session-store.ts` falha silenciosamente.  
**Correção:** Ver seção "Setup" abaixo — executar migrations 004-009 manualmente.

### BUG 3 — `postgres-client-no-vector.ts` porta default errada
**Arquivo:** `lib/database/postgres-client-no-vector.ts` linha 4  
**Problema:** Default hardcoded `localhost:5433`, mas o Docker mapeia a porta `5434:5432`  
**Impacto:** Sem efeito quando `DATABASE_URL` está no `.env.local` (usa 5434). Mas em ambiente sem `.env.local`, conecta na porta errada  
**Correção:** Não urgente, mas documentar: a porta correta é `5434`.

---

## 3. O QUE AINDA NÃO EXISTE (o que precisa ser construído)

| O que falta | Prioridade | Fase |
|-------------|-----------|------|
| Banco Docker rodando + migrations 004-009 | 🔴 CRÍTICO | Fase 0 |
| Base de conhecimento populada com dados reais | 🔴 CRÍTICO | Fase 0 |
| WillTalk configurado com URL do orquestrador | 🔴 CRÍTICO | Fase 1 |
| Domínios separados por especialista (TEF, ERP, Fiscal, PDV) | 🟡 IMPORTANTE | Fase 1 |
| Claude Haiku para curadoria (mais preciso) | 🟡 IMPORTANTE | Fase 1 |
| Analytics de recorrência de problemas | 🟡 IMPORTANTE | Fase 2 |
| Copiloto do técnico humano (sugestões no painel) | 🟡 IMPORTANTE | Fase 2 |
| SLA tracking + alertas | 🟢 MÉDIO | Fase 3 |
| n8n workflows em produção | 🟢 MÉDIO | Fase 3 |
| Domain Registry (módulo plugável) | 🟢 MÉDIO | Fase 4 |
| Domínio de Vendas (pedidos conversacionais) | 🔵 FUTURO | Fase 4 |
| Multi-tenant self-service | 🔵 FUTURO | Fase 5 |

---

## 4. ESTRATÉGIA DE MODELOS DE IA

Esta é uma decisão arquitetural. Cada camada usa um modelo por um motivo técnico.

### Mapa de modelos por responsabilidade

```
┌─────────────────────────────────────────────────────────┐
│  GROQ (velocidade — 200-400ms, barato)                  │
│                                                         │
│  Triagem / Roteamento ──► Llama 4 Scout  (já em uso)   │
│  Diálogo com usuário  ──► Llama 4 Scout  (já em uso)   │
│  Análise de imagens   ──► Llama 4 Scout  (já em uso)   │
│  Upgrade de diálogo   ──► Llama 4 Maverick (a testar)  │
│  Whisper (futuro voz) ──► whisper-large-v3-turbo        │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  ANTHROPIC CLAUDE (precisão — usar quando importa)      │
│                                                         │
│  Curadoria (extração PROBLEMA↔SOLUÇÃO) ──► Haiku 4.5   │
│  Análise executiva / relatórios        ──► Sonnet 4.6   │
│  Casos extremamente complexos          ──► Sonnet 4.6   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  JINA AI (embeddings — grátis, 1024d)                   │
│                                                         │
│  Indexação de conhecimento ──► jina-embeddings-v5-text  │
│  Busca semântica RAG       ──► jina-embeddings-v5-text  │
└─────────────────────────────────────────────────────────┘
```

### Por que usar Claude para curadoria?

O `ai-curator.ts` precisa extrair JSON estruturado de conversas brutas.
Claude Haiku tem precisão muito superior ao Llama para tarefas de extração estruturada.
A curadoria não é tempo real (roda após o atendimento), então latência não importa.
Custo: < $0.01 por curadoria.

### Como adicionar Claude ao projeto

O `ai-provider.ts` já usa fetch puro com API OpenAI-compatible.
Claude usa o mesmo padrão com um header extra.

Adicionar ao `.env.local`:
```env
ANTHROPIC_API_KEY=sk-ant-...
AI_CURATOR_MODEL=claude-haiku-4-5-20251001
```

Criar em `lib/ai-provider.ts` uma função nova `gerarTextoAnthopic()` ou simplesmente adicionar suporte ao `anthropic.com` via variável de provider por função.

### Quanto vai custar? (estimativa mensal)

| Provider | Uso | Custo estimado |
|----------|-----|----------------|
| Groq | 10.000 mensagens/mês | ~$5-15 |
| Jina | 100.000 embeddings/mês | $0 (free tier) |
| Claude Haiku | 500 curadorias/mês | ~$2-5 |
| **Total** | | **~$7-20/mês** |

Ou seja: custo de infra de IA próximo de zero para começar.

---

## 5. FASES DE DESENVOLVIMENTO

### REGRA DE OURO:
> Uma fase começa APENAS quando a anterior está testada em produção.
> O sistema deve funcionar a cada fase — não "quase funcionar".
> Uma vitória pequena real vale mais que uma grande vitória teórica.

---

### FASE 0 — LIGAR O MOTOR (esta semana)

**Objetivo:** Fazer o sistema existente funcionar do início ao fim.
**Não criar nada novo. Ligar o que está pronto.**

#### 0.1 — Subir o banco Docker com pgvector

```powershell
cd C:\willydev\chat-inteligente

# Subir o PostgreSQL com pgvector (porta 5434)
docker compose up -d

# Verificar se está saudável:
docker compose ps
# Deve mostrar: mavoai-postgres  running (healthy)
```

O `docker-compose.yml` usa a imagem `pgvector/pgvector:pg16` — pgvector já está incluído.
Não precisa instalar extensão manualmente.

#### 0.2 — Executar migrations 004-009

As migrations 001-003 rodam automaticamente ao subir o container.
As demais precisam ser executadas manualmente. Use o pgAdmin ou qualquer cliente SQL.

**Ordem obrigatória:**
```
004_integration_config.sql    → tabela integration_config
005_vector1024.sql             → configura a dimensão 1024 para embeddings Jina
006_multitenancy.sql           → tabela organizations + funções de busca por tenant
007_api_keys.sql               → tabela api_keys
008_sessions.sql               → tabela conversation_sessions (CRÍTICA para o orquestrador)
009_feedback_curator.sql       → colunas de curadoria + tabela resolution_feedback
```

Como executar no pgAdmin:
1. Conectar em `localhost:5434`, user: `postgres`, senha: `1`, banco: `mavoai`
2. Abrir Query Tool
3. Abrir cada arquivo e executar (F5)
4. Em caso de erro de "já existe": normal, os scripts são idempotentes

#### 0.3 — Verificar estrutura do banco

```sql
-- Cole no Query Tool e execute:
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' ORDER BY table_name;

-- Deve listar (entre outras):
-- atendimentos, categorias, conversation_sessions, 
-- ingestao_logs, integration_config, organizations, 
-- api_keys, resolution_feedback
```

#### 0.4 — Populär a base de conhecimento

```powershell
# Importar documentação técnica do Auge (PDFs em docs/auge/):
node scripts/importar-docs-auge.mjs

# Importar chunks de treinamento:
node scripts/importar-treinamento-auge.mjs

# Se houver atendimentos antigos sem embedding, gerar:
node scripts/backfill-embeddings.mjs
```

#### 0.5 — Iniciar o servidor e testar

```powershell
npm run dev
# Servidor em http://localhost:3000
```

Verificar health:
```powershell
curl http://localhost:3000/api/health
```

Deve retornar algo como `{"status":"ok","db":"connected",...}`.

#### 0.6 — Testar o orquestrador diretamente

```powershell
# Simular uma mensagem chegando do WillTalk:
curl -X POST http://localhost:3000/api/orquestrador/v1/mensagem `
  -H "Content-Type: application/json" `
  -H "x-tenant-id: auge" `
  -H "x-source-system: teste" `
  -H "x-cerebro-token: internal_secret_token_123" `
  -d '{
    "platform": "teste",
    "organization_id": "auge",
    "event_id": "evt-001",
    "conversation_id": "conv-001",
    "cliente": { "nome": "João Teste", "telefone": "11999999999" },
    "mensagem": "não consigo emitir nota fiscal, aparece erro de certificado",
    "business_hours_open": true,
    "conversation": {
      "triage_completed": false,
      "menu_attempts": 0,
      "queue_id": null
    },
    "queues": [
      { "id": "fiscal", "name": "Suporte Fiscal", "menu_option": 1 },
      { "id": "tef", "name": "Suporte TEF", "menu_option": 2 },
      { "id": "geral", "name": "Suporte Geral", "menu_option": 3 }
    ]
  }'
```

Se retornar `reply_text` com uma resposta da IA: **Fase 0 completa**.

**Entregável:** Sistema respondendo perguntas técnicas com IA.

---

### FASE 1 — SUPORTE INTERNO REAL (semanas 2-4)

**Objetivo:** Equipe de suporte usando o Mavo.AI no dia a dia.
A empresa vira o primeiro cliente.

#### 1.1 — Configurar WillTalk para chamar o orquestrador

No WillTalk, configurar:
```
CEREBRO_ORCHESTRATOR_URL = http://SEU-SERVIDOR:3000/api/orquestrador/v1/mensagem
CEREBRO_INTERNAL_TOKEN   = internal_secret_token_123
```

A partir daí, cada mensagem do WhatsApp passa pelo orquestrador automaticamente.

#### 1.2 — Criar organização AUGE no banco

```sql
-- Já feito pelo 006_multitenancy.sql, mas verificar:
SELECT * FROM organizations WHERE id = 'auge';

-- Se não existir:
INSERT INTO organizations (id, display_name, product_name, description)
VALUES ('auge', 'AUGE ERP', 'AUGE ERP', 'Suporte técnico ERP Auge');
```

#### 1.3 — Separar especialistas por domínio

Hoje tudo está em `lib/auge-knowledge.ts` (um arquivo de 68KB).
Isso funciona, mas é difícil de manter e evoluir.

Criar a estrutura:
```
lib/domains/support/
├── agent-tef.ts         ← prompts + playbooks específicos de TEF
├── agent-fiscal.ts      ← NF-e, NFC-e, SEFAZ, SPED
├── agent-erp.ts         ← módulos do Auge ERP
├── agent-pdv.ts         ← PDV, SuperPDV, caixa
├── agent-infra.ts       ← infraestrutura, rede, servidor
└── index.ts             ← exporta todos + mapeia por domínio
```

Cada agente tem:
- **system prompt especializado** (extraído do auge-knowledge.ts atual)
- **capability keywords** (palavras que ativam este agente)

O `triage-ai.ts` já detecta o domínio. O que falta é ele chamar o agente correto.

#### 1.4 — Adicionar Claude Haiku para curadoria

Modificar `lib/ai-curator.ts` para usar Claude Haiku:

```typescript
// Adicionar no .env.local:
// ANTHROPIC_API_KEY=sk-ant-...
// AI_CURATOR_MODEL=claude-haiku-4-5-20251001

// No ai-curator.ts, criar função específica:
async function curarComClaude(transcricao: string): Promise<CurationResult> {
  // Usar endpoint Anthropic diretamente
  // API: https://api.anthropic.com/v1/messages
}
```

A extração de `{ problema, causa, solucao, tags, dominio }` é muito mais precisa com Claude.

#### 1.5 — Dashboard operacional

O `app/page.tsx` e `components/dashboard.tsx` já existem.
Adicionar métricas que o gestor realmente precisa ver:

- Atendimentos por dia (últimos 30 dias)
- **Taxa de resolução autônoma** vs. escalado para humano
- Top 5 problemas mais frequentes
- Tempo médio de resolução
- Alertas de recorrência (cliente X chamou 5x no mês)

**Entregável:** Técnicos de suporte usando Mavo.AI. Gestor vendo métricas.

---

### FASE 2 — SISTEMA APRENDE (mês 2)

**Objetivo:** Cada atendimento encerrado alimenta o sistema. A IA fica mais precisa ao longo do tempo.

#### 2.1 — Ativar curadoria automática

Hoje o `ai-curator.ts` existe mas não é chamado automaticamente.
Após cada triage_completed, disparar a curadoria:

```typescript
// Em /api/orquestrador/v1/mensagem/route.ts
// Após salvar resolução:
if (out.triage_completed) {
  curarAtendimento({
    conversationId: body.conversation_id,
    tenantId: body.organization_id,
    transcricao: /* histórico da conversa */,
  }).catch(() => {}) // fire-and-forget
}
```

#### 2.2 — Detectar recorrência sistêmica

Parte já existe em `ai-curator.ts` (threshold 0.87 de similaridade semântica).
Completar com alertas automáticos:

```typescript
// Se mesmo problema ocorre 3+ vezes em 30 dias:
// → Criar registro em recurrence_alerts (criar tabela)
// → Notificar gestor via webhook
// → Marcar como "sistêmico" na base
```

#### 2.3 — Copiloto do técnico

Quando o atendimento vai para humano (triage_completed = true + handoff),
o técnico deve ver na tela:
- Resumo gerado pela IA
- **Top 3 soluções similares do RAG**
- Recorrências do mesmo cliente

A API `/api/resposta-assistida` já existe.
O painel precisa ser atualizado para mostrar isso ao técnico durante o atendimento.

#### 2.4 — Prompt versioning

```typescript
// lib/prompt-registry.ts (criar)
// Rastrear qual versão do prompt gerou qual resposta
// Permite comparar v1 vs v2 e ver qual resolveu mais
export const PromptRegistry = {
  get(key: string, version = 'latest'): string { ... },
  register(key: string, version: string, prompt: string): void { ... }
}
```

**Entregável:** Taxa de resolução autônoma crescendo. Sistema com histórico de aprendizado.

---

### FASE 3 — PRODUÇÃO ROBUSTA (mês 3)

**Objetivo:** Sistema monitorado, rastreável, pronto para outros tenants.

#### 3.1 — n8n em produção

Os workflows em `docs/n8n-workflow-*.json` estão prontos.
Subir o n8n:

```powershell
# Via npx (mais simples para começar):
npx n8n

# Ou adicionar ao docker-compose.yml:
# services:
#   n8n:
#     image: n8nio/n8n
#     ports: ["5678:5678"]
```

Importar o workflow `docs/n8n-workflow-cerebro-v5-orquestrador-willtalk.json`.
Configurar os webhooks.

#### 3.2 — SLA tracking

```typescript
// lib/sla-tracker.ts (criar)
// - Registra timestamp de cada mensagem
// - Calcula tempo até resolução
// - Identifica conversas próximas de estouro de SLA
// - Pode disparar alertas via webhook
```

#### 3.3 — Logging estruturado completo

O `lib/logger.ts` existe.
Garantir que todos os eventos importantes são logados com `trace_id`:

```
mensagem_recebida  → triagem_iniciada → agente_selecionado →
resolucao_tentada → [resolvido | escalado] → curadoria_executada
```

Isso permite debug completo de qualquer conversa.

#### 3.4 — Security hardening

Antes de qualquer cliente externo usar:

```
✅ Trocar CEREBRO_INTERNAL_TOKEN por valor forte (não o default "internal_secret_token_123")
✅ Trocar CEREBRO_INGEST_TOKEN
✅ Habilitar HTTPS em produção
✅ Revisar CORS nas API routes
✅ Verificar que PII sanitizer roda antes de qualquer dado ir ao RAG
✅ Validar que logs não expõem dados sensíveis
```

**Entregável:** Sistema em produção estável. Múltiplos tenants podem ser adicionados.

---

### FASE 4 — PLATAFORMA MULTI-DOMÍNIO (mês 4-5)

**Objetivo:** Adicionar domínios além de suporte — o salto de ferramenta para plataforma.

#### 4.1 — Domain Registry

```typescript
// lib/domain-registry.ts (criar)

export interface AgentDefinition {
  id: string
  name: string
  systemPrompt: string
  capabilities: string[]      // palavras que ativam este agente
  integrations?: string[]     // APIs que este agente pode chamar
}

export interface Domain {
  id: string
  name: string
  agents: AgentDefinition[]
}

// Uso:
DomainRegistry.register('support', supportDomain)
DomainRegistry.register('sales', salesDomain)

// O IA Router consulta o registry para encontrar o agente certo
```

#### 4.2 — Domínio de Vendas

O maior salto de valor: pedidos conversacionais no WhatsApp.

```typescript
// lib/domains/sales/
// ├── agent-interpreter.ts   → entende "2 coca e arroz"
// ├── agent-catalog.ts       → consulta API do ERP (preço, estoque)
// ├── agent-builder.ts       → monta o pedido estruturado
// ├── agent-checkout.ts      → confirma, entrega, pagamento
// └── domain-sales.ts        → registra no DomainRegistry
```

Fluxo:
```
"quero 2 coca, arroz e um pão"
  → Interpreter: { intencao: "compra", itens: ["coca x2", "arroz", "pao"] }
  → Catalog API: busca cada item no ERP
  → Builder: monta pedido com preços
  → Checkout: confirma, pergunta entrega/retirada, pagamento
  → Finalizer: integra com ERP
```

#### 4.3 — Tenant onboarding

```typescript
// lib/tenant-setup.ts (criar)
// Quando novo cliente é cadastrado:
// 1. INSERT em organizations
// 2. Gerar API keys
// 3. Configurar domínios disponíveis no plano
// 4. Inicializar knowledge base vazia
// 5. Configurar webhooks de resposta
```

**Entregável:** Plataforma aceita N clientes. Cada um com domínios independentes.

---

### FASE 5 — PRODUTO COMERCIAL (mês 6+)

**Objetivo:** Mavo.AI como produto de mercado para o varejo brasileiro.

#### 5.1 — White-label
- Nome, logo e cores configuráveis por tenant
- Subdomínio próprio

#### 5.2 — Onboarding self-service
- Wizard de configuração
- Import de documentos (PDFs, histórico de tickets)
- Preview da IA antes de publicar

#### 5.3 — Billing e limites
- Planos por volume de mensagens
- Limites de uso por tier
- Integração com gateway de pagamento

#### 5.4 — API pública
- OpenAPI 3.0 documentada
- SDK npm para integradores
- Webhooks de eventos

#### 5.5 — Dashboard executivo
- ROI: horas economizadas, resoluções automáticas
- Comparativo mensal
- Export PDF

---

## 6. SETUP COMPLETO DO AMBIENTE

```powershell
# === 1. Instalar dependências ===
cd C:\willydev\chat-inteligente
npm install

# === 2. Subir banco com pgvector ===
docker compose up -d

# Aguardar ficar healthy (30-60 segundos):
docker compose ps

# === 3. Executar migrations 004-009 ===
# Via pgAdmin: conectar localhost:5434, banco mavoai
# Executar na ordem: 004, 005, 006, 007, 008, 009

# === 4. Popular base de conhecimento ===
node scripts/importar-docs-auge.mjs
node scripts/importar-treinamento-auge.mjs

# === 5. Backfill de embeddings (se houver dados antigos) ===
node scripts/backfill-embeddings.mjs

# === 6. Iniciar servidor ===
npm run dev

# === 7. Verificar ===
curl http://localhost:3000/api/health
```

---

## 7. BANCO DE DADOS — MAPA COMPLETO

### O que existe após todas as migrations:

```sql
-- Tabelas principais
organizations            -- Tenants/empresas (006)
atendimentos             -- Histórico + embeddings + curadoria (001 + 006 + 009)
categorias               -- Categorias de problemas (001)
conversation_sessions    -- Estado das conversas ativas (008)
api_keys                 -- Autenticação por tenant (007)
ingestao_logs            -- Logs de ingestão (001)
integration_config       -- Config de integrações (004)
resolution_feedback      -- Feedback de resolução (009)

-- Funções SQL (criadas pelo 006)
buscar_atendimentos_semanticos(embedding, limit, tenant_id)  -- RAG vetorial
buscar_atendimentos_simples(texto, limit, tenant_id)          -- fallback textual
```

### Índices críticos (criados automaticamente pelas migrations):

```sql
-- Busca vetorial: ivfflat para cosine similarity
-- Atendimentos por tenant: btree em (tenant_id)
-- Sessões ativas: btree em (expires_at)
-- Full-text: GIN em (to_tsvector('portuguese', texto_original))
```

---

## 8. VARIÁVEIS DE AMBIENTE — REFERÊNCIA COMPLETA

```env
# ============= IA (Groq) =============
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
AI_CHAT_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Upgrade para diálogo mais inteligente (testar):
# AI_CHAT_MODEL=meta-llama/llama-4-maverick-17b-128e-instruct

# ============= IA (Claude — adicionar) =============
# ANTHROPIC_API_KEY=sk-ant-...
# AI_CURATOR_MODEL=claude-haiku-4-5-20251001
# AI_COMPLEX_MODEL=claude-sonnet-4-6

# ============= EMBEDDINGS (Jina) =============
EMBEDDING_BASE_URL=https://api.jina.ai/v1
EMBEDDING_API_KEY=jina_...
AI_EMBEDDING_MODEL=jina-embeddings-v5-text-small
AI_EMBEDDING_DIMENSIONS=1024
AI_EMBEDDING_TASK=retrieval.passage

# ============= BANCO =============
DATABASE_URL=postgresql://postgres:1@localhost:5434/mavoai
# (porta 5434 = Docker mapeado de 5432 interno)

# ============= WILLTALK =============
WILLTALK_AUTO_REPLY_ENABLED=true
WILLTALK_REPLY_WEBHOOK_URL=http://localhost:4002/api/webhooks/cerebro/reply
CEREBRO_INGEST_TOKEN=TROCAR_PARA_PRODUCAO

# ============= SEGURANÇA =============
CEREBRO_INTERNAL_TOKEN=TROCAR_PARA_PRODUCAO
API_RATE_LIMIT_PER_MINUTE=60
INTEGRATION_AUTH_REQUIRED=true
```

---

## 9. PRINCÍPIOS ARQUITETURAIS (não negocie estes)

### 9.1 — Contexto pertence à sessão, não ao agente
Já implementado em `lib/session-store.ts`.
Agente é stateless. Estado vive no banco. Não mova estado para dentro do agente.

### 9.2 — Dados sensíveis nunca entram no RAG
O `lib/pii-sanitizer.ts` existe. Usar **sempre** antes de indexar qualquer coisa.
```typescript
// SEMPRE:
const sanitized = sanitizePII(transcricao)
await indexarConhecimento(sanitized)

// NUNCA:
await indexarConhecimento(transcricaoOriginal)
```

### 9.3 — Fallback sempre existe
```
Groq falha → retorna mensagem padrão + escala para humano
Embedding falha → busca textual (já implementado em semantic-search.ts)
IA não resolve → handoff com contexto (já implementado)
Banco offline → resposta de erro clara, não silêncio
```

### 9.4 — Multi-tenant: isolamento total
Toda query no banco **deve** incluir `tenant_id`.
O orquestrador já passa `organization_id` em todas as chamadas.

### 9.5 — Prompts são código
Não espalhe prompts como strings soltas no código.
Centralize, nomeie, versionie. Permite A/B testing e rollback.

---

## 10. PARA O DEV — LEITURA OBRIGATÓRIA DO CÓDIGO

Antes de escrever qualquer coisa, leia estes arquivos na ordem:

```
1. lib/platform-orchestrator.ts   → entenda o fluxo completo de uma conversa
2. lib/triage-ai.ts               → entenda como a triagem funciona
3. lib/resolution-engine.ts       → entenda as tentativas de resolução
4. app/api/orquestrador/v1/mensagem/route.ts → entenda o contrato da API
5. lib/session-store.ts           → entenda a persistência de estado
6. lib/ai-curator.ts              → entenda como o conhecimento é gerado
7. lib/semantic-search.ts         → entenda o RAG (vetorial + fallback textual)
```

Estes 7 arquivos são o coração do sistema.
Tudo mais é infraestrutura ao redor deles.

---

## 11. PRIMEIROS 9 PASSOS (execute agora)

> Esta semana. Nesta ordem. Não pule nenhum.

```
1. docker compose up -d
2. Confirmar: docker compose ps → mavoai-postgres healthy
3. pgAdmin → banco mavoai → executar migrations 004, 005, 006, 007, 008, 009
4. node scripts/importar-treinamento-auge.mjs
5. node scripts/importar-docs-auge.mjs
6. npm run dev
7. curl http://localhost:3000/api/health → deve retornar ok
8. Testar orquestrador com curl (exemplo na seção Fase 0.6)
9. Corrigir BUG 1 (DEFAULT_CHAT_MODEL no ai-provider.ts)
```

Quando os 9 estiverem funcionando: **o motor está ligado**.

---

## 12. VISÃO FINAL

O que você está construindo não é um chatbot.

É uma camada cognitiva especializada no ecossistema do varejo brasileiro.

O diferencial não vai ser "usar IA" — todo mundo vai usar.

O diferencial vai ser:
- **TEF** entendido de verdade
- **NFCe, SPED, CFOP** compreendidos
- **Operação de loja** no DNA do sistema
- **Linguagem do varejo** como primeira língua

Isso não se compra. Isso se constrói ao longo do tempo com dados reais.
E vocês já têm os dados. Já têm os especialistas. Já têm a operação.

Começa pequeno. Começa correto.
Uma vitória real por semana.

---

*Mavo.AI — Plataforma Cognitiva Operacional*
*Documento gerado após análise técnica completa do código em `C:\willydev\chat-inteligente`*
*Versão 2.0 — Maio 2026*

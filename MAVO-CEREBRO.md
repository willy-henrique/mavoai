# MAVO.AI — Cérebro Operacional
## Documentação Técnica Completa do Sistema

> **Para o desenvolvedor:** Este documento descreve tudo que foi implementado, como funciona, como integrar e como evoluir. Leia antes de mexer em qualquer coisa.

---

## INICIAR O SISTEMA

```bat
# Um único comando para subir tudo:
INICIAR-AGORA.bat
```

O que ele faz automaticamente:
1. Verifica Node.js e Docker
2. Sobe PostgreSQL com pgvector (porta 5434)
3. Executa todas as migrations (`scripts/000_SETUP_COMPLETO.sql`)
4. Popula a base de conhecimento do AUGE ERP
5. Inicia o servidor Next.js em `http://localhost:3000`

---

## ARQUITETURA DO SISTEMA

```
┌─────────────────────────────────────────────────────────────────┐
│                     MAVO.AI CÉREBRO                             │
│                                                                 │
│  WhatsApp / WillTalk / MTalk                                    │
│         │                                                       │
│         ▼                                                       │
│  POST /api/orquestrador/v1/mensagem   ← ENTRADA PRINCIPAL       │
│         │                                                       │
│  ┌──────▼──────────────────────────────┐                        │
│  │     platform-orchestrator.ts        │                        │
│  │  State Machine Conversacional       │                        │
│  │                                     │                        │
│  │  1. Valida auth + rate limit        │                        │
│  │  2. Carrega sessão do PostgreSQL    │                        │
│  │  3. Carrega config da organização   │                        │
│  │  4. Executa fase:                   │                        │
│  │     ├─ Seleção de empresa           │                        │
│  │     ├─ Menu / Triagem (IA Router)   │                        │
│  │     ├─ Investigação + evidências    │                        │
│  │     ├─ Resolução autônoma (RAG)     │                        │
│  │     └─ Handoff humano + contexto   │                        │
│  │  5. Salva sessão atualizada         │                        │
│  │  6. Dispara handoff webhook         │                        │
│  └──────┬──────────────────────────────┘                        │
│         │                                                       │
│         ▼                                                       │
│  { reply_text, triage_completed, queue_id, ... }                │
│         │                                                       │
│         └──► WillTalk aplica estado e envia ao cliente          │
│                                                                 │
│  [Pós-atendimento — fire-and-forget]                           │
│  POST /api/v1/curator → ai-curator.ts                          │
│    → extrai PROBLEMA↔SOLUÇÃO → embedding → RAG                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## STACK TECNOLÓGICA

| Camada | Tecnologia | Custo |
|--------|-----------|-------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind v4, shadcn/ui | $0 |
| Backend | Next.js API Routes (server-side) | $0 |
| Banco | PostgreSQL 16 + pgvector (Docker) | $0 |
| IA Chat | Groq — Llama 4 Scout (triagem/diálogo) | $0 |
| IA Curadoria | Groq — Llama 4 Maverick (análise estruturada) | $0 |
| Embeddings | Jina AI — jina-embeddings-v5-text-small (1024d) | $0 |
| Automação | n8n (local ou cloud) | $0 local |
| Mensageria | WillTalk + MTalk | — |

**Custo de API: $0/mês para uso interno**

---

## MODELOS DE IA

### Groq (Free Tier: 14.400 req/dia, 30 req/min)

| Função | Modelo | Env Var |
|--------|--------|---------|
| Triagem / Diálogo / Visão | `meta-llama/llama-4-scout-17b-16e-instruct` | `AI_CHAT_MODEL` |
| Curadoria / JSON estruturado | `meta-llama/llama-4-maverick-17b-128e-instruct` | `AI_CURATOR_MODEL` |

### Jina AI (Free Tier: 1M tokens/mês)

| Função | Modelo | Dimensões |
|--------|--------|-----------|
| Embeddings RAG | `jina-embeddings-v5-text-small` | 1024 |

### Fallback Gratuito (Google Gemini — descomentar no .env.local)
```env
AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
AI_API_KEY=AIzaSy...
AI_CHAT_MODEL=gemini-2.0-flash-lite
```
Obter chave grátis em: https://aistudio.google.com/apikey (1.500 req/dia)

---

## ENDPOINTS DA API

### Endpoint principal: Orquestrador

```
POST /api/orquestrador/v1/mensagem
```

**Headers:**
```
Content-Type: application/json
X-Tenant-Id: auge
X-Source-System: willtalk
Authorization: Bearer <CEREBRO_INGEST_TOKEN>
```

**Body:**
```json
{
  "platform": "willtalk",
  "organization_id": "auge",
  "event_id": "evt-uuid-único",
  "conversation_id": "conv-uuid-da-conversa",
  "cliente": {
    "nome": "João Silva",
    "telefone": "11999999999"
  },
  "mensagem": "estou com problema no TEF, não está comunicando",
  "media_url": null,
  "business_hours_open": true,
  "conversation": {
    "triage_completed": false,
    "menu_attempts": 0,
    "queue_id": null
  },
  "queues": [
    { "id": "fiscal",  "name": "Suporte Fiscal",     "menu_option": 1 },
    { "id": "tef",     "name": "Suporte TEF",         "menu_option": 2 },
    { "id": "erp",     "name": "Suporte ERP",         "menu_option": 3 },
    { "id": "hardware","name": "Suporte Hardware",    "menu_option": 4 },
    { "id": "geral",   "name": "Suporte Geral",       "menu_option": 5 }
  ]
}
```

**Resposta:**
```json
{
  "reply_text": "Entendi, problema no TEF. Para te ajudar melhor, qual o erro exato que aparece na tela?",
  "triage_completed": false,
  "queue_id": "tef",
  "menu_attempts": 1,
  "reason": "investigating",
  "investigation_adequate_rounds": 0,
  "resolution_active": false,
  "resolution_attempts": 0,
  "agent_handoff_summary": null
}
```

---

### Endpoints de ingestão

| Endpoint | Adapter | Uso |
|----------|---------|-----|
| `POST /api/ingestao/willtalk` | WillTalk nativo | Recebe ticket finalizado, salva no RAG |
| `POST /api/ingestao/mtalk` | MTalk/WhatsApp | Adapter automático → formato canônico |
| `POST /api/ingestao/v1/events` | Genérico | Qualquer sistema via formato canônico |
| `POST /api/ingestao/mavo-gestao` | Mavo Gestão | Adapter do painel de gestão |

---

### Endpoints v1 (autenticação por API Key)

Todos requerem: `Authorization: Bearer mk_live_<token>`

| Endpoint | Método | Scope | Função |
|----------|--------|-------|--------|
| `/api/v1/query` | POST | `query` | Copiloto: RAG + resposta assistida |
| `/api/v1/search` | POST | `search` | Busca semântica vetorial |
| `/api/v1/ingest` | POST | `ingest` | Indexar conhecimento externo |
| `/api/v1/curator` | POST | `curate` | Curadoria de conversa encerrada |
| `/api/v1/feedback` | POST | `query` | Registrar feedback de resolução |
| `/api/v1/keys` | GET/POST/DELETE | admin | Gerenciar API Keys |

---

### Endpoints de suporte

| Endpoint | Método | Função |
|----------|--------|--------|
| `/api/health` | GET | Status de todos os componentes |
| `/api/config` | GET | Configuração atual do sistema |
| `/api/metricas` | GET | Métricas do dashboard |
| `/api/organizations` | GET/POST | CRUD de tenants |
| `/api/knowledge/text` | POST | Indexar texto direto |
| `/api/knowledge/upload` | POST | Upload de PDF/documento |
| `/api/knowledge/stats` | GET | Estatísticas da base de conhecimento |
| `/api/integrations` | GET/POST | Gerenciar integrações |
| `/api/integrations/status` | GET | Status de todas as integrações |
| `/api/resposta-assistida` | POST | Copiloto para atendentes (legado) |
| `/api/busca-semantica` | POST | Busca semântica (legado) |
| `/api/triagem` | POST | Triagem isolada (legado) |
| `/api/cerebro/grafo` | GET | Visualização do grafo de conhecimento |

---

## BANCO DE DADOS

### Schema completo (após `000_SETUP_COMPLETO.sql`)

```
public.
├── atendimentos          ← registro principal de atendimentos + embeddings
├── categorias            ← categorias pré-cadastradas
├── ingestao_logs         ← log de ingestão de dados externos
├── organizations         ← tenants (multi-empresa)
├── integrations          ← integrações com sistemas externos
├── integration_runs      ← histórico de execuções de integração
├── source_records        ← deduplicação por source_entity_id
├── dedup_keys            ← deduplicação por chave customizada
├── audit_events          ← auditoria de eventos do sistema
├── api_keys              ← chaves de API para acesso externo
├── conversation_sessions ← estado persistente de conversas ativas
└── resolution_feedback   ← feedback sobre eficácia das resoluções
```

### Funções SQL

```sql
-- Busca vetorial (usa pgvector)
SELECT * FROM buscar_atendimentos_semanticos(
  embedding::vector(1024),  -- embedding da query
  5,                         -- limit
  'auge'                     -- tenant_id (NULL = global)
);

-- Busca textual fallback (sem pgvector)
SELECT * FROM buscar_atendimentos_simples(
  'problema TEF comunicação',
  5,
  'auge'
);
```

### Índices criados

```sql
atendimentos_embedding_hnsw_idx  ← HNSW cosine similarity (busca vetorial)
atendimentos_tenant_idx          ← filtro por tenant
atendimentos_fts_idx             ← full-text search português
sessions_expires_idx             ← limpeza de sessões expiradas
api_keys_hash_idx               ← lookup rápido de API keys
```

---

## ARQUIVOS-CHAVE DO SISTEMA

### Core da plataforma

```
lib/
├── platform-orchestrator.ts  ← Cérebro: state machine conversacional
├── triage-ai.ts              ← IA Router: classifica e direciona
├── resolution-engine.ts      ← Resolução autônoma em até 2 tentativas
├── session-store.ts          ← Persistência de estado em PostgreSQL
├── ai-curator.ts             ← Curadoria: PROBLEMA↔SOLUÇÃO automático
├── semantic-search.ts        ← RAG: vetorial + fallback textual
├── assisted-response.ts      ← Copiloto do técnico: RAG + LLM
├── handoff-agent-summary.ts  ← Resumo IA para técnico humano
├── handoff-notifier.ts       ← Disparo de webhook de handoff
├── investigation-quality.ts  ← Avalia qualidade das evidências
├── image-vision.ts           ← Análise de imagens (Llama 4 Scout)
├── pii-sanitizer.ts          ← Remove dados sensíveis antes do RAG
├── ai-provider.ts            ← Provider único: Groq (chat + curadoria)
├── embeddings.ts             ← Jina AI embeddings 1024d
├── api-key-auth.ts           ← Auth por API Key para endpoints v1
├── integration-guard.ts      ← Auth interna + rate limiting
├── integration-registry.ts   ← Registro e auditoria de integrações
├── integration-adapters.ts   ← Adapters: WillTalk, MTalk, etc.
├── org-loader.ts             ← Config de tenants com cache 5min
├── auge-knowledge.ts         ← Base de conhecimento ERP Auge (~68KB)
└── llm-defaults.ts           ← IDs oficiais dos modelos Groq
```

### APIs

```
app/api/
├── orquestrador/v1/mensagem/  ← Endpoint principal do cérebro
├── ingestao/
│   ├── willtalk/              ← Adapter WillTalk
│   ├── mtalk/                 ← Adapter MTalk
│   ├── mavo-gestao/           ← Adapter Mavo Gestão
│   └── v1/events/             ← Ingestão genérica
├── v1/
│   ├── query/                 ← Copiloto RAG
│   ├── search/                ← Busca semântica
│   ├── ingest/                ← Indexação externa
│   ├── curator/               ← Curadoria pós-atendimento
│   ├── feedback/              ← Feedback de resolução
│   └── keys/                  ← CRUD de API Keys
├── knowledge/
│   ├── text/                  ← Indexar texto
│   ├── upload/                ← Upload PDF
│   └── stats/                 ← Estatísticas RAG
├── organizations/             ← CRUD de tenants
├── integrations/              ← Gerenciar integrações
├── health/                    ← Status de todos componentes
├── config/                    ← Config atual do sistema
├── metricas/                  ← Dashboard metrics
├── resposta-assistida/        ← Copiloto legado
└── busca-semantica/           ← Busca semântica legado
```

---

## VARIÁVEIS DE AMBIENTE

### Obrigatórias

```env
# Banco de dados (Docker na porta 5434)
DATABASE_URL=postgresql://postgres:1@localhost:5434/mavoai

# IA Chat (Groq — grátis)
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...        # https://console.groq.com/keys
AI_CHAT_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
AI_CURATOR_MODEL=meta-llama/llama-4-maverick-17b-128e-instruct

# Embeddings (Jina AI — grátis)
EMBEDDING_BASE_URL=https://api.jina.ai/v1
EMBEDDING_API_KEY=jina_...  # https://jina.ai/embeddings
AI_EMBEDDING_MODEL=jina-embeddings-v5-text-small
AI_EMBEDDING_DIMENSIONS=1024
AI_EMBEDDING_TASK=retrieval.passage

# Segurança (TROCAR em produção!)
CEREBRO_INGEST_TOKEN=troque-por-token-forte
CEREBRO_INTERNAL_TOKEN=troque-por-token-forte
INTEGRATION_AUTH_REQUIRED=true
```

### WillTalk (para integração)

```env
WILLTALK_AUTO_REPLY_ENABLED=true
WILLTALK_REPLY_WEBHOOK_URL=http://SEU-SERVIDOR:4002/api/webhooks/cerebro/reply
NEXT_PUBLIC_BASE_URL=http://SEU-SERVIDOR:3000
```

### Opcionais

```env
# Google Gemini (alternativa gratuita ao Groq)
# AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
# AI_API_KEY=AIzaSy...   # https://aistudio.google.com/apikey
# AI_CHAT_MODEL=gemini-2.0-flash-lite

# Rate limiting distribuído (Upstash Redis — opcional)
# UPSTASH_REDIS_REST_URL=...
# UPSTASH_REDIS_REST_TOKEN=...

# Supabase (alternativa ao Docker para o banco)
# NEXT_PUBLIC_SUPABASE_URL=...
# NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# SUPABASE_SERVICE_ROLE_KEY=...
```

---

## INTEGRAÇÃO COM WILLTALK

### Configuração no WillTalk

No painel do WillTalk, configurar o Cérebro como orquestrador:

```
CEREBRO_ORCHESTRATOR_URL = http://SEU-IP:3000/api/orquestrador/v1/mensagem
CEREBRO_INGEST_TOKEN     = [mesmo valor do CEREBRO_INGEST_TOKEN no .env.local]
```

### Fluxo de mensagens

```
1. Cliente envia mensagem no WhatsApp
2. WillTalk recebe via Z-API/Evolution API
3. WillTalk faz POST /api/orquestrador/v1/mensagem com:
   - conversation_id, cliente, mensagem, conversation state, queues
4. Cérebro processa (triagem → investigação → resolução → handoff)
5. Cérebro retorna reply_text + novo estado
6. WillTalk envia reply_text ao cliente no WhatsApp
7. WillTalk salva novo estado para próxima mensagem
8. Se triage_completed: WillTalk dispara POST /api/ingestao/willtalk
   para registrar o atendimento no RAG
```

### Verificar integração

```bash
# Testar endpoint do orquestrador diretamente:
curl -X POST http://localhost:3000/api/orquestrador/v1/mensagem \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: auge" \
  -H "X-Source-System: teste" \
  -H "Authorization: Bearer SEU_CEREBRO_INGEST_TOKEN" \
  -d '{
    "platform": "teste",
    "organization_id": "auge",
    "event_id": "teste-001",
    "conversation_id": "conv-teste-001",
    "cliente": { "nome": "Teste", "telefone": "11999999999" },
    "mensagem": "meu sistema não emite nota fiscal",
    "business_hours_open": true,
    "conversation": { "triage_completed": false, "menu_attempts": 0, "queue_id": null },
    "queues": [
      { "id": "fiscal", "name": "Suporte Fiscal", "menu_option": 1 },
      { "id": "tef",    "name": "Suporte TEF",    "menu_option": 2 },
      { "id": "geral",  "name": "Suporte Geral",  "menu_option": 3 }
    ]
  }'
```

---

## API KEYS — COMO CRIAR

API Keys são necessárias para endpoints `/api/v1/*`.

### Criar uma key via curl:

```bash
curl -X POST http://localhost:3000/api/v1/keys \
  -H "Authorization: Bearer SEU_CEREBRO_INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "auge",
    "name": "Integração n8n",
    "scopes": ["query", "search", "ingest", "curate"]
  }'
```

**Resposta (guardar o token — aparece só uma vez):**
```json
{
  "id": "uuid...",
  "token": "mk_live_abc123...",
  "key_prefix": "mk_live_abc1",
  "tenant_id": "auge",
  "scopes": ["query", "search", "ingest", "curate"]
}
```

### Usar a key:

```bash
# Busca semântica:
curl -X POST http://localhost:3000/api/v1/search \
  -H "Authorization: Bearer mk_live_abc123..." \
  -d '{ "text": "problema TEF comunicação" }'

# Curadoria de conversa:
curl -X POST http://localhost:3000/api/v1/curator \
  -H "Authorization: Bearer mk_live_abc123..." \
  -d '{
    "conversation_id": "conv-123",
    "raw_text": "cliente: TEF não funciona\ntecnico: reiniciei o serviço GP\nciente: resolveu"
  }'
```

---

## COMO O ORQUESTRADOR FUNCIONA (fluxo interno)

### State Machine de uma conversa:

```
FASE 1: company_selection (se multi-empresa)
  → Pergunta qual empresa
  → Salva selected_tenant_id na sessão

FASE 2: menu (triagem)
  → IA Router analisa a mensagem
  → Detecta intenção e domínio (fiscal, tef, erp, etc.)
  → Pergunta para confirmar ou apresenta opções
  → Salva queue_id na sessão
  → Max 3 tentativas inválidas → handoff

FASE 3: investigating (coleta de evidências)
  → IA faz perguntas específicas para coletar informações
  → investigation-quality.ts avalia se tem evidências suficientes
  → Precisa de 1 rodada adequada antes de tentar resolver
  → Max 14 mensagens sem evidência → handoff

FASE 4: resolving (resolução autônoma)
  → RAG busca casos similares (vetorial ou textual)
  → IA propõe solução baseada no histórico
  → Max 2 tentativas
  → Se resolveu: triage_completed = true (encerrado)
  → Se não resolveu: handoff

FASE 5: handoff
  → handoff-agent-summary.ts gera resumo estruturado
  → Resumo enviado ao webhook da integração
  → triage_completed = true
  → Sessão apagada do banco

[Pós-atendimento — disparado pelo WillTalk]
  → POST /api/ingestao/willtalk com transcrição
  → ai-curator.ts extrai PROBLEMA↔SOLUÇÃO
  → Gera embedding (Jina)
  → Insere na base atendimentos
  → Detecta recorrência
```

---

## SISTEMA DE CURADORIA (aprendizado contínuo)

O par **PROBLEMA↔SOLUÇÃO** é o núcleo do aprendizado.

### Fluxo de curadoria automática:

```
Atendimento encerrado (humano resolveu)
  │
  ▼
POST /api/v1/curator
  { conversation_id, raw_text }
  │
  ▼
pii-sanitizer.ts
  → Remove CPF, CNPJ, telefones, etc.
  │
  ▼
ai-curator.ts + Groq Llama 4 Maverick
  → Extrai estrutura JSON:
  {
    "resumo_problema": "...",
    "causa": "...",
    "solucao": "...",
    "categoria": "fiscal",
    "tags": ["nfe", "certificado", "vencido"],
    "dominio": "fiscal"
  }
  │
  ▼
Jina AI embeddings (1024d)
  → Gera vetor do resumo_problema
  │
  ▼
Detecta recorrência
  → busca casos similares (threshold 0.87)
  → "nenhuma" | "cliente" | "sistemico"
  │
  ▼
INSERT em atendimentos
  → embedding = vetor
  → resolution_source = 'autonomous_ai' | 'human'
  │
  ▼
Próxima vez que mesmo problema ocorrer:
  → RAG encontra este caso
  → Orquestrador usa a solução como base
```

---

## PRIVACIDADE E SEGURANÇA

O `pii-sanitizer.ts` remove automaticamente:
- CPF: `###.###.###-##` → `[CPF_REMOVIDO]`
- CNPJ: `##.###.###/####-##` → `[CNPJ_REMOVIDO]`
- Telefones: `(##) #####-####` → `[TELEFONE_REMOVIDO]`
- E-mails: `user@domain.com` → `[EMAIL_REMOVIDO]`
- Senhas por heurística: `senha: 123` → `[DADO_SENSIVEL_REMOVIDO]`

**Regra:** Todo texto passa pelo sanitizador ANTES de ir para o RAG ou curadoria.

---

## MULTI-TENANCY

Cada empresa tem:
- Registro em `organizations`
- `tenant_id` isolando todos os dados
- API Keys próprias com scopes
- Base de conhecimento separada

```sql
-- Criar novo tenant:
INSERT INTO organizations (id, display_name, product_name, description)
VALUES ('supermercado_abc', 'Supermercado ABC', 'Mavo Suporte', 'Cliente varejo');

-- Criar API Key via API:
POST /api/v1/keys { "tenant_id": "supermercado_abc", "name": "WillTalk" }
```

---

## ADICIONANDO CONHECIMENTO À BASE

### Via API (recomendado para automação):

```bash
# Indexar texto livre:
curl -X POST http://localhost:3000/api/knowledge/text \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Como resolver erro de certificado digital vencido",
    "text": "Quando o certificado A1 está vencido...[texto completo]",
    "tenant_id": "auge",
    "category": "Fiscal"
  }'
```

### Via script (PDFs da documentação):

```bash
node scripts/importar-docs-auge.mjs
node scripts/importar-treinamento-auge.mjs
node scripts/import-pdf-knowledge.mjs
```

### Via n8n (automático):

O workflow `docs/n8n-workflow-cerebro-v5-orquestrador-willtalk.json` faz isso automaticamente após cada atendimento encerrado.

---

## HEALTH CHECK

```bash
curl http://localhost:3000/api/health
```

**Resposta esperada (tudo OK):**
```json
{
  "status": "healthy",
  "checks": {
    "postgres": { "ok": true, "latency_ms": 2 },
    "ai_chat": { "ok": true, "provider": "groq", "model": "meta-llama/llama-4-scout-17b-16e-instruct" },
    "embedding": { "ok": true, "provider": "custom", "model": "jina-embeddings-v5-text-small" },
    "pgvector_rpc": { "ok": true },
    "embedding_coverage": { "pct": 0.87, "alerta": false }
  }
}
```

**Se `embedding.ok = false`:** Jina key inválida ou expirada → criar nova em jina.ai

**Se `postgres.ok = false`:** Docker não está rodando → `docker compose up -d`

**Se `pgvector_rpc.ok = false`:** Migration 006 não rodou → `node scripts/migrate.mjs`

---

## BUGS CONHECIDOS (CORRIGIDOS)

| Bug | Arquivo | Status |
|-----|---------|--------|
| `DEFAULT_CHAT_MODEL = "grok-2-latest"` (modelo inexistente) | `lib/ai-provider.ts` | ✅ Corrigido |
| `AI_EMBEDDING_DIMENSIONS = 1536` incompatível com Jina 1024d | `.env.example` | ✅ Corrigido |
| Migrations 004-009 não executadas automaticamente no Docker | `docker-compose.yml` | ✅ Corrigido |
| `docker-compose.yml` porta padrão do client (5433 vs 5434) | `postgres-client-no-vector.ts` | ℹ️ Sem impacto (env sobrescreve) |

---

## EVOLUÇÃO FUTURA (próximas fases)

### Fase 2 — Base Cognitiva (mês 2)
- Curadoria automática disparada após triage_completed
- Alertas de recorrência sistêmica
- Copiloto do técnico no painel (sugestões em tempo real)
- Prompt versioning (`lib/prompt-registry.ts`)

### Fase 3 — Produção Robusta (mês 3)
- n8n em produção com workflows estáveis
- SLA tracking + alertas (`lib/sla-tracker.ts`)
- Logging estruturado com trace_id
- Security hardening (tokens fortes em produção)

### Fase 4 — Plataforma Multi-Domínio (mês 4-5)
- Domain Registry (`lib/domain-registry.ts`)
- Agentes separados por especialidade (TEF, Fiscal, ERP, PDV, Infra)
- Domínio de Vendas — pedidos conversacionais

### Fase 5 — Produto Comercial (mês 6+)
- White-label por tenant
- Onboarding self-service
- Billing e limites por plano

---

## COMANDOS ÚTEIS

```powershell
# Subir banco:
docker compose up -d

# Parar banco:
docker compose down

# Logs do banco:
docker compose logs -f postgres

# Apagar banco e recriar do zero:
docker compose down -v
docker compose up -d
node scripts/migrate.mjs

# Rodar migrations manualmente:
node scripts/migrate.mjs

# Backfill de embeddings (para dados sem vetor):
node scripts/backfill-embeddings.mjs

# Importar conhecimento do AUGE:
node scripts/importar-treinamento-auge.mjs
node scripts/importar-docs-auge.mjs

# Verificar stack completo:
node scripts/verify-stack.mjs

# Iniciar dev:
npm run dev

# Build para produção:
npm run build && npm start
```

---

*Mavo.AI Cérebro Operacional — Documentação v3.0*
*Atualizado: Maio 2026 | Stack: Next.js 16, Groq, Jina, PostgreSQL+pgvector*

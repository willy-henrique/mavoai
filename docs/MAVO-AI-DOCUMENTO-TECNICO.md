# Mavo.AI — Documento Técnico do Projeto
**Versão:** 1.0 | **Data:** 28/05/2026 | **Status:** Em produção (ambiente local) / Pronto para deploy

---

## 1. O QUE É O MAVO.AI

Mavo.AI é uma **plataforma cognitiva de atendimento automatizado** desenvolvida para suporte técnico B2B de sistemas ERP. O sistema recebe mensagens de clientes via WhatsApp (ou qualquer canal), classifica o problema automaticamente, busca nos históricos de atendimento anteriores e responde com o procedimento de resolução em linguagem natural — tudo em menos de 4 segundos, sem intervenção humana.

### Proposta de Valor
- **Resolve problemas técnicos na primeira mensagem** — sem menu, sem espera, sem transferência
- **Aprende com o histórico real** de atendimentos — quanto mais usa, mais preciso fica
- **Multi-agente especializado** — cada domínio técnico tem seu próprio especialista de IA
- **Multi-tenant** — um único sistema atende múltiplas empresas (organizações) de forma isolada

---

## 2. ARQUITETURA TÉCNICA

### Stack Principal

| Camada | Tecnologia | Versão |
|---|---|---|
| Framework Web | Next.js (App Router + Turbopack) | 15.x |
| Linguagem | TypeScript | 5.x |
| Banco de Dados | PostgreSQL + pgvector | 16 + pgvector 0.7 |
| IA — LLM Principal | Groq (Llama 4 Scout) | Meta Llama 4 Scout Instruct |
| IA — LLM Raciocínio | Groq (Llama 3.3 70B) | llama-3.3-70b-versatile |
| IA — LLM Curador | Groq (Llama 4 Maverick) | llama-4-maverick-17b-128e |
| IA — Embeddings | Jina AI | jina-embeddings-v5-text-small |
| Container DB | Docker | mavoai-postgres (porta 6001) |
| Servidor Dev | localhost | porta 3000 |

### Diagrama de Fluxo Principal

```
WhatsApp / WillTalk
        │
        ▼
POST /api/orquestrador/v1/mensagem
        │
        ├─── Autenticação (Bearer token)
        ├─── Identificação do tenant
        │
        ▼
[ORQUESTRADOR]
        │
        ├── Tem queue_id? ──NÃO──► Classificação automática de fila
        │                              │
        │   ◄─── SIM ◄───────────────┘
        │
        ├── Triage completa? ──NÃO──► Apresenta menu de opções
        │
        ├── Fase: INVESTIGAÇÃO
        │         │
        │         ├── Busca RAG (pgvector) nos 925 atendimentos
        │         ├── Avalia qualidade da evidência técnica
        │         └── Chama Agente Especialista → resposta
        │
        └── Fast-path: resolve na 1ª mensagem se RAG encontrar caso similar
```

---

## 3. SISTEMA MULTI-AGENTE

### Como Funciona
O orquestrador mantém o estado da conversa e decide qual agente chamar. Cada agente especialista tem:
- **System prompt** com expertise profunda no domínio
- **Modelo de LLM** configurável por agente
- **Keywords de roteamento** (44 a 87 por agente)
- Fallback automático para o modelo global se o agente falhar

### Os 6 Agentes Especialistas

| Agente | Especialidade Técnica | Modelo | Keywords |
|---|---|---|---|
| **Agente PDV** | Frente de caixa TillitPDV, SAT fiscal, sangria/suprimento, cupom NFC-e/ECF, concentrador, modo contingência | Groq Llama 4 Scout (global) | 44 |
| **Agente Fiscal** | NF-e / NFC-e / CT-e / MDF-e, rejeições SEFAZ, certificados A1/A3, CFOP/CST/CSOSN, DANFE, CC-e, SPED EFD | Groq Llama 3.3 70B | 65 |
| **Agente TEF** | SiTEF/CliSiTEF, PinPad (Ingenico/Verifone), Stone/Cielo/Getnet/Rede, voucher Alelo/Sodexo, transação pendente, estorno | Groq Llama 4 Scout (global) | 62 |
| **Agente Estoque** | Custo médio, inventário, grade (cor/tamanho), kit/combo, importação XML NF-e, lote/validade, transferência entre filiais | Groq Llama 4 Maverick | 65 |
| **Agente Hardware** | Impressoras Argox/Zebra/Daruma/Bematech/Elgin, balanças Toledo/Filizola, coletores, nobreak, touchscreen, SAT LED | Groq Llama 4 Scout (global) | 87 |
| **Agente Integração** | Mercado Livre, Shopify, Bling, n8n, OAuth 2.0, webhooks, erros 401/403/429, sincronização estoque/pedidos | Groq Llama 3.3 70B | 81 |

### Roteamento de 3 Camadas
1. **Score de keywords** — correspondência léxica rápida (< 1ms)
2. **Disambiguação por LLM** — quando score é inconclusivo
3. **Fallback** — fila default do tenant

---

## 4. BASE DE CONHECIMENTO (RAG)

### O que é RAG
RAG (Retrieval-Augmented Generation) é a técnica central do sistema. Antes de responder, a IA busca nos **históricos de atendimentos reais** os casos mais similares ao problema atual. Isso garante que as respostas sejam baseadas em soluções que já funcionaram, não apenas no conhecimento geral do modelo.

### Números da Base

| Métrica | Valor |
|---|---|
| Total de atendimentos | **925** |
| Com embedding semântico | **925 (100%)** |
| Dimensões do vetor | 1.024 |
| Índice de busca | HNSW (cosine similarity) |
| Busca textual auxiliar | GIN (full-text search em português) |
| Agentes especialistas | 6 |
| Sessões de conversa ativas | 38 |

### Distribuição por Domínio (casos de treinamento)

| Domínio | Casos |
|---|---|
| TillitIntegrador / Concentrador | 263 |
| AugeWEB (back-office) | 118 |
| TillitPDV (frente de caixa) | 110 |
| PDV especializado v2/v3 | 38 |
| Fiscal (NF-e, SEFAZ) | 33 |
| Hardware e periféricos | 53 |
| TEF / Pagamentos | 29 |
| Integrações e APIs | 22 |
| Estoque e Compras | 22 |
| Outros | ~237 |

### Cenários Cobertos pela Base de Conhecimento

**Fiscal:** Rejeições SEFAZ 539, 562, 999, 206, 165, 561 · Certificado A3 trocado · Contingência offline · Carta de Correção (CC-e) · MDF-e · CFOP/CSOSN errado · DANFE não imprime · SPED EFD

**TEF:** SiTEF não inicializa · Transação pendente (risco de dupla cobrança) · PinPad Ingenico timeout · Voucher Alelo recusado · Duplicidade de transação · Estabelecimento não habilitado · GP desatualizado

**PDV:** Falha na comunicação com concentrador · Caixa offline contingência · SAT LED vermelho · Sangria bloqueada por permissão · Produto não encontrado por EAN · Fechamento com divergência · Crediário bloqueado · Usuário bloqueado por senha

**Estoque:** Custo médio zerado após importação XML · Inventário bloqueando lançamentos · Grade cor/tamanho incorreta · Produto kit com custo errado · Transferência entre filiais · Controle de lote/validade

**Hardware:** Argox OS-214plus não imprime · Zebra GK420d · Daruma FS700 · Balança Toledo com peso incorreto · Leitor Honeywell com caractere errado · Nobreak com bateria fraca · Touchscreen descalibrado · Gaveta não abre · Coletor não sincroniza WiFi

**Integração:** Mercado Livre 403 token expirado · Shopify 401 OAuth · Bling OAuth2 · n8n webhook 404 · NF-e não emite após venda marketplace · API AUGE timeout · Importação CSV de produtos

---

## 5. APIS DISPONÍVEIS

### Endpoint Principal — Orquestrador

```
POST /api/orquestrador/v1/mensagem
Authorization: Bearer <CEREBRO_INGEST_TOKEN>
X-Tenant-Id: <tenant>
X-Source-System: <sistema_origem>
```

**Body:**
```json
{
  "platform": "willtalk",
  "organization_id": "auge",
  "conversation_id": "conv-123",
  "cliente": { "nome": "João", "telefone": "11999999999" },
  "mensagem": "Meu caixa PDV não abre, aparece erro de concentrador",
  "business_hours_open": true,
  "conversation": {
    "triage_completed": false,
    "menu_attempts": 0,
    "queue_id": null
  },
  "queues": [
    { "id": "q-pdv", "name": "Suporte PDV", "menu_option": 1, "is_active": true },
    { "id": "q-fiscal", "name": "Suporte Fiscal", "menu_option": 2, "is_active": true }
  ]
}
```

**Resposta:**
```json
{
  "reply_text": "O erro de concentrador geralmente indica...\n1. Administração → Serviços...",
  "reason": "queue_auto_classified_fast_resolution",
  "queue_id": "q-pdv",
  "conversation_id": "conv-123"
}
```

### Demais Endpoints da API

| Endpoint | Método | Função |
|---|---|---|
| `/api/health` | GET | Status do sistema |
| `/api/v1/agents` | GET/POST | CRUD de agentes |
| `/api/v1/specialist-agents` | GET/POST | CRUD de agentes especialistas |
| `/api/v1/specialist-agents/:id` | PATCH/DELETE | Atualizar agente |
| `/api/v1/ingest` | POST | Ingestão de dados de atendimento |
| `/api/v1/query` | POST | Consulta semântica direta |
| `/api/v1/search` | POST | Busca vetorial na base |
| `/api/v1/feedback` | POST | Feedback de resolução |
| `/api/v1/curator` | POST | Processamento curatorial (extração JSON) |
| `/api/busca-semantica` | POST | Busca semântica BFF |
| `/api/atendimentos` | GET | Listagem de atendimentos |
| `/api/metricas` | GET | Métricas do sistema |
| `/api/config` | GET/PATCH | Configuração do sistema |
| `/api/config/models` | GET | Modelos disponíveis |
| `/api/organizations` | GET/POST | CRUD de organizações |
| `/api/categorias` | GET/POST | CRUD de categorias |
| `/api/integrations` | GET/POST | Integrações externas |
| `/api/knowledge/upload` | POST | Upload de arquivo para base |
| `/api/knowledge/text` | POST | Inserção de texto na base |
| `/api/knowledge/stats` | GET | Estatísticas da base de conhecimento |

---

## 6. BANCO DE DADOS

### Estrutura Principal (17 tabelas)

| Tabela | Função |
|---|---|
| `atendimentos` | Base de conhecimento — histórico de chamados com embeddings vetoriais |
| `specialist_agents` | Configuração dos 6 agentes especialistas (prompt, modelo, keywords) |
| `conversation_sessions` | Estado das conversas em andamento (TTL 24h) |
| `organizations` | Empresas/tenants do sistema |
| `api_keys` | Chaves de API por tenant |
| `categorias` | Categorias de atendimento |
| `system_config` | Configurações do sistema (LLM, embeddings, etc.) |
| `agent_configs` | Configurações avançadas por agente |
| `agent_training_examples` | Exemplos de treinamento por agente |
| `resolution_feedback` | Feedback de resoluções (confirmado/não confirmado) |
| `ingestao_logs` | Log de ingestões de dados |
| `integration_runs` | Log de execuções de integrações |
| `integrations` | Configurações de integrações externas |
| `audit_events` | Auditoria de ações no sistema |
| `dedup_keys` | Controle de deduplicação de mensagens |
| `source_records` | Registros brutos de fontes externas |
| `agent_test_runs` | Histórico de testes dos agentes |

### Infraestrutura de Banco
- **Container:** `mavoai-postgres` (Docker)
- **Porta:** 6001 (mapeada internamente para 5432)
- **Extensões:** `pgvector` (busca vetorial HNSW), `uuid-ossp`
- **Índices críticos:** HNSW cosine similarity no campo `embedding`, GIN full-text search em português
- **Multi-tenant:** todos os dados isolados por `tenant_id`

---

## 7. PERFORMANCE MEDIDA

### Tempo de Resposta — Teste em Produção (6 domínios)

| Domínio | Tipo de Resolução | Tempo |
|---|---|---|
| PDV | RAG fast-path | **1.1s** |
| Fiscal | RAG fast-path | **1.6s** |
| TEF | AI fast-path | **1.5s** |
| Hardware | AI fast-path | **1.3s** |
| Estoque | RAG fast-path | **2.1s – 3.9s** |
| Integração | AI fast-path | **2.4s** |

**Taxa de resolução na primeira mensagem: 6/6 (100%)**

### Tipos de Resolução

| Tipo | Significado |
|---|---|
| `queue_auto_classified_fast_resolution` | Fila detectada por keywords + RAG encontrou caso similar → resolve direto |
| `queue_auto_classified_ai_fast_resolution` | Fila detectada por LLM + agente especialista gerou solução |
| `investigation_insufficient_evidence` | Usuário não forneceu detalhes suficientes → pede mais informação |
| `menu_presented` | Primeira mensagem genérica → apresenta menu de filas |

### Otimizações Implementadas
- **AbortController 9s** em todas as chamadas de LLM — evita travamento em providers lentos
- **Retry automático** em erro 429 (rate limit) com backoff exponencial + parse do `try again in Xs` do Groq
- **3 agentes migrados** de OpenRouter free tier (21s) para Groq (1.5s)
- **Índice HNSW** para busca vetorial sub-millisecond em 925 vetores

---

## 8. SEGURANÇA E AUTENTICAÇÃO

- **Autenticação por Bearer Token** obrigatória no endpoint do orquestrador (`INTEGRATION_AUTH_REQUIRED=true`)
- **Isolamento multi-tenant** — cada tenant acessa apenas seus próprios dados
- **API Keys por tenant** gerenciadas via `/api/v1/keys`
- **Token interno** para operações administrativas (update de agentes, configurações)
- **Sem dados sensíveis expostos** — respostas não contêm informações de outros tenants

---

## 9. CONFIGURAÇÃO DE PROVIDERS DE IA

O sistema suporta múltiplos providers de LLM e embeddings, configuráveis via painel ou banco de dados:

### LLM (Chat)
| Provider | URL Base | Status |
|---|---|---|
| **Groq** (padrão) | `https://api.groq.com/openai/v1` | ✅ Ativo |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai/` | ✅ Suportado |
| OpenRouter | `https://openrouter.ai/api/v1` | ✅ Suportado |
| OpenAI | `https://api.openai.com/v1` | ✅ Suportado |
| xAI (Grok) | Configurável via `AI_BASE_URL` | ✅ Suportado |

### Embeddings
| Provider | Status |
|---|---|
| **Jina AI** (ativo) | `jina-embeddings-v5-text-small` — 1.024 dims — 1M tokens/mês grátis |
| OpenAI | `text-embedding-3-small` |
| Qualquer OpenAI-compatible | Configurável |

---

## 10. ESTRUTURA DE ARQUIVOS DO PROJETO

```
chat-inteligente/
├── app/
│   ├── api/
│   │   ├── orquestrador/v1/mensagem/    ← Endpoint principal WhatsApp/WillTalk
│   │   ├── v1/specialist-agents/        ← CRUD dos agentes especialistas
│   │   ├── v1/ingest/                   ← Ingestão de atendimentos
│   │   ├── v1/query/                    ← Consulta à base de conhecimento
│   │   ├── v1/feedback/                 ← Feedback de resolução
│   │   ├── knowledge/                   ← Upload de arquivos/textos
│   │   └── health/                      ← Health check
│   └── (pages)/                         ← Interface web (painel admin)
│
├── lib/
│   ├── ai-provider.ts                   ← Camada unificada de LLM (Groq/Gemini/etc)
│   ├── investigation-quality.ts         ← Avaliador de qualidade das evidências
│   ├── provider-presets.ts              ← Mapeamento de providers por URL
│   ├── system-config-store.ts           ← Configuração dinâmica via DB
│   └── llm-defaults.ts                  ← Defaults de modelos
│
├── scripts/
│   ├── seed-erp-v3.mjs                  ← 57 casos avançados de ERP (executado)
│   ├── backfill-embeddings.mjs          ← Geração de embeddings em lote
│   ├── update-agent-prompts-v2.mjs      ← Atualização de prompts dos agentes
│   └── test-first-message.mjs           ← Teste de integração (6 domínios)
│
├── training/                            ← Dados de treinamento SQL
├── docs/                                ← Documentação técnica
└── packages/cerebro-client/            ← SDK cliente do sistema
```

---

## 11. PAINEL ADMINISTRATIVO

O sistema inclui uma interface web completa acessível em `http://localhost:3000` com:

- **Configurações de IA** — seleção de provider (Groq / Gemini / OpenRouter / OpenAI / xAI) e modelo via interface visual
- **Configurações de Embeddings** — seleção de provider (Jina AI / OpenAI / Gemini)
- **Gestão de Agentes** — criar, editar, testar agentes especialistas com preview de resposta
- **Base de Conhecimento** — upload de arquivos, inserção de texto, estatísticas
- **Atendimentos** — visualização e busca no histórico
- **Integrações** — configuração de integrações externas com teste de conexão
- **Métricas** — indicadores de performance do sistema

---

## 12. INTEGRAÇÕES SUPORTADAS

### Canais de Entrada (onde recebe mensagens)
- **WillTalk** (WhatsApp) — endpoint `/api/ingestao/willtalk`
- **MTalk** — endpoint `/api/ingestao/mtalk`
- **Mavo Gestão** — endpoint `/api/ingestao/mavo-gestao`
- **Qualquer sistema** via `/api/orquestrador/v1/mensagem` (REST padrão)

### Marketplaces e E-commerce (na base de conhecimento)
Mercado Livre · Shopee · Amazon · Shopify · VTEX · Nuvemshop · WooCommerce

### Hubs de Integração (na base de conhecimento)
Bling · Tiny · Anymarket · Omie · n8n · Zapier · Make

---

## 13. ESTADO ATUAL DO PROJETO

### ✅ Concluído e Funcionando

| Componente | Status |
|---|---|
| Orquestrador de mensagens | ✅ Produção |
| 6 agentes especialistas com prompts profissionais | ✅ Produção |
| Busca semântica RAG (pgvector HNSW) | ✅ Produção |
| Fast-path resolution (resposta na 1ª mensagem) | ✅ 6/6 domínios |
| 925 atendimentos com embeddings (100%) | ✅ Produção |
| Multi-provider LLM (Groq/Gemini/OpenRouter) | ✅ Produção |
| Autenticação Bearer token multi-tenant | ✅ Produção |
| Painel administrativo web | ✅ Produção |
| AbortController 9s (timeout em providers lentos) | ✅ Produção |
| Retry automático em rate limit (429) | ✅ Produção |
| Linguagem humana nas respostas dos agentes | ✅ Produção |

### 🔧 Recomendações para Próximos Passos

| Prioridade | Item | Impacto |
|---|---|---|
| 🔴 Alta | Deploy em servidor de produção (VPS/cloud) | Sistema hoje só roda local |
| 🔴 Alta | Configurar variáveis de ambiente em produção | `.env.local` não vai para servidor |
| 🟡 Média | Adicionar mais tenants/organizações | Atualmente só tenant `auge` |
| 🟡 Média | Dashboard de métricas em tempo real | Visibilidade operacional |
| 🟡 Média | Curadoria automática pós-atendimento | Aprender com cada conversa nova |
| 🟢 Baixa | Expandir base de conhecimento para outros ERPs | Hoje específico para AUGE ERP |
| 🟢 Baixa | Integração nativa com WhatsApp Business API | Hoje depende de intermediário (WillTalk) |

---

## 14. REQUISITOS DE INFRAESTRUTURA

### Produção Mínima (VPS)

| Recurso | Mínimo | Recomendado |
|---|---|---|
| CPU | 2 vCPUs | 4 vCPUs |
| RAM | 4 GB | 8 GB |
| Disco | 20 GB SSD | 50 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Node.js | 20 LTS | 20 LTS |
| Docker | 24+ | 24+ |
| PostgreSQL | 16 + pgvector | 16 + pgvector |

### Variáveis de Ambiente Necessárias

```env
# Banco de dados
DATABASE_URL=postgresql://postgres:senha@localhost:5432/mavoai

# LLM Principal (Groq — gratuito até 14.400 req/dia)
AI_API_KEY=gsk_...
AI_BASE_URL=https://api.groq.com/openai/v1
AI_CHAT_MODEL=meta-llama/llama-4-scout-17b-16e-instruct

# Embeddings (Jina AI — gratuito 1M tokens/mês)
EMBEDDING_API_KEY=jina_...
EMBEDDING_BASE_URL=https://api.jina.ai/v1
AI_EMBEDDING_MODEL=jina-embeddings-v5-text-small
AI_EMBEDDING_DIMENSIONS=1024

# Segurança
CEREBRO_INGEST_TOKEN=<token_seguro_gerado>
INTEGRATION_AUTH_REQUIRED=true
```

### Custos de IA (plano atual — gratuito)

| Provider | Plano | Limite |
|---|---|---|
| **Groq** | Free tier | 14.400 req/dia · 500.000 tokens/dia |
| **Jina AI** | Free tier | 1.000.000 tokens/mês de embedding |
| **Total** | **R$ 0,00/mês** | Suficiente para volume médio de suporte |

> Para alto volume: Groq pago a partir de ~$0,11 por 1M tokens de entrada.

---

## 15. GLOSSÁRIO TÉCNICO

| Termo | Significado |
|---|---|
| **RAG** | Retrieval-Augmented Generation — IA busca contexto real antes de responder |
| **Embedding** | Representação vetorial de texto que permite busca por similaridade semântica |
| **HNSW** | Hierarchical Navigable Small World — algoritmo de busca vetorial aproximada ultra-rápido |
| **pgvector** | Extensão do PostgreSQL para armazenar e buscar vetores de embedding |
| **Fast-path** | Resolução na primeira mensagem usando casos similares do RAG |
| **Multi-tenant** | Múltiplas empresas no mesmo sistema, dados isolados por `tenant_id` |
| **Orquestrador** | Componente central que coordena agentes, RAG e estado da conversa |
| **LLM** | Large Language Model — modelo de linguagem (Llama, Gemini, etc.) |
| **Groq** | Provider de inferência de LLM ultra-rápido (hardware especializado LPU) |
| **TillitPDV** | Frente de caixa do AUGE ERP |
| **TillitConcentrador** | Servidor PDV do AUGE ERP (intermediário entre PDV e banco) |
| **AugeWEB** | Back-office web do AUGE ERP |
| **SiTEF** | Software Express TEF — gerenciador de pagamentos eletrônicos |

---

*Documento gerado em 28/05/2026 — Mavo.AI v1.0*
*Projeto: C:\willydev\chat-inteligente*

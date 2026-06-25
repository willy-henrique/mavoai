# CLAUDE.md — Mavo.AI (codinome interno: **Cérebro**)

> Arquivo de contexto para o Claude Code. É lido no início de **toda** sessão.
> Mantenha-o curto, verdadeiro e atualizado. Se mudar arquitetura/fluxo, atualize aqui no mesmo PR.
> Última revisão: 2026-06-24.

---

## 1. O que é

Plataforma cognitiva de **atendimento técnico para varejo**. Um cliente manda mensagem no WhatsApp
(via WillTalk ou MTalk) e o "Cérebro" faz **triagem → investigação → tentativa de resolução autônoma →
handoff para humano**, tudo em português, com base de conhecimento do **AUGE ERP** + casos históricos (RAG).

O foco do produto é **suporte do AUGE ERP** (fiscal/NF-e, TEF, hardware de PDV, estoque, financeiro, banco de dados).
É **multi-tenant**: cada empresa (`organization_id` / `tenant_id`) tem config, filas e conhecimento próprios.

Princípio de design nº 1: **anti-alucinação**. Quando falta contexto, o sistema **escala para humano** em vez de inventar passo/menu/campo. Nunca enfraqueça isso.

Documento técnico detalhado (mais longo): `docs/MAVO-AI-DOCUMENTO-TECNICO.md`.

---

## 2. Stack

- **Next.js 16** (App Router) + **React 19** + TypeScript
- **Vercel AI SDK v6** instalado, mas as chamadas de LLM em produção são **fetch direto OpenAI-compatible** (ver `lib/ai-provider.ts`)
- **Groq** como provedor de LLM (OpenAI-compatible). Fallback: Google Gemini / OpenRouter (configuráveis)
- **PostgreSQL + pgvector** (RAG). **Supabase** (auth/storage/SSR)
- **Jina AI** para embeddings (1024 dims)
- **Upstash Redis** (rate limit), **Zod** (validação), **Tailwind v4 + Radix** (UI)
- Testes: **Vitest** (unit) + **Playwright** (e2e). Deploy: **Render** (`render.yaml`)

---

## 3. Como rodar

```bash
npm run dev            # Next dev (porta 3000)
npm run dev:pilot      # porta 3100
npm run db:up          # sobe Postgres+pgvector via docker compose
npm run db:test        # testa conexão com o banco
npm test               # vitest (unit) — RODE ISTO antes de concluir mudanças em lib/
npm run test:e2e       # Playwright
npm run verify:stack   # checagem de saúde da stack (scripts/verify-stack.mjs)
npm run lint
```

Variáveis ficam em `.env.local` (NÃO versionado — ver §9 Segurança).

---

## 4. Arquitetura da IA  ← leia antes de mexer em qualquer coisa de IA

### 4.1 Camada de provider — `lib/ai-provider.ts` (ponto único de acesso ao LLM)
**Toda** geração de texto passa por aqui. Não chame `fetch` para LLM em outro lugar.
Funções públicas principais:
- `gerarTextoIA(system, prompt)` — single-shot, modelo de chat global (temp 0.2)
- `gerarTextoIARapido(system, prompt)` — **classificação interna** (triagem/avaliação) no modelo rápido/barato; não vai ao cliente (temp 0.1)
- `gerarTextoIAConversa(system, historico, msg)` — multi-turno (temp 0.35)
- `gerarTextoIAComAgente(...)` / `gerarTextoIAConversaComAgente(...)` — usa modelo do agente especialista (override) ou cai no global
- `gerarTextoIACurador(...)` — extração de JSON / curadoria (temp 0.1)
- `analisarImagemIA(...)` — visão (Llama 4 Scout), `transcreverAudioIA(...)` — Whisper
- `gerarEmbeddingIA(texto, task)` — embeddings (Jina/OpenAI)

Config em **camadas**: `system_config` no banco **>** env var **>** default hardcoded
(via `getSystemConfig` / `lib/secret-store.ts`). O painel admin pode sobrescrever modelo, chaves e fallbacks em runtime — **o `.env.local` nem sempre reflete o que está rodando**.

### 4.2 Modelos (config atual de produção via `.env.local`)
| Papel | Modelo | Observação |
|---|---|---|
| Chat / conversa | `llama-3.3-70b-versatile` (Groq) | rápido, instruct |
| Classificação interna (rápido) | `llama-3.1-8b-instant` (Groq) | triagem/avaliação; config `ai.fast_model` / env `AI_FAST_MODEL`; editável no painel (aba Modelos IA) |
| Curadoria/JSON | `llama-3.3-70b-versatile` (Groq) | |
| Embeddings | `jina-embeddings-v5-text-small`, 1024d | task `query` p/ busca, `passage` p/ indexação |
| Visão | `meta-llama/llama-4-scout-17b-16e-instruct` | fixo |
| Áudio | `whisper-large-v3-turbo` | fixo |
| Alternativa "qualidade máxima" | `openai/gpt-oss-120b` (**reasoning**) | ⚠ ver §8 — armadilha de reasoning |

### 4.3 Resiliência
- **Retry em 429** com leitura do `retry-after` do Groq; cota diária longa → falha rápido p/ o fallback assumir
- **Fallback de provedor** (`getFallbackProviders`): só dispara em rate-limit; usa chaves do secret-store. Se não houver chave de fallback configurada, **não há rede de segurança** → erro vira resposta genérica
- Timeouts por chamada: **9 s** (instruct) / **45 s** (reasoning)

### 4.4 Fluxo do orquestrador — `lib/platform-orchestrator.ts` (máquina de estados, ~1750 linhas)
Entrada: `POST app/api/orquestrador/v1/mensagem/route.ts`. Estado persiste em `lib/session-store.ts`.
```
Seleção de empresa (se org desconhecida)
   → Triagem (escolhe fila: texto livre → IA classificadora → menu)
      → Investigação (coleta campos obrigatórios, 1 pergunta por vez)
         → Resolução autônoma (até N tentativas: RAG + playbooks AUGE)
            → Handoff humano (gera resumo para o atendente)
```
Atalhos: **fast-path** (mensagem já detalhada pula investigação) e **resolver determinístico**
(`lib/deterministic-resolver.ts` — erros conhecidos respondidos sem LLM).

Peças de IA do fluxo:
- `lib/investigation-quality.ts` — classifica a mensagem (`evaluateInvestigationTurn`) e gera a próxima pergunta (`gerarRespostaConversacional`). Contém o **PROTOCOLO DE COLETA** (campos obrigatórios por domínio)
- `lib/resolution-engine.ts` — `gerarSolucaoAutonoma`: RAG (`buscarSemantica`) + playbooks AUGE + system prompt por tentativa. Retorna `__INSUFFICIENT_CONTEXT__` quando não há base → orquestrador escala
- `lib/ia-router.ts` — roteia para agente especialista (só se `ENABLE_AI_ROUTER=true`)
- `lib/semantic-search.ts` — busca híbrida 70% vetorial + 30% lexical, com fallback textual se o pgvector/Jina cair

---

## 5. Mapa do código

```
app/
  api/
    orquestrador/v1/mensagem/   # ★ entrada principal do atendimento (WhatsApp)
    triagem/  resposta-assistida/  atendimentos/
    mtalk/  ingestao/            # canais de entrada (MTalk, WillTalk, n8n)
    v1/  v2/cerebro/             # API pública (keys, query, search, agents)
    admin/                       # painel (login, secrets, logs, ai-status, ai-fallbacks)
    config/  integrations/  knowledge/  metricas/
  page.tsx, dashboard            # UI admin
lib/                             # ★ toda a lógica de negócio (ver §4)
components/                      # UI (Radix + shadcn-style)
packages/cerebro-client/         # SDK cliente do Cérebro
docs/                            # documentação técnica
scripts/                         # ingestão de conhecimento, verificação de stack
tests/                           # vitest (unit) + playwright (e2e)
```

---

## 6. Banco de dados
- Postgres + pgvector. Clientes: `lib/database/postgres-client.ts` e `...-no-vector.ts`
- Funções SQL chamadas pelo RAG: `buscar_atendimentos_semanticos(vector, int, text)`, `buscar_atendimentos_simples(...)`; tabela `atendimentos`
- Supabase: `lib/supabase/{client,server}.ts`
- Sempre passar `tenant_id` — o sistema é multi-tenant em todas as queries

---

## 7. Variáveis de ambiente (nomes — valores no `.env.local`)
- **IA chat**: `AI_BASE_URL`, `AI_API_KEY`, `GROQ_API_KEY`, `AI_CHAT_MODEL`, `AI_CURATOR_MODEL`, `AI_FAST_MODEL`
- **Embeddings**: `EMBEDDING_BASE_URL`, `EMBEDDING_API_KEY`, `AI_EMBEDDING_MODEL`, `AI_EMBEDDING_DIMENSIONS`, `AI_EMBEDDING_TASK`
- **Fallback LLM**: `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, `XAI_API_KEY`
- **Banco/Supabase**: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- **Canais**: `WILLTALK_*`, `MTALK_*` (inclui `MTALK_REPLY_TIMEOUT_MS` — corte p/ resposta assíncrona, default 9000), `N8N_WEBHOOK_*`, `OBSIDIAN_*`
- **Plataforma**: `CEREBRO_INTERNAL_TOKEN`, `CEREBRO_INGEST_TOKEN`, `API_RATE_LIMIT_PER_MINUTE`, `ADMIN_PASSWORD`, `MANAGER_PASSWORD` (senha do Gerente de Curadoria), `ADMIN_SESSION_SECRET`, `INTEGRATION_AUTH_REQUIRED`, `ENABLE_AI_ROUTER`

---

## 8. Problemas conhecidos & como diagnosticar  ← atualizar sempre que aprender algo

**Sintoma relatado: "às vezes a IA não responde, e quando responde vem coisa sem nexo."**
Causas prováveis, em ordem — confirme nos logs (`app/api/admin/logs` ou `lib/logger.ts`) antes de mexer:

1. **Rate limit do Groq (free tier).** O atendimento faz **2–4 chamadas de LLM por mensagem**
   (classificar + responder + resolver + resumo de handoff). A cota estoura e, se **não houver chave de fallback**
   (`GOOGLE_API_KEY`/`OPENROUTER_API_KEY`) válida, o erro vira a resposta genérica *"Não consegui processar…"* → parece "não responde".
   Logs: `ia_fallback`, `ia_fallback_falhou`. **Verificar primeiro.**
   *Mitigação aplicada (2026-06-24):* as classificações internas (avaliação de investigação, roteamento de fila) usam o **modelo rápido** (`gerarTextoIARapido`, default `llama-3.1-8b-instant`), reduzindo o consumo do modelo de chat. **A correção definitiva continua sendo configurar ≥1 fallback saudável** (key Gemini real / Groq Dev Tier / créditos OpenRouter).
2. **Chaves vencidas/revogadas/cota Jina.** Chave Groq inválida → 401 (não tem fallback, que só cobre 429). Cota Jina (1M tokens/mês grátis) estourada → busca vetorial cai no fallback textual → contexto pobre → resposta "sem nexo". Logs: `busca_vetorial_indisponivel`.
3. **Reasoning model (`gpt-oss-120b`) ligado pelo painel.** ⚠ Armadilha: é reasoning, e o `content` pode vir **vazio**
   (todo o orçamento de tokens consumido no raciocínio) → `throw "Resposta de chat invalida"` → "não responde"; ou vir com `<think>` cru → "sem nexo". `max_completion_tokens` atual = 4096. Se for usar reasoning, tratar `reasoning_format`/`reasoning_effort` e o caso de content vazio em `lib/ai-provider.ts`.
4. **JSON do classificador não parseia** (`evaluateInvestigationTurn`) → cai em `"insuficiente"` → pergunta genérica que "não tem a ver". Log: `investigation_eval_unparseable`.

5. **WhatsApp (MTalk webhook) "a 2ª mensagem não responde, a próxima sim".** O webhook ([app/api/ingestao/mtalk/route.ts](app/api/ingestao/mtalk/route.ts)) é síncrono: o MTalk espera a resposta HTTP. Quando a geração demora além do timeout do MTalk (rate-limit do Groq fazendo `sleep`/retries por vários segundos), o MTalk desiste → **vácuo**; na próxima mensagem a cota tokens/min já liberou → responde. **Corrigido (2026-06-25):** o webhook agora tem timeout-guard (`MTALK_REPLY_TIMEOUT_MS`, default 9s) — se passar disso, libera o webhook e envia a resposta real de forma **assíncrona** via `enviarRespostaParaMTalk` (`after()`), em vez de pendurar. Obs.: o MTalk **não usa o orquestrador** — usa `gerarRespostaWhatsApp` ([lib/assisted-response.ts](lib/assisted-response.ts)) + memória ([lib/whatsapp-memory.ts](lib/whatsapp-memory.ts)).

Correções de robustez a considerar (validar com testes): garantir fallback de provedor configurado; reduzir nº de chamadas de LLM por turno; tratar `content` vazio (retry/usar `reasoning`) em vez de erro seco; alertar quando a cota Jina cair.

---

## 8.1 Curar a base de conhecimento (remover o que está errado)
Conhecimento errado/duplicado na tabela `atendimentos` faz a IA **"responder sem nexo"** (puxa um caso ruim por similaridade). Pelo painel: aba **Conhecimento** ([components/conhecimento-panel.tsx](components/conhecimento-panel.tsx)) → busca + filtro por origem → **Remover da base** (com confirmação). Backend: `GET /api/knowledge` (lista/filtra/pagina) e `DELETE /api/knowledge/[id]` — ambos sob `/api/knowledge/*`, **protegidos pelo middleware** (login admin). Remoção é **permanente** e vale na busca seguinte, sem reindexar. Sinais de item "envenenado" a remover: solução vazia/genérica ("não foi possível determinar"), factualmente errada/desatualizada, ou duplicado. Se faltar a versão correta, recadastre na aba **Cadastrar**.

## 8.2 Módulo de Curadoria de IA — rota do gerente (`/manager/ai-curation`)
Rota protegida ([components/manager/curation-module.tsx](components/manager/curation-module.tsx)) para o **Gerente de Curadoria** ensinar/validar/publicar conhecimento. Ciclo de governança **rascunho → em_teste → publicado → arquivado** na tabela `knowledge_items` (migration **`scripts/014_curation.sql`** — rodar no Supabase antes de usar).
- **Papéis (auth):** o cookie agora carrega um papel. `ADMIN_PASSWORD` → **admin** (acessa tudo); `MANAGER_PASSWORD` → **gerente** (acessa só `/manager/*`). Lógica em [lib/admin-auth.ts](lib/admin-auth.ts) (`authenticate`, `getSession`, `createSessionToken(role)`); o middleware separa rotas admin-only (`/`, `/api/{config,admin,knowledge}`) das de curadoria (`/manager/*`, `/api/manager/*`). Cookies legados continuam válidos como admin.
- **A "dobradinha":** `gerarRascunhoDeConversa` ([lib/knowledge-curation.ts](lib/knowledge-curation.ts)) cruza a pergunta do cliente (início) + a solução do técnico (fim) → rascunho enriquecido (intenção/categoria/tags via LLM curador). APIs: `/api/manager/curation/items` (GET/POST), `/api/manager/curation/items/[id]` (PATCH conteúdo/status, DELETE), `/api/manager/curation/stats`.
- **Status:** Fase 0+1 (fundação + dobradinha + rota) **pronta**. Faltam (próximas fases): Sandbox + modo comparativo, versionamento (tabela `knowledge_item_versions` já criada), o RAG de produção priorizar `publicado`, captura 100% automática no encerramento, e estatísticas avançadas. Os `knowledge_items` ainda **não geram embedding** (busca por texto) — Fase 2.

## 9. Segurança ⚠
- **Já houve vazamento de segredos em repo público** (token MTalk + chave GCP); histórico foi reescrito.
  **Rotação de chaves estava pendente.** As chaves no `.env.local` (Groq, Jina, MTalk…) devem ser **rotacionadas** e nunca commitadas.
- `.env.local` está em texto plano com chaves reais — não copie valores para código, docs, logs ou mensagens.
- `lib/pii-sanitizer.ts` limpa PII de logs; mantenha PII fora de logs e prompts quando possível.

---

## 10. Convenções
- Domínio/comentários em **PT-BR**; mantenha o estilo do arquivo que está editando
- LLM **só** via `lib/ai-provider.ts`. Config **só** via `getSystemConfig`/`getAgentParams`/`secret-store` (nunca `process.env` solto em lib nova)
- Validar input de rota com **Zod**; logar via `lib/logger.ts` (objeto estruturado, sem PII/segredo)
- Tudo **multi-tenant**: propague `tenantId`/`organization_id`
- Resposta de WhatsApp passa por `sanitizeOutboundReply` + header `*Mavo AI*`; máx 4096 chars
- Rode `npm test` antes de concluir mudanças em `lib/`

---

## 11. Como manter este arquivo
Quando você (Claude) terminar uma tarefa que mude **arquitetura, fluxo, modelos, env vars ou um problema conhecido**,
atualize a seção correspondente e a data no topo. Mantenha enxuto: fatos que poupam reler o código, não tudo.

# Mavo.AI — Plano de Finalização e Capacitação das IAs
**Documento gerado em:** 28/05/2026  
**Elaborado por:** Claude (Anthropic) — análise completa do repositório  
**Status atual:** ~75% pronto. Fundação sólida. Gaps críticos identificados e mapeados.

---

## 1. Diagnóstico — O Que Já Está Pronto ✅

Após explorar todo o código do projeto, a conclusão é: **a arquitetura está correta e o core está funcionando**. Não é um projeto incipiente — é uma plataforma madura com gaps específicos e resolvíveis.

### 1.1 Motor Central (Platform Orchestrator)

Arquivo: `lib/platform-orchestrator.ts` — **1.470 linhas**. Implementa o fluxo completo:

```
Mensagem entrada
  → Seleção de empresa (multi-tenant)
  → Classificação automática da fila por texto livre
  → Fast-path (resolve direto se mensagem clara)
  → Fase de investigação (coleta evidências)
  → Fase de resolução autônoma (até N tentativas)
  → Escalonamento humano com contexto estruturado
```

### 1.2 IA Router (Roteamento Semântico)

Arquivo: `lib/ia-router.ts` — **3 camadas de classificação**:
1. Score por keywords (sem LLM, O(n)) — retorna se confiança > 0.7
2. LLM desempata candidatos próximos (0.4–0.7)
3. Fallback para domínio "geral"

### 1.3 IA Curadora

Arquivo: `lib/ai-curator.ts` — já implementa:
- Sanitização de PII antes de processar
- Extração estruturada (problema → causa → solução) via LLM
- Geração de embedding da solução
- Detecção de recorrência (cliente / sistêmica)
- Inserção na base cognitiva (`public.atendimentos`)

### 1.4 Agentes Especialistas

Arquivo: `lib/specialist-agent-store.ts` — CRUD completo com cache 5min.  
Banco: `scripts/012_specialist_agents.sql` — 6 agentes seeded (TEF, PDV, Fiscal, Estoque, Hardware, Integração).

**⚠️ PROBLEMA CRÍTICO:** os `system_prompt` estão VAZIOS. Os agentes existem no banco mas não têm inteligência/comportamento definido.

### 1.5 Motor de Resolução Autônoma

Arquivo: `lib/resolution-engine.ts` — busca semântica em casos históricos + LLM gerativo + contexto AUGE especializado. Suporta até 3 tentativas antes de escalar para humano.

### 1.6 Busca Semântica

Arquivo: `lib/semantic-search.ts` — pgvector com similaridade coseno.  
**⚠️ LIMITAÇÃO:** banco atualmente vazio. Sem histórico de atendimentos → busca sempre retorna 0 resultados.

### 1.7 APIs (30+ endpoints prontos)

```
/api/orquestrador/v1/mensagem    ← endpoint principal (WillTalk/MTalk chamam aqui)
/api/ingestao/willtalk           ← recebe webhooks do WillTalk
/api/ingestao/mtalk              ← recebe eventos do MTalk
/api/busca-semantica             ← busca por similaridade
/api/resposta-assistida          ← copiloto do técnico humano
/api/v1/specialist-agents        ← CRUD agentes especialistas
/api/v1/curator                  ← curadoria de conversas encerradas
/api/v1/feedback                 ← feedback pós-atendimento
/api/v1/agents                   ← agentes de conhecimento
/api/metricas                    ← métricas operacionais
/api/health                      ← healthcheck
```

### 1.8 Banco de Dados

12 scripts de migração (`000` a `012`) cobrindo:
- Tabelas de atendimentos, embeddings, sessões, configurações
- pgvector para busca semântica
- Multi-tenancy
- API Keys
- Agentes especialistas
- Sistema de feedback e curadoria

### 1.9 Qualidade

- **37 testes automatizados passando**
- TypeScript sem erros
- ESLint zero erros
- npm audit zero vulnerabilidades

### 1.10 Integrações

| Sistema | Status |
|---------|--------|
| WillTalk (WhatsApp) | ✅ Integração pronta |
| n8n (orquestração) | ✅ Workflows JSON prontos |
| Groq (LLM) | ✅ Configurado (Llama 4 Scout) |
| Jina AI (embeddings) | ✅ Configurado |
| PostgreSQL + pgvector | ✅ Rodando local |

---

## 2. Gaps Críticos — O Que Falta ❌

### 2.1 🔴 CRÍTICO — System Prompts dos Agentes Estão VAZIOS

Este é o gap mais importante. Os 6 agentes especialistas existem no banco mas **não têm personalidade, conhecimento nem comportamento definido**. Sem `system_prompt`, o agente responde como um LLM genérico — perde toda a especialização.

**Arquivo:** `scripts/012_specialist_agents.sql`  
**Linha problemática:** `system_prompt TEXT NOT NULL DEFAULT ''`

**O que precisa:** system_prompt rico para cada agente:
- Agente TEF → conhece SiTef, PayGo, PinPad, adquirentes, GP
- Agente Fiscal → conhece NF-e, NFC-e, SEFAZ, rejeições, certificado
- Agente PDV → conhece frente de caixa, SAT, ECF, impressora fiscal
- Agente Estoque → conhece inventário, grade, NCM, EAN, transferências
- Agente Hardware → conhece balança, leitor, impressora, drivers, rede
- Agente Integração → conhece APIs, webhooks, XML, REST, ERP

**Solução:** Script `013_agent_prompts.sql` — **gerado neste plano** (seção 5).

---

### 2.2 🔴 CRÍTICO — Base Cognitiva Vazia (Sem Histórico)

A busca semântica só funciona com dados. Atualmente o banco `public.atendimentos` está vazio — o motor de resolução não encontra casos similares e recai 100% no LLM genérico.

**O que precisa:**
- Histórico de atendimentos reais (ou simulados)
- Documentação técnica do AUGE ERP convertida em casos
- Execução do `scripts/backfill-embeddings.ts` após popular o banco

---

### 2.3 🟡 MÉDIO — Infraestrutura de Produção Não Configurada

| Item | Status |
|------|--------|
| Servidor Linux | ⏳ Aguardando aprovação |
| SSL/HTTPS | ❌ Não configurado |
| `.env` de produção | ❌ Não configurado |
| n8n em produção | ❌ Não deployado |
| WillTalk → prod webhook | ❌ Não apontado |

---

### 2.4 🟡 MÉDIO — Configuração de Organizações (Multi-tenant)

Arquivo `lib/org-loader.ts` carrega orgs do banco. Se não houver nenhuma org cadastrada, o sistema apresenta seleção vazia ao usuário.

**O que precisa:** inserir a organização AUGE (e futuras) na tabela `public.organizations`.

---

### 2.5 🟠 BAIXO — Monitoramento/Alertas

Não há sistema de alerta para:
- Erros 5xx em produção
- Latência acima do limite
- Fallbacks frequentes (IA não resolvendo)
- Recorrências sistêmicas detectadas pelo curador

---

## 3. Arquitetura — Como Está Funcionando

```
WhatsApp (cliente)
     ↓
WillTalk
     ↓
n8n (orquestração de eventos)
     ↓
POST /api/orquestrador/v1/mensagem   ← CÉREBRO (este projeto)
     ↓
[Session Store] ← recupera estado da conversa
     ↓
[Seleção de Empresa] ← se multi-tenant sem org definida
     ↓
[IA Router] ← classifica domínio (keywords → LLM → fallback)
     ↓
[Agente Especialista] ← system_prompt específico + base de conhecimento
     ↓
[Fast-path] ← resolve direto se mensagem clara
     ↓
[Investigação] ← coleta evidências (print, descrição, erro)
     ↓
[Resolução Autônoma] ← até 3 tentativas com busca semântica
     ↓
[Handoff Humano] ← com resumo estruturado da IA
     ↓
[IA Curadora] ← extrai problema/causa/solução da conversa
     ↓
[Base Cognitiva] ← conhecimento indexado para futuros atendimentos
```

---

## 4. Roadmap — Do Atual ao 100% Funcional

### FASE 1 — Capacitar as IAs (Esta Semana) 🧠

**Prioridade máxima.** Sem isso, o sistema existe mas não tem inteligência especializada.

#### 1.1 Aplicar os System Prompts dos Agentes (ver Seção 5)

```bash
# No pgAdmin ou psql, executar:
\i scripts/013_agent_prompts.sql
```

#### 1.2 Popular a Base Cognitiva com Casos Simulados

Enquanto o histórico real não chega, criar 20–30 casos por domínio:

```bash
npx ts-node scripts/seed-demo.ts
```

Ou inserir manualmente via API:

```bash
curl -X POST http://localhost:3000/api/ingestao/willtalk \
  -H "Content-Type: application/json" \
  -d '{
    "ticket_id": "SEED-TEF-001",
    "cliente": "Loja Teste",
    "canal": "whatsapp",
    "mensagens": "Problema no gerenciador padrão TEF. GP não comunica com PinPad.\nTécnico: Reiniciou serviço GP, liberou porta 2000 no firewall, PinPad voltou a funcionar.",
    "tecnico": "Carlos",
    "data_evento": "2026-01-15T10:00:00Z"
  }'
```

#### 1.3 Executar Backfill de Embeddings

```bash
npx ts-node scripts/backfill-embeddings.ts
```

#### 1.4 Cadastrar Organização AUGE no Banco

```sql
INSERT INTO public.organizations (id, display_name, is_active)
VALUES ('auge', 'AUGE ERP', true)
ON CONFLICT (id) DO NOTHING;
```

---

### FASE 2 — Validação Local (Esta Semana) 🧪

Executar os testes do roteiro `docs/testes-mvp.md`:

```bash
# 1. Health check
curl http://localhost:3000/api/health

# 2. Teste de ingestão
curl -X POST http://localhost:3000/api/ingestao/willtalk -H "Content-Type: application/json" \
  -d '{"ticket_id":"WT-VAL-001","cliente":"Loja Centro","canal":"whatsapp","mensagens":"impressora termica sem imprimir","tecnico":"Carlos","data_evento":"2026-05-28T10:00:00Z"}'

# 3. Busca semântica
curl -X POST http://localhost:3000/api/busca-semantica -H "Content-Type: application/json" \
  -d '{"texto":"impressora termica nao imprime cupom fiscal"}'

# 4. Teste do orquestrador
curl -X POST http://localhost:3000/api/orquestrador/v1/mensagem \
  -H "Content-Type: application/json" \
  -H "X-Tenant-Id: auge" \
  -H "X-Source-System: willtalk" \
  -d '{
    "platform": "willtalk",
    "organization_id": "auge",
    "event_id": "test-001",
    "conversation_id": "conv-test-001",
    "cliente": {"nome": "João Silva", "telefone": "11999990001"},
    "mensagem": "estou com problema no gerenciador padrão do meu TEF, não está comunicando",
    "business_hours_open": true,
    "conversation": {"triage_completed": false, "menu_attempts": 0, "queue_id": null},
    "queues": [
      {"id": "1", "name": "TEF / Pagamentos", "menu_option": 1},
      {"id": "2", "name": "Fiscal / NF-e", "menu_option": 2},
      {"id": "3", "name": "Infraestrutura", "menu_option": 3}
    ]
  }'
```

**Critério de sucesso:** o orquestrador deve retornar resposta técnica sobre TEF sem exibir menu numérico.

---

### FASE 3 — Produção (Semana Seguinte) 🚀

#### 3.1 Servidor Linux

Quando o servidor for liberado:

```bash
# Instalar dependências
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql-16 nginx certbot python3-certbot-nginx

# Extensão pgvector
sudo apt install -y postgresql-16-pgvector

# Clone do projeto
git clone <repositório> /opt/mavoai
cd /opt/mavoai && npm install
```

#### 3.2 Configurar .env de Produção

```env
DATABASE_URL=postgresql://postgres:<senha>@localhost:5432/mavoai
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_...
EMBEDDING_BASE_URL=https://api.jina.ai/v1
EMBEDDING_API_KEY=jina_...
INTEGRATION_AUTH_REQUIRED=true
CEREBRO_INGEST_TOKEN=<token-forte-32-chars>
WILLTALK_REPLY_WEBHOOK_URL=https://willtalk.seudominio.com/api/webhooks/cerebro/reply
NEXT_PUBLIC_BASE_URL=https://mavoai.seudominio.com
```

#### 3.3 SSL com Certbot

```bash
sudo certbot --nginx -d mavoai.seudominio.com
```

#### 3.4 Aplicar Migrations em Produção

```bash
# No servidor de produção:
psql -U postgres -d mavoai -f scripts/000_SETUP_COMPLETO.sql
psql -U postgres -d mavoai -f scripts/013_agent_prompts.sql
```

#### 3.5 Configurar WillTalk

No painel WillTalk, apontar webhook para:
```
https://mavoai.seudominio.com/api/ingestao/willtalk
Header: X-Tenant-Id: auge
Header: Authorization: Bearer <CEREBRO_INGEST_TOKEN>
```

#### 3.6 Deploy com PM2

```bash
npm run build
pm2 start npm --name "mavoai" -- start
pm2 save && pm2 startup
```

---

### FASE 4 — Piloto Controlado (2 semanas após produção) 📊

- Iniciar com 10–20 atendimentos/dia
- Monitorar taxa de resolução autônoma (meta: 40% sem intervenção humana)
- Técnicos registram resoluções → curador alimenta base cognitiva
- Ajustar keywords e system_prompts conforme necessidade

**Métricas de sucesso do piloto:**
- `GET /api/metricas` mostrando taxa de resolução crescente
- Busca semântica retornando casos similares com similaridade > 0.85
- Handoffs humanos recebendo resumo estruturado (sem reclamação dos técnicos)
- Zero loops entre n8n e o orquestrador

---

### FASE 5 — Evolução (Pós-piloto) 🌱

- Ingestão da documentação oficial AUGE ERP
- Painel de gestão completo (métricas, gráficos, recorrências)
- Módulo de feedback pós-atendimento automatizado
- Expansão para novos domínios (cobrança, delivery, vendas)
- Multi-tenancy para clientes externos

---

## 5. System Prompts dos Agentes Especialistas

> **Estes prompts devem ser aplicados via `scripts/013_agent_prompts.sql`** (ver Seção 6).

### 5.1 Agente TEF — Especialista em Pagamentos

```
Você é o Agente TEF do Mavo.AI, especialista em terminais de pagamento eletrônico (TEF) no ecossistema AUGE ERP.

EXPERTISE:
- SiTef (Software Express) e PayGo — configuração, comunicação, troubleshooting
- Gerenciadores de pagamento (GP): instalação, serviços Windows, portas de comunicação
- PinPad: modelos Ingenico, Verifone, Gertec — drivers, comunicação serial/USB
- Adquirentes: Cielo, Rede (GetNet), Stone, Safra, Bradesco, Itaú — integração e erros
- Comunicação TEF → POS: timeout, porta bloqueada, serviço parado
- Erros comuns: GP inativo, porta 2000/8443 bloqueada, driver PinPad, certificado TEF
- PIX QR Code: geração, cancelamento, timeout
- Estorno/cancelamento: procedimentos por adquirente

POSTURA:
- Diagnóstico objetivo e direto
- Peça sempre: qual adquirente, qual GP (SiTef/PayGo), se o erro é em todas as transações ou só em algumas
- Valide sempre: serviço GP ativo no Windows, porta de comunicação liberada, driver PinPad instalado
- Se problema persistir após 2 orientações, prepare handoff estruturado para técnico humano

RESTRIÇÕES:
- Não autorize estornos — oriente o processo técnico, execução é responsabilidade do operador
- Não acesse sistemas externos — apenas oriente procedimentos
- Não invente códigos de erro — se não conhecer, admita e escale
```

### 5.2 Agente Fiscal — Especialista em Documentos Fiscais

```
Você é o Agente Fiscal do Mavo.AI, especialista em emissão de documentos fiscais eletrônicos no AUGE ERP.

EXPERTISE:
- NF-e (modelo 55): fluxo completo de emissão, contingência, cancelamento, CC-e, inutilização
- NFC-e (modelo 65): CSC/Token, QR Code, contingência offline, cancelamento em 30min
- SAT CF-e: ativação, associação MFE, erros por código (2, 5, 6), DLL satcfe.dll
- SEFAZ: rejeições por código (100 a 999), diagnóstico de causa e solução
- Certificado digital A1 e A3: instalação, leitura, renovação, erros de expiração
- CFOP, CST, CSOSN, NCM, CEST, alíquotas estaduais
- SPED: EFD ICMS/IPI, EFD Contribuições, ECF, registros obrigatórios (C100, C170, etc.)
- Contingência: SCAN, DPEC, FS-DA

REJEIÇÕES SEFAZ MAIS COMUNS:
- 204: Duplicidade de NF-e — número já usado
- 401: Certificado inválido ou expirado
- 539: NCM inválido ou não corresponde à TIPI
- 559: Data de emissão anterior a 24h — emissão em contingência
- 773: Informar chave de acesso da NF-e referenciada
- 999: Erro interno SEFAZ — tentar novamente em 30min

POSTURA:
- Identifique sempre o código de rejeição exato antes de orientar
- Valide: internet ativa, data/hora do servidor corretos, certificado válido
- Para erros de contingência, oriente sempre sobre prazo legal de transmissão

RESTRIÇÕES:
- Não emita documentos — apenas oriente o processo
- Consultas de legislação: informe que pode haver atualizações e oriente consultar contador
```

### 5.3 Agente PDV — Especialista em Frente de Caixa

```
Você é o Agente PDV do Mavo.AI, especialista em operação de frente de caixa no AUGE ERP.

EXPERTISE:
- Abertura e fechamento de caixa: procedimentos, relatórios, Z Redução
- Cupom fiscal: emissão, cancelamento, devolução, troca
- SAT/ECF/NFC-e no PDV: integração, erros de comunicação
- Finalizadoras de pagamento: dinheiro, cheque, cartão, PIX, crediário
- Sangria e suprimento: procedimentos operacionais
- Desconto e acréscimo: regras de permissão por usuário
- Leitora de código de barras no PDV: configuração, não lê, lê errado
- Impressora de cupom: não imprime, papel, configuração de porta
- Erros comuns de PDV: tela travada, não abre, cupom não fecha, diferença de caixa
- Controle de operadores: permissões, senhas, bloqueios

POSTURA:
- Pergunte sempre: qual a mensagem exata na tela do PDV
- Valide: se o problema ocorre em todos os caixas ou só em um
- Para problemas de fechamento de caixa com diferença: oriente auditoria de movimentos antes de reabrir
- Operações críticas (reabertura de caixa, cancelamento após Z): sempre confirme com o gerente

RESTRIÇÕES:
- Não oriente modificação de valores em movimento já encerrado sem supervisão do gerente
- Não acesse remotamente — apenas guie o operador
```

### 5.4 Agente Estoque — Especialista em Gestão de Estoque

```
Você é o Agente Estoque do Mavo.AI, especialista em gestão de estoque e produtos no AUGE ERP.

EXPERTISE:
- Inventário: contagem, acerto, fechamento de inventário
- Entradas de mercadoria: XML de NF-e, conferência, divergências
- Saídas e transferências entre filiais
- Grade (variações de produto): tamanho, cor, embalagem
- Saldo de estoque: consulta, inconsistência, acerto manual
- NCM, EAN/GTIN, código interno, PLU de balança
- Custo médio e FIFO: cálculo, inconsistências
- Cadastro de produto: campos obrigatórios, erros de inclusão/alteração
- Ruptura de estoque: alertas, ponto de pedido
- Lote e validade: controle, rastreabilidade

POSTURA:
- Para inconsistências de saldo: sempre pergunte quando o estoque "batia" pela última vez
- Para erros de cadastro: identifique qual campo está com problema (NCM, EAN, alíquota)
- Orientações de acerto manual: sempre com cautela, oriente registrar justificativa

RESTRIÇÕES:
- Não autorize exclusão de movimentos sem supervisão do gestor
- Alterações de custo médio impactam financeiro — oriente envolver o setor responsável
```

### 5.5 Agente Hardware — Especialista em Equipamentos e Periféricos

```
Você é o Agente Hardware do Mavo.AI, especialista em equipamentos e periféricos no ambiente AUGE ERP.

EXPERTISE:
- Impressoras térmicas: Bematech, Elgin, Epson, Daruma — configuração, porta, driver
- Impressoras fiscais/SAT: ECF, MFE, SAT CF-e — comunicação, DLL, porta serial/USB
- Balanças: Toledo, Filizola, Líder — configuração TCP/Serial, PLU, etiqueta, peso
- Leitoras de código de barras: USB HID, serial — configuração, prefixo/sufixo
- Coletores de dados: Datalogic, Honeywell, Zebra — sincronização, inventário
- Gaveta de dinheiro: abertura automática, pulso, paralelo
- Pinpad TEF: Ingenico, Verifone, Gertec — driver, porta COM, USB
- Rede local: switch, cabeamento, IP fixo, firewall para comunicação de equipamentos
- Drivers Windows: instalação, conflito, assinatura digital
- Computadores: lento, travando, disco cheio — diagnóstico básico para suporte nível 1

POSTURA:
- Peça sempre: modelo exato do equipamento, sistema operacional, porta de conexão (USB/Serial/TCP)
- Valide: cabo, conexão física, gerenciador de dispositivos, driver instalado
- Para problemas de driver: verifique sempre conflitos no Gerenciador de Dispositivos
- Para balanças: valide endereço IP ou porta COM antes de qualquer outra coisa

RESTRIÇÕES:
- Não oriente abertura física de equipamentos — escale para manutenção especializada
- Para equipamentos em garantia: sempre registre e oriente acionar o fabricante
```

### 5.6 Agente Integração — Especialista em Integrações e APIs

```
Você é o Agente Integração do Mavo.AI, especialista em integrações entre sistemas no ecossistema AUGE ERP.

EXPERTISE:
- APIs REST do AUGE ERP: endpoints, autenticação, formato de dados
- Webhooks: configuração, diagnóstico de falha, retry, payload
- Sincronização de dados entre sistemas: produtos, clientes, pedidos, financeiro
- XML NF-e/NFC-e: estrutura, validação, importação
- JSON: estrutura, parsing, erros comuns
- Integrações com e-commerce: Mercado Livre, Shopify, WooCommerce, VTEX
- Integrações com marketplaces: catálogo, pedidos, estoque
- ERPs legados: importação de dados, mapeamento de campos
- Banco de dados: conexão, query básica, exportação de dados

POSTURA:
- Para erros de integração: sempre peça o log completo do erro, não apenas a mensagem resumida
- Valide sempre: autenticação (token/API key), URL base, formato do payload
- Para falhas intermitentes: investigue timeout, rate limit, disponibilidade da API
- Documente sempre a solução encontrada — integrações tendem a repetir os mesmos problemas

RESTRIÇÕES:
- Não compartilhe credenciais ou tokens — oriente o cliente a verificar sem expor
- Para alterações de mapeamento de dados que afetam histórico: exija aprovação do gestor
```

---

## 6. Script SQL para Aplicar os Prompts (013_agent_prompts.sql)

> O script completo está em `scripts/013_agent_prompts.sql`  
> Aplicar após confirmar que a tabela `specialist_agents` está populada.

```sql
-- Verificar agentes antes de aplicar:
SELECT domain, name, length(system_prompt) as prompt_len FROM specialist_agents WHERE tenant_id = 'auge';

-- Após aplicar o script, verificar:
SELECT domain, name, LEFT(system_prompt, 80) as prompt_preview FROM specialist_agents WHERE tenant_id = 'auge';
```

---

## 7. Checklist Final — Para Dizer que Está 100%

### Backend / IA
- [ ] `013_agent_prompts.sql` aplicado no banco
- [ ] Pelo menos 15 casos históricos por domínio na tabela `atendimentos`
- [ ] `backfill-embeddings.ts` executado com sucesso
- [ ] Organização `auge` cadastrada em `public.organizations`
- [ ] `GET /api/health` retorna `database: ok`
- [ ] Busca semântica retorna resultados com similaridade > 0.80

### Teste de Fluxo Completo
- [ ] Mensagem "problema no gerenciador do TEF" → roteada para Agente TEF (sem menu)
- [ ] Mensagem "rejeição 539 na nota fiscal" → roteada para Agente Fiscal
- [ ] Após 3 tentativas sem resolução → handoff humano com resumo estruturado
- [ ] Conversa encerrada → curador processa e insere na base cognitiva

### Infraestrutura (Produção)
- [ ] Servidor Linux provisionado
- [ ] `.env` de produção configurado com tokens reais
- [ ] SSL/HTTPS ativo (`certbot`)
- [ ] WillTalk webhook apontando para produção
- [ ] n8n workflows ativos em produção
- [ ] PM2 rodando e configurado para reiniciar automaticamente
- [ ] `npm run build` sem erros

### Operacional
- [ ] Filas de atendimento configuradas no WillTalk
- [ ] Atendentes treinados: como visualizar handoff, como registrar resolução
- [ ] Horário comercial configurado (`business_hours_open`)
- [ ] Primeiro piloto com 10 atendimentos reais validado

---

## 8. Resumo Executivo

| Dimensão | Status | Próximo passo |
|----------|--------|---------------|
| Arquitetura | ✅ Completa e correta | — |
| Orquestrador | ✅ Operacional | — |
| IA Router | ✅ Funcionando | — |
| IA Curadora | ✅ Implementada | Testar com conversa real |
| Agentes Especialistas | ⚠️ Estrutura ok, prompts vazios | **Aplicar 013_agent_prompts.sql** |
| Base Cognitiva | ❌ Banco vazio | Seed com casos históricos |
| Integração WillTalk | ✅ Pronta | Apontar para produção |
| Infra de Produção | ❌ Pendente | Aguardando servidor |
| Documentação AUGE | ❌ Pendente | Aguardando fornecedor |

**Tempo estimado para Fase 1 (IA funcionando localmente):** 1 dia  
**Tempo estimado para Fase 2 (em produção, conectado ao WillTalk):** 2–3 dias após servidor

---

*Documento técnico elaborado por Claude (Anthropic) com base na análise completa do repositório em 28/05/2026.*

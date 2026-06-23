# Changelog — 23/06/2026

Resumo das correções entregues no Mavo.AI neste dia. Todas em produção
(`mavoai.onrender.com`), exceto os itens marcados como **pendentes**.

## Correções entregues

### 1. Agente Fiscal — lê a evidência do cliente
Adicionada a instrução "0. LEIA PRIMEIRO": quando o cliente cola um erro literal
da SEFAZ, o agente cita o texto e responde a partir dele, em vez de chutar
hipótese genérica. Caso âncora — `"prazo de cancelamento superior ao previsto"` —
agora responde prazo legal vencido → CC-e/devolução (antes falava de data/hora).
Reforçado com **resposta determinística** (sem LLM, zero alucinação).

### 2. Roteador PDV — correção da fórmula de score
O roteador punia agentes com vocabulário rico: 1 keyword do PDV pontuava
`1/√13 = 0,28` e caía no genérico. Trocada a fórmula para `1−1/(matched+1.2)`,
que depende só do nº de keywords batidas. Resolve PDV **e** Fiscal de uma vez.
Detalhe técnico em [`correcao-roteador-score.md`](correcao-roteador-score.md).

### 3. Saudação + contexto-fantasma
`"tarde"`/`"dia"`/`"noite"` isolados não eram reconhecidos como saudação, então o
histórico antigo não era limpo e a IA arrastava contexto de outra conversa.
Corrigido, com guarda contra falso-positivo (`"dia 15 não fechou o caixa"` não
vira saudação).

### 4. Imagem usa o contexto da conversa
A análise de imagem respondia no vácuo (ignorava o histórico e a legenda). Agora
recebe as últimas trocas da conversa + a legenda enviada, e não se reapresenta
(corrige também o cabeçalho "Mavo AI" duplicado).

### 5. Roteamento "NF-e em contingência"
Único caso que falhava no health-check (roteava pro PDV). `contingência`/`nf-e`
adicionadas às keywords do Fiscal → desempate por LLM manda pro Fiscal.

### 6. Fallback de IA sem modelo de reasoning
Removido o `gpt-oss-120b` (reasoning, ~15s) da cadeia de reserva. Quando o Groq
rate-limita o modelo principal, agora cai num modelo rápido. *(Default no código
feito; valor live no banco **pendente** — ver abaixo.)*

### 7. Higiene técnica
- Unificada a fonte dos prompts (`seed-especialistas.mjs` canônico;
  `update-agent-prompts-v5.mjs` depreciado).
- Removido token hardcoded que estava exposto no script depreciado.

## Validação (health-check)

Criado `scripts/test-cases.json` (20 casos adversariais) +
`scripts/validar-regressao.mjs`. Rodado contra produção:

- Roteamento: **95%** (≥90% exigido) — 100% após o item 5
- Conteúdo: **100%** (≥85% exigido)
- Fallback sem invenção: **0 falhas**
- Tempo: bom com a instância morna; ver "latência" abaixo

Pode ser rodado a qualquer momento como health-check do sistema.

## Pendências (ação fora do código)

1. **Aplicar a cadeia de fallback no banco** — painel admin ou
   `POST /api/admin/ai-fallbacks`. Sem isso, o item 6 não tem efeito live.
2. **Rotacionar chaves vazadas** (MTalk + GCP) — segurança.
3. **Groq plano pago** — a lentidão de ~16s vem do rate limit do free tier, não
   do Render. O keep-alive está ok. Para suporte ao vivo, o free tier não basta.

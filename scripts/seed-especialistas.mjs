/**
 * scripts/seed-especialistas.mjs
 *
 * Cria/atualiza os 6 agentes especialistas no banco (tenant "auge"), com os
 * roteiros de diagnóstico sênior (v5). Idempotente (ON CONFLICT por domínio).
 *
 * Por que "auge": o roteador (lib/ia-router → loadSpecialistAgentsCascade) cai
 * para o tenant "auge" quando o tenant da conversa (ex: "default") não tem
 * agentes próprios. Então basta semear em "auge".
 *
 * Modelo: NULL (usa o modelo global = llama-3.3-70b-versatile) — forte e rápido,
 * sem depender de free-tier de terceiros que estoura no atendimento ao vivo.
 *
 * Uso:  node scripts/seed-especialistas.mjs
 * Requer DATABASE_URL no .env.local (ou no ambiente).
 */

import { readFileSync, existsSync } from "fs"
import { createRequire } from "module"
import { fileURLToPath } from "url"
import path from "path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const envPath = path.join(__dirname, "..", ".env.local")
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i === -1) continue
    const k = t.slice(0, i).trim()
    const v = t.slice(i + 1).trim().replace(/^["']|["']$/g, "")
    if (k && !process.env[k]) process.env[k] = v
  }
}

const DATABASE_URL = process.env.DATABASE_URL || "postgresql://postgres:1@localhost:6001/mavoai"
const TENANT = "auge"

const REGRAS = `COMO RESPONDER:
- Vá direto ao ponto, sem introdução teórica nem enrolação.
- Passos curtos, 1 ação por passo, na ordem certa — não corte passo importante.
- Caminho de menu entre parênteses quando ajudar: (Fiscal → Operações Fiscais).
- Feche com 1 linha de confirmação: "Me fala se funcionou."
- Sem "prezado", sem despedida formal, sem emojis.`

const AGENTS = [
  {
    domain: "pdv",
    name: "Agente PDV",
    description: "Frente de caixa, cupom, sangria, suprimento, SAT, concentrador",
    priority: 10,
    keywords: ["pdv","caixa","cupom","sangria","suprimento","ecf","sat","mfe","concentrador","tillit","nfce","contingência","crediário"],
    system_prompt: `Você é especialista PDV do suporte AUGE ERP. Fala como colega técnico no WhatsApp.

${REGRAS}

DIAGNÓSTICO PDV (siga esta ordem):
1. Serviço do Concentrador rodando? → (services.msc ou Administração → Serviços)
2. IP e porta do servidor corretos no PDV? → (Configurações → Concentrador)
3. Firewall liberando a porta? (padrão 9000)
4. Reiniciar serviço do Concentrador e testar

ESPECIALIDADE: TillitPDV, SAT fiscal, sangria/suprimento, cupom NFC-e/ECF, concentrador, modo contingência, permissões, crediário, EAN.`,
  },
  {
    domain: "fiscal",
    name: "Agente Fiscal",
    description: "NF-e, NFC-e, SEFAZ, certificado digital, rejeições fiscais",
    priority: 10,
    keywords: ["nfe","nf-e","nfce","nota fiscal","sefaz","certificado","rejeição","rejeicao","danfe","xml","cfop","cst","csosn","icms","sped","cce","benefício","semcbenef","contingência","contingencia"],
    system_prompt: `Você é especialista fiscal do suporte AUGE ERP. Fala como colega técnico no WhatsApp.

${REGRAS}

DIAGNÓSTICO FISCAL (siga esta ordem):
0. LEIA PRIMEIRO: se o cliente colou um texto de erro literal (rejeição SEFAZ, mensagem do sistema), cite esse texto na primeira linha da resposta e responda a partir dele — nunca ignore evidência objetiva para propor hipótese genérica. Ex.: "Prazo de cancelamento superior ao previsto na legislação" = o prazo legal de cancelamento da NF-e venceu (não é data/hora do sistema): oriente CC-e quando couber ou NF-e de devolução, não mexa em relógio.
1. Identifica o código de rejeição em 1 frase antes dos passos.
2. Certificado (rejeição 562, 165): driver do token instalado? certificado listado? associado à empresa?
3. CSOSN/CST errado (539): operação fiscal → CSOSN/CST → perfil tributário.
4. Código de benefício (SEMCBENEF): operação fiscal com código de benefício indevido → remover ou trocar operação.
5. Erro 999 SEFAZ: instabilidade da SEFAZ — tenta de novo ou ativa contingência.
6. Erro DNS 12007: é DNS do computador do cliente, nunca a SEFAZ → configurar DNS 8.8.8.8.

ESPECIALIDADE: NF-e, NFC-e, CT-e, MDF-e, SEFAZ, rejeições, certificado A1/A3, CFOP/CST/CSOSN, código de benefício fiscal, SEMCBENEF, DANFE, CC-e, SPED EFD.`,
  },
  {
    domain: "tef",
    name: "Agente TEF",
    description: "Terminal de pagamento, PinPad, SiTEF, adquirentes (Stone, Cielo, GetNet)",
    priority: 10,
    keywords: ["tef","sitef","clisitef","pinpad","stone","cielo","getnet","rede","gp","pagamento","cartão","cartao","adquirente","estorno","transação pendente","voucher"],
    system_prompt: `Você é especialista TEF do suporte AUGE ERP. Fala como colega técnico no WhatsApp.

${REGRAS}

ATENÇÃO: se for transação pendente, avise o risco de dupla cobrança ANTES dos passos de cancelamento.

DIAGNÓSTICO TEF (siga esta ordem):
1. O problema é no PinPad (cabo, driver, porta COM), no SiTEF (serviço parado) ou na adquirente (timeout de rede)?
2. PinPad: confere cabo USB/serial → Gerenciador de Dispositivos do Windows → driver instalado?
3. SiTEF: serviço rodando? → (services.msc → SiTEF) → porta COM no CliSiTef.ini correta?
4. Adquirente: olha o log do SiTEF para o código de erro → aciona Stone/Cielo/Getnet se preciso.

ESPECIALIDADE: SiTEF, CliSiTEF, PinPad Ingenico/Verifone/Gertec, Stone/Cielo/Getnet/Rede, voucher Alelo/Sodexo, transação pendente, estorno, duplicidade, GP Linx.`,
  },
  {
    domain: "estoque",
    name: "Agente Estoque",
    description: "Inventário, custo médio, grade, saldo, entrada de mercadoria",
    priority: 8,
    keywords: ["estoque","inventário","inventario","custo médio","custo medio","produto","grade","saldo","ncm","ean","entrada","saída","saida","transferência","perfil de movimento","kit","combo","lote"],
    system_prompt: `Você é especialista em estoque do suporte AUGE ERP. Fala como colega técnico no WhatsApp.

${REGRAS}

DIAGNÓSTICO ESTOQUE (siga esta ordem):
1. Custo médio zerado: o Perfil de Movimento tem custo ativado? → (Estoque → Perfil de Movimento).
2. Depois de corrigir o perfil: reimportar o XML ou lançar de novo → recalcular custo médio.
3. Inventário bloqueando: tem inventário em andamento? → pausar ou finalizar antes de lançar.
4. Grade/variação errada: cadastro do produto → grade → variações configuradas certas?

ESPECIALIDADE: custo médio, inventário, grade cor/tamanho, kit/combo, importação XML NF-e, lote/validade, transferência entre filiais, Perfil de Movimento, pedido de compra.`,
  },
  {
    domain: "hardware",
    name: "Agente Hardware",
    description: "Impressoras, balanças, leitores, periféricos, rede, drivers",
    priority: 8,
    keywords: ["impressora","balança","balanca","leitor","scanner","computador","rede","driver","usb","serial","porta com","periférico","periferico","gaveta","nobreak","touchscreen","elgin","bematech","epson","zebra","daruma","argox","toledo"],
    system_prompt: `Você é especialista em hardware do suporte AUGE ERP. Fala como colega técnico no WhatsApp.

${REGRAS}

DIAGNÓSTICO HARDWARE (siga esta ordem):
1. Físico primeiro: cabo conectado? LED aceso? aparece no Gerenciador de Dispositivos do Windows?
2. Driver: instalado e sem erro? testa a impressão/comunicação pelo Windows ANTES do ERP.
3. Configuração no AUGE: (Configurações → Periféricos) → equipamento selecionado e porta correta?
4. Impressoras: faça o autoteste do aparelho (desligar, segurar o avanço de papel e ligar). Se sair a folha, o aparelho está ok e o problema é no PC/sistema. Confira temperatura/densidade e a bobina na direção certa.
5. Balanças: protocolo correto (Toledo, Filizola, Urano)? baud rate? porta COM?

ESPECIALIDADE: impressoras Argox/Zebra/Daruma/Bematech/Elgin/Epson, balanças Toledo/Filizola/Urano, leitores Honeywell/Zebra, coletores, nobreak, touchscreen, SAT, gaveta de dinheiro.`,
  },
  {
    domain: "integracao",
    name: "Agente Integração",
    description: "APIs, marketplaces, webhooks, sincronização entre sistemas",
    priority: 7,
    keywords: ["api","webhook","integração","integracao","sincronização","sincronizacao","mercado livre","shopify","bling","tiny","oauth","token","rest","json","marketplace","erro 401","erro 429"],
    system_prompt: `Você é especialista em integrações do suporte AUGE ERP. Fala como colega técnico no WhatsApp.

${REGRAS}

DIAGNÓSTICO INTEGRAÇÃO (siga esta ordem):
1. Identifica o tipo de erro: 401/403 = autenticação | 429 = limite de requisições | 404 = rota errada | 500 = erro no servidor.
2. Para 401: token expirado? escopos/permissões certos no painel do marketplace?
3. Para 401 após renovar: token atualizado no AUGE? → (Integrações → [marketplace] → Token).
4. Para 429: reduzir a frequência de sync ou aguardar o reset do limite.
5. Conferir o log → (Integrações → Histórico de Sincronização).

ESPECIALIDADE: Mercado Livre, Shopify, Bling, Tiny, n8n, OAuth 2.0, webhooks, erros HTTP, sincronização de estoque/pedidos, importação CSV/XML.`,
  },
]

let pg
try {
  pg = require("pg")
} catch {
  console.error("❌ Módulo 'pg' não encontrado. Execute: npm install")
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: DATABASE_URL, connectionTimeoutMillis: 10_000 })

async function run() {
  console.log("🔌 Conectando em:", DATABASE_URL.replace(/:([^:@]+)@/, ":***@"))
  const client = await pool.connect()
  try {
    // Garante a tabela (idempotente).
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.specialist_agents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL DEFAULT 'auge',
        domain TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        system_prompt TEXT NOT NULL DEFAULT '',
        keywords TEXT[] NOT NULL DEFAULT '{}',
        model_base_url TEXT,
        model_name TEXT,
        priority INT NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (tenant_id, domain)
      );
    `)
    await client.query(`CREATE INDEX IF NOT EXISTS specialist_agents_tenant_idx ON public.specialist_agents (tenant_id, is_active);`)

    for (const a of AGENTS) {
      await client.query(
        `INSERT INTO public.specialist_agents
           (tenant_id, domain, name, description, system_prompt, keywords, model_base_url, model_name, priority, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,$7,true)
         ON CONFLICT (tenant_id, domain) DO UPDATE
           SET name = EXCLUDED.name,
               description = EXCLUDED.description,
               system_prompt = EXCLUDED.system_prompt,
               keywords = EXCLUDED.keywords,
               priority = EXCLUDED.priority,
               is_active = true,
               updated_at = NOW()`,
        [TENANT, a.domain, a.name, a.description, a.system_prompt, `{${a.keywords.map((k) => `"${k}"`).join(",")}}`, a.priority],
      )
      console.log(`  ✅ ${a.name} (${a.domain}) — ${a.keywords.length} keywords`)
    }

    const r = await client.query(
      "SELECT domain, name, priority, array_length(keywords,1) AS kw FROM public.specialist_agents WHERE tenant_id=$1 AND is_active=true ORDER BY priority DESC, domain",
      [TENANT],
    )
    console.log(`\n📋 ${r.rows.length} especialistas ativos no tenant "${TENANT}":`)
    for (const row of r.rows) console.log(`   • ${row.domain} — ${row.name} (prioridade ${row.priority}, ${row.kw} keywords)`)
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((e) => {
  console.error("\n❌ Erro:", e.message)
  process.exit(1)
})

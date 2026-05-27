/**
 * importar-treinamento-auge.mjs
 *
 * Importa os 7 cenários de diagnóstico da documentação de treinamento do Auge
 * como atendimentos na base de dados com embeddings vetoriais.
 *
 * Uso:
 *   node scripts/importar-treinamento-auge.mjs           → importa tudo
 *   node scripts/importar-treinamento-auge.mjs --dry-run → simula sem salvar
 *
 * Idempotente: verifica existência por resumo_problema + canal antes de inserir.
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  for (const fname of [".env.local", ".env"]) {
    const p = path.join(__dirname, "..", fname)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
      const t = line.trim()
      if (!t || t.startsWith("#")) continue
      const eq = t.indexOf("=")
      if (eq < 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
      if (k && !process.env[k]) process.env[k] = v
    }
    break
  }
}
loadEnv()

// ─── Cores ────────────────────────────────────────────────────────────────────

const bold   = (s) => `\x1b[1m${s}\x1b[0m`
const green  = (s) => `\x1b[32m${s}\x1b[0m`
const yellow = (s) => `\x1b[33m${s}\x1b[0m`
const red    = (s) => `\x1b[31m${s}\x1b[0m`
const dim    = (s) => `\x1b[2m${s}\x1b[0m`

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

// ─── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run")
const DB_URL = process.env.DATABASE_URL || "postgresql://postgres:1@localhost:5433/mavoai"
const EMBEDDING_KEY = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY
const EMBEDDING_BASE = process.env.EMBEDDING_BASE_URL || "https://api.openai.com/v1"
const EMBEDDING_MODEL = process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small"
const DELAY_MS = 500

// ─── Embedding ────────────────────────────────────────────────────────────────

async function gerarEmbedding(texto) {
  if (!EMBEDDING_KEY) {
    console.warn(yellow("  [AVISO] EMBEDDING_API_KEY não configurada — embedding não será gerado"))
    return null
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${EMBEDDING_BASE}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${EMBEDDING_KEY}`,
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: [texto.slice(0, 8000)],
        }),
      })
      if (!res.ok) {
        const body = await res.text()
        if (res.status === 429 && attempt < 2) {
          await sleep(3000 * (attempt + 1))
          continue
        }
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
      const data = await res.json()
      return data?.data?.[0]?.embedding ?? null
    } catch (err) {
      if (attempt === 2) throw err
      await sleep(2000)
    }
  }
  return null
}

// ─── Banco ────────────────────────────────────────────────────────────────────

let pgPool = null

async function getPg() {
  if (pgPool) return pgPool
  const pgMod = await import("pg")
  const PgClass = pgMod.default?.Pool ?? pgMod.Pool ?? pgMod.default
  if (!PgClass) throw new Error("Não foi possível importar Pool do módulo pg")
  pgPool = new PgClass({ connectionString: DB_URL, max: 3, connectionTimeoutMillis: 5000 })
  return pgPool
}

async function dbQuery(sql, params = []) {
  const pool = await getPg()
  const client = await pool.connect()
  try {
    return await client.query(sql, params)
  } finally {
    client.release()
  }
}

function errMsg(err) {
  if (!err) return "erro desconhecido"
  if (typeof err === "string") return err
  return err.message || err.code || String(err) || "erro sem mensagem"
}

async function jaExiste(resumo_problema) {
  const res = await dbQuery(
    "SELECT id FROM atendimentos WHERE canal = 'treinamento' AND resumo_problema = $1 LIMIT 1",
    [resumo_problema]
  )
  return res.rows.length > 0
}

// ─── Casos de Treinamento (Seção 15 do documento) ────────────────────────────

const CASOS_TREINAMENTO = [
  {
    problema: "Não consigo emitir NFe",
    causa: "Pode ser: certificado expirado, destinatário com CNPJ/IE/endereço/cidade incorretos, produto sem NCM/alíquota/CFOP, comunicação com SEFAZ, série ou numeração incorreta",
    solucao: "1. Ler a rejeição completa na tela ou no XML de retorno. 2. Identificar tipo: cadastro, fiscal, certificado, comunicação ou numeração. 3. Corrigir o cadastro indicado pela rejeição (cliente/produto/filial/cidade). 4. Se fiscal: corrigir CFOP, CST/CSOSN, NCM, CEST, alíquotas. 5. Se certificado: renovar ou reimportar. 6. Reabrir ou reimprimir/enviar novamente conforme rotina. Perguntar sempre: Qual rejeição aparece? A venda tem chave? Tem protocolo? Qual perfil foi usado?",
    categoria: "Fiscal",
    resumo_problema: "NFe não emite — diagnóstico multi-causa",
    texto_original: "Não consigo emitir nota fiscal eletrônica NFe. Rejeição SEFAZ. Certificado expirado. CFOP incorreto. Destinatário inválido. NCM produto. Protocolo. Chave de acesso. Perfil de movimento modelo 55.",
  },
  {
    problema: "Venda não gerou financeiro",
    causa: "Perfil de movimento não gera financeiro, prazo ou finalizadora mal configurada, venda não foi finalizada, ou título existe mas com filtros diferentes no FContaR",
    solucao: "1. Confirmar se a venda foi finalizada (não apenas digitada). 2. Verificar perfil de movimento — ele define se gera financeiro e qual conta/prazo. 3. Checar prazo e finalizadora configurados no perfil. 4. Buscar título em FContaR com outros filtros (período, status: todos, filial, cliente). 5. Verificar se a venda foi excluída ou cancelada.",
    categoria: "Financeiro",
    resumo_problema: "Venda finalizada mas sem título em Contas a Receber",
    texto_original: "Venda não gerou financeiro. Contas a receber título não aparece. Prazo. Finalizadora. Perfil de movimento. LANCC. FContaR. Contas a receber filtro período status filial.",
  },
  {
    problema: "Compra não entrou no estoque",
    causa: "Perfil de compra não movimenta estoque como entrada, compra não foi confirmada, filial errada, ou processamento de estoque não foi executado",
    solucao: "1. Confirmar que a compra foi confirmada/finalizada (não apenas iniciada). 2. Verificar perfil de compra — deve ter entrada de estoque ativa. 3. Conferir filial (compra lançada em filial diferente da consultada). 4. Verificar Painel de Estoque na data correta. 5. Se foi via XML/check-in de NF, verificar se o processamento de estoque foi executado.",
    categoria: "Estoque",
    resumo_problema: "Compra lançada mas estoque não aumentou",
    texto_original: "Compra não entrou no estoque. Entrada de nota fiscal. Perfil de compra. Painel de estoque. Check-in NF. XML NFe entrada. Importação XML. Processamento estoque filial.",
  },
  {
    problema: "Produto não aparece na venda",
    causa: "Produto bloqueado, excluído logicamente (DATAEXCLUSAO), sem preço na tabela do perfil, tipo de cadastro errado, ou código/EAN incorreto",
    solucao: "1. Confirmar como está pesquisando (código interno, EAN/código de barras ou descrição). 2. Verificar se o produto está bloqueado no cadastro. 3. Verificar se tem DATAEXCLUSAO (exclusão lógica — produto inativo). 4. Verificar se tem preço configurado na tabela de preço do perfil usado. 5. Confirmar tipo do cadastro: Produto, Matéria-prima ou Serviço. 6. Conferir codigos alternativos em PROCODIGO se EAN não está encontrando.",
    categoria: "Vendas",
    resumo_problema: "Produto não encontrado ao incluir na venda",
    texto_original: "Produto não aparece na venda. Não encontra produto. Produto bloqueado. Excluído. DATAEXCLUSAO. Código de barras EAN. Tabela de preço. Tipo produto matéria-prima serviço. PROCODIGO.",
  },
  {
    problema: "Relatório não bate com outro relatório",
    causa: "Filtros inconsistentes: período diferente, data base diferente (emissão vs vencimento vs pagamento), status (inclui cancelados em um mas não no outro), perfis filtrados de forma diferente, ou tipo analítico vs sintético",
    solucao: "1. Verificar se período e filial são idênticos nos dois relatórios. 2. Confirmar qual data base cada um usa: emissão, separação, entrega, vencimento ou pagamento. 3. Verificar se ambos incluem ou excluem cancelados/excluídos. 4. Confirmar se filtram os mesmos perfis de movimento. 5. Verificar se é analítico vs sintético (nível de detalhe diferente). Padronizar todos os filtros antes de comparar.",
    categoria: "Relatórios",
    resumo_problema: "Divergência entre relatórios — filtros inconsistentes",
    texto_original: "Relatório não bate divergência. Período data base. Emissão vencimento pagamento. Cancelados perfil. Analítico sintético. Filial. Painel de vendas painel financeiro livro fiscal.",
  },
  {
    problema: "Usuário não vê uma opção no menu",
    causa: "Falta de direito no grupo do usuário, módulo inativo em MODULOS, ou PAGINA incorreta coloca o módulo fora do menu esperado",
    solucao: "1. Identificar qual usuário e qual grupo ele pertence. 2. Verificar DIREITOS do grupo para o módulo em questão. 3. Verificar se o módulo está ativo em MODULOS. 4. Verificar MODULOS.PAGINA — PAGINA=0 tira do menu principal (acesso só por link direto). 5. Se for para todos os usuários, pode ser que o módulo foi desativado ou movido de página.",
    categoria: "Permissões",
    resumo_problema: "Tela ou módulo não aparece no menu para o usuário",
    texto_original: "Usuário não vê opção no menu. Permissão negada. Tela sumiu do menu. Direitos grupo. MODULOS. DIREITOS. PAGINA. Acesso negado. Módulo inativo.",
  },
  {
    problema: "Estoque está negativo",
    causa: "Venda lançada antes da compra dar entrada, contagem aplicada zerou o saldo, produto com grade com tamanho/cor incorreto, ou transferência entre filiais não finalizada",
    solucao: "1. Consultar movimentação completa do produto no período (FMovimentacao). 2. Verificar se houve venda registrada antes da compra entrar. 3. Verificar se houve contagem aplicada que zerou/reduziu o saldo após a venda. 4. Se produto tem grade, checar se tamanho/cor foram registrados corretamente em todos os movimentos. 5. Verificar transferências pendentes entre filiais. 6. Corrigir por entrada/ajuste/contagem autorizada conforme política da empresa.",
    categoria: "Estoque",
    resumo_problema: "Saldo de estoque negativo — diagnóstico de causa raiz",
    texto_original: "Estoque negativo. Saldo menor que zero. Venda antes da compra. Contagem aplicada. Grade tamanho cor. Transferência entre filiais. Ajuste de estoque. FMovimentacao FContagem.",
  },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(bold("\n=== Importar Treinamento Auge — Casos de Diagnóstico ===\n"))

  const maskedUrl = DB_URL.replace(/:([^:@]{1,40})@/, ":***@")
  console.log(dim(`  DB   : ${maskedUrl}`))
  if (DRY_RUN) console.log(yellow("  [DRY-RUN] Nenhum dado será gravado.\n"))
  if (!EMBEDDING_KEY) console.log(yellow("  [AVISO] Sem chave de embedding — registros serão inseridos sem vetor.\n"))

  if (!DRY_RUN) {
    try {
      await dbQuery("SELECT 1")
      console.log(green("  Banco   : conectado\n"))
    } catch (err) {
      console.error(red(`\n  FALHA NA CONEXÃO: ${errMsg(err)}`))
      console.error(dim(`  Verifique DATABASE_URL no .env.local ou .env`))
      console.error(dim(`  URL tentada: ${maskedUrl}`))
      process.exit(1)
    }
  }

  let inseridos = 0
  let pulados = 0
  let erros = 0

  for (let i = 0; i < CASOS_TREINAMENTO.length; i++) {
    const caso = CASOS_TREINAMENTO[i]
    console.log(`  [${i + 1}/${CASOS_TREINAMENTO.length}] ${dim(caso.resumo_problema)}`)

    try {
      if (!DRY_RUN) {
        const existe = await jaExiste(caso.resumo_problema)
        if (existe) {
          console.log(`         ${yellow("→ já existe, pulando")}\n`)
          pulados++
          continue
        }
      }

      let embedding = null
      if (!DRY_RUN) {
        process.stdout.write(`         gerando embedding...`)
        embedding = await gerarEmbedding(caso.texto_original)
        process.stdout.write(embedding ? green(" ok\n") : yellow(" sem chave\n"))
        await sleep(DELAY_MS)
      } else {
        console.log(`         ${dim("(dry-run: embed pulado)")}`)
      }

      if (!DRY_RUN) {
        const baseParams = [
          "Base de Conhecimento Auge",
          "treinamento",
          "IA Treinamento",
          new Date(),
          caso.texto_original,
          caso.resumo_problema,
          caso.problema,
          caso.causa,
          caso.solucao,
          caso.categoria,
          true,
        ]

        if (embedding) {
          await dbQuery(
            `INSERT INTO atendimentos
               (cliente, canal, tecnico, data_atendimento, texto_original,
                resumo_problema, problema, causa, solucao, categoria,
                embedding, processado, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                     $12::vector, $11, NOW(), NOW())`,
            [...baseParams, `[${embedding.join(",")}]`]
          )
        } else {
          await dbQuery(
            `INSERT INTO atendimentos
               (cliente, canal, tecnico, data_atendimento, texto_original,
                resumo_problema, problema, causa, solucao, categoria,
                processado, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, NOW(), NOW())`,
            baseParams
          )
        }
        console.log(`         ${green("→ inserido com sucesso")}\n`)
      } else {
        console.log(`         ${dim("→ seria inserido (dry-run)")}\n`)
      }

      inseridos++
    } catch (err) {
      console.error(`         ${red("→ ERRO:")} ${errMsg(err).slice(0, 120)}\n`)
      if (process.env.VERBOSE) console.error(err)
      erros++
    }
  }

  console.log(bold("─────────────────────────────────"))
  console.log(`  Inseridos : ${green(String(inseridos))}`)
  console.log(`  Pulados   : ${yellow(String(pulados))} (já existiam)`)
  console.log(`  Erros     : ${erros > 0 ? red(String(erros)) : dim("0")}`)
  console.log("")

  if (!DRY_RUN && pgPool) await pgPool.end().catch(() => {})

  process.exit(erros > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error(red("\nErro fatal:"), err)
  process.exit(1)
})

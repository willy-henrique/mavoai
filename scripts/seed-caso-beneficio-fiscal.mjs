/**
 * Insere caso real de suporte: rejeição SEFAZ por código de benefício fiscal indevido
 * Fonte: conversa real da equipe Mais Varejo — Patrícia Nogueira + Danilo Empresa
 */

import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadEnv() {
  const p = path.join(__dirname, "..", ".env.local")
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "")
    if (k && !process.env[k]) process.env[k] = v
  }
}
loadEnv()

const { default: pg } = await import("pg")
const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
await client.connect()

const casos = [
  {
    tenant_id: "auge",
    cliente: "Mais Varejo",
    tecnico: "Patricia Nogueira",
    resumo_problema: "Rejeição SEFAZ: Informado código de benefício fiscal para CST sem benefício fiscal",
    causa: `O produto tinha código de benefício fiscal cadastrado diretamente no cadastro do produto. Porém, a operação fiscal utilizada (ex: troca, perda) também tinha um código de benefício vinculado. Ao emitir NF-e com CST 090 (SEMCBENEF - operação sem benefício fiscal), o SEFAZ rejeitou porque o sistema estava informando código de benefício em uma operação que não o exige. A raiz do problema: o código de benefício fica vinculado em dois lugares — no cadastro do produto E/OU na operação fiscal. Quando a operação fiscal está configurada, o sistema ignora o cadastro do produto e usa a configuração da operação fiscal.`,
    solucao: `1. Criar uma operação fiscal específica "outras saídas não especificadas" SEM código de benefício vinculado — usar essa operação para saídas que não envolvem benefício fiscal.
2. Para operações de troca e perda: verificar se a operação fiscal tem código de benefício vinculado e remover se o CST for 090 (SEMCBENEF).
3. SEMCBENEF funciona para produtos COM código de benefício, porém a operação específica com CST 090 não precisa informar o código de benefício — ao vincular a operação fiscal correta (SEMCBENEF / "outras saídas não especificadas"), o sistema ignora o código do cadastro do produto.
4. Caminho no AUGE: Fiscal → Operações Fiscais → localizar/criar operação → verificar campo "Código de Benefício Fiscal" → deixar em branco para CST 090.
5. Após corrigir a operação fiscal, reabrir a nota e selecionar a operação correta → a rejeição é resolvida sem alterar o cadastro do produto.`,
    categoria: "fiscal",
    tags: ["codigo_de_beneficio", "semcbenef", "rejeicao_sefaz", "cst_090", "operacao_fiscal", "outras_saidas_nao_especificadas", "nfe", "beneficio_fiscal", "troca", "perda"],
    texto_original: `Conversa real de suporte — equipe Mais Varejo:
Cliente (Danilo Empresa): Bom dia, ainda estou com esse problema e eu não lembro o caminho exato se tiver que fazer alguma alteração para informar o CFOP sobre esse código de benefício, alguém consegue me ajudar?
Suporte (Patrícia Nogueira): código de benefício fica no cadastro do produto e/ou vinculado a operação fiscal.
Suporte: mas criei operações diferentes de outras saidas justamente por causa desse problema de codigo de beneficio. Se for mandar em outras saidas, produtos que como esse são para garantia.
Cliente: outras saidas não especificadas
Suporte: tem que escolher essa operação pq ela nao tem qualque codigo de beneficio vinculado. Ja em outras saidas (troca,perda) foi vinculado um codigo de beneficio..pois vivia com nota pendente. Coloquei a operação fiscal correta e a nota esta na tela.
Cliente: sim eu acompanhei tudo
Suporte: codigo de beneficio fica vinculado no cadastro do produto. Se vincular a operação fiscal, o sistema ignora o cadastro e pega da operação fiscal. SEMCBENEF só funciona para produtos que tem codigo de beneficoo porém aquela operação especifica, o cst (normalmente 090) não precisa informar.
Erro SEFAZ capturado na tela: "Informado código de benefício fiscal para CST sem benefício fiscal"`,
    resolution_confirmed: true,
    resolution_source: "human_confirmed",
  },
  {
    tenant_id: "auge",
    cliente: "Mais Varejo",
    tecnico: "Patricia Nogueira",
    resumo_problema: "Onde fica o código de benefício fiscal no AUGE ERP — cadastro do produto ou operação fiscal?",
    causa: `Dúvida comum da equipe: não sabem onde o sistema busca o código de benefício fiscal ao emitir NF-e. O código pode estar em dois lugares distintos e o sistema tem hierarquia de prioridade entre eles.`,
    solucao: `O código de benefício fiscal no AUGE ERP fica em DOIS lugares:
1. Cadastro do produto (campo "Código de Benefício Fiscal") — configuração padrão do produto
2. Operação Fiscal — configuração por tipo de operação (venda, devolução, troca, garantia etc.)

HIERARQUIA: Se a operação fiscal tiver código de benefício configurado, o sistema usa o da OPERAÇÃO e ignora o do cadastro do produto. Se a operação fiscal não tiver, usa o do produto.

Portanto:
- Para criar uma saída SEM benefício fiscal: usar operação fiscal que NÃO tenha código de benefício vinculado (ex: "outras saídas não especificadas")
- Para criar uma saída COM benefício específico: vincular o código na operação fiscal ou garantir que o produto tem o código correto
- CST 090 (SEMCBENEF): operação sem benefício fiscal — NÃO informar código de benefício. Se informar, SEFAZ rejeita com "Informado código de benefício fiscal para CST sem benefício fiscal"`,
    categoria: "fiscal",
    tags: ["codigo_de_beneficio", "semcbenef", "operacao_fiscal", "cadastro_produto", "cst_090", "hierarquia_fiscal", "nfe"],
    texto_original: `Dúvida: onde configurar código de benefício fiscal no AUGE ERP para NF-e.
Resposta suporte Patrícia Nogueira: fica no cadastro do produto e/ou vinculado à operação fiscal. Se vincular a operação fiscal, o sistema ignora o cadastro e pega da operação fiscal. SEMCBENEF só funciona para produtos que tem código de benefício porém aquela operação específica, o CST (normalmente 090) não precisa informar.`,
    resolution_confirmed: true,
    resolution_source: "human_confirmed",
  },
]

let inseridos = 0
for (const caso of casos) {
  try {
    await client.query(
      `INSERT INTO atendimentos
         (tenant_id, cliente, tecnico, resumo_problema, causa, solucao, categoria, tags, texto_original, resolution_confirmed, resolution_source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        caso.tenant_id, caso.cliente, caso.tecnico,
        caso.resumo_problema, caso.causa, caso.solucao,
        caso.categoria, caso.tags, caso.texto_original,
        caso.resolution_confirmed, caso.resolution_source,
      ]
    )
    console.log(`  ✅ Inserido: ${caso.resumo_problema.slice(0, 70)}`)
    inseridos++
  } catch (e) {
    console.log(`  ❌ Erro: ${e.message.slice(0, 120)}`)
  }
}

await client.end()
console.log(`\n✅ ${inseridos} caso(s) inserido(s) na base de conhecimento.`)

/**
 * Seed de dados demo para o Cerebro Operacional.
 * Uso: npx tsx scripts/seed-demo.ts
 *
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local
 */

import { createClient } from "@supabase/supabase-js"
import { config } from "dotenv"
import { resolve } from "path"

config({ path: resolve(__dirname, "..", ".env.local") })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error("Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local")
  process.exit(1)
}

const supabase = createClient(url, key)

const categorias = [
  { nome: "Hardware", descricao: "Problemas com equipamentos fisicos" },
  { nome: "Software", descricao: "Instalacao, atualizacao e bugs de software" },
  { nome: "Rede", descricao: "Conectividade, Wi-Fi, VPN" },
  { nome: "Acesso", descricao: "Senhas, permissoes e autenticacao" },
  { nome: "Impressao", descricao: "Impressoras e problemas de impressao" },
]

function diasAtras(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

const atendimentos = [
  {
    cliente: "Maria Silva",
    tecnico: "Carlos TI",
    canal: "whatsapp",
    ticket_externo: "WLT-001",
    data_atendimento: diasAtras(0),
    texto_original:
      "Bom dia, meu computador nao liga desde ontem. Apertei o botao e nada acontece, nenhuma luz acende.",
    resumo_problema: "Computador nao liga — sem energia",
    problema: "Desktop nao liga, sem LEDs, sem ventoinhas",
    causa: "Fonte de alimentacao queimada",
    solucao:
      "Substituida a fonte de alimentacao ATX 500W. Testada com multimetro antes — saida 0V no conector 24 pinos. Apos troca, equipamento ligou normalmente.",
    resumo: "Troca de fonte ATX resolveu problema de desktop sem energia.",
    processado: true,
    categoria_nome: "Hardware",
  },
  {
    cliente: "Joao Pereira",
    tecnico: "Ana Suporte",
    canal: "whatsapp",
    ticket_externo: "WLT-002",
    data_atendimento: diasAtras(1),
    texto_original:
      "Ola, esqueci minha senha do e-mail corporativo e nao consigo resetar pelo portal. Preciso acessar urgente.",
    resumo_problema: "Senha de e-mail corporativo esquecida",
    problema: "Usuario sem acesso ao e-mail corporativo, reset via portal bloqueado",
    causa: "Conta bloqueada apos 5 tentativas incorretas no Active Directory",
    solucao:
      "Desbloqueio da conta no AD, reset de senha manual, enviado nova senha temporaria por SMS. Orientado a trocar no primeiro acesso.",
    resumo: "Desbloqueio de conta AD + reset de senha manual.",
    processado: true,
    categoria_nome: "Acesso",
  },
  {
    cliente: "Fernanda Costa",
    tecnico: "Carlos TI",
    canal: "chat",
    ticket_externo: "WLT-003",
    data_atendimento: diasAtras(2),
    texto_original:
      "A impressora do 3o andar nao imprime. Mando imprimir e fica na fila mas nao sai nada.",
    resumo_problema: "Impressora travada — documentos na fila sem imprimir",
    problema: "Impressora HP LaserJet do 3o andar com fila travada",
    causa: "Spooler de impressao travado no servidor de print",
    solucao:
      "Reiniciado servico Print Spooler no servidor, limpa fila de impressao, teste de pagina OK. Configurado reinicio automatico do spooler em caso de falha.",
    resumo: "Reinicio do Print Spooler no servidor resolveu fila travada.",
    processado: true,
    categoria_nome: "Impressao",
  },
  {
    cliente: "Ricardo Almeida",
    tecnico: "Ana Suporte",
    canal: "whatsapp",
    ticket_externo: "WLT-004",
    data_atendimento: diasAtras(3),
    texto_original:
      "Minha VPN parou de conectar hoje de manha. Diz que o certificado expirou. Trabalho remoto e preciso urgente.",
    resumo_problema: "VPN nao conecta — certificado expirado",
    problema: "Conexao VPN falha com erro de certificado expirado",
    causa: "Certificado digital do cliente VPN venceu (validade anual)",
    solucao:
      "Emitido novo certificado via CA interna, importado no client VPN do usuario. Conexao restabelecida. Adicionado alerta no monitoramento para renovacao 30 dias antes.",
    resumo: "Renovacao de certificado VPN resolveu conexao remota.",
    processado: true,
    categoria_nome: "Rede",
  },
  {
    cliente: "Patricia Lima",
    tecnico: "Carlos TI",
    canal: "whatsapp",
    ticket_externo: "WLT-005",
    data_atendimento: diasAtras(4),
    texto_original:
      "O Excel trava toda vez que abro uma planilha grande com macros. Ja reiniciei o PC varias vezes.",
    resumo_problema: "Excel trava ao abrir planilhas com macros",
    problema: "Microsoft Excel congela ao abrir arquivos .xlsm grandes",
    causa: "Suplemento de terceiro (Adobe PDF Maker) conflitando com macros VBA",
    solucao:
      "Desabilitado suplemento Adobe PDF Maker via Opcoes > Suplementos. Testado com planilha de 15MB com macros — abriu sem travamento. Orientado usuario a usar 'Salvar como PDF' nativo.",
    resumo: "Desabilitar add-in Adobe PDF Maker resolveu travamento do Excel.",
    processado: true,
    categoria_nome: "Software",
  },
  {
    cliente: "Roberto Santos",
    tecnico: "Ana Suporte",
    canal: "whatsapp",
    ticket_externo: "WLT-006",
    data_atendimento: diasAtras(5),
    texto_original:
      "Boa tarde, o Wi-Fi da sala de reunioes esta muito lento. Mal consigo fazer videochamada.",
    resumo_problema: "Wi-Fi lento na sala de reunioes",
    problema: "Conexao Wi-Fi com alta latencia e perda de pacotes na sala de reunioes",
    causa:
      "Access point sobrecarregado — 47 dispositivos conectados em AP de capacidade para 30",
    solucao:
      "Instalado AP adicional (Ubiquiti U6 Pro) com balanceamento de carga. Separadas faixas 2.4GHz e 5GHz com SSIDs diferentes. Latencia caiu de 200ms para 12ms.",
    resumo: "AP adicional com balanceamento resolveu Wi-Fi lento.",
    processado: true,
    categoria_nome: "Rede",
  },
  {
    cliente: "Luciana Oliveira",
    tecnico: "Carlos TI",
    canal: "whatsapp",
    ticket_externo: "WLT-007",
    data_atendimento: diasAtras(1),
    texto_original:
      "O sistema ERP esta dando erro 500 quando tento gerar relatorio financeiro. Urgente pois preciso fechar o mes.",
    resumo_problema: "ERP com erro 500 ao gerar relatorio financeiro",
    problema: null,
    causa: null,
    solucao: null,
    resumo: null,
    processado: false,
    categoria_nome: null,
  },
  {
    cliente: "Diego Martins",
    tecnico: "Ana Suporte",
    canal: "chat",
    ticket_externo: "WLT-008",
    data_atendimento: diasAtras(0),
    texto_original:
      "Preciso instalar o AutoCAD 2025 na minha maquina. Tenho licenca mas nao consigo instalar sozinho, pede permissao de admin.",
    resumo_problema: "Instalacao de AutoCAD requer permissao admin",
    problema: null,
    causa: null,
    solucao: null,
    resumo: null,
    processado: false,
    categoria_nome: null,
  },
]

async function seed() {
  console.log("Inserindo categorias...")
  const { data: catData, error: catErr } = await supabase
    .from("categorias")
    .upsert(categorias, { onConflict: "nome" })
    .select("id, nome")

  if (catErr) {
    console.error("Erro ao inserir categorias:", catErr.message)
    console.log("Tentando buscar categorias existentes...")
  }

  const catMap = new Map<string, string>()
  const existing =
    catData ||
    (await supabase.from("categorias").select("id, nome")).data ||
    []
  for (const c of existing) {
    catMap.set(c.nome, c.id)
  }
  console.log(`  ${catMap.size} categorias disponiveis`)

  console.log("Inserindo atendimentos de demo...")
  let inserted = 0
  for (const a of atendimentos) {
    const categoriaId = a.categoria_nome ? catMap.get(a.categoria_nome) : null
    const { categoria_nome, ...rest } = a

    const { error } = await supabase.from("atendimentos").insert({
      ...rest,
      categoria_id: categoriaId || null,
      categoria: categoria_nome || null,
    })

    if (error) {
      console.warn(`  Falha ao inserir "${rest.cliente}": ${error.message}`)
    } else {
      inserted++
    }
  }

  console.log(`  ${inserted}/${atendimentos.length} atendimentos inseridos`)

  console.log("Inserindo logs de ingestao demo...")
  await supabase.from("ingestao_logs").insert([
    {
      origem: "willtalk",
      status: "sucesso",
      payload: { ticket_id: "WLT-001" },
      detalhes: { atendimento_id: "demo", ticket_id: "WLT-001" },
    },
    {
      origem: "willtalk",
      status: "sucesso",
      payload: { ticket_id: "WLT-002" },
      detalhes: { atendimento_id: "demo", ticket_id: "WLT-002" },
    },
    {
      origem: "willtalk",
      status: "auto_reply_erro",
      payload: { ticket_id: "WLT-007" },
      detalhes: { motivo: "429 rate_limit", skipped: true },
    },
  ])

  console.log("Seed concluido!")
}

seed().catch((err) => {
  console.error("Seed falhou:", err)
  process.exit(1)
})

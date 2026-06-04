const { Pool } = require("pg")
const pool = new Pool({ connectionString: "postgresql://postgres:1@localhost:6001/mavoai" })

const casos = [
  {
    cliente: "Maria Silva", tecnico: "Carlos TI", canal: "whatsapp", ticket: "WLT-001",
    texto: "Bom dia, meu computador nao liga desde ontem. Apertei o botao e nada acontece, nenhuma luz acende.",
    resumo: "Computador nao liga — sem energia",
    problema: "Desktop nao liga, sem LEDs, sem ventoinhas",
    causa: "Fonte de alimentacao queimada",
    solucao: "Substituida a fonte de alimentacao ATX 500W. Testada com multimetro — saida 0V no conector 24 pinos. Apos troca, equipamento ligou normalmente.",
    categoria: "Hardware",
  },
  {
    cliente: "Joao Pereira", tecnico: "Ana Suporte", canal: "whatsapp", ticket: "WLT-002",
    texto: "Ola, esqueci minha senha do e-mail corporativo e nao consigo resetar pelo portal.",
    resumo: "Senha de e-mail corporativo esquecida",
    problema: "Usuario sem acesso ao e-mail corporativo, reset via portal bloqueado",
    causa: "Conta bloqueada apos 5 tentativas incorretas no Active Directory",
    solucao: "Desbloqueio da conta no AD, reset de senha manual, enviado nova senha temporaria por SMS.",
    categoria: "Acesso",
  },
  {
    cliente: "Fernanda Costa", tecnico: "Carlos TI", canal: "chat", ticket: "WLT-003",
    texto: "A impressora do 3o andar nao imprime. Mando imprimir e fica na fila mas nao sai nada.",
    resumo: "Impressora travada — documentos na fila sem imprimir",
    problema: "Impressora HP LaserJet com fila travada",
    causa: "Spooler de impressao travado no servidor de print",
    solucao: "Reiniciado servico Print Spooler no servidor, limpa fila, teste de pagina OK.",
    categoria: "Impressao",
  },
  {
    cliente: "Ricardo Almeida", tecnico: "Ana Suporte", canal: "whatsapp", ticket: "WLT-004",
    texto: "Minha VPN parou de conectar hoje de manha. Diz que o certificado expirou.",
    resumo: "VPN nao conecta — certificado expirado",
    problema: "Conexao VPN falha com erro de certificado expirado",
    causa: "Certificado digital do cliente VPN venceu (validade anual)",
    solucao: "Emitido novo certificado via CA interna, importado no client VPN. Conexao restabelecida.",
    categoria: "Rede",
  },
  {
    cliente: "Patricia Lima", tecnico: "Carlos TI", canal: "whatsapp", ticket: "WLT-005",
    texto: "O Excel trava toda vez que abro uma planilha grande com macros. Ja reiniciei o PC varias vezes.",
    resumo: "Excel trava ao abrir planilhas com macros",
    problema: "Microsoft Excel congela ao abrir arquivos xlsm grandes",
    causa: "Suplemento de terceiro Adobe PDF Maker conflitando com macros VBA",
    solucao: "Desabilitado suplemento Adobe PDF Maker via Opcoes > Suplementos. Abriu sem travamento.",
    categoria: "Software",
  },
  {
    cliente: "Roberto Santos", tecnico: "Ana Suporte", canal: "whatsapp", ticket: "WLT-006",
    texto: "Boa tarde, o Wi-Fi da sala de reunioes esta muito lento. Mal consigo fazer videochamada.",
    resumo: "Wi-Fi lento na sala de reunioes",
    problema: "Wi-Fi com alta latencia na sala de reunioes",
    causa: "Access point sobrecarregado — 47 dispositivos conectados em AP para 30",
    solucao: "Instalado AP adicional Ubiquiti U6 Pro com balanceamento de carga. Latencia caiu de 200ms para 12ms.",
    categoria: "Rede",
  },
  {
    cliente: "Luciana Oliveira", tecnico: "Carlos TI", canal: "whatsapp", ticket: "WLT-007",
    texto: "O sistema ERP esta dando erro 500 quando tento gerar relatorio financeiro.",
    resumo: "ERP erro 500 ao gerar relatorio financeiro",
    problema: "Sistema ERP retorna HTTP 500 ao gerar relatorio financeiro",
    causa: "Timeout na query do relatorio — tabela de lancamentos sem indice adequado",
    solucao: "Adicionado indice na coluna data_lancamento na tabela LANCC. Relatorio passou de timeout para 3s.",
    categoria: "Software",
  },
  {
    cliente: "Carlos Mendes", tecnico: "Carlos TI", canal: "whatsapp", ticket: "WLT-009",
    texto: "Nota fiscal nao esta autorizando. Aparece erro de conexao com SEFAZ.",
    resumo: "NF-e nao autoriza — erro de conexao com SEFAZ",
    problema: "Emissao de NF-e falha com erro de conexao/DNS ao tentar comunicar com SEFAZ",
    causa: "DNS do servidor configurado incorretamente — nao resolve dominios externos como nfe.sefaz.go.gov.br",
    solucao: "Alterado DNS primario para 8.8.8.8 e secundario para 8.8.4.4. Testado ping para nfe.sefaz.go.gov.br — respondendo. NF-e autorizada com sucesso.",
    categoria: "Fiscal",
  },
  {
    cliente: "Ana Beatriz", tecnico: "Ana Suporte", canal: "chat", ticket: "WLT-010",
    texto: "Sistema de PDV travou durante venda e agora nao abre mais. Caixa parado.",
    resumo: "PDV travado — sistema nao abre apos falha",
    problema: "Aplicativo de PDV nao inicializa apos travamento durante operacao de venda",
    causa: "Arquivo de lock nao foi liberado apos falha — processo ainda listado no gerenciador",
    solucao: "Encerrado processo residual via gerenciador de tarefas. Deletado arquivo lock na pasta de dados do PDV. Sistema reiniciado normalmente.",
    categoria: "Software",
  },
  {
    cliente: "Marcos Vieira", tecnico: "Carlos TI", canal: "whatsapp", ticket: "WLT-011",
    texto: "Computador ligou mas fica na tela de boot com mensagem NTLDR is missing.",
    resumo: "PC com erro NTLDR is missing na inicializacao",
    problema: "Boot falha com mensagem NTLDR is missing ou bootmgr compressed",
    causa: "Arquivo de boot corrompido apos queda de energia durante update do Windows",
    solucao: "Boot via pendrive com WinPE, executado bootrec /fixmbr e bootrec /fixboot. Sistema inicializou normalmente.",
    categoria: "Hardware",
  },
  {
    cliente: "Simone Castro", tecnico: "Ana Suporte", canal: "chat", ticket: "WLT-012",
    texto: "Usuario nao consegue fazer login no sistema. Diz que senha esta correta mas continua negando acesso.",
    resumo: "Login negado mesmo com senha correta",
    problema: "Autenticacao falha mesmo com credenciais validas",
    causa: "Cache de sessao corrompido no servidor de autenticacao",
    solucao: "Limpeza do cache de sessao no servidor, forcado logout de todos os dispositivos. Login funcionou apos limpeza.",
    categoria: "Acesso",
  },
  {
    cliente: "Thiago Ramos", tecnico: "Carlos TI", canal: "whatsapp", ticket: "WLT-013",
    texto: "Backup automatico do servidor nao rodou ontem a noite. Alerta no e-mail diz que falhou.",
    resumo: "Backup automatico do servidor falhou",
    problema: "Job de backup noturno nao executou — alerta por e-mail",
    causa: "Disco de destino do backup sem espaco livre — particao encheu com logs antigos",
    solucao: "Removidos logs de backup com mais de 90 dias, liberados 120GB. Backup re-executado manualmente com sucesso. Configurado alerta de espaco em disco.",
    categoria: "Software",
  },
  {
    cliente: "Renata Gomes", tecnico: "Ana Suporte", canal: "chat", ticket: "WLT-014",
    texto: "Monitor do computador fica piscando e as vezes apaga. Ja troquei o cabo.",
    resumo: "Monitor piscando — possivel problema de hardware",
    problema: "Monitor oscila e desliga esporadicamente mesmo com cabo trocado",
    causa: "Placa de video com defeito no conector de saida — sinal intermitente",
    solucao: "Testado com outra placa de video — problema confirmado na GPU original. Substituida por placa reserva. Agendado RMA da GPU defeituosa.",
    categoria: "Hardware",
  },
  {
    cliente: "Paulo Figueiredo", tecnico: "Carlos TI", canal: "whatsapp", ticket: "WLT-015",
    texto: "Preciso de acesso ao sistema do setor financeiro. Sou novo funcionario e ainda nao tenho perfil.",
    resumo: "Novo funcionario sem acesso ao sistema financeiro",
    problema: "Funcionario novo sem perfil de acesso no sistema ERP financeiro",
    causa: "Cadastro de usuario ainda nao foi criado — processo de onboarding pendente",
    solucao: "Criado perfil de usuario no ERP com permissoes do setor financeiro conforme solicitacao do gestor. Enviada senha provisoria por e-mail seguro.",
    categoria: "Acesso",
  },
]

async function main() {
  // Garantir categorias
  const cats = ["Hardware", "Software", "Rede", "Acesso", "Impressao", "Fiscal"]
  for (const nome of cats) {
    await pool.query("INSERT INTO categorias (nome) VALUES ($1) ON CONFLICT (nome) DO NOTHING", [nome])
  }

  const { rows: catRows } = await pool.query("SELECT id, nome FROM categorias")
  const catMap = Object.fromEntries(catRows.map((r) => [r.nome, r.id]))
  console.log("Categorias:", Object.keys(catMap).join(", "))

  let ok = 0
  for (const c of casos) {
    try {
      const check = await pool.query(
        "SELECT id FROM atendimentos WHERE ticket_externo = $1 LIMIT 1",
        [c.ticket]
      )
      if (check.rows.length > 0) { console.log("  skip (já existe):", c.ticket); continue }

      await pool.query(
        `INSERT INTO atendimentos
          (cliente, tecnico, canal, ticket_externo, data_atendimento, texto_original,
           resumo_problema, problema, causa, solucao, resumo, categoria, categoria_id, processado, tenant_id)
         VALUES ($1,$2,$3,$4,NOW(),$5,$6,$7,$8,$9,$6,$10,$11,true,'auge')`,
        [
          c.cliente, c.tecnico, c.canal, c.ticket, c.texto,
          c.resumo, c.problema, c.causa, c.solucao,
          c.categoria, catMap[c.categoria] || null,
        ]
      )
      ok++
    } catch (e) {
      console.error("Falha:", c.ticket, e.message)
    }
  }
  console.log(`Inseridos: ${ok}/${casos.length}`)
  await pool.end()
}

main().catch((e) => { console.error(e); pool.end() })

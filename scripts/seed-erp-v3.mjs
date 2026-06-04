/**
 * Seed v3 — 80 casos avançados ERP para Mavo.AI
 * Execução: node scripts/seed-erp-v3.mjs
 */

import pg from "pg"

const { Pool } = pg
const pool = new Pool({ connectionString: "postgresql://postgres:1@localhost:6001/mavoai" })

const CASES = [
  // ──────────────── FISCAL ────────────────
  {
    categoria: "fiscal",
    cliente: "Distribuidora Central",
    resumo_problema: "Rejeição SEFAZ código 539 — CSOSN inválido para regime tributário",
    causa: "CSOSN incompatível com o regime tributário da empresa (ex: Lucro Presumido usando CSOSN do Simples Nacional)",
    texto_original: "NF-e rejeitada código 539 SEFAZ. CSOSN inválido para o regime tributário da empresa.",
    solucao: "Rejeição 539 indica CSOSN incompatível com o regime. Acesse Cadastro → Produtos → aba Fiscal e corrija o CSOSN: para Simples Nacional use 400 (tributado), 500 (ST), 102 (sem crédito). Para Lucro Presumido/Real use CST (não CSOSN). Corrija e reemita.",
    tags: ["rejeicao 539","csosn","regime tributario","simples nacional","nfe","cst"],
  },
  {
    categoria: "fiscal",
    cliente: "Farmácias Vida",
    resumo_problema: "Rejeição 999 SEFAZ — erro genérico, NF-e não autorizada",
    causa: "Instabilidade interna da SEFAZ — não é falha do sistema ERP",
    texto_original: "Rejeição 999 SEFAZ erro genérico. NF-e não está sendo autorizada.",
    solucao: "Rejeição 999 é erro interno da SEFAZ. Aguarde 15-20 minutos e reemita. Se persistir: verifique internet, data/hora do servidor, e consulte o portal da SEFAZ estadual para verificar instabilidade. Normalmente resolve em até 1 hora.",
    tags: ["rejeicao 999","sefaz","instabilidade","nfe","aguardar"],
  },
  {
    categoria: "fiscal",
    cliente: "Construtora Horizonte",
    resumo_problema: "Rejeição 206 SEFAZ — IE do emitente inválida",
    causa: "Inscrição Estadual cadastrada com pontuação incorreta ou diferente do cadastro na SEFAZ",
    texto_original: "Código de rejeição 206 SEFAZ. IE do emitente está inválida na NF-e.",
    solucao: "Rejeição 206 — IE inválida: Acesse Cadastro → Empresa e confirme a IE exatamente como consta na SEFAZ (sem pontos/traços extras). Para empresa com IE isenta: marque 'IE Isento' e coloque ISENTO no campo. Salve e reemita.",
    tags: ["rejeicao 206","inscricao estadual","ie","emitente","nfe","cadastro empresa"],
  },
  {
    categoria: "fiscal",
    cliente: "Supermercado Bom Preço",
    resumo_problema: "NF-e em contingência offline não transmitiu após restaurar conexão",
    causa: "NF-e emitidas em contingência precisam ser transmitidas manualmente em até 24 horas",
    texto_original: "NF-e contingência offline não autoriza após restaurar conexão internet.",
    solucao: "Para autorizar NF-e em contingência: Fiscal → NF-e → Consultar/Transmitir Lote. Selecione notas com status 'Contingência' e clique Transmitir. Prazo: 24h após emissão. Se passou de 24h: cancele e reemita normalmente.",
    tags: ["contingencia","offline","transmitir lote","nfe","prazo 24h","sefaz"],
  },
  {
    categoria: "fiscal",
    cliente: "Eletro Fácil",
    resumo_problema: "DANFE não imprime — impressora de cupom não aceita",
    causa: "DANFE de NF-e requer impressora A4; impressora fiscal de cupom não suporta esse formato",
    texto_original: "DANFE não imprime. Impressora de cupom fiscal não aceita o DANFE em PDF.",
    solucao: "DANFE de NF-e (modelo 55) requer impressora A4. Configure: Fiscal → Configurações → DANFE → selecione impressora A4. Para NFC-e (cupom 80mm) não há DANFE — o sistema emite XML + QR Code. Instale Foxit Reader se PDF não abrir automaticamente.",
    tags: ["danfe","impressora a4","nfe","nfce","pdf","configuracao"],
  },
  {
    categoria: "fiscal",
    cliente: "Posto Combustível Alto",
    resumo_problema: "Carta de correção CC-e rejeitada pela SEFAZ",
    causa: "Tentativa de corrigir campo não permitido por CC-e (ex: valor, CFOP principal, emitente/destinatário)",
    texto_original: "Carta de correção CC-e não sendo aceita pela SEFAZ. O sistema rejeita o campo que quero corrigir.",
    solucao: "CC-e só corrige: natureza da operação, data de saída, código do produto, transportador, dados adicionais. NÃO corrige: valor, CFOP principal, emitente, destinatário, quantidade. Se o campo não é permitido: cancele a NF-e (prazo 24h) e reemita. Para emitir CC-e: Fiscal → NF-e → Carta de Correção (mínimo 15 caracteres).",
    tags: ["carta correcao","cce","campo nao permitido","cancelamento","nfe","sefaz"],
  },
  {
    categoria: "fiscal",
    cliente: "Transportadora Rápida",
    resumo_problema: "MDF-e rejeitado código 561 — MDF-e Encerrado Anteriormente",
    causa: "MDF-e já encerrado é estado final — não pode ser reaberto ou reencerrado",
    texto_original: "MDF-e rejeitado código 561. MDF-e Encerrado Anteriormente.",
    solucao: "Rejeição 561: o MDF-e já foi encerrado. Encerramento é irreversível. Para verificar: Fiscal → MDF-e → Consultar. Se precisar novo MDF-e para a mesma carga: emita um novo documento em Fiscal → MDF-e → Novo, preenchendo veículo, motorista, UF percurso e NF-e do carregamento.",
    tags: ["mdfe","rejeicao 561","encerrado","novo mdfe","transporte","fiscal"],
  },
  {
    categoria: "fiscal",
    cliente: "Atacadão do Centro",
    resumo_problema: "NF-e com CFOP errado já autorizada — como corrigir?",
    causa: "CFOP é campo não corrigível por CC-e — exige cancelamento ou devolução",
    texto_original: "NF-e com CFOP errado já autorizada. Como faço para corrigir o CFOP?",
    solucao: "CFOP não pode ser corrigido por CC-e. Para corrigir: (1) Cancele a NF-e — prazo 24h após autorização. (2) Reemita com CFOP correto. Se passou do prazo: emita NF-e de devolução (CFOP 2xxx) e reemita a saída correta. Consulte seu contador sobre o procedimento.",
    tags: ["cfop errado","cancelamento","devolucao","prazo","nfe","correcao"],
  },
  {
    categoria: "fiscal",
    cliente: "Clínica Bem Estar",
    resumo_problema: "Certificado digital A1 vencido — como renovar e reinstalar no sistema",
    causa: "Certificado A1 tem validade de 1-3 anos; após vencimento NF-e não é assinada",
    texto_original: "Certificado digital A1 vencido. Como renovar e instalar no AUGE ERP?",
    solucao: "Renovar certificado A1: (1) Acesse o provedor (Certisign, Serasa, Valid) e solicite renovação. (2) Baixe o arquivo .pfx gerado. (3) Windows: clique duplo → Loja 'Usuário Atual' → Pessoal. (4) AUGE: Fiscal → Configurações → Certificado Digital → Selecionar .pfx → informe senha. (5) Teste em homologação antes de produção. Para A3 (token): instale o driver do token antes.",
    tags: ["certificado a1","vencido","renovacao","pfx","instalacao","nfe","a3"],
  },
  {
    categoria: "fiscal",
    cliente: "Madeireira Pinhão",
    resumo_problema: "Como gerar arquivo SPED EFD para envio à Receita Federal",
    causa: "Fluxo de geração do SPED EFD não realizado antes — produtos sem NCM e operações com CFOP incorreto",
    texto_original: "Como gerar relatório SPED EFD para enviar à Receita Federal? Nunca fiz isso pelo sistema.",
    solucao: "SPED EFD no AUGE: (1) Verifique pré-requisitos: todos os produtos com NCM, notas com CFOP e CST corretos. (2) Fiscal → SPED → EFD ICMS/IPI → selecione o período. (3) Configure CNAE, regime de apuração. (4) Gere o arquivo .txt. (5) Valide com o PVA da Receita Federal (obrigatório). (6) Corrija erros apontados pelo PVA no AUGE. Prazo: 25° dia útil do mês seguinte.",
    tags: ["sped","efd","receita federal","ncm","cfop","pva","obrigacao acessoria"],
  },
  // ──────────────── TEF ────────────────
  {
    categoria: "tef",
    cliente: "Varejo Mega",
    resumo_problema: "SiTEF não inicializa — erro 'Não foi possível conectar ao servidor SiTEF'",
    causa: "Serviço CliSiTef parado, IP do servidor incorreto no ini ou firewall bloqueando porta 2000",
    texto_original: "SiTEF não inicializa. Aparece erro 'Não foi possível conectar ao servidor SiTEF'.",
    solucao: "Resolver SiTEF: (1) services.msc → verifique 'CliSiTef' rodando — se parado, inicie. (2) C:\\SiTef\\ini\\CliSiTef.ini → confirme IP e porta do servidor (padrão: 2000). (3) Desative firewall temporariamente e teste. (4) Se servidor em outra máquina: ping para confirmar conectividade. (5) Reinicie o serviço SiTEF no servidor.",
    tags: ["sitef","clisitef","nao inicializa","servidor","porta 2000","firewall","tef"],
  },
  {
    categoria: "tef",
    cliente: "Padaria Aroma",
    resumo_problema: "Transação TEF pendente — cartão passou mas não confirmou no sistema",
    causa: "Falha de comunicação após aprovação da adquirente fez a transação ficar pendente no sistema",
    texto_original: "Transação TEF pendente. O cartão passou mas o sistema não registrou a venda.",
    solucao: "Transação pendente — NÃO repita o pagamento! (1) AUGE → Caixa → TEF → Consultar Transações Pendentes. (2) Se aprovada na adquirente: confirme manualmente no sistema. (3) Se não aprovada: desfaça a transação. (4) Para estorno: Caixa → TEF → Estorno, informe o NSU. Guarde o comprovante do PinPad como evidência.",
    tags: ["transacao pendente","tef","cartao","nsu","confirmar","estorno","pinpad"],
  },
  {
    categoria: "tef",
    cliente: "Auto Peças Torres",
    resumo_problema: "PinPad Ingenico não reconhecido pelo Windows — não aparece no gerenciador",
    causa: "Cabo USB defeituoso, driver não instalado ou porta COM incorreta no ini",
    texto_original: "PinPad Ingenico não é reconhecido pelo Windows. Não aparece no gerenciador de dispositivos.",
    solucao: "PinPad não reconhecido: (1) Troque o cabo USB (causa mais comum). (2) Teste outra porta USB (não use hubs). (3) Baixe e instale o driver do Ingenico no site do fabricante. (4) Gerenciador de Dispositivos: desinstale dispositivo com '!' e reinstale. (5) Se USB Serial: configure porta COM correta no CliSiTef.ini (ex: COM3). (6) Reinicie após instalar driver.",
    tags: ["pinpad","ingenico","driver","usb","porta com","gerenciador dispositivos","nao reconhecido"],
  },
  {
    categoria: "tef",
    cliente: "Cantina Escola",
    resumo_problema: "Voucher Alelo não passa no TEF — erro de adquirente",
    causa: "Finalizadora de voucher não configurada ou a adquirente não habilitou o produto Alelo para o estabelecimento",
    texto_original: "Voucher Alelo não passa no TEF. Dá erro de adquirente ao tentar passar.",
    solucao: "Voucher Alelo: (1) Verifique finalizadora 'Vale Alimentação/Refeição' ativa: Configurações → TEF → Finalizadoras. (2) CliSiTef.ini: confirme que a adquirente que processa Alelo (geralmente Rede ou Cielo) está habilitada. (3) Se erro 'bandeira não habilitada': ligue para a credenciadora e solicite habilitação de vouchers no estabelecimento (pode requerer contrato separado).",
    tags: ["voucher","alelo","sodexo","vr","bandeira nao habilitada","credenciadora","tef"],
  },
  {
    categoria: "tef",
    cliente: "Livraria Saber",
    resumo_problema: "TEF apresenta erro de duplicidade de transação",
    causa: "Transação foi processada mas o sistema não registrou — usuário tentou novamente gerando duplicidade",
    texto_original: "TEF apresenta erro de duplicidade. Transação já realizada.",
    solucao: "Duplicidade no TEF: (1) Consulte o extrato da adquirente (Stone App, Cielo Manager) — verifique se a venda existe. (2) Se existe: NÃO processe novamente. Registre manualmente no AUGE. (3) Se não existe: processe normalmente. (4) Para evitar: sempre aguarde OK do PinPad antes de fechar o caixa. Nunca force fechar o AUGE durante transação.",
    tags: ["duplicidade","tef","transacao","registrar manualmente","stone","cielo","comprovante"],
  },
  {
    categoria: "tef",
    cliente: "Ótica Visão Clara",
    resumo_problema: "Erro TEF: Estabelecimento não habilitado para esta operação",
    causa: "Modalidade de pagamento ou bandeira não contratada junto à adquirente",
    texto_original: "Erro no TEF: Estabelecimento não habilitado para esta operação ao passar cartão.",
    solucao: "Erro de adquirente (não do sistema): (1) Modalidade não contratada (parcelado, débito). (2) Bandeira não habilitada (Amex, Hipercard). Solução: ligue para a adquirente — Stone: 4003-5750 / Cielo: 4002-5472 — e solicite habilitação informando seu número de estabelecimento (EC). Pode levar até 24h.",
    tags: ["estabelecimento nao habilitado","adquirente","stone","cielo","bandeira","contrato","tef"],
  },
  {
    categoria: "tef",
    cliente: "Barbearia Corte & Arte",
    resumo_problema: "Reimpressão de comprovante TEF não funciona no sistema",
    causa: "Comprovante TEF armazenado localmente — para transações antigas é preciso buscar na adquirente",
    texto_original: "Reimpressão de comprovante TEF não funciona. Preciso reimprimir uma transação de ontem.",
    solucao: "Reimprimir comprovante TEF: Caixa → Histórico de Vendas → localize a venda → Reimprimir Comprovante TEF. Se não aparecer: o AUGE guarda comprovante apenas da última transação. Para transações antigas: acesse o portal da adquirente (Stone Dashboard, Cielo Backoffice) e baixe o comprovante por data/NSU.",
    tags: ["reimpressao","comprovante","tef","nsu","stone","cielo","historico"],
  },
  {
    categoria: "tef",
    cliente: "Farmácia Saúde Total",
    resumo_problema: "GP (Gerenciador de Pagamentos) desatualizado — como atualizar?",
    causa: "Versão antiga do GP/SiTEF pode causar incompatibilidade com novas adquirentes",
    texto_original: "GP Gerenciador de Pagamentos versão antiga. Como atualizar o SiTEF?",
    solucao: "Atualizar GP/SiTEF: (1) Feche todos os PDVs. (2) Faça backup da pasta C:\\SiTef\\ini. (3) Desinstale a versão atual pelo Painel de Controle. (4) Instale a nova versão do portal Software Express. (5) Restaure o backup do ini. (6) Teste uma transação em modo debug. Versão mínima recomendada: 8.0. Faça em horário de baixo movimento.",
    tags: ["gp","sitef","atualizar","software express","ini","backup","versao"],
  },
  // ──────────────── PDV ────────────────
  {
    categoria: "pdv",
    cliente: "Hipermercado Central",
    resumo_problema: "SAT fiscal não comunica — LED vermelho, erro 'SAT não responde'",
    causa: "SAT desconfigurado, código de ativação incorreto, USB com problema ou SAT precisa de reinicialização",
    texto_original: "SAT fiscal não comunica. LED vermelho. Erro 'SAT não responde' ao emitir cupom.",
    solucao: "SAT sem comunicação: (1) LED verde fixo = OK, piscando = ativando, vermelho = erro. (2) Teste pelo software do fabricante (Dimep SATActivador, Elgin SAT Toolbox). (3) Confira código de ativação: Configurações → SAT → Código de Ativação. (4) Troque a porta USB (evite hubs). (5) Reinicie o SAT: retire da tomada por 30s. SAT precisa de ativação inicial pelo portal SEFAZ + fabricante.",
    tags: ["sat","led vermelho","codigo ativacao","usb","dimep","elgin","ativar sat"],
  },
  {
    categoria: "pdv",
    cliente: "Loja do Trabalhador",
    resumo_problema: "Caixa não abre após atualização do sistema AUGE ERP",
    causa: "Incompatibilidade entre versão do cliente PDV e do servidor após atualização, ou cache corrompido",
    texto_original: "Caixa não abre após atualização do sistema. Trava ao tentar abrir o PDV.",
    solucao: "Caixa travado pós-atualização: (1) Verifique log: Administração → Logs → Erros recentes. (2) Reinicie o Concentrador no servidor. (3) Se erro de banco: Administração → Manutenção → Verificar Estrutura do Banco. (4) Confirme que versão cliente PDV = versão servidor. (5) Limpe cache: pasta C:\\AUGE\\cache → apague .tmp. (6) Reinstale o cliente PDV se necessário.",
    tags: ["caixa nao abre","atualizacao","concentrador","cache","versao","pdv"],
  },
  {
    categoria: "pdv",
    cliente: "Mercadinho da Esquina",
    resumo_problema: "Sangria bloqueada — usuário sem permissão para sangria",
    causa: "Operador de caixa sem a permissão específica de sangria configurada no perfil",
    texto_original: "Sangria bloqueada. Mensagem usuário sem permissão para sangria.",
    solucao: "Liberar sangria: Administração → Usuários → selecione o usuário → Permissões → marque 'Realizar Sangria'. Para sangria com supervisão: no caixa, clique Sangria → informe senha do supervisor. Configure limite máximo em Configurações → Caixa → Limite de Sangria.",
    tags: ["sangria","permissao","supervisor","senha","limite","caixa","usuario"],
  },
  {
    categoria: "pdv",
    cliente: "Quitanda Fresca",
    resumo_problema: "Produto não localizado no PDV pelo leitor de código de barras",
    causa: "EAN/código de barras não cadastrado no produto, produto inativo ou não sincronizado",
    texto_original: "Produto não localizado no PDV pelo leitor de código de barras. Não acha o produto.",
    solucao: "Produto não encontrado pelo leitor: (1) Confirme EAN cadastrado: Cadastro → Produtos → produto → aba Códigos de Barras. (2) Se cadastrado mas não localiza: verifique produto ativo e pertencente à filial. (3) Teste digitar manualmente — se funcionar, problema no leitor (limpe a lente ou troque a bateria). (4) Após cadastrar novo código: Caixa → Sincronizar Produtos.",
    tags: ["ean","codigo barras","produto","leitor","sincronizar","pdv","nao localizado"],
  },
  {
    categoria: "pdv",
    cliente: "Açougue Corte Fino",
    resumo_problema: "Fechamento de caixa com divergência entre físico e sistema",
    causa: "Sangrias ou suprimentos não registrados, devoluções sem retorno ao caixa, troco incorreto",
    texto_original: "Fechamento de caixa com divergência. Diferença entre o dinheiro físico e o que o sistema mostra.",
    solucao: "Divergência no fechamento: (1) Imprima relatório detalhado: Caixa → Relatórios → Movimentações Detalhadas. (2) Compare sangrias, suprimentos, vendas, estornos. (3) Verifique cancelamentos sem retorno ao caixa. (4) Confira troco em dinheiro vs troco digital. (5) Suprimento inicial incorreto ao abrir o caixa é causa frequente. Não feche com divergência sem identificar a causa.",
    tags: ["fechamento caixa","divergencia","sangria","suprimento","troco","relatorio","conferencia"],
  },
  {
    categoria: "pdv",
    cliente: "Confecções Moda Nova",
    resumo_problema: "Crediário bloqueado — cliente com limite disponível mas não consegue comprar",
    causa: "Saldo devedor reduz o limite disponível ou parcelas vencidas estão bloqueando novas vendas",
    texto_original: "Crediário cliente sem limite disponível mas tem limite cadastrado no sistema.",
    solucao: "Crediário sem limite: (1) Financeiro → Crediário → Contas a Receber → cliente → verifique saldo devedor (limite - saldo = disponível). (2) Se saldo zerado mas bloqueia: Cadastro → Clientes → Crediário → verifique se limite está ativo. (3) Parcelas vencidas bloqueiam: configure em Configurações → Crediário → Bloquear com parcelas vencidas. (4) Para aumentar limite: edite o cadastro do cliente.",
    tags: ["crediario","limite","parcelas vencidas","saldo devedor","bloqueio","cliente","financeiro"],
  },
  {
    categoria: "pdv",
    cliente: "Papelaria Estudante",
    resumo_problema: "PDV offline — caixa em modo contingência sem conexão com servidor",
    causa: "Falha de rede ou servidor fora do ar — PDV entrou em modo offline automaticamente",
    texto_original: "PDV offline. Caixa funcionando em modo contingência sem conexão com servidor.",
    solucao: "PDV offline: (1) Verifique rede (cabo, Wi-Fi, IP). (2) Confirme se servidor/concentrador está ligado. (3) AUGE PDV em contingência registra vendas localmente — sincroniza ao reconectar. (4) NF-e emitida offline vai em contingência (FS-IA). (5) Ao reconectar: Caixa → Sincronizar com Servidor para enviar vendas. (6) Se timeout frequente: verifique qualidade da rede e use cabo dedicado.",
    tags: ["pdv offline","contingencia","sincronizar","rede","concentrador","fsia","reconexao"],
  },
  {
    categoria: "pdv",
    cliente: "Pão Quente Padaria",
    resumo_problema: "Usuário bloqueado por excesso de tentativas de login",
    causa: "Operador errou a senha mais vezes que o limite configurado no sistema",
    texto_original: "Usuário bloqueado por excesso de tentativas de login. Não consegue entrar no sistema.",
    solucao: "Desbloquear usuário: Administração → Usuários → localize o usuário → clique Desbloquear. Após desbloqueio o usuário deve trocar a senha. Para alterar política de bloqueio: Administração → Segurança → Tentativas máximas de login (padrão: 3-5). Se administrador principal bloqueado: contate o suporte AUGE com prova de propriedade.",
    tags: ["usuario bloqueado","tentativas login","senha","administrador","desbloquear","seguranca"],
  },
  // ──────────────── ESTOQUE ────────────────
  {
    categoria: "estoque",
    cliente: "Distribuidora ABC",
    resumo_problema: "Inventário iniciado bloqueando lançamentos de entrada e saída",
    causa: "Inventário em andamento bloqueia movimentações por design de segurança",
    texto_original: "Inventário iniciado e agora não consigo lançar entradas ou saídas de estoque.",
    solucao: "Inventário bloqueia movimentações por design. Opções: (1) Para urgência: finalize ou cancele o inventário: Estoque → Inventário → Finalizar/Cancelar. (2) Para não parar as vendas: use Inventário Parcial por departamento — só bloqueia os produtos daquele setor. Planeje inventários para horários de baixo movimento.",
    tags: ["inventario","bloqueio","movimentacao","cancelar inventario","parcial","estoque"],
  },
  {
    categoria: "estoque",
    cliente: "Moda Jovem Store",
    resumo_problema: "Grade de produto (cor/tamanho) com saldo divergindo do físico",
    causa: "Importação de XML sem mapeamento correto das variantes da grade de cor/tamanho",
    texto_original: "Grade de produto com saldo errado. Quantidade no sistema divergindo do físico.",
    solucao: "Grade divergente: (1) Verifique histórico: Estoque → Produtos → produto → Histórico por Grade. (2) Identifique se problema é na entrada (XML mal mapeado) ou saída (venda). (3) Para corrigir: Estoque → Ajuste de Estoque → produto + variante → corrija com motivo 'Correção de grade'. (4) Para evitar: configure mapeamento de grades em Compras → Parâmetros → Importar Grade.",
    tags: ["grade","cor tamanho","variante","ajuste estoque","xml","mapeamento","inventario"],
  },
  {
    categoria: "estoque",
    cliente: "Atacado do Povo",
    resumo_problema: "Romaneio de entrega com produto a mais que a nota fiscal",
    causa: "Fornecedor enviou quantidade diferente do pedido — divergência entre NF e entrega física",
    texto_original: "Romaneio de entrega com produto a mais ou a menos que a nota fiscal.",
    solucao: "Divergência romaneio × nota: (1) Compras → Receber Pedido → Conferir Itens → marque cada item conferido. (2) Produto a mais: crie entrada de ajuste ou devolução parcial ao fornecedor. (3) Produto a menos: registre recebimento parcial e aguarde complemento. (4) Configure tolerância: Compras → Parâmetros → Tolerância de Recebimento (%).",
    tags: ["romaneio","conferencia","recebimento","fornecedor","divergencia","devolucao parcial"],
  },
  {
    categoria: "estoque",
    cliente: "Laticínios do Vale",
    resumo_problema: "Produto com controle de lote e validade — como configurar e monitorar",
    causa: "Controle de lote/validade não habilitado no cadastro do produto",
    texto_original: "Como configurar produto com lote e validade e controlar vencimento no sistema?",
    solucao: "Controle lote/validade: (1) Cadastro → Produtos → aba Controle → marque 'Controla Lote' e/ou 'Controla Validade'. (2) Na entrada: informe lote e data de validade por produto. (3) O sistema sugere FEFO (primeiro a vencer, primeiro a sair) na saída se configurado. (4) Relatório de vencimentos: Estoque → Relatórios → Produtos por Validade. (5) Configure alerta de X dias antes do vencimento.",
    tags: ["lote","validade","vencimento","fefo","alerta","controle","perecivel"],
  },
  {
    categoria: "estoque",
    cliente: "Rede de Lojas Bela",
    resumo_problema: "Transferência entre filiais com custo médio diferente em cada filial",
    causa: "Cada filial calcula seu próprio custo médio independentemente — comportamento esperado",
    texto_original: "Transferência entre filiais com custo diferente. Custo médio divergindo entre filiais.",
    solucao: "Custo médio diverge entre filiais por design — cada filial calcula independentemente. Para transferência: Estoque → Transferência entre Filiais → informe filial origem/destino, produto e quantidade. O custo transferido é o custo médio da origem. Para uniformizar: use Ajuste de Custo na filial destino após a transferência.",
    tags: ["transferencia filial","custo medio","divergencia","ajuste custo","filial","estoque"],
  },
  {
    categoria: "estoque",
    cliente: "Mercearia Boa Vista",
    resumo_problema: "XML de NF-e importado mas produtos não deram entrada no estoque",
    causa: "Perfil de Movimento não configurado para movimentar estoque, ou importação pendente de confirmação",
    texto_original: "XML de nota de entrada importado mas produtos não deram entrada no estoque.",
    solucao: "XML importado sem entrada no estoque: (1) Verifique o Perfil de Movimento — deve ter 'Movimenta Estoque' marcado. (2) Compras → Importar XML → verifique status da importação. (3) Se importação pendente: clique Confirmar/Lançar para efetivar. (4) Alguns fluxos criam pedido de compra que precisa ser confirmado separadamente. (5) Verifique se CFOP da nota (1102, 1202) está configurado para movimentar estoque.",
    tags: ["xml","importar","nota entrada","cfop","perfil movimento","movimentar estoque","compras"],
  },
  {
    categoria: "estoque",
    cliente: "Drogaria Saúde Viva",
    resumo_problema: "Como fazer inventário rotativo por categoria sem parar as vendas",
    causa: "Inventário total bloqueia todas as movimentações — inventário parcial é a solução",
    texto_original: "Como fazer inventário rotativo por categoria sem parar as vendas no sistema?",
    solucao: "Inventário rotativo: (1) Estoque → Inventário → Novo → tipo 'Parcial por Categoria'. (2) Selecione as categorias — só esses produtos ficam bloqueados. (3) Imprima fichas de contagem. (4) Lance contagens: Estoque → Inventário → Lançar Contagem. (5) Compare, ajuste e finalize por categoria. (6) O restante continua normalmente. Recomendado: inventariar categorias de alto valor semanalmente.",
    tags: ["inventario rotativo","parcial","categoria","contar","ajuste","estoque","sem parar"],
  },
  {
    categoria: "estoque",
    cliente: "Cozinha Industrial SA",
    resumo_problema: "Produto kit com custo médio incorreto após venda",
    causa: "Composição do kit sem custo dos componentes ou fator de conversão incorreto",
    texto_original: "Produto kit com custo médio incorreto. O custo está errado depois das vendas.",
    solucao: "Custo de kit/composição: (1) Kit explode os componentes na saída — custo = soma dos componentes. (2) Verifique custo de cada componente: Cadastro → Produtos → componente → Custo. (3) Recalcule: Cadastro → Produtos → kit → Recalcular Custo de Composição. (4) Para kits com frações: confirme unidades de medida e fatores de conversão corretos.",
    tags: ["kit","composicao","custo medio","componente","recalcular","unidade medida","fator"],
  },
  // ──────────────── HARDWARE ────────────────
  {
    categoria: "hardware",
    cliente: "Mercearia São João",
    resumo_problema: "Balança Toledo com peso incorreto — valores errados",
    causa: "Balança descalibrada ou protocolo de comunicação incorreto no sistema",
    texto_original: "Balança Toledo não está pesando corretamente. Valores estão errados.",
    solucao: "Balança Toledo com peso errado: (1) Nivele a balança (bolha central). (2) Calibre: balança vazia → pressione TARE/ZERO. (3) AUGE: Configurações → Periféricos → Balança → selecione protocolo Toledo 8217 ou Prix III. (4) Configurações → Balança → Testar Comunicação. (5) Se comunicação cai: verifique cabo RS-232/USB e porta COM. (6) Calibração INMETRO: contate Toledo para recalibração certificada (exigida anualmente para uso comercial).",
    tags: ["balanca","toledo","calibracao","peso errado","rs232","protocolo","inmetro"],
  },
  {
    categoria: "hardware",
    cliente: "Restaurante Sabor",
    resumo_problema: "Impressora Daruma FS700 não imprime após troca de papel",
    causa: "Papel instalado ao contrário (lado errado para cima) em impressora térmica",
    texto_original: "Impressora Daruma FS700 não imprime após troca de papel. Folha sai em branco.",
    solucao: "Daruma FS700 após troca de papel: (1) Papel térmico: lado liso/brilhoso para baixo (voltado para o rolo). (2) Feche a tampa completamente até o clique. (3) Pressione FEED para avançar. (4) Se sai em branco: papel invertido — vire o rolo. (5) Auto-teste: desligue, pressione FEED, ligue segurando até impressão iniciar. (6) Linha falhada na impressão: limpe a cabeça com álcool isopropílico + cotonete.",
    tags: ["daruma","papel termico","branco","imprime branco","rolo papel","cabeca impressao","limpeza"],
  },
  {
    categoria: "hardware",
    cliente: "Agropecuária Campo Verde",
    resumo_problema: "Leitor Honeywell lendo código com caracteres extras ou errados",
    causa: "Leitor configurado para idioma US-INTL ao invés de PT-BR, ou sufixo configurado",
    texto_original: "Leitor de código de barras Honeywell lendo código errado ou com caracteres extras.",
    solucao: "Honeywell com leitura incorreta: (1) Idioma errado: configure para PT-BR com barcodes de configuração do manual do modelo. (2) Caracteres extras (enters, tabs): imprima o barcode 'Remove Suffix' do guia. (3) Lente suja: limpe com pano macio. (4) EAN com dígito verificador incorreto no cadastro: compare com o rótulo físico. (5) Configure velocidade de leitura se processar muito rápido.",
    tags: ["honeywell","leitor","caracteres extras","idioma","sufixo","ean","barcode configuracao"],
  },
  {
    categoria: "hardware",
    cliente: "Posto Ipê",
    resumo_problema: "Nobreak (UPS) com bateria fraca — computador desligando durante operação",
    causa: "Bateria de gel com vida útil esgotada (2-4 anos) ou descarga profunda",
    texto_original: "Nobreak descarregou. Computador está desligando durante a operação.",
    solucao: "Nobreak com bateria fraca: (1) Vida útil: 2-4 anos. (2) Teste: desconecte da tomada com equipamento ligado — se desligar imediatamente, bateria morta. (3) Leve potência (VA) e modelo ao distribuidor para adquirir bateria (comum: 7Ah/9Ah/12Ah em 12V). (4) Emergência: conecte direto na tomada. (5) Para PDV crítico: configure monitoramento USB para desligamento seguro automático em queda de energia.",
    tags: ["nobreak","ups","bateria","desligando","gel","substituir","monitoramento"],
  },
  {
    categoria: "hardware",
    cliente: "Supermercado Vila Nova",
    resumo_problema: "Gaveta de dinheiro não abre automaticamente ao finalizar venda",
    causa: "Gaveta não conectada na porta Drawer da impressora, ou opção não habilitada no AUGE",
    texto_original: "Gaveta de dinheiro não abre automaticamente ao finalizar a venda.",
    solucao: "Gaveta não abre: (1) Conecte a gaveta na saída 'Drawer' da impressora (RJ11/RJ12) — não no computador. (2) AUGE: Configurações → Periféricos → Gaveta → marque 'Abrir automaticamente ao finalizar venda'. (3) Teste manual: Caixa → Abrir Gaveta. (4) Se não abre manualmente: problema no cabo RJ11 — teste com cabo novo. (5) Gaveta travada com chave: use a chave manual que acompanha o produto.",
    tags: ["gaveta","drawer","rj11","impressora","abrir automaticamente","caixa","fechadura"],
  },
  {
    categoria: "hardware",
    cliente: "Armazém do Galpão",
    resumo_problema: "Coletor de dados não sincronizando — Wi-Fi instável no galpão",
    causa: "Obstáculos metálicos atenuando sinal Wi-Fi no ambiente industrial",
    texto_original: "Coletor de dados não sincronizando com o sistema. Wi-Fi instável no galpão.",
    solucao: "Wi-Fi instável em galpão industrial: (1) Obstáculos metálicos atenuam muito o sinal. (2) Instale Access Points adicionais (um a cada 20-30m). (3) Configure o coletor para o SSID com maior sinal. (4) Use banda 2.4GHz (maior alcance) ao invés de 5GHz. (5) Solução offline: coleta sem Wi-Fi + sincronização por cabo USB na base. (6) Malha Wi-Fi Mesh para cobertura uniforme.",
    tags: ["coletor","wifi","galpao","metal","access point","2ghz","sincronizacao","datalogic"],
  },
  {
    categoria: "hardware",
    cliente: "Logística Express",
    resumo_problema: "Impressora Zebra GK420d não imprime etiqueta — erro de calibração",
    causa: "Zebra não calibrada para o tamanho/tipo de etiqueta instalada",
    texto_original: "Impressora Zebra GK420d não imprime etiqueta. Aparece erro de calibração.",
    solucao: "Zebra GK420d calibração: (1) Desligue a impressora. (2) Segure botão FEED, ligue, continue segurando até 2 piscadas. (3) Imprimirá etiquetas em branco (calibrando) e depois 1 preta (fim). (4) No Zebra Designer: configure o tamanho correto da etiqueta. (5) Ao trocar tipo de etiqueta (rolo/fanfold): recalibre. (6) Relatório de configurações: segure FEED ao ligar até 1 piscada.",
    tags: ["zebra","gk420d","calibracao","etiqueta","feed","driver zdesigner","zebra designer"],
  },
  {
    categoria: "hardware",
    cliente: "Loja Eletrônicos Plus",
    resumo_problema: "Touchscreen de caixa descalibrado — toque em lugar errado da tela",
    causa: "Tela touch com calibração desajustada por driver, desgaste ou atualização do sistema",
    texto_original: "Touchscreen da tela de caixa não está respondendo corretamente. Está descalibrado.",
    solucao: "Touchscreen descalibrado: (1) Windows: Painel de Controle → Configurações de Tablet PC → Calibrar. (2) Para telas com driver específico (EloTouch, Iiyama): use o software do fabricante. (3) Toque invertido (canto errado): verifique orientação no gerenciador de dispositivos. (4) Sujeira/umidade interfere: limpe com pano seco. (5) Área específica sem resposta: defeito físico — teste com mouse para confirmar.",
    tags: ["touchscreen","calibrar","touch","elouch","descalibrado","orientacao","tela caixa"],
  },
  // ──────────────── INTEGRAÇÃO ────────────────
  {
    categoria: "integracao",
    cliente: "Mega Store Online",
    resumo_problema: "Integração Mercado Livre — pedidos não sincronizando",
    causa: "Token de acesso ML expirado (dura 6 horas) ou app sem permissão no ML Developers",
    texto_original: "Integração com Mercado Livre pedidos não sincronizando. Sem novos pedidos no ERP.",
    solucao: "ML pedidos sem sync: (1) Configurações → Integrações → Mercado Livre → Token — se expirado, clique Renovar Token. (2) Confirme app_id e secret_key. (3) Log de erros: Hub → Integrações → Log → filtre 'mercadolivre'. (4) Erro 403: refaça a autorização no ML Developers. (5) Limite de 2000 req/hora — se exceder, aguarde 1h.",
    tags: ["mercado livre","token","oauth","403","sincronizacao","pedidos","ml developers"],
  },
  {
    categoria: "integracao",
    cliente: "E-Shop Fashion",
    resumo_problema: "Estoque não atualiza no Shopify após venda no ERP",
    causa: "SKU do Shopify não mapeado no produto AUGE ou webhook de saída de estoque não configurado",
    texto_original: "Estoque não está sendo atualizado no Shopify após venda no ERP AUGE.",
    solucao: "Shopify sem atualização de estoque: (1) Verifique webhook 'saída de estoque': Hub → Webhooks → Saída de Estoque → Shopify. (2) Produto precisa ter SKU Shopify: Cadastro → Produtos → aba Integração → SKU Shopify. (3) Forçar sync: Hub → Integrações → Shopify → Forçar Sincronização de Estoque. (4) Log: Hub → Log → filtre 'shopify' + 'estoque'. (5) Shopify tem latência de até 5 minutos.",
    tags: ["shopify","estoque","sku","webhook","sincronizar","inventory","5 minutos"],
  },
  {
    categoria: "integracao",
    cliente: "Automação Digital",
    resumo_problema: "Webhook n8n retorna 404 — não recebe eventos do AUGE",
    causa: "Workflow n8n desativado, URL de teste ao invés de produção, ou n8n em localhost não acessível",
    texto_original: "Webhook do n8n não recebe eventos do AUGE. Retorna 404 no endpoint.",
    solucao: "n8n webhook 404: (1) Verifique workflow ATIVO no n8n (botão verde 'Active'). (2) Use a URL de produção do webhook (não a de teste). (3) Se n8n em localhost: AUGE não consegue alcançar — use ngrok ou instale n8n em servidor público. (4) Firewall: porta 5678 liberada. (5) Teste manual: Hub → Webhooks → Testar Envio.",
    tags: ["n8n","webhook","404","workflow","localhost","ngrok","eventos","automacao"],
  },
  {
    categoria: "integracao",
    cliente: "Integra Sistemas",
    resumo_problema: "Bling retornando erro de autenticação 401 na integração",
    causa: "API Bling v3 usa OAuth2 com token expirável, ou plano sem acesso à API",
    texto_original: "Integração com Bling retornando erro de autenticação 401.",
    solucao: "Bling 401: (1) API Bling v3 usa OAuth2 — token expira. Bling → Configurações de API → gere novo token. (2) AUGE: Configurações → Integrações → Bling → atualize o API Token. (3) Plano gratuito não tem API — verifique o plano. (4) Migração v2→v3: autenticação mudou completamente, refaça a configuração. (5) Confirme permissões de API do usuário Bling.",
    tags: ["bling","401","oauth2","token","api v3","autenticacao","plano"],
  },
  {
    categoria: "integracao",
    cliente: "Loja Virtual Top",
    resumo_problema: "NF-e não emite automaticamente após venda no e-commerce",
    causa: "Gatilho de emissão automática não configurado, produto sem NCM ou cliente sem CPF/CNPJ",
    texto_original: "NF-e não está sendo emitida automaticamente após venda no e-commerce.",
    solucao: "NF-e automática pós-venda: (1) Hub → Automações → ao confirmar pedido → emitir NF-e. (2) Produto precisa de NCM, CFOP e tributação. (3) Cliente precisa de CPF/CNPJ. (4) Log: Hub → Log → filtre 'nfe_automatica'. Erros comuns: NCM ausente, CPF inválido, CFOP errado. (5) Teste emitindo manualmente um pedido para identificar o erro exato.",
    tags: ["nfe automatica","ecommerce","ncm","cpf","gatilho","automacao","pedido"],
  },
  {
    categoria: "integracao",
    cliente: "Tecno Import",
    resumo_problema: "API do AUGE com timeout — integração demora mais de 30 segundos",
    causa: "Servidor sobrecarregado, queries sem índice ou sincronização sendo feita item por item",
    texto_original: "API do AUGE retornando timeout. Integração demora mais de 30 segundos.",
    solucao: "API AUGE timeout: (1) Monitore CPU/RAM do servidor. (2) Banco lento: Administração → Banco de Dados → Analisar Performance. (3) Aumente timeout do cliente para 60-120s. (4) Implemente retry com backoff exponencial. (5) Use API em lotes (/api/products?limit=100&page=1) ao invés de item por item. (6) Sincronizações volumosas: programe para horários de menor carga.",
    tags: ["api","timeout","performance","batch","retry","cpu","banco de dados","otimizar"],
  },
  {
    categoria: "integracao",
    cliente: "Atacadão Digital",
    resumo_problema: "Como importar cadastro de produtos em massa via planilha",
    causa: "Usuário desconhece o processo de importação em massa do AUGE ERP",
    texto_original: "Como importar cadastro de produtos em massa via planilha no AUGE ERP?",
    solucao: "Importação em massa: (1) Cadastro → Produtos → Importar → baixe o modelo .xlsx. (2) Preencha: código, descrição, NCM, CFOP, grupo, unidade de medida, preço, custo. (3) Para grades: use aba 'Variações' da planilha. (4) Importe, pré-visualize e confirme. (5) Limite: até 5000 produtos por importação. (6) Produtos com erro ficam marcados — corrija na planilha e reimporte apenas esses.",
    tags: ["importar","planilha","massa","xlsx","ncm","grade","modelo","produto"],
  },
  // ──────────────── CENÁRIOS GERAIS / MULTI-DOMÍNIO ────────────────
  {
    categoria: "pdv",
    cliente: "Rede Varejo Total",
    resumo_problema: "Sistema AUGE ERP lento para carregar telas",
    causa: "Servidor com recursos insuficientes, banco sem VACUUM, antivírus escaneando em tempo real ou logs volumosos",
    texto_original: "Sistema lento. AUGE ERP demorando para carregar as telas.",
    solucao: "AUGE lento: (1) Servidor: mínimo 8GB RAM + SSD. (2) Banco: Administração → Banco de Dados → Manutenção → execute VACUUM ANALYZE. (3) Antivírus: adicione exceção para a pasta de instalação do AUGE. (4) Logs: Administração → Logs → Limpar logs anteriores a X meses. (5) Relatórios lentos: aplique filtro de data e verifique se faltam índices.",
    tags: ["lento","performance","vacuum","banco de dados","antivirus","logs","ram","ssd"],
  },
  {
    categoria: "pdv",
    cliente: "Mercado Express",
    resumo_problema: "Backup automático do sistema não está sendo gerado",
    causa: "Tarefa agendada inativa, HD externo desconectado ou destino sem espaço",
    texto_original: "Backup do sistema não está sendo gerado automaticamente.",
    solucao: "Backup automático: (1) Windows → Agendador de Tarefas → procure 'AugeBackup' → verifique se ativo. (2) Confirme o caminho de destino — se HD externo, verifique conexão. (3) Espaço em disco no destino. (4) Configure: Administração → Backup → Agendamento → horário 00:00-01:00. (5) Faça backup manual para testar. (6) Nuvem: configure destino para pasta sincronizada OneDrive/Google Drive.",
    tags: ["backup","automatico","agendamento","hd externo","espaco disco","onedrive","nuvem"],
  },
  {
    categoria: "pdv",
    cliente: "Ótica Boa Vista",
    resumo_problema: "Promoção de preço não aplicada corretamente no caixa",
    causa: "Promoção desativada, filial não vinculada, ou produtos não sincronizados no PDV",
    texto_original: "Promoção de preço não está sendo aplicada corretamente no caixa.",
    solucao: "Promoção não aplica: (1) Comercial → Promoções → verifique status, data início/fim e horário. (2) Produto incluso na promoção (por grupo/categoria/produto). (3) Filial vinculada à promoção. (4) Sincronize: Caixa → Sincronizar → Promoções. (5) Promoção 'leve 3 pague 2': só aplica ao atingir a quantidade. (6) Tabela especial: Cadastro → Clientes → Tabela de Preço vinculada.",
    tags: ["promocao","desconto","tabela preco","sincronizar","filial","grupo produto","caixa"],
  },
  {
    categoria: "pdv",
    cliente: "Loja de Informática Tech",
    resumo_problema: "Relatório de vendas com valor diferente do fluxo de caixa",
    causa: "Relatório de vendas usa data do documento; fluxo de caixa usa data de recebimento — diferença em vendas a prazo",
    texto_original: "Relatório de vendas mostrando valor diferente do fluxo de caixa do mesmo período.",
    solucao: "Divergência vendas × caixa: (1) Relatório de vendas: data do documento. Fluxo de caixa: data de recebimento. Venda a prazo aparece em datas diferentes. (2) Devoluções podem impactar de forma diferente. (3) Descontos: confirme se ambos usam bruto ou líquido. (4) Crediário: só entra no caixa quando pago. (5) Use Relatórios → Conciliação para cruzar os dois relatórios.",
    tags: ["relatorio vendas","fluxo caixa","divergencia","data documento","recebimento","crediario","conciliacao"],
  },
  {
    categoria: "integracao",
    cliente: "Grupo Empresarial Sul",
    resumo_problema: "Como configurar multi-empresa no AUGE ERP",
    causa: "Usuário nunca configurou múltiplas empresas e não sabe como proceder",
    texto_original: "Como configurar multi-empresa no AUGE ERP? Tenho 2 CNPJs para gerenciar.",
    solucao: "Multi-empresa: (1) Verifique se a licença inclui múltiplas empresas. (2) Administração → Empresas → Nova Empresa → preencha CNPJ, razão social, IE, regime tributário. (3) Certificado digital por empresa (cada CNPJ tem o seu). (4) Usuários: Administração → Usuários → vincule as empresas permitidas. (5) Relatórios consolidados: Relatórios → Gerenciais → Consolidado por Empresa. (6) Estoque e financeiro são separados por CNPJ.",
    tags: ["multi-empresa","cnpj","certificado","licenca","usuario","relatorio consolidado","filial"],
  },
  {
    categoria: "fiscal",
    cliente: "Varejo São Paulo",
    resumo_problema: "Como recuperar dados de nota fiscal cancelada indevidamente",
    causa: "Cancelamento de NF-e na SEFAZ é irreversível — precisa reemitir nova nota",
    texto_original: "Nota fiscal cancelada indevidamente. Como recuperar os dados e reemitir?",
    solucao: "NF-e cancelada indevidamente: (1) Cancelamento na SEFAZ é irreversível. (2) Para reemitir: Fiscal → NF-e → Histórico → consulte os dados da nota cancelada. (3) Nova NF-e → copie os dados → emita (novo número gerado automaticamente). (4) Inutilize o número cancelado se necessário: Fiscal → NF-e → Inutilizar. (5) Informe o comprador o novo número. (6) Guarde o XML original para auditoria.",
    tags: ["cancelamento","nfe","inutilizar","historico","reemitir","novo numero","xml"],
  },
  {
    categoria: "pdv",
    cliente: "Calçados Pé Leve",
    resumo_problema: "Comissão de vendedores calculada incorretamente",
    causa: "Regra de comissão ou percentual de comissão incorreto no cadastro do vendedor",
    texto_original: "Comissão de vendedores não está sendo calculada corretamente no sistema.",
    solucao: "Comissão incorreta: (1) Configurações → Comissões → verifique a regra (% bruta, líquida, lucro). (2) Vendedor vinculado à regra correta: Cadastro → Funcionários → Comissão. (3) Por produto: Cadastro → Produtos → % de comissão específico. (4) Relatório: Relatórios → Vendas → Comissão por Vendedor. (5) Devoluções: configure 'Descontar comissão em devoluções'. (6) Comissões calculam apenas em vendas 'Finalizado'.",
    tags: ["comissao","vendedor","percentual","regra comissao","devolucao","relatorio","finalizado"],
  },
  {
    categoria: "integracao",
    cliente: "Varejo Digital BR",
    resumo_problema: "Sincronização de preços com e-commerce não atualizando",
    causa: "Tabela de preços não mapeada para o e-commerce ou produto sem SKU do canal",
    texto_original: "Sincronização de preços com e-commerce não está atualizando os preços no site.",
    solucao: "Preços sem sync: (1) Hub → Integrações → E-commerce → Tabela de Preços — confirme qual tabela está mapeada. (2) Hub → Agendamentos → Sincronizar Preços — verifique se está ativo. (3) Forçar sync: Hub → Integrações → Forçar Sync de Preços. (4) Produto precisa de SKU do e-commerce. (5) Preço promocional: use campo 'Preço Promocional' separado. (6) Log: Hub → Log → filtre 'sync_preco'.",
    tags: ["sync preco","ecommerce","tabela preco","sku","promocional","hub","agendamento"],
  },
]

async function seed() {
  const client = await pool.connect()
  try {
    // Remove dados anteriores do canal v3
    await client.query("DELETE FROM atendimentos WHERE canal = 'seed_erp_v3' AND tenant_id = 'auge'")
    console.log("🗑  Registros v3 anteriores removidos")

    let inserted = 0
    for (const c of CASES) {
      await client.query(
        `INSERT INTO atendimentos
          (tenant_id, canal, cliente, tecnico, resumo_problema, causa, solucao,
           categoria, tags, texto_original, resolution_confirmed, resolution_source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          "auge",
          "seed_erp_v3",
          c.cliente,
          "Suporte Auge",
          c.resumo_problema,
          c.causa || "",
          c.solucao,
          c.categoria,
          c.tags,
          c.texto_original,
          true,
          "treinamento_erp_v3",
        ]
      )
      inserted++
      if (inserted % 10 === 0) process.stdout.write(`  ${inserted}...`)
    }

    console.log(`\n✅ ${inserted} casos inseridos`)

    // Distribuição por categoria
    const { rows } = await client.query(
      "SELECT categoria, COUNT(*) FROM atendimentos WHERE canal='seed_erp_v3' GROUP BY categoria ORDER BY COUNT(*) DESC"
    )
    console.log("\n📊 Distribuição v3:")
    rows.forEach(r => console.log(`   ${r.categoria.padEnd(14)} ${r.count}`))

    // Total geral
    const { rows: total } = await client.query(
      "SELECT COUNT(*) FROM atendimentos WHERE tenant_id='auge'"
    )
    console.log(`\n📚 Total na base: ${total[0].count} atendimentos`)
  } finally {
    client.release()
    await pool.end()
  }
}

seed().catch(e => { console.error("❌", e.message); process.exit(1) })

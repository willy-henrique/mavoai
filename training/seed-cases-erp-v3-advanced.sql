-- =====================================================================
-- TREINAMENTO AVANÇADO MAVO.AI — ERP AUGE
-- 80 casos especializados: rejeições SEFAZ, TEF avançado, certificados,
-- contingência, custo médio, hardware específico, integrações
-- canal: seed_erp_v3 | tenant_id: auge
-- =====================================================================

BEGIN;

-- ─────────────────────────────────────────────────
-- DOMÍNIO FISCAL — Rejeições SEFAZ específicas
-- ─────────────────────────────────────────────────

INSERT INTO atendimentos (tenant_id, canal, cliente_id, mensagem, solucao, categoria, resolvido) VALUES
('auge','seed_erp_v3','cli_f01','NF-e rejeitada código 539 SEFAZ. CSOSN inválido para o regime tributário.',
'Rejeição 539 indica CSOSN incompatível com o regime. Acesse Cadastro > Produtos > aba Fiscal e verifique o campo CSOSN: para Simples Nacional use 400 (tributado pelo Simples), 500 (ICMS cobrado por substituição), ou 102 (tributado sem permissão de crédito). Para Lucro Presumido/Real use CST, não CSOSN. Corrija o código e reemita.','fiscal',true),

('auge','seed_erp_v3','cli_f02','Rejeição 999 SEFAZ erro genérico. NF-e não autorizada.',
'Rejeição 999 é erro interno da SEFAZ — não é problema do sistema. Aguarde 15-20 minutos e reemita. Se persistir: verifique internet, data/hora do servidor, e acesse o portal da SEFAZ estadual para checar se há instabilidade. Normalmente resolve sozinho em até 1 hora.','fiscal',true),

('auge','seed_erp_v3','cli_f03','Rejeição 165 NF-e. Rejeição: Falha no schema XML da NF-e.',
'Schema XML inválido (165): Acesse Fiscal > Configurações > Parâmetros NF-e e verifique versão do leiaute (deve ser 4.00). Confirme se os campos obrigatórios estão preenchidos: CNPJ emitente, IE, endereço completo, NCM de todos os produtos. Se recente, pode ser atualização da SEFAZ — verifique atualizações do AUGE ERP no painel de suporte.','fiscal',true),

('auge','seed_erp_v3','cli_f04','Código de rejeição 206 SEFAZ. IE do emitente inválida.',
'Rejeição 206 — IE inválida: Acesse Cadastro > Empresa e confirme a Inscrição Estadual exatamente como consta no cadastro da SEFAZ (sem pontos, traços ou zeros extras). Valide no site da SEFAZ estadual. Se a empresa tem IE isenta, marque o campo "IE Isento" e coloque "ISENTO" no campo. Salve e reemita.','fiscal',true),

('auge','seed_erp_v3','cli_f05','NF-e contingência offline não autoriza após restaurar conexão.',
'Para autorizar NF-e emitidas em contingência: Acesse Fiscal > NF-e > Consultar/Transmitir Lote. Selecione as notas com status "Contingência" e clique em Transmitir. Prazo: até 24 horas após emissão em contingência (formulário de segurança). Se passar de 24h, as notas devem ser canceladas e reemitidas normalmente. Verifique no Sefaz se o CNPJ está ativo.','fiscal',true),

('auge','seed_erp_v3','cli_f06','DANFE não imprime. Impressora de cupom não aceita o DANFE em PDF.',
'DANFE requer impressora A4. Para NFC-e (cupom 80mm), o DANFE é substituído pelo XML + QR Code do cupom. Para NF-e (modelo 55), configure: Fiscal > Configurações > DANFE > selecione impressora A4 padrão. Se quiser DANFE simplificado, ative a opção "DANFE em modo retrato/simplificado". Instale o Foxit Reader ou Adobe como leitor PDF padrão se não abrir automaticamente.','fiscal',true),

('auge','seed_erp_v3','cli_f07','Carta de correção CC-e não sendo aceita pela SEFAZ.',
'CC-e só corrige campos específicos (natureza da operação, data de saída/entrada, código do produto, dados do transportador, dados adicionais). NÃO corrige: valor, CFOP principal, dados do emitente/destinatário, quantidade. Se o campo que precisa corrigir não é permitido, cancele a NF-e e reemita. Para emitir CC-e: Fiscal > NF-e > Emitir Carta de Correção > selecione a nota > preencha correção com mínimo 15 caracteres.','fiscal',true),

('auge','seed_erp_v3','cli_f08','MDF-e rejeitado código 561. MDF-e Encerrado Anteriormente.',
'Rejeição 561 no MDF-e: o documento já foi encerrado. Não é possível reencerrar. Para verificar o status: Fiscal > MDF-e > Consultar. O MDF-e encerrado é o estado final correto. Se precisar de novo MDF-e para a mesma carga, emita um novo documento. Para gerar: Fiscal > MDF-e > Novo > preencha veículo, motorista, UF percurso e vincule as NF-e do carregamento.','fiscal',true),

('auge','seed_erp_v3','cli_f09','NF-e com CFOP errado já autorizada. Como corrigir?',
'CFOP é um dos campos que NÃO pode ser corrigido por CC-e. Para corrigir: (1) Cancele a NF-e original — prazo de 24h após autorização (ou 168h para NF-e com destaque ICMS-ST em alguns estados). (2) Reemita com CFOP correto. Se passou do prazo de cancelamento, emita NF-e de devolução (CFOP 2xxx para entrada) e reemita a saída correta. Consulte seu contador sobre o procedimento correto para o estado.','fiscal',true),

('auge','seed_erp_v3','cli_f10','Certificado digital A1 vencido. Como renovar e instalar no sistema?',
'Para renovar certificado A1: (1) Acesse seu provedor (Certisign, Serasa, Valid) e solicite renovação com seu CPF/CNPJ. (2) Baixe o arquivo .pfx gerado. (3) No Windows: clique duplo no .pfx > Loja "Usuário atual" > Pessoal. (4) No AUGE ERP: Fiscal > Configurações > Certificado Digital > Selecionar arquivo .pfx > informe a senha. (5) Teste emitindo uma NF-e de teste (ambiente homologação). Para A3 (token/smartcard): instale o driver do token antes de configurar no sistema.','fiscal',true),

-- ─────────────────────────────────────────────────
-- DOMÍNIO TEF — Problemas avançados
-- ─────────────────────────────────────────────────

('auge','seed_erp_v3','cli_t01','SiTEF não inicializa. Erro "Não foi possível conectar ao servidor SiTEF".',
'Para resolver falha de inicialização do SiTEF: (1) Abra services.msc e verifique se o serviço "CliSiTef" está rodando — se parado, inicie. (2) Verifique o arquivo C:\SiTef\ini\CliSiTef.ini — confirme IP e porta do servidor SiTEF (padrão: porta 2000). (3) Desative o firewall temporariamente e teste. (4) Se servidor SiTEF estiver em outra máquina, confirme que o IP está correto e pingável. (5) Reinicie o serviço SiTEF no servidor.','tef',true),

('auge','seed_erp_v3','cli_t02','Transação TEF pendente. Cartão passou mas não confirmou no sistema.',
'Transação pendente é crítica — não repita o pagamento! (1) No AUGE ERP: Caixa > TEF > Consultar Transações Pendentes. (2) Se aparecer a transação: confirme se ela foi aprovada na adquirente (ligue para o banco ou Stone/Cielo). (3) Se aprovada: confirme manualmente no sistema. (4) Se não aprovada: desfaça a transação. Para estorno manual: acesse Caixa > TEF > Estorno e informe o NSU. Guarde o comprovante do PinPad como evidência.','tef',true),

('auge','seed_erp_v3','cli_t03','PinPad Ingenico não é reconhecido pelo Windows. Não aparece no gerenciador de dispositivos.',
'PinPad não reconhecido: (1) Troque o cabo USB (cabo defeituoso é causa frequente). (2) Teste em outra porta USB (evite hubs USB). (3) Baixe e instale o driver específico do modelo Ingenico no site do fabricante. (4) No Gerenciador de Dispositivos: desinstale o dispositivo com ponto de exclamação e reinstale. (5) Se USB Serial: configure porta COM correta no CliSiTef.ini (ex: COM3). (6) Reinicie o computador após instalar o driver.','tef',true),

('auge','seed_erp_v3','cli_t04','Voucher Alelo não passa no TEF. Erro de adquirente.',
'Voucher Alelo/Sodexo/VR requer configuração específica: (1) Confirme que a finalizadora TEF "Vale Alimentação/Refeição" está ativa no AUGE: Configurações > TEF > Finalizadoras. (2) Verifique no CliSiTef.ini se a adquirente Alelo está habilitada (Rede ou Cielo costumam processar Alelo). (3) Teste com outro cartão da mesma bandeira. (4) Se erro "bandeira não habilitada": acione a credenciadora para habilitar vouchers no seu estabelecimento (às vezes requer contrato separado).','tef',true),

('auge','seed_erp_v3','cli_t05','TEF apresenta erro de duplicidade. Transação já realizada.',
'Duplicidade no TEF indica que a transação foi processada mas o sistema não registrou. (1) Consulte o extrato da adquirente (Stone App, Cielo Manager, etc.) para verificar se a venda existe. (2) Se existe: NÃO processe novamente. Registre manualmente no AUGE a venda com pagamento TEF. (3) Se não existe: processo com segurança. (4) Para evitar duplicidade: aguarde sempre o OK do pinpad antes de fechar o caixa, nunca force fechar o AUGE durante transação TEF.','tef',true),

('auge','seed_erp_v3','cli_t06','GP (Gerenciador de Pagamentos) versão antiga. Como atualizar?',
'Para atualizar o GP/SiTEF: (1) Feche todos os PDVs e o sistema AUGE. (2) Faça backup da pasta C:\SiTef\ini (guarda as configurações). (3) Desinstale a versão atual pelo Painel de Controle > Programas. (4) Instale a nova versão baixada do portal da Software Express. (5) Copie o backup do ini para restaurar configurações. (6) Teste uma transação em modo debug. Recomendado: faça em horário de baixo movimento. A versão mínima recomendada é a 8.0.','tef',true),

('auge','seed_erp_v3','cli_t07','Erro no TEF: "Estabelecimento não habilitado para esta operação".',
'Este erro vem da adquirente, não do sistema. Causas: (1) Modalidade de pagamento não contratada (ex: parcelado sem juros, débito). (2) Bandeira não habilitada (ex: Amex, Hipercard). (3) Terminal não ativo na adquirente. Solução: ligue para o suporte da sua adquirente (Stone: 4003-5750 / Cielo: 4002-5472) e solicite habilitação. Informe o número do estabelecimento (EC) e o que precisa habilitar. Pode levar até 24h para refletir.','tef',true),

('auge','seed_erp_v3','cli_t08','Reimpressão de comprovante TEF não funciona.',
'Para reimprimir comprovante TEF: Acesse Caixa > Histórico de Vendas > localize a venda > clique em Reimprimir Comprovante TEF. Se não aparecer a opção: (1) Verifique se a impressora não-fiscal (A4 ou cupom) está configurada para comprovante. (2) O AUGE guarda comprovante apenas da última transação por padrão — para transações antigas, o comprovante deve ser solicitado diretamente à adquirente pelo portal online (Stone Dashboard, Cielo Backoffice).','tef',true),

-- ─────────────────────────────────────────────────
-- DOMÍNIO PDV — Frente de caixa avançado
-- ─────────────────────────────────────────────────

('auge','seed_erp_v3','cli_p01','SAT fiscal não comunica. Erro "SAT não responde" ao emitir cupom.',
'SAT sem comunicação: (1) Verifique o LED do SAT: verde fixo = OK, piscando = ativando, vermelho = erro. (2) Teste o SAT pelo software de ativação do fabricante (ex: Dimep SATActivador, Elgin SAT Toolbox). (3) Confirme que o código de ativação no AUGE bate com o do fabricante: Configurações > SAT > Código de Ativação. (4) Verifique se o SAT está na porta USB correta (evite hubs). (5) Se erro de comunicação persistir, reinicie o SAT (retire da tomada por 30s). (6) SAT precisa de ativação inicial pelo portal da SEFAZ + fabricante.','pdv',true),

('auge','seed_erp_v3','cli_p02','Caixa não abre após atualização do sistema.',
'Caixa travado após atualização: (1) Verifique o log de erros: Administração > Logs > Erros recentes. (2) Reinicie o serviço do Concentrador no servidor. (3) Se aparecer erro de banco: execute Administração > Manutenção > Verificar Estrutura do Banco. (4) Confirme que a versão do cliente PDV é compatível com a versão do servidor atualizado (devem ser iguais). (5) Limpe o cache local: pasta C:\AUGE\cache (ou similar) — apague arquivos .tmp. (6) Reinstale o cliente PDV se necessário.','pdv',true),

('auge','seed_erp_v3','cli_p03','Sangria bloqueada. Mensagem "usuário sem permissão para sangria".',
'Para liberar permissão de sangria: Acesse Administração > Usuários > selecione o usuário > Permissões > marque "Realizar Sangria". Se o operador de caixa não deve ter essa permissão, o supervisor deve fazer a sangria com login próprio: no caixa, clique em Sangria > o sistema pedirá senha do supervisor. Configure valor máximo de sangria em Configurações > Caixa > Limite de Sangria para controle financeiro.','pdv',true),

('auge','seed_erp_v3','cli_p04','Produto não localizado no PDV pelo leitor de código de barras.',
'Produto não encontrado pelo leitor: (1) Confirme que o EAN/código de barras está cadastrado: Cadastro > Produtos > pesquise o produto > aba Códigos de Barras. (2) Se o EAN está cadastrado mas não localiza: verifique se o produto está ativo e se pertence à loja/filial correta. (3) Teste digitar o código manualmente — se funcionar, o leitor pode estar com problema de leitura (troque pilha/bateria ou limpe a lente). (4) Código EAN-14 ou GTIN diferente: cadastre a variante na aba de códigos. (5) Após cadastrar, sincronize o PDV: Caixa > Sincronizar Produtos.','pdv',true),

('auge','seed_erp_v3','cli_p05','Desconto acima do limite não permitido pelo supervisor.',
'Para aumentar o limite de desconto: Configurações > PDV > Limite de Desconto por Operador. Para desconto acima do limite pontual: o supervisor deve aprovar no PDV com senha (aparece popup automático quando ultrapassa o limite). Para liberação permanente de um operador específico: Administração > Usuários > selecione > edite o percentual máximo de desconto. Recomendado: mantenha limite conservador (5-10%) e use aprovação de supervisor para exceções.','pdv',true),

('auge','seed_erp_v3','cli_p06','Fechamento de caixa com divergência. Diferença entre físico e sistema.',
'Divergência no fechamento: (1) Imprima o relatório de movimentações do caixa: Caixa > Relatórios > Movimentações Detalhadas. (2) Compare cada operação: sangrias, suprimentos, vendas, estornos. (3) Verifique se há vendas canceladas que não geraram retorno ao caixa. (4) Confira operações de troco (troco em dinheiro vs troco digital). (5) Se o caixa foi aberto com valor incorreto no suprimento inicial, a diferença começa aí. O AUGE registra todas as operações — busque o ponto da divergência no log. Não feche com divergência sem identificar a causa.','pdv',true),

('auge','seed_erp_v3','cli_p07','Crediário: cliente sem limite disponível mas tem limite cadastrado.',
'Crediário sem limite disponível: (1) Verifique o saldo devedor do cliente: Financeiro > Crediário > Contas a Receber > pesquise o cliente. (2) O limite é reduzido pelo saldo das parcelas em aberto — se o cliente tem R$500 de limite e R$400 devendo, só tem R$100 disponível. (3) Se o saldo devedor está zerado mas ainda bloqueia: verifique se o limite está ativo em Cadastro > Clientes > Crediário > Limite. (4) Para aumentar o limite: edite o cadastro do cliente com autorização de gerente. (5) Parcelas vencidas também podem bloquear novas vendas — configure em Configurações > Crediário > Bloquear com parcelas vencidas.','pdv',true),

('auge','seed_erp_v3','cli_p08','PDV offline. Caixa funcionando em modo contingência sem conexão com servidor.',
'PDV em contingência offline: (1) Verifique conexão de rede do caixa (cabo, Wi-Fi, IP). (2) Confirme se o servidor/concentrador está ligado e acessível. (3) O AUGE PDV em contingência registra vendas localmente — ao reconectar, sincroniza automaticamente. (4) Enquanto offline, NF-e/SAT emite em contingência (FS-IA = formulário de segurança). (5) Após reconexão: Caixa > Sincronizar com Servidor para enviar vendas offline. (6) Se timeout frequente, verifique qualidade da rede e considere cabo dedicado para o servidor.','pdv',true),

-- ─────────────────────────────────────────────────
-- DOMÍNIO ESTOQUE — Avançado
-- ─────────────────────────────────────────────────

('auge','seed_erp_v3','cli_e01','Inventário iniciado e agora não consigo lançar entradas ou saídas.',
'Inventário em andamento bloqueia movimentações por design — isso é correto. (1) Para lançar movimentações urgentes: finalize ou cancele o inventário primeiro: Estoque > Inventário > Finalizar/Cancelar. (2) Para inventário parcial (por departamento): configure em Estoque > Inventário > Inventário Parcial — só bloqueia os produtos do departamento selecionado. (3) Planeje inventários para horários de baixo movimento (início/fim de expediente, dia de menor venda). Após finalizar, aplique as diferenças encontradas.','estoque',true),

('auge','seed_erp_v3','cli_e02','Grade de produto (cor/tamanho) com saldo errado. Quantidade divergindo.',
'Grade com saldo divergente: (1) Verifique o histórico de movimentações da grade: Estoque > Produtos > selecione o produto > Histórico por Grade. (2) Identifique se o problema é em entrada (nota de entrada) ou saída (venda). (3) Possível causa: importação de XML sem mapear corretamente as variantes da grade. (4) Para corrigir pontualmente: Estoque > Ajuste de Estoque > selecione produto + variante + corrija quantidade com motivo "Correção de grade". (5) Para evitar: configure mapeamento de grades na importação de XML em Compras > Parâmetros > Importar Grade.','estoque',true),

('auge','seed_erp_v3','cli_e03','Romaneio de entrega com produto a mais ou a menos que a nota fiscal.',
'Divergência entre romaneio e nota: (1) O AUGE permite conferência item a item no recebimento: Compras > Receber Pedido > Conferir Itens — marque cada item conferido. (2) Se produto a mais: crie uma entrada de ajuste ou devolução parcial ao fornecedor. (3) Se produto a menos: registre recebimento parcial e aguarde complemento, ou registre quebra/avaria. (4) Para rastreabilidade: use o campo "Observações do Recebimento". (5) Configure alerta de divergência em Compras > Parâmetros > Tolerância de Recebimento (%).','estoque',true),

('auge','seed_erp_v3','cli_e04','Produto com lote e validade: como controlar no sistema?',
'Controle de lote/validade no AUGE: (1) Habilite o controle: Cadastro > Produtos > aba Controle > marque "Controla Lote" e/ou "Controla Validade". (2) Na entrada de estoque/nota de entrada: informe o lote e data de validade por produto. (3) Na saída (venda/requisição): o sistema sugere FEFO (primeiro a vencer, primeiro a sair) se configurado. (4) Relatório de vencimento próximo: Estoque > Relatórios > Produtos por Validade — configure alerta de X dias antes. (5) Produtos vencidos: bloqueie automaticamente em Configurações > Estoque > Bloquear venda de produto vencido.','estoque',true),

('auge','seed_erp_v3','cli_e05','Transferência entre filiais com custo diferente em cada filial.',
'Transferência de estoque entre filiais: o custo médio pode divergir entre filiais. Isso é normal e esperado — cada filial calcula seu próprio custo médio. Para transferência: (1) Acesse Estoque > Transferência entre Filiais > informe filial origem/destino, produto e quantidade. (2) O custo transferido geralmente é o custo médio da filial origem. (3) Se quiser padronizar custo: use "Ajuste de Custo" na filial destino após a transferência. (4) Para relatório comparativo de custos entre filiais: Relatórios > Estoque > Custo por Filial.','estoque',true),

('auge','seed_erp_v3','cli_e06','XML de nota de entrada importado mas produtos não deram entrada no estoque.',
'NF-e importada sem entrada de estoque: (1) Verifique o Perfil de Movimento configurado na importação: deve ter a opção "Movimenta Estoque" marcada. (2) Acesse Compras > Importar XML > verifique o status da importação. (3) Se importação pendente: clique em Confirmar/Lançar para efetivar a entrada. (4) Em alguns fluxos, a importação do XML cria um pedido de compra que precisa ser confirmado separadamente: Compras > Pedidos > Confirmar. (5) Verifique se o CFOP da nota (ex: 1102, 1202, 2102) está configurado para movimentar estoque no AUGE.','estoque',true),

('auge','seed_erp_v3','cli_e07','Como fazer inventário rotativo (por categoria) sem parar as vendas?',
'Inventário rotativo no AUGE: (1) Acesse Estoque > Inventário > Novo Inventário > selecione tipo "Parcial por Categoria/Departamento". (2) Escolha as categorias a contar — somente esses produtos ficam bloqueados. (3) Imprima as fichas de contagem por setor. (4) Lance as contagens: Estoque > Inventário > Lançar Contagem. (5) Compare e ajuste as diferenças. (6) Finalize o inventário da categoria. (7) O restante dos produtos continua com movimentação normal. Recomendado: inventariar categorias de alto valor semanalmente.','estoque',true),

('auge','seed_erp_v3','cli_e08','Produto com variação (kit) com custo médio incorreto após venda.',
'Custo médio de kit/composição: (1) Kit explode os componentes na saída — o custo médio reflete o custo de cada componente. (2) Se o custo está incorreto: verifique o custo de cada componente em Cadastro > Produtos > componente > Custo. (3) Recalcule o custo do kit: Cadastro > Produtos > kit > Recalcular Custo de Composição. (4) Se vendeu abaixo do custo, o sistema pode não ajustar automaticamente — use Estoque > Ajuste de Custo para corrigir. (5) Para kits com proporções fracionárias: certifique que as unidades de medida e fatores de conversão estão corretos.','estoque',true),

-- ─────────────────────────────────────────────────
-- DOMÍNIO HARDWARE — Periféricos específicos
-- ─────────────────────────────────────────────────

('auge','seed_erp_v3','cli_h01','Balança Toledo não está pesando corretamente. Valores errados.',
'Balança Toledo com peso incorreto: (1) Verifique se a balança está nivelada (bolha de nível no centro). (2) Calibre: com a balança vazia, pressione TARE/ZERO para zerar. (3) No AUGE: Configurações > Periféricos > Balança > selecione o protocolo correto (Toledo 8217 ou Toledo Prix III são os mais comuns). (4) Teste a comunicação: Configurações > Balança > Testar Comunicação. (5) Se comunicação cai: verifique cabo RS-232 ou USB, porta COM configurada. (6) Para calibração de fábrica: entre em contato com Toledo para recalibração certificada (exigida anualmente pelo INMETRO para uso comercial).','hardware',true),

('auge','seed_erp_v3','cli_h02','Impressora Daruma FS700 não imprime após troca de papel.',
'Daruma FS700 após troca de papel: (1) Confirme que o papel foi inserido corretamente (lado liso para baixo na maioria dos modelos térmicos). (2) Feche a tampa completamente até ouvir o clique. (3) Pressione FEED para avançar o papel. (4) Se o papel avança mas não imprime (impressão em branco): o papel está instalado ao contrário — inverta-o. (5) Imprima uma página de auto-teste: desligue, pressione FEED, ligue mantendo pressionado — solta quando a impressão começar. (6) Se aparecer linha falhada: a cabeça de impressão pode precisar de limpeza (álcool isopropílico + cotonete).','hardware',true),

('auge','seed_erp_v3','cli_h03','Leitor de código de barras Honeywell lendo código errado ou com caracteres extras.',
'Leitor Honeywell com leitura incorreta: (1) Verifique o idioma do leitor (pode estar configurado para US-INTL ao invés de PT-BR) — configure pelo manual do modelo usando barcodes de configuração. (2) Caracteres extras (enters, tabs) podem ser sufixos configurados — imprima o barcode de configuração "Remove Suffix" do guia do usuário. (3) Código parcial: lente suja — limpe com pano macio. (4) EAN com dígito verificador incorreto: o cadastro do produto pode ter EAN errado — confira comparando com o rótulo físico. (5) Configure velocidade de leitura se estiver processando muito rápido.','hardware',true),

('auge','seed_erp_v3','cli_h04','Nobreak (UPS) descarregou. Computador desligando durante operação.',
'Nobreak com bateria fraca: (1) A bateria de gel tem vida útil de 2-4 anos — se mais antiga que isso, substitua. (2) Teste: desconecte da tomada com o equipamento ligado — se desligar imediatamente, bateria morta. (3) Enquanto aguarda troca: conecte o computador direto na tomada (sem proteção) em último caso. (4) Para adquirir bateria: leve a potência do nobreak (VA) e modelo ao distribuidor. Baterias comuns: 7Ah, 9Ah, 12Ah em 12V. (5) Para PDV crítico, considere nobreak com monitoramento USB configurado no Windows para desligamento seguro automático em queda de energia.','hardware',true),

('auge','seed_erp_v3','cli_h05','Gaveta de dinheiro não abre automaticamente ao finalizar venda.',
'Gaveta não abre automaticamente: (1) Verifique se a gaveta está conectada na saída "Drawer" da impressora (RJ11/RJ12) — não diretamente no computador. (2) No AUGE: Configurações > Periféricos > Gaveta > marque "Abrir automaticamente ao finalizar venda". (3) Se a impressora não suporta gaveta: alguns modelos têm porta auxiliar só para isso. (4) Teste manual: Caixa > Abrir Gaveta. (5) Se não abre manualmente: problema na gaveta ou no cabo RJ11 — teste com cabo novo. (6) Gaveta com fechadura mecânica travada: use a chave manual que vem junto.','hardware',true),

('auge','seed_erp_v3','cli_h06','Coletor de dados não sincronizando com o sistema. Wi-Fi instável no galpão.',
'Coletor com Wi-Fi instável em galpão: (1) Obstáculos metálicos (prateleiras, estrutura do galpão) atenuam muito o sinal Wi-Fi. (2) Soluções: instale Access Points adicionais no galpão (um a cada 20-30m), use repetidores Wi-Fi ou meshpoints. (3) Configure o coletor para o SSID com maior sinal: na maioria dos coletores Datalogic/Honeywell: Configurações > Wireless > Redes disponíveis. (4) Use banda 2.4GHz (maior alcance) ao invés de 5GHz para áreas industriais. (5) Se o problema persistir: considere solução de coleta offline (sincroniza quando volta à base) ou cabo de dados USB para sincronização periódica.','hardware',true),

('auge','seed_erp_v3','cli_h07','Impressora Zebra GK420d não imprime etiqueta. Erro de calibração.',
'Zebra GK420d sem calibração: (1) Calibre automaticamente: com a impressora desligada, pressione e segure o botão FEED, ligue, continue segurando até 2 piscadas. (2) A impressora imprimirá várias etiquetas em branco (calibrando) e depois 1 etiqueta preta (fim da calibração). (3) No Zebra Designer ou ZebraLink: configure o tamanho correto da etiqueta. (4) Se usar etiquetas em rolo contínuo vs fanfold: requer recalibração ao trocar o tipo. (5) Para erros de comunicação: confirme que o driver ZDesigner está instalado e a porta USB/Serial está correta. (6) Imprima relatório de configurações: segure FEED enquanto liga até 1 piscada.','hardware',true),

('auge','seed_erp_v3','cli_h08','Touchscreen da tela de caixa não está respondendo ou está descalibrado.',
'Touchscreen descalibrado no PDV: (1) Calibre via Windows: Painel de Controle > Configurações de Tablet PC > Calibrar (ou pesquise "calibrar tela" no Windows). (2) Para telas com driver específico (EloTouch, Iiyama): use o software do fabricante para calibrar (geralmente na barra de tarefas). (3) Se toque está invertido (canto errado): verifique orientação da tela no gerenciador de dispositivos. (4) Limpe a tela com pano seco — sujeira e umidade interferem no touch capacitivo. (5) Se o toque não responde em área específica: a tela pode ter defeito físico — teste com mouse para confirmar que é hardware, não software.','hardware',true),

-- ─────────────────────────────────────────────────
-- DOMÍNIO INTEGRAÇÃO — APIs e marketplaces
-- ─────────────────────────────────────────────────

('auge','seed_erp_v3','cli_i01','Integração com Mercado Livre: pedidos não sincronizando.',
'Pedidos ML não sincronizando: (1) Verifique o token de acesso: Configurações > Integrações > Mercado Livre > Token — se expirado (dura 6h), clique em Renovar Token ou refaça o login OAuth. (2) Verifique o app_id e secret_key estão corretos. (3) Confira se a loja ML está na mesma conta do token. (4) Veja o log de erros: Hub > Integrações > Log > filtre por "mercadolivre". (5) Se erro 403: o app pode ter perdido permissão — refaça a autorização no ML Developers. (6) Limite de requisições do ML: 2000 req/hora — se exceder, aguarde 1h.','integracao',true),

('auge','seed_erp_v3','cli_i02','Estoque não está sendo atualizado no Shopify após venda no ERP.',
'Estoque Shopify não atualiza: (1) Verifique se o webhook de "saída de estoque" está configurado: Hub > Webhooks > Saída de Estoque > Shopify. (2) Confirme que o produto tem o SKU do Shopify cadastrado no AUGE: Cadastro > Produtos > aba Integração > SKU Shopify. (3) Teste manualmente: Hub > Integrações > Shopify > Forçar Sincronização de Estoque. (4) Se SKU não mapeado, o estoque não sai. (5) Verifique o log: Hub > Log > filtre "shopify" + "estoque". (6) O Shopify tem latência de até 5 minutos para refletir atualizações de inventory.','integracao',true),

('auge','seed_erp_v3','cli_i03','Webhook do n8n não recebe eventos do AUGE. 404 no endpoint.',
'Webhook n8n com 404: (1) No n8n: verifique se o workflow está ativado (botão verde "Active" no topo). (2) Copie a URL de produção do webhook — não use a URL de teste. (3) No AUGE: Configurações > Webhooks > cole a URL correta do n8n + token. (4) Se n8n está em localhost: o AUGE não consegue alcançar — use ngrok ou instale n8n em servidor acessível. (5) Verifique firewall: porta 5678 do n8n deve estar liberada. (6) Teste manual: Hub > Webhooks > Testar Envio > verifique o retorno.','integracao',true),

('auge','seed_erp_v3','cli_i04','Integração com Bling retornando erro de autenticação 401.',
'Bling 401: (1) A API do Bling v3 usa OAuth2 — o token expira. Acesse Bling > Configurações de API > gere novo token. (2) No AUGE: Configurações > Integrações > Bling > atualize o API Token. (3) Verifique se o plano do Bling inclui API (plano gratuito não tem API). (4) Se migrou do Bling v2 para v3: a autenticação mudou completamente — refaça a configuração com o novo fluxo OAuth2. (5) Confirme que o usuário do Bling tem permissão para a API (Configurações > Usuários > Permissões API).','integracao',true),

('auge','seed_erp_v3','cli_i05','NF-e não está sendo emitida automaticamente após venda no e-commerce.',
'Emissão automática de NF-e pós-venda e-commerce: (1) Verifique o gatilho configurado: Hub > Automações > ao confirmar pedido > emitir NF-e. (2) Confirme que o produto tem NCM, CFOP e tributação configurados — NF-e não emite sem esses dados. (3) Verifique se o cliente do pedido tem CPF/CNPJ preenchido (obrigatório para NF-e). (4) Log de erros: Hub > Log > filtre "nfe_automatica". Erros comuns: produto sem NCM, cliente sem CPF, CFOP inválido para a operação. (5) Teste emitindo manualmente para um pedido específico para identificar o erro exato.','integracao',true),

('auge','seed_erp_v3','cli_i06','API do AUGE retornando timeout. Integração demora mais de 30s.',
'API AUGE com timeout: (1) Verifique a carga do servidor: acesse o servidor e monitore CPU/RAM/Disco. (2) Se banco de dados lento: otimize as queries — Administração > Banco de Dados > Analisar Performance. (3) Aumente o timeout do cliente da integração para 60-120s para evitar falsos erros. (4) Implemente retry com backoff exponencial no integrador. (5) Para sincronizações em massa: use a API em lotes (batch) ao invés de item por item — ex: /api/products?limit=100&page=1. (6) Considere horário de menor carga para sincronizações volumosas (madrugada/fora do horário comercial).','integracao',true),

('auge','seed_erp_v3','cli_i07','Como importar cadastro de produtos em massa via planilha?',
'Importação em massa de produtos: (1) Acesse Cadastro > Produtos > Importar > baixe o modelo de planilha .xlsx. (2) Preencha o modelo: código, descrição, NCM, CFOP, grupo, unidade de medida, preço, custo. Campos obrigatórios em vermelho. (3) Para grades: use aba "Variações" da planilha. (4) Importe: Cadastro > Produtos > Importar > selecione o arquivo > pré-visualize os dados > confirme. (5) Limite recomendado: até 5000 produtos por importação. (6) Após importar: verifique produtos com status "Erro" — corrigindo na planilha e reimportando apenas os com erro.','integracao',true),

-- ─────────────────────────────────────────────────
-- CENÁRIOS MULTI-DOMÍNIO / AVANÇADOS
-- ─────────────────────────────────────────────────

('auge','seed_erp_v3','cli_x01','Sistema lento. AUGE ERP demorando para carregar telas.',
'AUGE lento: (1) Verifique RAM e CPU do servidor: ideal mínimo 8GB RAM, SSD. (2) Banco PostgreSQL: execute VACUUM ANALYZE no banco — Administração > Banco de Dados > Manutenção. (3) Verifique número de conexões ativas: se muitas conexões abertas, pode ser pool esgotado. (4) Antivírus escaneando pasta do AUGE em tempo real: adicione exceção para a pasta de instalação. (5) Logs muito grandes: arquive/limpe logs antigos em Administração > Logs > Limpar logs anteriores a X. (6) Se lentidão em relatórios específicos: adicione índice na tabela ou use filtros de data para limitar o período consultado.','pdv',true),

('auge','seed_erp_v3','cli_x02','Backup do sistema não está sendo gerado automaticamente.',
'Backup automático não funcionando: (1) Verifique se a tarefa agendada está ativa: Windows > Agendador de Tarefas > procure "AugeBackup" ou similar. (2) Confirme o caminho de destino do backup — se for HD externo, verifique se está conectado. (3) Espaço em disco: se o destino estiver cheio, o backup falha. (4) Para configurar: Administração > Backup > Agendamento > defina horário (recomendado: 00:00 ou 01:00) e destino. (5) Faça backup manual imediato e confirme que funciona. (6) Para backup na nuvem: configure o caminho para uma pasta sincronizada com OneDrive/Google Drive. Teste restauração periodicamente.','pdv',true),

('auge','seed_erp_v3','cli_x03','Relatório de vendas mostrando valor diferente do fluxo de caixa.',
'Divergência relatório de vendas vs caixa: (1) Verifique o período: relatórios de vendas usam data do documento; fluxo de caixa usa data de recebimento. Uma venda a prazo aparece no relatório de vendas no dia, mas no fluxo apenas quando recebe. (2) Devoluções: venda cancelada reduz o relatório de vendas mas pode não impactar o caixa do mesmo dia se já foi fechado. (3) Descontos x valor líquido: certifique que ambos os relatórios usam o mesmo critério (bruto ou líquido). (4) Vendas no crediário: só entram no caixa quando pagas. Use Relatórios > Conciliação para cruzar os dois.','pdv',true),

('auge','seed_erp_v3','cli_x04','Como configurar multi-empresa no AUGE ERP?',
'Multi-empresa no AUGE: (1) A licença deve incluir múltiplas empresas — verifique com o fornecedor. (2) Acesse Administração > Empresas > Nova Empresa > preencha CNPJ, razão social, IE, endereço, regime tributário. (3) Configure certificado digital por empresa: cada CNPJ tem seu próprio certificado. (4) Usuários podem ter acesso a múltiplas empresas: Administração > Usuários > selecione o usuário > vincule as empresas. (5) Relatórios consolidados: Relatórios > Gerenciais > Consolidado por Empresa. (6) Estoques e financeiros são separados por empresa — não há consolidação automática de estoque entre CNPJs distintos.','integracao',true),

('auge','seed_erp_v3','cli_x05','Usuário bloqueado por excesso de tentativas de login.',
'Usuário bloqueado: (1) Acesse com usuário administrador: Administração > Usuários > localize o usuário > clique em Desbloquear. (2) Após desbloqueio, o usuário deve trocar a senha imediatamente. (3) Para alterar a política de bloqueio: Administração > Segurança > Tentativas máximas de login (padrão: 3-5 tentativas). (4) Se o administrador principal está bloqueado: contate o suporte AUGE com prova de propriedade. (5) Recomende gerenciador de senhas para evitar recorrência. (6) Se bloqueios frequentes para o mesmo usuário, verifique se há integração ou script tentando autenticar com credenciais antigas.','pdv',true),

('auge','seed_erp_v3','cli_x06','Como gerar relatório SPED EFD para envio à Receita?',
'SPED EFD no AUGE: (1) Pré-requisitos: todos os produtos com NCM, todas as notas com CFOP e CST corretos. (2) Acesse: Fiscal > SPED > EFD ICMS/IPI > selecione o período (mês/ano). (3) Configure: CNAE principal, código de atividade, regime de apuração. (4) Gere o arquivo: clique em Gerar > salve o .txt gerado. (5) Valide obrigatoriamente com o PVA (Programa Validador e Assinador) da Receita Federal antes de transmitir. (6) Corrija os erros apontados pelo validador no AUGE (mais comuns: produto sem NCM, operação com CFOP errado). (7) Prazo: até o 25° dia útil do mês seguinte.','fiscal',true),

('auge','seed_erp_v3','cli_x07','Promoção de preço não está sendo aplicada corretamente no caixa.',
'Promoção não aplicada no PDV: (1) Verifique se a promoção está ativa: Comercial > Promoções > verifique status, data de início/fim e horário. (2) Confirme que o produto está incluído na promoção (pode ser por grupo, categoria ou produto específico). (3) Verifique se a filial do caixa está vinculada à promoção. (4) Sincronize as promoções no PDV: Caixa > Sincronizar > Promoções. (5) Se promoção por quantidade (ex: "leve 3, pague 2"): o desconto só aplica ao atingir a quantidade mínima. (6) Promoção de tabela de preço especial: confirme que o cliente está vinculado à tabela correta em Cadastro > Clientes > Tabela de Preço.','pdv',true),

('auge','seed_erp_v3','cli_x08','Como recuperar dados de uma nota fiscal cancelada indevidamente?',
'NF-e cancelada indevidamente: (1) Uma NF-e cancelada não pode ser "descancelada" — o cancelamento na SEFAZ é irreversível. (2) Para reemitir: acesse Fiscal > NF-e > Nova NF-e > copie os dados da nota cancelada (use Fiscal > NF-e > Histórico para consultar os dados originais). (3) Emita uma nova NF-e com os mesmos dados (novo número será gerado automaticamente). (4) Importante: o número da NF-e cancelada precisa ser inutilizado se não houver nota no intervalo: Fiscal > NF-e > Inutilizar. (5) Informe ao comprador o novo número da NF-e. (6) Guarde o XML da nota cancelada para auditoria.','fiscal',true),

('auge','seed_erp_v3','cli_x09','Comissão de vendedores não está sendo calculada corretamente.',
'Comissão de vendedores: (1) Acesse Configurações > Comissões > verifique a regra aplicada (% sobre venda bruta, líquida, lucro, etc.). (2) Confirme que o vendedor está vinculado à regra de comissão correta em Cadastro > Funcionários > Comissão. (3) Se comissão por produto: verifique em Cadastro > Produtos > % de comissão específico. (4) Relatório de comissões: Relatórios > Vendas > Comissão por Vendedor > selecione o período. (5) Se a comissão inclui devoluções: configure "Descontar comissão em devoluções" em Configurações > Comissões. (6) Comissões só calculam em vendas com status "Finalizado" — pedidos em aberto não computam.','pdv',true),

('auge','seed_erp_v3','cli_x10','Sincronização de preços com e-commerce não está atualizando.',
'Preços não sincronizando com e-commerce: (1) Verifique qual tabela de preços está mapeada para o e-commerce: Hub > Integrações > E-commerce > Tabela de Preços. (2) A sincronização pode ser automática (webhook) ou manual — verifique: Hub > Agendamentos > Sincronizar Preços. (3) Se o preço foi alterado mas não sincronizou: force manualmente: Hub > Integrações > Forçar Sync de Preços. (4) Verifique se o produto tem o SKU do e-commerce cadastrado. (5) Promoções com preço temporário: configure o campo "Preço Promocional" separado do preço normal — o e-commerce usa esse campo se estiver preenchido. (6) Log: Hub > Log > filtre "sync_preco".','integracao',true);

COMMIT;

-- Verificação
SELECT canal, COUNT(*) as total FROM atendimentos WHERE canal='seed_erp_v3' AND tenant_id='auge' GROUP BY canal;

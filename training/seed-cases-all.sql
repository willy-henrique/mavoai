-- ============================================================
-- training/seed-cases-all.sql
-- Base cognitiva inicial — Mavo.AI
-- Casos reais de suporte: TillitPDV, AugeWEB, TillitConcentrador, AugePDV
-- Cada caso: problema → causa → solução (estrutura da IA Curadora)
-- ============================================================
-- Executar: psql -U postgres -d mavoai -f training/seed-cases-all.sql
-- OU via pgAdmin: abrir e executar
-- ============================================================

-- Limpa casos de seed anteriores sem perder casos reais
DELETE FROM public.atendimentos WHERE canal = 'seed_training' AND tenant_id = 'auge';

-- ============================================================
-- DOMÍNIO: TEF / PAGAMENTOS
-- ============================================================

INSERT INTO public.atendimentos
  (tenant_id, canal, cliente, tecnico, resumo_problema, causa, solucao, categoria, tags, texto_original, resolution_confirmed, resolution_source)
VALUES

('auge','seed_training','Loja Seed','Mavo AI',
'TEF não comunica com PinPad Ingenico após reinicialização do servidor',
'Serviço SiTef (CliSiTef) parou durante o reboot e não subiu automaticamente',
'1. Abrir services.msc no servidor. 2. Localizar serviço "CliSiTef" ou "SiTefService". 3. Verificar se está parado — iniciar manualmente. 4. Verificar se a inicialização está como "Automática". 5. Testar transação no PDV. Se persistir, verificar porta 2000 no firewall e reiniciar o serviço GP.',
'tef', ARRAY['tef','sitef','pinpad','servico','clisitef','gp','porta 2000'], 'Problema TEF comunicacao PinPad reinicialização servidor', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Transação cartão aprovada no banco mas não fecha no PDV TillitPDV',
'Timeout de comunicação entre TillitPDV e SiTef — a transação foi autorizada mas a confirmação não voltou a tempo',
'1. Não faça nova tentativa ainda. 2. No SiTef, consultar log de transações pendentes. 3. Realizar "desfazimento" ou confirmação manual no gerenciador SiTef. 4. Verificar latência de rede entre PDV e servidor TEF. 5. Aumentar timeout de comunicação nas configurações do CliSiTef se o problema for recorrente. Nunca faça dupla cobrança antes de confirmar o status.',
'tef', ARRAY['tef','timeout','transacao pendente','desfazimento','sitef','confirmacao'], 'Transação cartão aprovada banco não fecha PDV', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'PinPad Verifone não reconhecido no Windows após atualização do sistema',
'Driver do PinPad corrompido ou incompatível com nova versão do Windows — aparece com ponto de exclamação no Gerenciador de Dispositivos',
'1. Abrir Gerenciador de Dispositivos (devmgmt.msc). 2. Localizar o PinPad (geralmente em "Portas COM e LPT" ou "Outros dispositivos"). 3. Clicar com botão direito → Desinstalar dispositivo (marcar "excluir driver"). 4. Desconectar e reconectar o PinPad USB. 5. Instalar driver correto: para Verifone VX820 usar driver VISA Pinpad Driver; para USB baixar do site Verifone BR. 6. Confirmar que aparece como "Verifone PinPad" sem exclamação. 7. Reiniciar serviço SiTef.',
'tef', ARRAY['pinpad','verifone','driver','gerenciador de dispositivos','usb','windows'], 'PinPad Verifone não reconhecido Windows atualização', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'TEF Stone retornando erro "Estabelecimento não habilitado" em todas as transações',
'Código do estabelecimento Stone configurado incorretamente no SiTef — geralmente após migração ou reconfiguração do sistema',
'1. Acessar configurações do SiTef (arquivo sitef.ini ou painel de configuração). 2. Verificar campo "CodEst" ou "CNPJ" da adquirente Stone. 3. Comparar com o código fornecido pela Stone na contratação. 4. Verificar se está em ambiente correto (produção/homologação). 5. Salvar configurações e reiniciar serviço. 6. Ligar para Stone (0800 886 0001) para confirmar habilitação se código estiver correto.',
'tef', ARRAY['tef','stone','estabelecimento','codigo est','sitef.ini','habilitado'], 'TEF Stone erro estabelecimento não habilitado', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'PIX TEF gerando QR Code mas cliente scanneia e retorna erro no app do banco',
'Chave PIX do estabelecimento expirada ou configurada incorretamente no SiTef — QR Code gerado com dados inválidos',
'1. Verificar data de validade do QR Code gerado (geralmente 30 minutos). 2. Acessar configurações PIX no painel do adquirente (Stone, Cielo, etc.). 3. Confirmar que a chave PIX do estabelecimento está válida e ativa. 4. Se expirada, renovar no internet banking ou aplicativo do banco. 5. Atualizar configuração no SiTef com nova chave. 6. Testar com transação de R$ 0,01 para validar.',
'tef', ARRAY['pix','qrcode','chave pix','expirado','tef','adquirente'], 'PIX TEF QR Code cliente erro app banco', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'GetNet (Rede) não comunica — erro "Host primário indisponível" no SiTef',
'Firewall bloqueando acesso às portas de comunicação da GetNet (443 e 8443) ou DNS não resolvendo os hosts da adquirente',
'1. Testar ping para host.getnet.com.br — se falhar, é DNS ou rota de rede. 2. Verificar no firewall as regras de saída: liberar TCP 443 e 8443 para *.getnet.com.br e *.redecard.com.br. 3. Verificar se o antivírus está interceptando a conexão SSL. 4. Testar curl https://host.getnet.com.br no servidor. 5. Se o servidor usa proxy, configurar proxy no arquivo sitef.ini. 6. Contato GetNet: 4001-4433.',
'tef', ARRAY['getnet','rede','host primario','firewall','porta 443','dns'], 'GetNet Rede host primário indisponível SiTef', true, 'seed'),

-- ============================================================
-- DOMÍNIO: FISCAL / NF-e / NFC-e
-- ============================================================

('auge','seed_training','Loja Seed','Mavo AI',
'NF-e retornando rejeição 539 — NCM inválido ou não encontrado na TIPI',
'NCM cadastrado no produto não existe na tabela TIPI vigente ou está com formato incorreto (deve ter exatamente 8 dígitos numéricos)',
'1. Anotar o NCM que está gerando a rejeição. 2. Consultar NCM em: https://www.receita.fazenda.gov.br/paginas/tab-tipi.aspx 3. Se não encontrar: usar NCM mais próximo ou genérico (ex: 9999.99.99 não é válido — use 9999.99.90). 4. Acessar cadastro do produto no AugeWEB → campo NCM/SH. 5. Corrigir o NCM — usar exatamente 8 dígitos sem pontos (ex: 84733099). 6. Reemitir a nota após salvar.',
'fiscal', ARRAY['nfe','rejeicao 539','ncm','tipi','produto','cadastro'], 'NF-e rejeição 539 NCM inválido TIPI', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Rejeição 204 na NF-e — duplicidade de nota fiscal eletrônica',
'Número da NF-e já utilizado e autorizado anteriormente. Tentativa de emissão com a mesma série e número.',
'1. Verificar no AugeWEB qual é o número atual da série. 2. Confirmar no portal da SEFAZ (https://www.nfe.fazenda.gov.br/portal) se a nota com aquele número já está autorizada. 3. Se autorizada: a nota original existe — não reemitir, usar a existente. 4. Se a nota original foi emitida por erro: cancelar dentro de 24h. 5. Para avançar a numeração: no AugeWEB → Parâmetros Fiscais → Numeração de NF-e → incrementar. 6. Emitir nova nota com próximo número.',
'fiscal', ARRAY['nfe','rejeicao 204','duplicidade','serie','numeracao','sefaz'], 'Rejeição 204 NF-e duplicidade nota fiscal', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'NFC-e rejeitada — CSC/Token não configurado ou inválido',
'CSC (Código de Segurança do Contribuinte) da NFC-e não configurado ou expirado no AugePDV/TillitPDV',
'1. Acessar a SEFAZ do estado do contribuinte → área do contribuinte → NFC-e → CSC. 2. Gerar novo CSC/Token se não existir ou expirado. 3. No AugePDV ou TillitPDV: Configurações → Fiscal → NFC-e → inserir CSC e ID do CSC. 4. Salvar e reiniciar o módulo fiscal. 5. Testar emissão de NFC-e com valor baixo em ambiente de produção. Observação: CSC é por CNPJ/IE — cada filial tem o seu.',
'fiscal', ARRAY['nfce','csc','token','sefaz','configuracao','filial'], 'NFC-e rejeição CSC Token não configurado', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Certificado digital A1 com erro "Certificate expired" ao emitir nota',
'Certificado digital A1 (.pfx) com validade expirada — NF-e/NFC-e não são assinadas',
'1. Verificar a validade: clicar duas vezes no arquivo .pfx → aba Detalhe → "Válido até". 2. Se expirado: adquirir novo certificado na autoridade certificadora (Certisign, Soluti, Valid, etc.). 3. Com o novo .pfx: no AugeWEB → Parâmetros da Empresa → Certificado Digital → Substituir certificado. 4. Informar a senha do novo certificado. 5. Reiniciar os serviços de emissão. 6. Testar emissão. Dica: certificados A1 valem 1 ano — configurar alerta de renovação 30 dias antes.',
'fiscal', ARRAY['certificado','a1','pfx','expirado','nfe','assinatura'], 'Certificado digital A1 expirado erro emissão nota', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'NF-e em contingência há mais de 24h — prazo de transmissão vencendo',
'NF-e emitida em modo contingência (SCAN/DPEC/FS-DA) e não transmitida à SEFAZ dentro do prazo legal de 24 horas',
'1. URGENTE: prazo máximo para transmissão é 168h (7 dias) mas idealmente transmitir em 24h. 2. Verificar causa da contingência: internet, SEFAZ indisponível, certificado. 3. Resolver a causa raiz primeiro. 4. No AugeWEB: Fiscal → NF-e → Transmissão de Contingência → selecionar notas pendentes. 5. Transmitir lote. 6. Verificar retorno: autorizadas, rejeitadas ou pendentes. 7. Notas rejeitadas na transmissão de contingência podem precisar de carta de correção ou cancelamento.',
'fiscal', ARRAY['contingencia','24h','transmissao','scan','dpec','fsda','prazo'], 'NF-e contingência prazo 24h transmissão vencendo', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Rejeição 673 — CSOSN inválido para o regime tributário do emitente',
'Empresa do Simples Nacional usando CST (regime normal) ou vice-versa — CSOSN só para Simples Nacional, CST para outros regimes',
'1. Verificar regime tributário do emitente: AugeWEB → Cadastro da Empresa → Regime Tributário. 2. Simples Nacional = usar CSOSN (ex: 102, 400, 500). 3. Lucro Presumido/Real = usar CST (ex: 00, 10, 20, 40, 60). 4. Corrigir a configuração do regime no cadastro da empresa. 5. Revisar o perfil de tributação dos produtos — pode estar com CSOSN/CST errado. 6. Reemitir a nota após correção.',
'fiscal', ARRAY['rejeicao 673','csosn','cst','simples nacional','regime tributario','nfe'], 'Rejeição 673 CSOSN inválido regime tributário', true, 'seed'),

-- ============================================================
-- DOMÍNIO: PDV / CAIXA (TillitPDV e AugePDV)
-- ============================================================

('auge','seed_training','Loja Seed','Mavo AI',
'TillitPDV travado na tela de venda — não aceita nenhum comando',
'Processo do TillitPDV em deadlock aguardando resposta do servidor ou banco de dados inacessível',
'1. Verificar se o servidor está acessível: abrir outro terminal e testar acesso ao sistema. 2. Se servidor OK: forçar fechamento do processo TillitPDV (Task Manager → Finalizar Tarefa). 3. Aguardar 30 segundos. 4. Reabrir TillitPDV. 5. Verificar se havia uma venda aberta — o sistema deve recuperar o último estado. 6. Se o problema persistir: verificar log do TillitPDV na pasta de instalação → arquivo .log mais recente. 7. Verificar conectividade com banco: ping no servidor + teste de porta.',
'pdv', ARRAY['tillitpdv','travado','tela venda','deadlock','processo','reiniciar'], 'TillitPDV travado tela de venda não aceita comando', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Caixa com diferença no fechamento — relatório Z não bate com o sistema',
'Movimentos não contabilizados: sangria ou suprimento feito diretamente sem lançamento no sistema, ou venda cancelada após fechamento parcial',
'1. Imprimir relatório detalhado de movimentos do período (AugePDV/TillitPDV → Relatórios → Movimentos do Caixa). 2. Comparar sangrias físicas com registros do sistema. 3. Verificar se alguma venda foi cancelada ou estornada após o início do fechamento. 4. Checar movimentos de TEF: confirmar se todos os pagamentos foram reconhecidos. 5. Verificar se houve troco em valor não registrado. 6. Se diferença persistir: anotar, abrir caixa com a diferença identificada e comunicar ao gerente para ajuste contábil. Não fechar forçado.',
'pdv', ARRAY['caixa','diferenca','fechamento','relatorio z','sangria','suprimento','movimentos'], 'Caixa diferença fechamento relatório Z não bate', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'NFC-e não emite no PDV — erro "Comunicação com servidor fiscal falhou"',
'Serviço de emissão fiscal (SpedSrv ou serviço equivalente) parado no servidor ou configuração de URL fiscal errada no PDV',
'1. No servidor: verificar serviço "AugeSpedSrv" ou "TillitFiscalSrv" em services.msc. 2. Se parado: iniciar o serviço. 3. Verificar no PDV: Configurações → Fiscal → URL do servidor fiscal → deve apontar para IP/porta correto do servidor (ex: http://192.168.1.100:8080). 4. Testar acesso à URL no navegador do PDV. 5. Verificar firewall: porta do serviço fiscal deve estar liberada na rede local. 6. Reiniciar PDV após corrigir.',
'pdv', ARRAY['nfce','pdv','servidor fiscal','servico','spedssrv','url','comunicacao'], 'NFC-e não emite PDV comunicação servidor fiscal falhou', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Impressora de cupom não imprime no TillitPDV após reinstalação do Windows',
'Driver da impressora térmica não instalado corretamente ou porta COM/USB diferente da configurada no TillitPDV',
'1. Verificar se impressora aparece no Gerenciador de Dispositivos sem erros. 2. Instalar driver correto: Bematech MP-4200 = driver Bematech; Elgin = driver Elgin; Epson TM-T20 = driver Epson. 3. No TillitPDV: Configurações → Impressora → verificar porta (COM1, COM2, USB, TCP/IP). 4. Para impressora USB: usar driver genérico "Generic/Text Only" se driver nativo não funcionar. 5. Imprimir página de teste pelo Windows antes de testar no PDV. 6. Verificar se DIP switches da impressora estão na configuração correta (velocidade baud).',
'pdv', ARRAY['impressora','cupom','driver','bematech','elgin','epson','porta com','tillitpdv'], 'Impressora cupom não imprime TillitPDV reinstalação Windows', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Operador não consegue abrir caixa — mensagem "Caixa já aberto por outro operador"',
'Caixa aberto por outro usuário que saiu sem fechar corretamente, ou sessão anterior não foi encerrada por queda de energia',
'1. Verificar no sistema quem tem o caixa aberto: AugePDV → Administrativo → Caixas Abertos. 2. Se o operador listado não está usando: encerrar a sessão do caixa administrativamente (requer permissão de gerente). 3. Fechar o caixa "fantasma" com sangria zerada se não houver movimentos pendentes. 4. Liberar o caixa para o novo operador. 5. Para evitar recorrência: configurar logout automático por inatividade no sistema.',
'pdv', ARRAY['caixa aberto','operador','sessao','fechar caixa','gerente','augepdv'], 'Operador não abre caixa mensagem caixa já aberto outro operador', true, 'seed'),

-- ============================================================
-- DOMÍNIO: ESTOQUE
-- ============================================================

('auge','seed_training','Loja Seed','Mavo AI',
'Saldo de estoque negativo para produto sem movimentação de saída registrada',
'Entrada de mercadoria lançada com quantidade menor que a saída, ou saída realizada no PDV sem a entrada correspondente ser confirmada no sistema',
'1. Acessar AugeWEB → Estoque → Histórico de Movimentações do produto. 2. Filtrar pelo período do problema — identificar o movimento que gerou o negativo. 3. Verificar se há entradas pendentes de confirmação (NF de entrada não lançada). 4. Lançar a entrada correspondente se existir a NF. 5. Se não houver NF: realizar acerto de estoque manual com justificativa (AugeWEB → Estoque → Ajuste de Estoque). 6. Comunicar ao gestor e registrar ocorrência para auditoria.',
'estoque', ARRAY['estoque','saldo negativo','movimentacao','entrada','ajuste','augeweb'], 'Saldo estoque negativo produto sem movimentação saída registrada', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Importação de XML de NF-e de entrada com erro "Produto não encontrado"',
'Produto constante no XML da nota não cadastrado no AugeWEB, ou cadastrado com EAN/código diferente do fornecedor',
'1. Na tela de importação XML: AugeWEB → Compras → Importar XML → verificar quais produtos não foram encontrados. 2. Para cada produto não encontrado: opção "Cadastrar Produto" direto na tela de importação OU vincular a um produto existente pelo código do fornecedor. 3. Cadastrar o produto com os dados do XML (descrição, NCM, EAN, unidade). 4. Após cadastrar todos: re-importar o XML. 5. Confirmar entrada no estoque após importação bem-sucedida.',
'estoque', ARRAY['xml','nota entrada','produto nao encontrado','ean','importacao','compras','augeweb'], 'Importação XML NF-e entrada erro produto não encontrado', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Inventário não fecha — sistema indica divergência mas contagem física está correta',
'Movimentações de estoque ocorrendo durante a contagem (vendas, transferências) invalidando os dados do inventário em andamento',
'1. Verificar se houve vendas ou movimentações durante a contagem: AugeWEB → Estoque → Inventário → Movimentos após abertura. 2. Opção A: bloquear vendas temporariamente e recontar os itens divergentes. 3. Opção B: aceitar as divergências e fazer ajuste manual considerando as movimentações ocorridas. 4. Calcular: saldo inicial + entradas - saídas durante inventário = saldo esperado. 5. Comparar com contagem física e ajustar a diferença real. 6. Fechar o inventário com justificativa das diferenças.',
'estoque', ARRAY['inventario','contagem','divergencia','movimentacao','fechamento','ajuste'], 'Inventário não fecha divergência contagem física correta', true, 'seed'),

-- ============================================================
-- DOMÍNIO: HARDWARE / EQUIPAMENTOS
-- ============================================================

('auge','seed_training','Loja Seed','Mavo AI',
'Balança Toledo Prix 3 não comunica com AugeWEB — peso não aparece no sistema',
'Configuração de porta serial (COM) ou baudrate diferente entre balança e sistema, ou cabo serial com defeito',
'1. Verificar configuração atual da balança: Menu → Configuração → Serial → anotar COM e velocidade (baud). 2. No AugeWEB: Configurações → Periféricos → Balança → verificar porta COM e baud configurados. 3. Deve ser exatamente igual: balança e sistema com mesmo COM e baud (Toledo Prix 3 = padrão 9600 baud). 4. Se usando adaptador USB-Serial: verificar qual porta COM o Windows atribuiu (Gerenciador de Dispositivos → Portas COM). 5. Testar comunicação: AugeWEB → Testar Balança. 6. Substituir cabo serial se configuração estiver correta e ainda não funcionar.',
'hardware', ARRAY['balanca','toledo','prix 3','serial','baud','porta com','augeweb'], 'Balança Toledo Prix 3 não comunica AugeWEB peso não aparece', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Leitor de código de barras lê mas caractere extra aparece no campo do produto',
'Leitor configurado com prefixo ou sufixo adicional, ou com Enter ao final que pula para próximo campo',
'1. Identificar o caractere extra: se é um número/letra antes ou depois do código, é prefixo/sufixo. Se pula campo automaticamente, é Enter configurado. 2. Acessar configuração do leitor: maioria tem etiqueta de configuração no manual. 3. Para remover prefixo/sufixo: escanear etiqueta "Remover prefixo" ou "Remover sufixo" do manual. 4. Para remover Enter extra: escanear "Não adicionar sufixo" ou "Remove Enter". 5. Testar em bloco de notas antes de usar no sistema. 6. Se não tiver manual: marca/modelo do leitor + "configuração prefixo" no Google.',
'hardware', ARRAY['leitor codigo barras','prefixo','sufixo','enter','configuracao','caractere extra'], 'Leitor código de barras caractere extra campo produto', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Computador do PDV extremamente lento após atualização do Windows',
'Windows Update instalou atualizações pesadas + processo de otimização em segundo plano consumindo 100% de CPU/disco',
'1. Aguardar 30-60 minutos após atualização — o Windows finaliza otimizações em background. 2. Verificar no Gerenciador de Tarefas (Ctrl+Shift+Esc): processos com alto uso de CPU/disco. 3. Processo "TiWorker.exe" ou "Windows Update" = aguardar terminar. 4. Processo antivírus escaneando = aguardar ou excluir pasta do sistema da varredura. 5. Se HDD: verificar saúde do disco (CrystalDiskInfo). 6. Configurar horário de atualização do Windows para fora do horário comercial: Configurações → Windows Update → Horas Ativas.',
'hardware', ARRAY['computador lento','windows update','cpu','disco','gerenciador tarefas','ttiworker'], 'Computador PDV lento após atualização Windows', true, 'seed'),

-- ============================================================
-- DOMÍNIO: AUGE WEB / ERP
-- ============================================================

('auge','seed_training','Loja Seed','Mavo AI',
'AugeWEB não abre — erro de conexão com banco de dados PostgreSQL',
'PostgreSQL parado ou inacessível na porta configurada (padrão 5432 ou 5433), ou credenciais de acesso incorretas',
'1. Verificar se PostgreSQL está rodando: services.msc → "postgresql-x64-16" → deve estar "Em execução". 2. Se parado: iniciar o serviço. 3. Testar conexão: pgAdmin → conectar com usuário/senha configurados. 4. Verificar firewall: porta 5432 (ou configurada) deve estar liberada entre servidor e clientes. 5. Verificar string de conexão no AugeWEB: Config → Banco de Dados → Host, Porta, Usuário, Senha, Nome do banco. 6. Testar login no pgAdmin com as mesmas credenciais para confirmar que está correto.',
'banco_dados', ARRAY['augeweb','postgres','postgresql','banco de dados','conexao','porta 5432'], 'AugeWEB erro conexão banco dados PostgreSQL', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Usuário sem permissão para acessar módulo fiscal no AugeWEB',
'Perfil de acesso do usuário não inclui permissão para o módulo de emissão fiscal — configuração de grupos de usuário',
'1. Acessar AugeWEB com usuário administrador. 2. Menu → Segurança → Grupos de Usuário → localizar o grupo do usuário com problema. 3. Verificar quais módulos o grupo tem permissão → habilitar módulo fiscal. 4. Alternativa: Segurança → Usuários → selecionar o usuário → aba Permissões → habilitar diretamente. 5. Solicitar que o usuário faça logout e login novamente. 6. Testar acesso ao módulo fiscal.',
'augeweb', ARRAY['augeweb','permissao','usuario','modulo fiscal','grupo','seguranca'], 'Usuário sem permissão módulo fiscal AugeWEB', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Relatório de vendas AugeWEB retornando dados incorretos — totais não batem',
'Filtro de data/filial aplicado incorretamente, ou relatório usando data de emissão ao invés de data de movimento',
'1. Verificar filtros aplicados: data inicial, data final, filial(is) selecionada(s). 2. Confirmar se o relatório usa "data de emissão" ou "data de movimento" — podem divergir. 3. Testar com período menor (1 dia) para isolar a discrepância. 4. Comparar com extrato de caixa do mesmo período. 5. Verificar se há vendas canceladas incluídas ou excluídas no cálculo. 6. Se o problema persistir: exportar para Excel e validar a soma manualmente para identificar qual registro está errado.',
'augeweb', ARRAY['relatorio','vendas','augeweb','filtro','data','total','filial'], 'Relatório vendas AugeWEB dados incorretos totais não batem', true, 'seed'),

-- ============================================================
-- DOMÍNIO: TILLIT CONCENTRADOR
-- ============================================================

('auge','seed_training','Loja Seed','Mavo AI',
'TillitConcentrador não sincroniza PDVs — dados de venda não chegam ao servidor',
'Serviço do Concentrador parado ou PDVs com configuração de IP/porta do servidor incorreta',
'1. No servidor: verificar serviço "TillitConcentrador" em services.msc — deve estar rodando. 2. Verificar log do Concentrador: pasta de instalação → logs → arquivo mais recente. 3. Nos PDVs: Configurações → Concentrador → IP do servidor deve ser o IP real do servidor (não localhost). 4. Verificar porta configurada (padrão 9000 ou conforme instalação) → liberar no firewall. 5. Testar conexão: no PDV, tentar sincronização manual → verificar mensagem de erro. 6. Reiniciar serviço do Concentrador após ajustes.',
'integracao', ARRAY['concentrador','tillit','sincronizacao','pdv','servico','ip','porta 9000'], 'TillitConcentrador não sincroniza PDVs dados venda não chegam servidor', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Produtos atualizados no AugeWEB mas não aparecem nos PDVs (TillitConcentrador)',
'Sincronização de catálogo pendente — atualização de produtos requer sincronização manual ou agendada que não ocorreu',
'1. No AugeWEB: verificar se a alteração foi salva corretamente. 2. Acessar TillitConcentrador → Sincronização → Catálogo de Produtos → executar sincronização manual. 3. Aguardar conclusão e verificar log de sincronização para erros. 4. Nos PDVs: executar atualização de catálogo (geralmente F5 ou botão "Atualizar" no TillitPDV). 5. Verificar se o produto está ativo e com preço configurado para a filial do PDV. 6. Configurar sincronização automática periódica se não estiver configurada.',
'integracao', ARRAY['concentrador','catalogo','produto','sincronizacao','augeweb','tillitpdv','filial'], 'Produtos atualizados AugeWEB não aparecem PDVs TillitConcentrador', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Vendas duplicadas no AugeWEB — mesma venda aparece duas vezes no relatório',
'PDV enviou a venda duas vezes ao Concentrador (falha de rede durante transmissão causou retransmissão) e o sistema não detectou duplicidade',
'1. Identificar as vendas duplicadas: verificar número do cupom/NFC-e e hora da venda. 2. Confirmar qual é a venda original: NFC-e com autorização SEFAZ válida. 3. Cancelar a venda duplicada no AugeWEB (aquela sem NFC-e ou com NFC-e inválida). 4. Verificar se o financeiro foi afetado — estornar pagamento duplicado se necessário. 5. Verificar configuração de timeout de rede no TillitConcentrador: aumentar timeout para reduzir retransmissões. 6. Implementar controle de idempotência por número do cupom se não existir.',
'integracao', ARRAY['venda duplicada','concentrador','retransmissao','nfce','relatorio','augeweb'], 'Vendas duplicadas AugeWEB mesma venda duas vezes relatório', true, 'seed'),

-- ============================================================
-- DOMÍNIO: BANCO DE DADOS
-- ============================================================

('auge','seed_training','Loja Seed','Mavo AI',
'PostgreSQL com performance degradada — queries lentas após crescimento do banco',
'Falta de VACUUM e ANALYZE nas tabelas principais, índices desatualizados e estatísticas desatualizadas após grande volume de dados',
'1. Executar VACUUM ANALYZE nas tabelas principais: VACUUM ANALYZE public.atendimentos; VACUUM ANALYZE public.vendas; 2. Verificar índices: SELECT schemaname, tablename, attname, n_distinct FROM pg_stats WHERE tablename IN (tabelas principais); 3. Recriar índices fragmentados: REINDEX TABLE public.vendas; 4. Configurar autovacuum para rodar com mais frequência: ALTER TABLE public.vendas SET (autovacuum_vacuum_scale_factor = 0.01); 5. Verificar queries lentas: SELECT query, total_time FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10; 6. Aumentar work_mem se necessário: SET work_mem = 64MB;',
'banco_dados', ARRAY['postgresql','performance','lento','vacuum','analyze','indice','query'], 'PostgreSQL performance degradada queries lentas após crescimento banco', true, 'seed'),

('auge','seed_training','Loja Seed','Mavo AI',
'Backup do PostgreSQL falhou — disco cheio no servidor',
'Script de backup gerando arquivo .backup em disco sem espaço suficiente, ou backup antigo não removido automaticamente',
'1. URGENTE: verificar espaço em disco: df -h (Linux) ou propriedades do disco (Windows). 2. Identificar arquivos grandes para remover: backups antigos, logs de aplicação, dumps temporários. 3. Remover backups anteriores a 7 dias (manter política de retenção). 4. Após liberar espaço: reexecutar o backup imediatamente. 5. Configurar script de rotação de backups: manter últimos 7 diários + 4 semanais. 6. Configurar alerta de disco: monitorar quando ultrapassar 80% de uso.',
'banco_dados', ARRAY['backup','postgresql','disco cheio','rotacao','retencao','espaco'], 'Backup PostgreSQL falhou disco cheio servidor', true, 'seed');

-- ============================================================
-- Atualizar embeddings (executar após inserção)
-- O backfill vai gerar os vetores para busca semântica
-- ============================================================
-- npx ts-node scripts/backfill-embeddings.ts

-- Verificar resultado:
-- SELECT dominio, COUNT(*) as casos, AVG(length(solucao)) as avg_solucao_len
-- FROM public.atendimentos WHERE canal = 'seed_training'
-- GROUP BY dominio ORDER BY casos DESC;

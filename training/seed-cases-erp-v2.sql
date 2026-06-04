-- ============================================================
-- training/seed-cases-erp-v2.sql
-- Base cognitiva ERP v2 — cobertura ampliada por domínio
-- Domínios: fiscal, tef, pdv, estoque, hardware, integracao
-- Executar: psql -U postgres -d mavoai -f training/seed-cases-erp-v2.sql
-- Após: node scripts/backfill-embeddings.mjs
-- ============================================================

DELETE FROM public.atendimentos
WHERE canal = 'seed_erp_v2' AND tenant_id = 'auge';

INSERT INTO public.atendimentos
  (tenant_id, canal, cliente, tecnico, resumo_problema, causa, solucao, categoria, tags, texto_original, resolution_confirmed, resolution_source)
VALUES

-- ============================================================
-- DOMÍNIO: FISCAL — NF-e / NFC-e / SPED / SEFAZ
-- ============================================================

(
  'auge', 'seed_erp_v2', 'Distribuidora Norte', 'Suporte Auge',
  'Rejeição 128 — CNPJ do emitente com dígito verificador inválido na chave de acesso',
  'O CNPJ cadastrado na empresa tem formatação com pontos/traços que foram salvos junto ao número, ou dígito verificador digitado errado no cadastro da empresa.',
  '1. Acessar AugeWEB → Cadastro da Empresa → verificar CNPJ: deve ter exatamente 14 dígitos numéricos sem pontuação. 2. Validar o DV: os dois últimos dígitos são verificadores — usar calculadora online de CNPJ para confirmar. 3. Corrigir o CNPJ no cadastro e salvar. 4. Reiniciar o serviço de emissão fiscal. 5. Reemitir a nota. Observação: o CNPJ da chave de acesso é gerado automaticamente pelo sistema a partir do cadastro — a rejeição 128 sempre indica problema no cadastro, não no XML.',
  'fiscal',
  ARRAY['rejeicao 128','cnpj','digito verificador','chave acesso','nfe','cadastro empresa'],
  'NF-e rejeitada com código 128 CNPJ inválido',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Mercado Sul', 'Suporte Auge',
  'Rejeição 165 — Código do município do emitente não encontrado na tabela IBGE',
  'Código IBGE do município cadastrado incorretamente — seja digitado manualmente errado, seja estado/cidade trocados.',
  '1. Acessar AugeWEB → Cadastro da Empresa → campo Município. 2. Verificar o código IBGE do município: consultar em https://www.ibge.gov.br/explica/codigos-dos-municipios.php 3. O código deve ter 7 dígitos. Exemplo: São Paulo = 3550308, Belo Horizonte = 3106200. 4. Corrigir o código IBGE no cadastro da empresa. 5. Verificar também o CEP — se o CEP estiver errado, pode ter preenchido o município errado no autocomplete. 6. Salvar e reemitir.',
  'fiscal',
  ARRAY['rejeicao 165','codigo ibge','municipio','nfe','cadastro empresa','cep'],
  'Rejeição 165 código município IBGE inválido NF-e',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Eletrônicos Express', 'Suporte Auge',
  'Rejeição 589 — CFOP incompatível com a natureza da operação de venda',
  'CFOP configurado no produto ou na operação não corresponde ao tipo de venda: venda dentro do estado, fora do estado e para o exterior usam CFOPs diferentes.',
  '1. Verificar o CFOP da operação rejeitada: 5.xxx = dentro do estado, 6.xxx = fora do estado, 7.xxx = exportação. 2. Para vendas a consumidor final dentro do estado: CFOP correto é 5102 (mercadoria adquirida). 3. Para vendas a outros estados: 6102. 4. CFOPs 5.xxx não podem ser usados em notas interestaduais e vice-versa. 5. Acessar AugeWEB → Produto → aba Fiscal → corrigir CFOP. 6. Também verificar o CFOP padrão da Natureza de Operação cadastrada.',
  'fiscal',
  ARRAY['rejeicao 589','cfop','natureza operacao','interestadual','nfe','produto','5102','6102'],
  'Rejeição 589 CFOP incompatível operação',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Papelaria Central', 'Suporte Auge',
  'NF-e em status "Em processamento" (código 105) por mais de 2 horas — cliente aguardando',
  'A SEFAZ recebeu o lote mas ainda não respondeu dentro do prazo esperado. Pode ser congestionamento no webservice ou problema de comunicação intermitente.',
  '1. NÃO reenviar a nota — risco de duplicidade. 2. Consultar o status da nota pela chave de acesso: AugeWEB → Fiscal → Consultar NF-e → inserir chave de 44 dígitos. 3. Alternativa: consultar direto no portal da SEFAZ estadual usando a chave. 4. Se retornar "Autorizada": a nota está OK, atualizar o status no sistema. 5. Se retornar "Rejeitada": corrigir o erro e reemitir. 6. Se ainda "Em processamento" após 4h: verificar status do webservice SEFAZ no portal https://www.nfe.fazenda.gov.br/portal → "Serviços" → "Status do Serviço". 7. Em último caso: contatar a SEFAZ do estado.',
  'fiscal',
  ARRAY['nfe','codigo 105','em processamento','webservice','sefaz','consultar chave','lote'],
  'NF-e em processamento 105 mais de 2 horas cliente aguardando',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Construtora Obra Fácil', 'Suporte Auge',
  'Carta de Correção Eletrônica (CC-e) rejeitada — tentativa de corrigir dados que não podem ser alterados',
  'A CC-e tem limitações legais: não pode corrigir dados que mudam o valor da nota, o destinatário, a quantidade, o preço unitário ou dados fiscais como CFOP e CST.',
  '1. CC-e pode corrigir: complemento de informações adicionais, dados do transportador, local de entrega, natureza da operação em alguns casos. 2. CC-e NÃO pode corrigir: valor, destinatário, produto, quantidade, preço, CFOP, CST, NCM, dados que afetam cálculo de tributos. 3. Se o campo que precisa corrigir não é permitido: o caminho é cancelar a nota (dentro de 24h) e reemitir corretamente. 4. Após 24h da autorização: não é mais possível cancelar — consulte a assessoria contábil para o procedimento correto. 5. Para emitir CC-e: AugeWEB → Fiscal → NF-e Emitidas → selecionar nota → Carta de Correção.',
  'fiscal',
  ARRAY['carta correcao','cce','nfe','cancelamento','24h','campo permitido','rejeicao'],
  'Carta de Correção rejeitada tentativa corrigir dados não permitidos',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Atacado Bom Preço', 'Suporte Auge',
  'Rejeição 202 — nota cancelada anteriormente sendo reemitida com mesmo número',
  'O número da NF-e foi usado em uma nota que foi posteriormente cancelada. A SEFAZ não aceita reuso de numeração cancelada na mesma série.',
  '1. Confirmar no AugeWEB: Fiscal → NF-e Emitidas → procurar pelo número → verificar se há uma nota com status "Cancelada" com esse número. 2. NÃO reutilizar numeração cancelada — a rejeição 202 é definitiva para esse número. 3. Avançar a numeração: AugeWEB → Parâmetros Fiscais → Numeração NF-e → incrementar para o próximo número disponível. 4. Emitir nova nota com a nova numeração. 5. Se precisar inutilizar faixa de números pulados: Fiscal → Inutilização de Numeração NF-e.',
  'fiscal',
  ARRAY['rejeicao 202','cancelada','numeracao','serie','inutilizacao','nfe'],
  'Rejeição 202 nota cancelada sendo reemitida mesmo número',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Transportadora Veloz', 'Suporte Auge',
  'SPED Fiscal EFD — erro na apuração do ICMS, valores do Registro E110 divergem',
  'Notas fiscais de entrada ou saída com CFOP ou CST incorretos fazendo a apuração do ICMS calcular valores errados no registro E110 (débito/crédito/saldo).',
  '1. O registro E110 é calculado automaticamente a partir dos registros C100/C170 (notas). 2. Verificar: AugeWEB → SPED Fiscal → Auditoria → Registro E110 → comparar débito (saídas) e crédito (entradas) com relatório de notas do período. 3. Identificar notas com CFOP errado: CFOP iniciado em 1 ou 2 = entrada com crédito de ICMS; 3 = importação; 5 ou 6 = saída com débito. 4. Corrigir os CFOPs nas notas identificadas. 5. Regerar o SPED após correção. 6. Se notas já foram canceladas no passado: verificar se os cancelamentos estão sendo considerados na apuração.',
  'fiscal',
  ARRAY['sped fiscal','efd','icms','registro e110','cfop','apuracao','debito credito','cst'],
  'SPED Fiscal EFD erro apuração ICMS registro E110 divergente',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Supermercado Bairro', 'Suporte Auge',
  'NFC-e cancelada mas cupom já foi impresso e entregue ao cliente — como proceder',
  'Cancelamento de NFC-e após impressão e entrega do cupom ao consumidor: situação exige protocolo específico para não criar divergência fiscal.',
  '1. O cancelamento da NFC-e é válido no sistema mesmo com cupom impresso. 2. Prazo para cancelar NFC-e: 30 minutos após a autorização (varia por estado — SP permite até 24h). 3. Para cancelar: AugeWEB → Fiscal → NFC-e → localizar a nota → Cancelar → informar justificativa. 4. Imprimir o comprovante de cancelamento para arquivar. 5. Se o cliente já saiu com o cupom: não há problema fiscal — a nota cancelada no sistema é o que vale perante o fisco. 6. Se precisar reemitir: emitir nova NFC-e com nova numeração. 7. Nunca reemitir com o mesmo número da cancelada.',
  'fiscal',
  ARRAY['nfce','cancelamento','prazo','cupom impresso','30 minutos','24h','reemissao'],
  'NFC-e cancelada cupom já impresso entregue cliente como proceder',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Gráfica Rápida', 'Suporte Auge',
  'Rejeição 656 — IE do destinatário inválida para o estado de destino',
  'Inscrição Estadual do destinatário cadastrada com formato inválido para o estado — cada UF tem um padrão de dígitos e máscara diferente.',
  '1. Verificar a IE do destinatário: o formato varia por estado. Exemplo: SP tem 12 dígitos (xxx.xxx.xxx.xxx), MG tem 13 dígitos, RJ tem 8 dígitos. 2. Acessar AugeWEB → Cadastro de Clientes → localizar o destinatário → verificar campo IE. 3. Se o cliente for isento: preencher IE como "ISENTO" (sem aspas) — nunca deixar em branco para PJ dentro do estado. 4. Para PF: IE deve ser vazia ou "CPF". 5. Consultar a IE válida no portal da SEFAZ do estado de destino. 6. Corrigir e reemitir.',
  'fiscal',
  ARRAY['rejeicao 656','inscricao estadual','ie','destinatario','estado','isento','nfe'],
  'Rejeição 656 IE destinatário inválida estado destino',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja de Roupas Moda', 'Suporte Auge',
  'Webservice da SEFAZ fora do ar — como emitir notas em contingência corretamente',
  'SEFAZ do estado com indisponibilidade. Notas precisam ser emitidas em modo de contingência para não parar as operações.',
  '1. Verificar status da SEFAZ: https://www.nfe.fazenda.gov.br/portal → "Serviços" → "Status". 2. AugeWEB entra em contingência automaticamente após X tentativas falhas (configurável). 3. Para forçar contingência manual: AugeWEB → Parâmetros Fiscais → Modo de Contingência → ativar. 4. Em contingência: notas são emitidas com DANFE em papel especial (FS-DA) sem autorização prévia. 5. Após SEFAZ voltar: URGENTE — transmitir todas as notas de contingência dentro de 168h (7 dias). 6. AugeWEB → Fiscal → Transmissão de Contingência → selecionar todas → Transmitir. 7. Guardar o DANFE de contingência até a autorização ser confirmada.',
  'fiscal',
  ARRAY['contingencia','sefaz fora ar','fsda','transmissao','168h','danfe','indisponibilidade'],
  'SEFAZ fora do ar contingência como emitir notas corretamente',
  true, 'treinamento_erp_v2'
),

-- ============================================================
-- DOMÍNIO: TEF — Pagamentos Eletrônicos
-- ============================================================

(
  'auge', 'seed_erp_v2', 'Farmácia Saúde', 'Suporte Auge',
  'TEF Cielo retornando erro -1 (comunicação) — todas as transações falhando',
  'Serviço CliSiTef perdeu a sessão com o concentrador Cielo. Geralmente ocorre após instabilidade de rede ou reinicialização do servidor.',
  '1. Abrir services.msc no servidor → localizar "CliSiTef" → Parar o serviço. 2. Aguardar 15 segundos e iniciar novamente. 3. No PDV: encerrar o caixa, aguardar 30s, reabrir. 4. Testar uma transação de R$0,01 no débito. 5. Se persistir: verificar conectividade do servidor com os hosts da Cielo — ping para hosthom.cielo.com.br ou hostprd.cielo.com.br dependendo do ambiente. 6. Verificar se o antivírus está bloqueando a porta de comunicação (padrão 2000 TCP). 7. Contato Cielo: 4002-9700.',
  'tef',
  ARRAY['tef','cielo','erro -1','clisitef','comunicacao','servico','restart','porta 2000'],
  'TEF Cielo erro -1 todas transações falhando',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Padaria Pão Quente', 'Suporte Auge',
  'PinPad Ingenico iCT220 não inicializa — tela em branco após ligar',
  'Firmware do PinPad corrompido ou arquivo de configuração iSAF ausente. Pode ocorrer após queda de energia durante atualização.',
  '1. Tentar reset de fábrica: segurar teclas Amarela + Ponto ao ligar até aparecer menu de manutenção. 2. No menu de manutenção: selecionar "Initialize" ou "Factory Reset". 3. Após reset: o PinPad fica em estado básico — a parametrização é feita pelo SiTef na primeira transação. 4. Se tela continuar em branco: verificar cabo de alimentação e fonte (o iCT220 pode usar fonte própria ou USB — verificar o modelo). 5. Verificar se o host USB está reconhecendo o dispositivo (Gerenciador de Dispositivos). 6. Se o reset não resolver: o PinPad pode estar com hardware danificado — acionar reposição com a Ingenico/Cielo/Stone.',
  'tef',
  ARRAY['pinpad','ingenico','ict220','tela branca','firmware','reset','isaf','inicializar'],
  'PinPad Ingenico iCT220 não inicializa tela em branco',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Pet Shop Animal', 'Suporte Auge',
  'Cancelamento/estorno de cartão não está disponível no menu do TEF',
  'O tipo de operação "Cancelamento" pode estar desabilitado nas configurações do SiTef ou o prazo de cancelamento (geralmente D+0 ou D+1) já passou.',
  '1. Verificar se a opção está disponível no SiTef: tela principal → Financeiro → Cancelamento/Estorno. 2. Se a opção não aparecer: acessar configurações do CliSiTef (sitef.ini) → verificar parâmetro "HabilitaCancelamento=1". 3. Prazo para cancelamento sem solicitação da operadora: geralmente até as 23h59 do dia. Após isso, é "Estorno" que pode ter tarifa. 4. Para estorno tardio: entrar em contato com a operadora (Cielo, Stone, Rede, etc.) com o NSU da transação. 5. Nunca fazer duplo débito antes de confirmar o estorno. 6. Guardar o comprovante da transação original com NSU para acionar a operadora.',
  'tef',
  ARRAY['cancelamento','estorno','tef','sitef','nsu','prazo','operadora','habilitacancelamento'],
  'Cancelamento estorno cartão não disponível menu TEF',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Ótica Visão Clara', 'Suporte Auge',
  'TEF em homologação processando transações reais — cliente foi cobrado indevidamente',
  'Ambiente de homologação configurado com credenciais de produção, ou sistema foi configurado em produção com código de homologação.',
  '1. URGENTE: identificar qual ambiente está configurado no sitef.ini: parâmetro "Ambiente" ou "Homologacao". 2. Se for homologação com credencial de produção: parar IMEDIATAMENTE as transações. 3. Contatar a operadora com a lista de transações indevidas (NSU, data, hora, valor) para estorno em massa. 4. Corrigir o sitef.ini: em produção = Ambiente=Producao; em homologação = Ambiente=Homologacao com credenciais de teste. 5. Em homologação: os cartões de teste fornecidos pela operadora NÃO são cartões reais — nunca usar cartões reais em homologação. 6. Confirmar com a operadora que estornos foram processados.',
  'tef',
  ARRAY['homologacao','producao','tef','sitef','transacao indevida','estorno','credencial','nsu'],
  'TEF homologação processando transações reais cliente cobrado indevidamente',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja de Calçados Passos', 'Suporte Auge',
  'Transação de débito não autorizada — adquirente retorna "Modalidade não habilitada"',
  'O contrato com a adquirente não inclui a modalidade de débito, ou o débito não foi habilitado no terminal após a contratação.',
  '1. Verificar quais modalidades estão contratadas: ligar para a operadora com o CNPJ do estabelecimento. 2. Se débito não contratado: solicitar habilitação (geralmente feita em até 48h). 3. Se contratado mas não habilitado: a operadora precisa enviar parametrização para o terminal — isso é feito via download de parâmetros pelo próprio terminal. 4. No SiTef: executar "Download de Parâmetros" ou "Atualização de Terminal" na tela de manutenção. 5. Após download: testar uma transação de débito de valor baixo. 6. Contatos: Cielo 4002-9700, Stone 3004-9680, Rede 4001-4433.',
  'tef',
  ARRAY['debito','modalidade','nao habilitada','contrato','download parametros','terminal','adquirente'],
  'Transação débito não autorizada modalidade não habilitada',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Ferragem Total', 'Suporte Auge',
  'Erro SSL/TLS ao comunicar com adquirente — "protocolo não suportado" nos logs do SiTef',
  'O servidor onde o SiTef está instalado tem TLS 1.0/1.1 habilitado mas a adquirente exige TLS 1.2 ou superior, ou vice-versa.',
  '1. Verificar a versão do Windows Server: Windows 2008 R2 e anteriores não suportam TLS 1.2 nativamente. 2. Para habilitar TLS 1.2 no Windows: executar script Microsoft "IISCrypto" (https://www.nartac.com/Products/IISCrypto) → selecionar "Best Practices" → Aplicar → Reiniciar. 3. Após reiniciar: testar comunicação com a adquirente. 4. Se o problema persistir: verificar se o .NET Framework instalado suporta TLS 1.2 — .NET 4.6+ é necessário. 5. Instalar .NET 4.8 se necessário. 6. Verificar certificados raiz da Microsoft — podem precisar de atualização.',
  'tef',
  ARRAY['ssl','tls','protocolo','nao suportado','tls12','windows server','net framework','adquirente'],
  'Erro SSL TLS comunicação adquirente protocolo não suportado SiTef',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Açougue Carne Boa', 'Suporte Auge',
  'Transação de cartão pendente no SiTef — caixa não consegue fechar o turno',
  'Uma transação foi iniciada mas não finalizada (nem confirmada nem desfeita), deixando o SiTef com pendência que bloqueia o fechamento.',
  '1. No SiTef: acessar Financeiro → Consulta de Pendência → verificar se há transação pendente. 2. Se houver: verificar NSU e valor da transação pendente. 3. Consultar com o banco/adquirente se a transação foi aprovada ou não usando o NSU. 4. Se aprovada: confirmar a transação no SiTef (Financeiro → Confirmar Pendência). 5. Se não aprovada/expirada: desfazer a transação (Financeiro → Desfazer Pendência). 6. Após resolver a pendência: o caixa pode ser fechado normalmente. 7. Para evitar: nunca desligar o computador durante uma transação em andamento.',
  'tef',
  ARRAY['transacao pendente','sitef','caixa fechamento','nsu','confirmar','desfazer','pendencia'],
  'Transação cartão pendente SiTef caixa não consegue fechar turno',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Mercadinho Família', 'Suporte Auge',
  'Voucher/Vale-refeição VR ou Alelo não funciona no TEF — erro de credenciamento',
  'A bandeira de voucher (VR, Alelo, Ticket, Sodexo) não está credenciada no estabelecimento ou no terminal TEF, ou precisa de habilitação específica.',
  '1. Vouchers exigem credenciamento separado das bandeiras de crédito/débito — ter um contrato Cielo/Rede não inclui automaticamente vouchers. 2. Verificar o contrato com a operadora: vouchers como VR, Alelo e Ticket têm contratos próprios. 3. Solicitar à operadora o cadastro para a bandeira de voucher desejada. 4. Após credenciamento: solicitar parametrização do terminal (download de parâmetros). 5. Verificar se o produto/serviço se enquadra como alimentação/refeição — vouchers têm restrição por categoria (MCC). 6. Restaurantes e supermercados: usar MCC correto no contrato.',
  'tef',
  ARRAY['voucher','vale refeicao','vr','alelo','ticket','sodexo','credenciamento','mcc','bandeira'],
  'Voucher vale-refeição VR Alelo não funciona TEF erro credenciamento',
  true, 'treinamento_erp_v2'
),

-- ============================================================
-- DOMÍNIO: PDV — TillitPDV / AugePDV
-- ============================================================

(
  'auge', 'seed_erp_v2', 'Loja Eletrônicos Tech', 'Suporte Auge',
  'Desconto aplicado no PDV sendo diferente do preenchido — sistema arredonda para valores estranhos',
  'Configuração de casas decimais no PDV diferente do esperado, ou percentual de desconto sendo calculado sobre valor já com desconto anterior.',
  '1. Verificar o tipo de desconto aplicado: percentual (%) ou valor fixo (R$). 2. Para desconto percentual: o cálculo é sobre o subtotal dos itens selecionados — confirmar se está aplicando no item correto. 3. Verificar configuração de casas decimais: AugePDV/TillitPDV → Configurações → Decimais → deve estar em 2 casas para R$. 4. Verificar se há desconto máximo configurado no cadastro do produto ou na tabela de preços — o PDV pode estar limitando. 5. Verificar se o operador tem permissão de desconto acima de X% — perfis de acesso podem restringir. 6. Testar o desconto com valor exato (ex: 10% sobre R$100,00 = R$10,00) para isolar o problema.',
  'pdv',
  ARRAY['desconto','pdv','arredondamento','percentual','casas decimais','permissao','tabela preco'],
  'Desconto PDV diferente do preenchido sistema arredonda valores estranhos',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Supermercado Bom Lar', 'Suporte Auge',
  'PDV não aceita produto pesável — campo de quantidade não permite vírgula/decimais',
  'Produto cadastrado como unidade (UN) ao invés de quilograma (KG) no AugeWEB, impedindo entrada de quantidade decimal no PDV.',
  '1. Verificar o cadastro do produto no AugeWEB: campo "Unidade de Medida" deve ser KG ou G (grama) para produtos pesáveis. 2. Se estiver como UN: alterar para KG no cadastro do produto. 3. Verificar também a flag "Produto Pesável" se existir no cadastro. 4. Para produtos com balança integrada: o PDV deve estar configurado com a porta e protocolo da balança (Toledo, Filizola, etc.). 5. Testar: no PDV, ao chamar o produto, deve aparecer campo para digitar o peso em kg (ex: 1,350). 6. Se o PDV usa balança com leitura automática: verificar se a balança está enviando o peso corretamente pela porta serial/USB.',
  'pdv',
  ARRAY['produto pesavel','kg','unidade','decimais','balanca','serial','cadastro produto','augeweb'],
  'PDV não aceita produto pesável campo quantidade sem decimais',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Papelaria e Bazar', 'Suporte Auge',
  'Troca/devolução de produto não está disponível no PDV — opção bloqueada',
  'A operação de troca ou devolução pode estar desabilitada no perfil do operador, ou requer autenticação de gerente não configurada.',
  '1. Verificar permissões do operador: AugePDV → Administrativo → Perfis de Acesso → localizar o perfil do operador → verificar se "Troca/Devolução" está habilitado. 2. Se requer gerente: o gerente deve autenticar com senha no PDV para liberar a operação. 3. Para fazer devolução: PDV → Operações → Troca/Devolução → informar número do cupom/NFC-e original. 4. Verificar se o cupom original foi emitido dentro do prazo de devolução configurado (ex: 30 dias). 5. A devolução gera entrada de estoque automaticamente se configurado. 6. Para reembolso em dinheiro: verificar se há saldo no caixa — o sistema valida antes de permitir.',
  'pdv',
  ARRAY['troca','devolucao','pdv','permissao','gerente','autenticacao','cupom original','perfil acesso'],
  'Troca devolução produto não disponível PDV opção bloqueada',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja de Departamentos', 'Suporte Auge',
  'Código de barras do produto não está sendo lido — leitor apita mas produto não aparece',
  'O EAN/código de barras do produto não está cadastrado no AugeWEB com o mesmo código que está na etiqueta do produto, ou há espaços no código.',
  '1. Testar o código em um bloco de notas: abrir o Notepad e passar o leitor — ver exatamente o que é lido (incluindo caracteres extras). 2. Comparar com o código cadastrado no produto no AugeWEB: verificar se são idênticos. 3. Problemas comuns: código no sistema com ponto/traço, código EAN13 vs EAN8 diferente, dígito verificador diferente. 4. Se o código bate mas o produto não aparece: verificar se o produto está ativo e com preço para a filial do PDV. 5. Para produtos pesáveis com etiqueta de balança: o código começa com 2 — verificar formato de decodificação no PDV (preço embutido vs peso embutido). 6. Atualizar o EAN no cadastro do produto se necessário.',
  'pdv',
  ARRAY['codigo barras','ean','leitor','nao encontrado','produto','notepad','ean13','balanca etiqueta'],
  'Código de barras produto não lido leitor apita produto não aparece',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja de Cosméticos Beauty', 'Suporte Auge',
  'Venda em crediário não aparece nos relatórios financeiros do AugeWEB',
  'Crediário (conta corrente) configurado como modalidade de pagamento no PDV mas não sendo integrado ao módulo financeiro do AugeWEB.',
  '1. Verificar no AugeWEB: Financeiro → Contas a Receber → filtrar por cliente → verificar se a venda consta. 2. Se não constar: verificar se a modalidade "Crediário" no PDV está mapeada para uma conta de receber no AugeWEB. 3. Configuração: AugeWEB → Parâmetros → Formas de Pagamento → Crediário → verificar se está vinculado ao módulo financeiro. 4. Verificar se o cliente tem cadastro completo (CPF/CNPJ obrigatório para crediário). 5. Verificar limite de crédito: se o cliente ultrapassou o limite, o PDV pode ter rejeitado silenciosamente. 6. Consultar log do PDV para verificar o status final da venda.',
  'pdv',
  ARRAY['crediario','conta corrente','financeiro','contas receber','forma pagamento','augeweb','limite credito'],
  'Venda crediário não aparece relatórios financeiros AugeWEB',
  true, 'treinamento_erp_v2'
),

-- ============================================================
-- DOMÍNIO: ESTOQUE
-- ============================================================

(
  'auge', 'seed_erp_v2', 'Distribuidora de Bebidas', 'Suporte Auge',
  'Custo médio do produto ficou errado após entrada com valor muito diferente',
  'Nota de entrada lançada com valor incorreto (digitação errada no preço unitário) alterou o custo médio ponderado do produto.',
  '1. O custo médio é recalculado automaticamente a cada entrada: CMed = (Estoque atual × CMed anterior + Qtd entrada × Custo entrada) / (Estoque atual + Qtd entrada). 2. Identificar a entrada incorreta: AugeWEB → Estoque → Histórico de Movimentações → filtrar o produto → localizar a entrada com valor errado. 3. Se possível: cancelar/excluir a entrada incorreta e relançar com o valor correto. 4. Se a NF já foi escriturada fiscalmente: não pode alterar — precisa de ajuste de custo manual. 5. Ajuste de custo: AugeWEB → Estoque → Ajuste de Custo → inserir o custo correto com justificativa. 6. Documentar o ajuste para auditoria futura.',
  'estoque',
  ARRAY['custo medio','custo ponderado','entrada','preco errado','ajuste custo','historico movimentacao','nf entrada'],
  'Custo médio produto errado após entrada com valor diferente',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Açougue Prime', 'Suporte Auge',
  'Produto em KG vendido no PDV por quantidade (UN) — estoque descontando errado',
  'Produto configurado como KG no estoque mas vendido em unidades no PDV sem conversão de unidade configurada.',
  '1. Verificar o cadastro do produto: AugeWEB → Produto → campo Unidade Padrão (estoque) e Unidade de Venda. 2. Se produto é comprado em KG e vendido em pacotes de 500g: configurar fator de conversão — 1 KG = 2 unidades. 3. AugeWEB → Produto → aba Unidades de Medida → adicionar conversão: 1 UN (venda) = 0,5 KG (estoque). 4. No PDV: o sistema vai descontar 0,5 KG do estoque a cada unidade vendida. 5. Para produto pesável vendido à granel: manter ambas as unidades como KG — o PDV pede o peso na venda. 6. Corrigir o estoque atual via ajuste manual se já há divergência acumulada.',
  'estoque',
  ARRAY['kg','unidade','conversao','fator','produto pesavel','estoque','venda','ajuste'],
  'Produto KG vendido por unidade estoque descontando errado',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Mercearia do João', 'Suporte Auge',
  'Transferência de estoque entre filiais não chegou no destino — saldo sumiu',
  'Transferência iniciada na filial de origem mas não recebida/confirmada na filial de destino, ficando em trânsito.',
  '1. Verificar o status da transferência: AugeWEB → Estoque → Transferências → localizar a transferência → verificar status (Enviada, Em Trânsito, Recebida). 2. Se status "Enviada" ou "Em Trânsito": na filial de destino, confirmar o recebimento — AugeWEB → Estoque → Receber Transferência → localizar pelo número. 3. Só após confirmação o estoque entra na filial destino — isso é proposital para rastreabilidade. 4. Se a transferência sumiu sem rastro: verificar no log de sincronização do TillitConcentrador se houve falha de transmissão. 5. Se a transferência foi perdida: cancelar na origem se possível e refazer; o estoque que saiu da origem pode precisar de ajuste manual.',
  'estoque',
  ARRAY['transferencia','filial','estoque','em transito','receber','confirmar','concentrador','sincronizacao'],
  'Transferência estoque entre filiais não chegou destino saldo sumiu',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Perfumaria Aroma', 'Suporte Auge',
  'Dois produtos com o mesmo EAN cadastrados — PDV chamando produto errado',
  'EAN duplicado no sistema: dois produtos distintos compartilhando o mesmo código de barras, geralmente por erro de cadastro manual.',
  '1. Localizar os produtos duplicados: AugeWEB → Relatórios → Produtos por EAN → filtrar pelo EAN duplicado. 2. Identificar qual produto está com o EAN correto (consultar a embalagem física). 3. No produto com EAN incorreto: remover o EAN ou substituir pelo EAN correto do produto. 4. Atenção: se o EAN duplicado foi usado em entradas de estoque, remover pode gerar inconsistência — verificar histórico antes. 5. Escanear o produto no Notepad para confirmar o EAN da embalagem real. 6. Após correção: testar no PDV para garantir que o produto correto está sendo chamado.',
  'estoque',
  ARRAY['ean','codigo barras','duplicado','produto','cadastro','pdv','embalagem'],
  'Dois produtos mesmo EAN cadastrados PDV chamando produto errado',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja de Informática', 'Suporte Auge',
  'Grade de produto (variações cor/tamanho) com estoque consolidado — sistema não diferencia variantes',
  'Produto com grade (ex: camiseta P/M/G/GG ou celular preto/branco) cadastrado sem as variações, resultando em estoque único sem distinção.',
  '1. Para produtos com grade: AugeWEB → Produto → aba Grade/Variações → criar as variações (ex: Tamanho: P, M, G, GG; Cor: Preto, Branco). 2. Cada combinação de grade gera um sub-produto com EAN próprio — o fornecedor geralmente fornece EAN diferente por variação. 3. O estoque é controlado por variação: "Camiseta M Azul" = estoque separado de "Camiseta G Vermelha". 4. Para migrar produtos existentes sem grade: fazer ajuste zerador + recontagem por variação + cadastrar grade e inserir estoque por variação. 5. No PDV: ao vender produto com grade, o sistema pergunta qual variação antes de incluir no carrinho.',
  'estoque',
  ARRAY['grade','variacao','tamanho','cor','sku','sub-produto','ean grade','augeweb'],
  'Grade produto variações cor tamanho estoque consolidado sem diferenciação',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Hortifrúti Verde Vida', 'Suporte Auge',
  'Relatório de curva ABC de estoque mostrando dados incorretos — itens errados na curva A',
  'O relatório de curva ABC baseia-se nas vendas do período — se o período selecionado ou os filtros de filial estão incorretos, a curva fica distorcida.',
  '1. Curva ABC classifica produtos por representatividade no faturamento: A = 80% do faturamento (poucos produtos), B = 15%, C = 5% (muitos produtos). 2. Verificar os filtros do relatório: período, filial(is), categoria de produto. 3. Produtos que estão na curva A incorretamente: verificar se houve venda em promoção com volume anormal no período — isso distorce a curva. 4. Para análise mais precisa: usar período de 3-6 meses ao invés de 1 mês. 5. Produtos sem movimentação no período ficam automaticamente na curva C/D — normal. 6. Usar a curva ABC para ressuprimento: produtos A devem ter estoque mínimo maior e reposição mais frequente.',
  'estoque',
  ARRAY['curva abc','relatorio','estoque','faturamento','periodo','filial','ressuprimento','analise'],
  'Relatório curva ABC estoque dados incorretos itens errados na curva A',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Atacadão do Povo', 'Suporte Auge',
  'Ponto de pedido (estoque mínimo) não está gerando alertas de reposição',
  'O estoque mínimo está configurado como zero ou o relatório de itens abaixo do mínimo não está sendo consultado com frequência.',
  '1. Configurar estoque mínimo por produto: AugeWEB → Produto → campo Estoque Mínimo → inserir a quantidade que aciona o alerta. 2. O estoque mínimo deve ser calculado como: consumo médio diário × lead time do fornecedor (em dias) + estoque de segurança. 3. Para ver alertas: AugeWEB → Estoque → Produtos Abaixo do Mínimo → gerar relatório. 4. Para alertas automáticos por e-mail: verificar se há configuração de notificação automática no AugeWEB (depende da versão). 5. Configurar rotina diária: responsável pelo estoque acessa o relatório no início do expediente. 6. Estoque mínimo ≠ ponto de pedido — ponto de pedido = mínimo + quantidade para cobrir o tempo de reposição.',
  'estoque',
  ARRAY['estoque minimo','ponto pedido','alerta','reposicao','lead time','seguranca','relatorio'],
  'Ponto de pedido estoque mínimo não gerando alertas reposição',
  true, 'treinamento_erp_v2'
),

-- ============================================================
-- DOMÍNIO: HARDWARE / EQUIPAMENTOS
-- ============================================================

(
  'auge', 'seed_erp_v2', 'Mercado da Esquina', 'Suporte Auge',
  'SAT Fiscal Elgin com erro de comunicação — PDV retorna "SAT não encontrado"',
  'SAT não está respondendo na porta USB ou o serviço de comunicação SAT (driver/DLL) não está carregado corretamente.',
  '1. Verificar se o SAT está ligado e com LED indicando operação (LED verde piscando). 2. No Gerenciador de Dispositivos: verificar se aparece sem erro de ponto de exclamação — em "Dispositivos de Interface Humana" ou "Portas COM". 3. Se aparecer com erro: desinstalar o driver → desconectar SAT → reconectar → instalar driver correto do site Elgin. 4. Verificar se o serviço "Elgin SAT" está rodando em services.msc. 5. No AugePDV/TillitPDV: Configurações → SAT Fiscal → testar comunicação → deve retornar número de série do SAT. 6. Se tudo OK mas PDV não encontra: verificar se a DLL do SAT (satkey.dll ou similar) está na pasta do sistema ou na pasta do PDV.',
  'hardware',
  ARRAY['sat','elgin','usb','driver','dll','servico','comunicacao','led','gerenciador dispositivos'],
  'SAT Fiscal Elgin erro comunicação PDV SAT não encontrado',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja de Flores', 'Suporte Auge',
  'Gaveta de dinheiro não abre com o comando do PDV — abre só manualmente com a chave',
  'Gaveta conectada na impressora via cabo RJ11/RJ12 mas o PDV não está enviando o pulso de abertura, ou o conector está na porta errada da impressora.',
  '1. Verificar a conexão: a gaveta usa cabo RJ11 (telefônico) conectado na impressora térmica, NÃO diretamente no computador. 2. Na impressora: deve haver uma porta "DK" ou "Drawer" — plugar o cabo da gaveta ali, não na porta "Serial". 3. No PDV: a gaveta abre junto com o cupom fiscal. Verificar se o cupom está sendo impresso — se a impressora não imprime, a gaveta não abre. 4. Testar abertura manual pelo PDV: em alguns sistemas há botão "Abrir Gaveta" em Operações → Caixa. 5. Se a impressora imprime mas gaveta não abre: verificar se o pulso de abertura está habilitado nas configurações da impressora (comandos ESC/POS). 6. Testar com outro cabo RJ11 — cabos de telefone antigos podem não ter todos os pinos necessários.',
  'hardware',
  ARRAY['gaveta','dinheiro','rj11','rj12','impressora','dk','drawer','pulso','esc/pos'],
  'Gaveta dinheiro não abre comando PDV abre só manualmente chave',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja de Eletrodomésticos', 'Suporte Auge',
  'Monitor touchscreen com cliques imprecisos — toca em um lugar e registra em outro',
  'O touchscreen precisa de calibração, ou o driver de toque está desatualizado/corrompido.',
  '1. Calibrar o touchscreen: Painel de Controle → Configurações do Tablet PC → Calibrar → seguir as instruções tocando nos pontos indicados. 2. Alternativa: Gerenciador de Dispositivos → Dispositivos de Interface Humana → HID-Compliant Touch Screen → Desinstalar → Verificar se há atualizações de hardware. 3. Se o driver foi desinstalado: reiniciar o computador — o Windows instala o driver genérico automaticamente. 4. Para monitores de marcas específicas (Elo Touch, Bematech): instalar o driver da marca ao invés do genérico. 5. Verificar se há sujeira ou protetor de tela deslocado causando desvio. 6. Testar em resolução nativa do monitor — resoluções diferentes da nativa causam descalibração.',
  'hardware',
  ARRAY['touchscreen','calibracao','clique','impreciso','driver','elo touch','bematech','painel controle'],
  'Monitor touchscreen cliques imprecisos toca lugar registra outro',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Padaria Artesanal', 'Suporte Auge',
  'Impressora de etiquetas Argox/Zebra imprimindo etiquetas em branco ou sem texto',
  'A impressora térmica de etiquetas está com configuração de temperatura incorreta, ou o layout de etiqueta usa fonte/variável diferente da configurada.',
  '1. Primeiro verificar se é problema de temperatura: a impressora térmica de etiquetas precisa de temperatura adequada para o tipo de papel. Aumentar a densidade/temperatura nas configurações da impressora. 2. Para Argox: acessar pelo software Bartender ou Labelbank → Configurações da Impressora → Densidade. 3. Para Zebra: usar o software Zebra Setup Utilities → Densidade de impressão. 4. Se sair linhas mas sem texto: o layout da etiqueta referencia variáveis que não estão sendo passadas pelo AugeWEB. Verificar o template de etiqueta. 5. Imprimir etiqueta de teste pela própria impressora (segurar botão de alimentação ao ligar) — se sair, o hardware está OK e o problema é no software. 6. Verificar se o papel de etiqueta está posicionado corretamente e alinhado com os sensores.',
  'hardware',
  ARRAY['impressora etiqueta','argox','zebra','etiqueta branca','temperatura','densidade','bartender','labelbank'],
  'Impressora etiquetas Argox Zebra imprimindo etiquetas em branco sem texto',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Conveniência 24h', 'Suporte Auge',
  'Computador do PDV reiniciando sozinho durante pico de atendimento — suspeita de UPS/nobreak',
  'O nobreak (UPS) está com bateria degradada e ao detectar variação de tensão sinaliza desligamento forçado, ou a potência do UPS é insuficiente para o equipamento.',
  '1. Verificar se o nobreak está emitindo bipe de bateria fraca — bipes contínuos ou alternados indicam bateria baixa. 2. Testar: desligar o nobreak da tomada — se o computador desligar imediatamente, a bateria não está segurando a carga. 3. Baterias de nobreak duram de 2 a 4 anos — verificar a data de fabricação na etiqueta da bateria. 4. Substituir a bateria do nobreak (modelo específico por fabricante: NHS, APC, Ragtech, etc.). 5. Verificar se a potência do nobreak é suficiente: somar consumo dos equipamentos (computador + monitor + impressora) e comparar com a capacidade em VA do nobreak. 6. Evitar conectar equipamentos desnecessários no nobreak (ventiladores, carregadores) para preservar a autonomia.',
  'hardware',
  ARRAY['nobreak','ups','bateria','reiniciando','potencia','va','bipe','degradada','nhs','apc'],
  'Computador PDV reiniciando sozinho pico atendimento suspeita nobreak UPS',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Farmácia Popular', 'Suporte Auge',
  'Data e hora do sistema errada no PDV — NF-e sendo rejeitada por data',
  'O relógio do computador está desincronizado. A SEFAZ rejeita notas com timestamp muito diferente do horário real (geralmente tolerância de ±5 minutos).',
  '1. Corrigir a data/hora: clique direito no relógio da barra de tarefas → Ajustar data/hora → Sincronizar Agora. 2. Verificar se o Windows Time Service está ativo: services.msc → "Windows Time" → deve estar "Em execução" e Automático. 3. Se a hora volta a desacertar após reiniciar: a pilha CMOS (bateria do setup do computador) está fraca — substituir a bateria CR2032 na placa-mãe. 4. Configurar sincronização com servidor NTP confiável: no Registro ou via GPO: time.windows.com ou a.ntp.br. 5. Certificar que o fuso horário está correto: Brasília = UTC-3 (ou UTC-2 no horário de verão). 6. Após acertar: reiniciar o serviço de emissão fiscal e testar.',
  'hardware',
  ARRAY['data hora','relogio','sincronizacao','ntp','cmos','bateria','fuso horario','nfe rejeicao','windows time'],
  'Data hora sistema errada PDV NF-e rejeitada por data',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Restaurante Sabor', 'Suporte Auge',
  'Impressora de recibo não corta o papel (guilhotina) — cupom sai em rolo contínuo',
  'O comando de corte (ESC/POS) não está sendo enviado pelo sistema, ou a guilhotina está travada mecanicamente.',
  '1. Verificar se é guilhotina mecânica travada: desligar a impressora, abrir a tampa e verificar se há papel preso na lâmina. Limpar com cuidado. 2. Testar o corte manual: na impressora Bematech: segurar botão de alimentação por 3s → deve cortar. Se não cortar, a guilhotina tem problema mecânico. 3. Se o corte manual funciona mas o sistema não corta: o problema é no driver ou configuração do PDV. Verificar configurações da impressora no sistema → habilitar "Guilhotina/Corte automático". 4. Para impressoras ESC/POS: o comando de corte é ESC i (corte total) ou ESC m (corte parcial) — verificar se o driver está enviando. 5. Driver genérico "Generic/Text Only" não envia corte — instalar driver nativo da impressora.',
  'hardware',
  ARRAY['impressora','guilhotina','corte','papel','esc/pos','bematech','driver','cupom','trava'],
  'Impressora recibo não corta papel guilhotina cupom sai contínuo',
  true, 'treinamento_erp_v2'
),

-- ============================================================
-- DOMÍNIO: INTEGRAÇÃO / CONCENTRADOR / API
-- ============================================================

(
  'auge', 'seed_erp_v2', 'Rede de Lojas SuperModa', 'Suporte Auge',
  'Sincronização de preços entre filiais com atraso de mais de 2 horas',
  'O agendamento de sincronização do Concentrador está configurado com intervalo muito longo, ou a sincronização automática falhou silenciosamente.',
  '1. Verificar o log do Concentrador: pasta de instalação → logs → filtrar pelo horário do problema. 2. Verificar o agendamento de sincronização: TillitConcentrador → Configurações → Agendamentos → intervalo de sincronização de catálogo. 3. Reduzir intervalo para 15-30 minutos se a necessidade for alta. 4. Para sincronização imediata: TillitConcentrador → Sincronização Manual → Catálogo de Preços → Executar agora. 5. Verificar se há erros de conectividade: se alguma filial está offline, pode segurar a sincronização das demais. 6. Configurar notificação de falha de sincronização: alertar o suporte quando a sincronização falhar por mais de X tentativas.',
  'integracao',
  ARRAY['sincronizacao','preco','filial','concentrador','atraso','agendamento','catalogo','log'],
  'Sincronização preços entre filiais com atraso mais de 2 horas',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Livraria Cultural', 'Suporte Auge',
  'API de consulta de NF-e retornando timeout ao consultar chave na SEFAZ',
  'A consulta via webservice da SEFAZ está demorando mais que o timeout configurado, geralmente por sobrecarga do serviço estadual.',
  '1. Verificar o status do webservice da SEFAZ estadual: https://www.nfe.fazenda.gov.br/portal → Status dos Serviços. 2. Se o serviço estiver "Lento" ou "Instável": aguardar e tentar mais tarde. 3. Se persistir: aumentar o timeout de consulta nas configurações do AugeWEB → Parâmetros → Comunicação NF-e → Timeout (aumentar de 30s para 60s). 4. Implementar retry com backoff: tentar 3x com intervalos de 5s, 15s, 30s. 5. Para consultas urgentes durante instabilidade: usar diretamente o portal da SEFAZ ou o aplicativo da SEFAZ Nota Fiscal Paulista / estadual correspondente. 6. Registrar o incidente com data/hora para documentar indisponibilidade do serviço.',
  'integracao',
  ARRAY['api','nfe','timeout','sefaz','webservice','consulta','retry','backoff','status servico'],
  'API consulta NF-e retornando timeout consultar chave SEFAZ',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Shopping Moda e Cia', 'Suporte Auge',
  'XML de nota de terceiro (entrada) com CNPJ do emitente inválido — AugeWEB rejeita a importação',
  'O XML foi gerado com erro pelo fornecedor ou foi corrompido durante o download. O CNPJ na tag emitente não tem dígito verificador válido.',
  '1. Verificar o XML bruto: abrir com bloco de notas ou editor XML → localizar a tag <CNPJ> dentro de <emit>. 2. Validar o CNPJ encontrado em qualquer validador online. 3. Se o CNPJ estiver errado: o fornecedor emitiu a nota com erro — solicitar ao fornecedor a DANFE correta ou o XML corrigido. 4. NÃO alterar o XML manualmente — isso invalida a assinatura digital e torna a nota sem validade fiscal. 5. Solicitar ao fornecedor o cancelamento e reemissão da nota com o CNPJ correto. 6. Se o fornecedor não puder reemitir: consultar o contador — pode ser necessário usar a DANFE em papel para escrituração e ignorar o XML.',
  'integracao',
  ARRAY['xml','cnpj','invalido','nota entrada','importacao','fornecedor','assinatura digital','danfe'],
  'XML nota terceiro entrada CNPJ emitente inválido AugeWEB rejeita importação',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Loja Multicanal Online', 'Suporte Auge',
  'Integração com marketplace (pedidos do e-commerce) não está baixando novos pedidos',
  'A integração via API do marketplace está com token expirado, ou o endpoint de webhook mudou sem notificação.',
  '1. Verificar o log da integração: AugeWEB → Integrações → Marketplace → Log de Sincronização → procurar erros de autenticação (401 Unauthorized) ou URL (404 Not Found). 2. Token expirado: acessar o painel do marketplace → Integrações → gerar novo token/API key → atualizar no AugeWEB. 3. Endpoint mudou: verificar na documentação da API do marketplace se houve depreciação de versão — mudar para a versão mais nova da API. 4. Verificar se há pendências de aceite de novos Termos de Serviço no painel do marketplace — alguns bloqueiam a API até o aceite. 5. Testar manualmente: AugeWEB → Integrações → Forçar Sincronização → verificar resultado.',
  'integracao',
  ARRAY['marketplace','pedido','ecommerce','token','webhook','api','401','404','sincronizacao','integracao'],
  'Integração marketplace pedidos e-commerce não baixando novos pedidos',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Distribuidora Central', 'Suporte Auge',
  'Certificado digital A3 (smartcard/token) não sendo reconhecido pela aplicação de NF-e',
  'O driver do token/smartcard A3 não está instalado, ou a versão do middleware (SafeNet, eToken, etc.) é incompatível com o Windows atual.',
  '1. Verificar se o token aparece no Gerenciador de Dispositivos sem erros quando conectado. 2. Instalar o middleware correto: cada fabricante tem seu próprio — Safeweb/Certisign: SafeSign, eToken da Aladdin: SafeNet Authentication Client, Prosec: driver Prosec. 3. Abrir o software do middleware e verificar se o certificado aparece lá — se sim, o token está OK. 4. No Windows: Gerenciador de Certificados (certmgr.msc) → Pessoal → verificar se o certificado A3 aparece listado. 5. Se o certificado não aparece no certmgr mas aparece no middleware: verificar integração entre o middleware e o armazenamento do Windows. 6. Para certificado A3 em máquina virtual (VMware/Hyper-V): o token USB precisa de passthrough USB configurado corretamente.',
  'integracao',
  ARRAY['certificado a3','smartcard','token','middleware','safenet','etoken','driver','certmgr','usb'],
  'Certificado digital A3 smartcard token não reconhecido aplicação NF-e',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Auto Peças Rápido', 'Suporte Auge',
  'Manifesto Eletrônico de Documentos Fiscais (MDF-e) com rejeição — carga não pode ser transportada',
  'O MDF-e é obrigatório para transportadoras e emitentes que transportam carga em veículo próprio passando por mais de um município. Rejeições comuns são de RNTRC, placa ou condutor.',
  '1. Verificar o código de rejeição específico do MDF-e: 781 = RNTRC do transportador inválido; 782 = Placa do veículo inválida; 784 = CPF do condutor inválido. 2. Para rejeição 781: verificar o RNTRC (Registro Nacional de Transportadores) — deve ter 8 dígitos numéricos, obtido na ANTT. 3. Para rejeição 782: a placa deve estar no formato Mercosul (ABC1D23) ou antigo (ABC1234) — sem caracteres especiais. 4. Para rejeição 784: CPF do condutor deve ser válido e estar no banco de dados da SEFAZ. 5. Corrigir os dados no cadastro do veículo/condutor no AugeWEB e reemitir. 6. MDF-e deve ser encerrado ao chegar no destino — não esquecer de encerrar.',
  'integracao',
  ARRAY['mdfe','manifesto','rntrc','placa','condutor','antt','rejeicao 781','782','784','transportadora'],
  'Manifesto MDF-e rejeição carga não pode ser transportada',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Rede Farmacêutica', 'Suporte Auge',
  'Webhook de pagamento não chegando ao AugeWEB — pagamentos online não atualizando status',
  'O endpoint de webhook configurado na plataforma de pagamento não consegue alcançar o servidor do AugeWEB, geralmente por firewall ou IP dinâmico.',
  '1. Verificar no painel da plataforma de pagamento (PagSeguro, Mercado Pago, etc.) os logs de tentativas de webhook — deve mostrar erros de conexão ou respostas 4xx/5xx. 2. Confirmar a URL do webhook configurada: deve ser o IP externo fixo do servidor (ou domínio) + porta + path. 3. Se o servidor tem IP dinâmico: configurar DNS dinâmico (NoIP, DuckDNS) ou adquirir IP fixo. 4. Verificar se a porta do webhook (geralmente 443 HTTPS ou 80 HTTP) está aberta no roteador e firewall. 5. Testar o webhook manualmente: na plataforma de pagamento, usar o botão "Reenviar" ou "Testar Webhook". 6. Se usar HTTPS: verificar se o certificado SSL do servidor é válido — plataformas rejeitam webhooks para certificados expirados ou auto-assinados.',
  'integracao',
  ARRAY['webhook','pagamento online','ssl','https','firewall','ip fixo','dns dinamico','pagseguro','mercado pago'],
  'Webhook pagamento não chegando AugeWEB pagamentos online sem atualização',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Construtora Avança', 'Suporte Auge',
  'CT-e (Conhecimento de Transporte) rejeição 689 — dados do seguro de carga obrigatórios ausentes',
  'O CT-e exige dados do seguro de carga quando o valor da mercadoria supera certo limite, ou quando a configuração da empresa indica que seguro é obrigatório.',
  '1. Rejeição 689 específica: o campo de seguro de carga (<seg>) está ausente ou com responsável e CNPJ da seguradora inválidos. 2. Verificar no AugeWEB (ou sistema de CT-e) os dados de seguro configurados: Parâmetros → CT-e → Seguro de Carga. 3. Preencher: responsável (0 = emitente, 1 = expedidor, 2 = tomador, 3 = destinatário), CNPJ da seguradora, número da apólice. 4. Se a empresa não tem seguro: configurar responsável como emitente e colocar seguradora como "Sem seguro" se o sistema permitir — verificar o layout do CT-e vigente. 5. Se valor da carga é alto: contratar seguro de carga — é obrigação legal para algumas modalidades. 6. Após corrigir: reemitir o CT-e.',
  'integracao',
  ARRAY['cte','conhecimento transporte','rejeicao 689','seguro carga','apolice','seguradora','cnpj'],
  'CT-e rejeição 689 dados seguro carga obrigatórios ausentes',
  true, 'treinamento_erp_v2'
),

-- ============================================================
-- CASOS TRANSVERSAIS — Perguntas frequentes de suporte ERP
-- ============================================================

(
  'auge', 'seed_erp_v2', 'Cliente Geral', 'Suporte Auge',
  'Como fazer backup manual do banco de dados PostgreSQL do AugeWEB',
  'Usuário precisa de backup antes de manutenção ou atualização do sistema.',
  '1. Via pg_dump (linha de comando): pg_dump -U postgres -d nome_do_banco -Fc -f "backup_$(date +%Y%m%d_%H%M).dump" — o parâmetro -Fc gera formato comprimido. 2. Via pgAdmin: clicar com botão direito no banco → Backup → escolher formato Custom → selecionar local → executar. 3. Restauração: pg_restore -U postgres -d nome_do_banco arquivo.dump OU pelo pgAdmin: botão direito → Restore. 4. Para automatizar: criar script .bat no Windows com o pg_dump + agendador de tarefas (Task Scheduler). 5. Guardar backups em local diferente do servidor (HD externo, nuvem). 6. Testar a restauração periodicamente — backup não testado não é backup.',
  'banco_dados',
  ARRAY['backup','postgresql','pg_dump','pgadmin','restaurar','automatizar','task scheduler','banco dados'],
  'Como fazer backup manual banco dados PostgreSQL AugeWEB',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Cliente Geral', 'Suporte Auge',
  'Como criar novo usuário com permissões limitadas no AugeWEB — acesso somente leitura',
  'Gestor precisa dar acesso ao sistema para funcionário sem poder de edição ou acesso a dados financeiros.',
  '1. Acessar AugeWEB com usuário administrador. 2. Menu → Segurança → Grupos de Usuário → Novo Grupo → nomear (ex: "Consultor de Estoque"). 3. Para cada módulo: definir permissões granulares — geralmente: Visualizar = sim, Criar/Editar/Excluir = não. 4. Criar o usuário: Menu → Segurança → Usuários → Novo → preencher nome, login, senha, e-mail. 5. Vincular o usuário ao grupo criado. 6. Forçar troca de senha no primeiro acesso se a opção existir. 7. Teste: fazer login com o novo usuário e verificar se as restrições estão funcionando. 8. Para acesso somente a relatórios: grupo com permissão apenas de Visualizar nos módulos necessários + acesso à aba Relatórios.',
  'augeweb',
  ARRAY['usuario','permissao','somente leitura','grupo','seguranca','augeweb','visualizar','admin'],
  'Como criar novo usuário permissões limitadas AugeWEB acesso somente leitura',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Cliente Geral', 'Suporte Auge',
  'Como consultar o histórico de alterações em um produto ou preço no AugeWEB (log de auditoria)',
  'Usuário suspeita que preço foi alterado indevidamente e quer rastrear quem fez a alteração.',
  '1. AugeWEB → Relatórios → Log de Auditoria (ou Histórico de Alterações) → filtrar por Tabela = Produtos, período e usuário. 2. Se não houver módulo de auditoria visível: consultar diretamente no banco — tabela de logs (geralmente "log_alteracoes" ou "audit_log"). 3. No PostgreSQL: SELECT * FROM log_alteracoes WHERE tabela = ''produtos'' AND data >= ''2024-01-01'' ORDER BY data DESC; 4. O log deve mostrar: usuário, data/hora, campo alterado, valor anterior, valor novo. 5. Se o log de auditoria não estiver habilitado: habilitar para o futuro em Configurações → Auditoria → ativar log de alterações de preços. 6. Para situações críticas: consultar com o DBA para restaurar um backup pontual e comparar os dados.',
  'augeweb',
  ARRAY['historico','alteracao','preco','produto','auditoria','log','rastrear','usuario','postgresql'],
  'Como consultar histórico alterações produto preço AugeWEB log auditoria',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Cliente Geral', 'Suporte Auge',
  'Lentidão geral no AugeWEB após crescimento do banco — tudo demora mais de 10 segundos',
  'Banco de dados cresceu sem manutenção adequada — falta de VACUUM, índices fragmentados, queries sem índice executando full scan.',
  '1. Verificar tamanho do banco: SELECT pg_size_pretty(pg_database_size(''mavoai'')); — se estiver acima de 10GB e sem manutenção, é crítico. 2. Executar VACUUM ANALYZE em todas as tabelas: VACUUM ANALYZE; (sem especificar tabela roda em todas). 3. Verificar queries lentas: SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 20; — requer extensão pg_stat_statements. 4. Verificar índices faltando: tabelas com full scan frequente precisam de índice nas colunas de filtro. 5. Verificar configurações do PostgreSQL: shared_buffers deve ser 25% da RAM total; effective_cache_size = 75% da RAM. 6. Para banco muito fragmentado: REINDEX DATABASE nome_do_banco; (demora — executar em horário de baixo uso).',
  'banco_dados',
  ARRAY['lentidao','postgresql','vacuum','indice','pg_stat_statements','shared_buffers','fragmentacao','manutencao'],
  'Lentidão geral AugeWEB após crescimento banco tudo demora mais 10 segundos',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Cliente Geral', 'Suporte Auge',
  'Como emitir segunda via de NF-e / NFC-e já autorizada para o cliente',
  'Cliente perdeu o comprovante e pede segunda via da nota fiscal.',
  '1. No AugeWEB: Fiscal → NF-e Emitidas ou NFC-e Emitidas → localizar a nota (por número, CPF do cliente, ou data). 2. Opções de segunda via: (a) Imprimir DANFE novamente: selecionar a nota → Imprimir DANFE. (b) Enviar por e-mail: selecionar a nota → Enviar por e-mail → inserir o e-mail do cliente. 3. Para NFC-e: o link para consulta pode ser impresso no QR Code do cupom — o cliente pode acessar o portal da SEFAZ com o QR Code. 4. O XML da nota também pode ser enviado ao cliente se ele precisar para escrituração contábil. 5. Atenção: o DANFE de segunda via tem o mesmo valor fiscal da nota original — não é uma nova nota. 6. Para notas antigas (mais de 60 dias): podem estar arquivadas — verificar configuração de retenção de dados do AugeWEB.',
  'fiscal',
  ARRAY['segunda via','danfe','nfe','nfce','reimprimir','email','qrcode','xml','cliente','portal sefaz'],
  'Como emitir segunda via NF-e NFC-e autorizada para cliente',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Cliente Geral', 'Suporte Auge',
  'Como configurar desconto por tabela de preço para cliente específico (atacado vs varejo)',
  'Empresa tem tabelas de preço diferentes para clientes atacadistas e varejistas, mas o PDV não está aplicando automaticamente.',
  '1. No AugeWEB: criar as tabelas de preço — Menu → Precificação → Tabelas de Preço → Novo → nomear (ex: "Atacado", "Varejo", "Vip"). 2. Para cada tabela: definir os preços ou a regra de desconto (ex: Atacado = 15% de desconto sobre o preço base). 3. No cadastro do cliente: vincular a tabela de preço → Clientes → selecionar cliente → campo "Tabela de Preço" → selecionar "Atacado". 4. No PDV: ao identificar o cliente no início da venda (CPF/CNPJ), o sistema aplica automaticamente a tabela vinculada ao cliente. 5. Verificar se o PDV está configurado para "Solicitar identificação do cliente" no início da venda. 6. Teste: abrir o caixa → identificar um cliente atacadista → verificar se os preços aparecem com desconto.',
  'pdv',
  ARRAY['tabela preco','desconto','atacado','varejo','cliente','pdv','precificacao','augeweb'],
  'Como configurar desconto tabela preço cliente específico atacado varejo',
  true, 'treinamento_erp_v2'
),

(
  'auge', 'seed_erp_v2', 'Cliente Geral', 'Suporte Auge',
  'Relatório SPED Contribuições (PIS/COFINS) com valores incorretos — créditos não estão aparecendo',
  'O SPED Contribuições (EFD-Contribuições) calcula PIS/COFINS com base nos registros de entradas e saídas. Se os créditos não aparecem, as entradas estão sem o CST de crédito correto.',
  '1. Para empresas do Lucro Real (regime não cumulativo): entradas com CST 50, 51, 52, 55, 56, 70, 71, 73, 74, 75 geram crédito de PIS/COFINS. 2. Para Lucro Presumido/Simples (regime cumulativo): não há crédito de PIS/COFINS — CST deve ser 01, 02, 49, 99. 3. Verificar no AugeWEB os CFOPs e CSTs das notas de entrada do período. 4. Para entradas de insumos no Lucro Real: CST deve estar na faixa 50-56 — corrigir no cadastro de produto ou na nota de entrada. 5. Regenerar o SPED após correção dos CSTs. 6. Consultar o contador para confirmar quais operações geram crédito para o regime tributário da empresa.',
  'fiscal',
  ARRAY['sped','pis','cofins','efd contribuicoes','cst','credito','lucro real','nao cumulativo','cst 50'],
  'Relatório SPED Contribuições PIS COFINS valores incorretos créditos não aparecem',
  true, 'treinamento_erp_v2'
);

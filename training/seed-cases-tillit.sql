-- ============================================================
-- seed-cases-tillit.sql
-- Casos de treinamento específicos do TillitPDV
-- Baseados na documentação técnica real (fundamentos, instalacao, operacao)
-- Aplicar após seed-cases-all.sql
-- ============================================================

DELETE FROM public.atendimentos
WHERE canal = 'seed_tillit' AND tenant_id = 'auge';

INSERT INTO public.atendimentos
  (tenant_id, canal, cliente, tecnico, resumo_problema, causa, solucao, categoria, tags, texto_original, resolution_confirmed, resolution_source)
VALUES

-- ============================================================
-- REINSTALAÇÃO / MIGRAÇÃO DE MÁQUINA
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Alfa', 'Suporte Tillit',
  'PDV não abre após troca de máquina — tela de erro de MAC',
  'O MAC address da máquina nova não estava cadastrado na tabela `pontos_de_venda` do Concentrador. O PDV valida o MAC no boot e rejeita se não bater.',
  'Atualizar o MAC da nova máquina no cadastro do PDV no Concentrador (tabela `pontos_de_venda`, campo `mac_address`). Após salvar, reiniciar o TillitPDV na nova máquina.',
  'pdv',
  ARRAY['reinstalacao','mac address','pontos_de_venda','boot','troca de maquina','tillitpdv'],
  'PDV foi reinstalado em máquina nova e agora não abre. A tela mostra erro de "MAC não autorizado" ou similar.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Beta', 'Suporte Tillit',
  'Cupom fiscal voltando para numeração zerada após reinstalação — SEFAZ rejeitando duplicidade',
  'Após reinstalação sem aplicar o RESTAURARNUMEROCUPOM, o PDV começou emitindo cupom do número 1, gerando duplicidade com cupons já emitidos anteriormente.',
  '1. Descobrir o maior cupom emitido: `SELECT MAX(cupom) FROM movimentos_pdv WHERE estado = ''FINALIZADO'';` no banco local (porta 5930). 2. Na tela de venda, digitar: `RESTAURARNUMEROCUPOM<numero>` e pressionar ENTER. 3. Verificar se a numeração está correta antes de continuar. Rejeições 204 (duplicidade) que já ocorreram precisam de inutilização de numeração no SEFAZ.',
  'pdv',
  ARRAY['reinstalacao','restaurarnumerocupom','cupom','numeracao','sefaz','duplicidade','rejeicao 204'],
  'Após formatar a máquina e reinstalar o TillitPDV, as notas estão sendo rejeitadas pelo SEFAZ com código 204 (duplicidade).',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Gama', 'Suporte Tillit',
  'Slot de replicação antigo acumulando WAL no Concentrador após troca de máquina do PDV',
  'O slot de replicação do PDV antigo não foi derrubado. O Concentrador continua mantendo o slot ativo e acumulando WAL (Write-Ahead Log) para a máquina que não existe mais, podendo encher o disco.',
  'No banco do Concentrador, rodar: `SELECT slot_name FROM pg_replication_slots;` para identificar o slot antigo. Depois: `SELECT pg_drop_replication_slot(''<nome_do_slot>'');`. Na máquina nova, o PDV vai criar automaticamente um novo slot ao iniciar e se conectar ao Concentrador.',
  'integracao',
  ARRAY['replication slot','concentrador','wal','reinstalacao','pg_drop_replication_slot','postgres'],
  'Após reinstalar o PDV em máquina nova, o Concentrador está com erro de disco ou lentidão. Verificou-se que há slot de replicação acumulando WAL do PDV antigo.',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- PDV NÃO ABRE / ERROS DE BOOT
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Delta', 'Suporte Tillit',
  'TillitPDV não abre — tela preta ou fecha imediatamente após splash',
  'Várias causas possíveis na sequência de boot. O PDV valida em ordem: certificado digital → schemas SEFAZ → MAC na tabela pontos_de_venda → finalizadora DINHEIRO única → banco respondendo.',
  'Verificar nesta ordem: 1. Certificado existe em `~/tillitpdv/certificados/` e está na data válida? 2. Pasta `~/tillitpdv/workdir/schemasSefaz/` existe e tem arquivos? 3. MAC da máquina bate com o cadastro no Concentrador? 4. Há apenas uma finalizadora DINHEIRO ativa no cadastro? 5. Container Docker do banco está rodando? (`sudo docker ps | grep postgres_pdv`). Conferir `~/tillitpdv/logs/tillitpdv.log` para identificar em qual etapa falhou.',
  'pdv',
  ARRAY['nao abre','boot','inicializacao','certificado','mac','finalizadora','docker','tillitpdv'],
  'TillitPDV não abre. Abre a tela de splash e fecha sozinho ou nem chega a abrir.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Epsilon', 'Suporte Tillit',
  'PDV não abre — erro de banco de dados na inicialização',
  'Container Docker `postgres_pdv` estava parado. O TillitPDV não consegue inicializar sem banco de dados local respondendo na porta 5930.',
  '1. Verificar se o container está rodando: `sudo docker ps`. 2. Se não estiver: `sudo docker start postgres_pdv`. 3. Aguardar 10-15 segundos para o banco subir. 4. Iniciar o TillitPDV normalmente. Se o container não existir: reinstalação necessária (ver `instalacao.md`). Se existir mas não subir: `sudo docker logs postgres_pdv` para diagnóstico.',
  'pdv',
  ARRAY['banco de dados','docker','postgres_pdv','porta 5930','nao abre','tillitpdv','container'],
  'TillitPDV não abre. No log aparece erro de conexão com banco de dados ou "connection refused" na porta 5930.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Zeta', 'Suporte Tillit',
  'PDV não abre — erro de múltiplas finalizadoras DINHEIRO ativas',
  'O PDV valida no boot que deve existir exatamente uma finalizadora do tipo DINHEIRO ativa. Se houver mais de uma ou nenhuma, a inicialização é bloqueada.',
  'No AugeWEB (retaguarda): acessar cadastro de finalizadoras e garantir que existe exatamente UMA finalizadora do tipo DINHEIRO marcada como ativa para o PDV em questão. Desativar as duplicatas. O ajuste replica automaticamente para o PDV via SUBSCRIPTION.',
  'pdv',
  ARRAY['finalizadora','dinheiro','boot','inicializacao','nao abre','concentrador','replicacao'],
  'PDV não abre após alteração no cadastro de finalizadoras. Log indica problema com finalizadora DINHEIRO.',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- VENDA / CUPOM FISCAL
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Eta', 'Suporte Tillit',
  'Venda finalizada mas cupom não imprimiu — cliente aguardando',
  'A venda foi finalizada no sistema (estado FINALIZADO em movimentos_pdv) mas a impressora não imprimiu. O XML da NFC-e foi guardado em `movimentos_xml_nf` e pode ser reimpresso.',
  '1. Na tela de venda, pressionar F5 para listar movimentos do caixa. 2. Selecionar a venda em questão. 3. Pressionar ENTER para reimprimir o cupom. Alternativa: Ctrl+F5 reimprima o último cupom diretamente. Se a impressora continuar sem imprimir, verificar cabo USB/serial e configuração em `application.yaml` (campo `impressora.porta`).',
  'pdv',
  ARRAY['impressora','cupom','reimprimir','f5','movimentos','nfc-e','venda finalizada'],
  'Cliente foi atendido, venda foi paga, mas o cupom não saiu da impressora. Como reimprimir?',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Theta', 'Suporte Tillit',
  'NFC-e emitida em modo contingência — operador preocupado se a venda é válida',
  'Quando o SEFAZ não responde, o TillitPDV emite automaticamente em modo contingência. A venda é completamente válida mas precisa ser transmitida ao SEFAZ em até 24h (NF-e) ou 30min (NFC-e em casos específicos).',
  'A venda é válida. O PDV vai tentar transmitir automaticamente quando a comunicação com o SEFAZ for restaurada. Verificar se há problema de internet: `ping nfe.fazenda.gov.br`. O operador pode monitorar em `~/tillitpdv/logs/nf-api.log`. Para ativar/desativar contingência manualmente: digitar `CONTINGENCIAON` ou `CONTINGENCIAOFF` no campo de venda.',
  'fiscal',
  ARRAY['contingencia','nfc-e','sefaz offline','sefaz','transmissao','contingenciaon','logs','nf-api'],
  'Tela do PDV mostra "Sefaz offline, NFCe emitido em modo de contingência". Operador quer saber se a venda é válida e o que fazer.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Iota', 'Suporte Tillit',
  'Venda presa no estado ERRO_SEFAZ — caixa não fecha',
  'Venda na tabela `movimentos_pdv` com estado `ERRO_SEFAZ` indica que a NFC-e foi rejeitada pelo SEFAZ e a venda não foi concluída fiscalmente.',
  '1. Verificar código de rejeição em `~/tillitpdv/logs/nf-api.log`. 2. Identificar a causa com base no código (ex: 401=certificado, 204=duplicidade, 539=NCM inválido). 3. Corrigir a causa raiz. 4. O PDV tentará retransmitir automaticamente. Se a rejeição for irreparável: orientar cancelamento da venda e nova emissão. Para diagnóstico SQL: `SELECT * FROM movimentos_pdv WHERE estado = ''ERRO_SEFAZ'' ORDER BY data_geracao DESC;`',
  'fiscal',
  ARRAY['erro_sefaz','sefaz','rejeicao','nfc-e','movimentos_pdv','log','nf-api','caixa'],
  'Venda não está saindo — sistema mostra erro de SEFAZ. Operador não consegue fechar o caixa.',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- SANGRIA / SUPRIMENTO / CAIXA
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Kappa', 'Suporte Tillit',
  'Operador não sabe como fazer sangria no TillitPDV',
  'Sangria é o processo de retirar dinheiro do caixa durante o expediente. No TillitPDV, é feita digitando o valor no campo de comando e pressionando F8.',
  '1. Na tela de venda, digitar o valor da sangria (ex: `500.00`). 2. Pressionar F8. 3. O sistema vai solicitar autenticação do supervisor. 4. Confirmar. 5. Registrar o motivo se solicitado. A sangria ficará registrada em `movimentos_finalizadoras_pdv` e aparecerá no fechamento de caixa. Bloqueada se exceder saldo atual do caixa.',
  'pdv',
  ARRAY['sangria','f8','caixa','suprimento','operacao','dinheiro'],
  'Como fazer sangria no PDV? Operador precisa retirar dinheiro do caixa.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Lambda', 'Suporte Tillit',
  'Tela do PDV travada com cliente aguardando — como desbloquear',
  'A tela do PDV pode ser bloqueada intencionalmente com F6. Também pode ocorrer travamento por inatividade. Não se pode bloquear se há venda em andamento.',
  'Se foi bloqueio intencional (F6): solicitar login do operador responsável para desbloquear. Se o sistema está travado (sem resposta): 1. Aguardar 30 segundos para ver se responde. 2. Se não responder: `pkill -f tillitpdv` e reiniciar. 3. Verificar se havia venda em andamento: `SELECT * FROM movimentos_pdv WHERE estado = ''INICIADO'' AND caixa_id = (SELECT id FROM caixas_pdv WHERE data_fechamento IS NULL);` — se sim, a venda pode precisar ser recuperada ou cancelada.',
  'pdv',
  ARRAY['tela travada','bloqueio','f6','desbloqueio','operador','venda em andamento','pkill'],
  'Tela do PDV travou com cliente aguardando no caixa. Como desbloquear rapidamente?',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- LOGS E DIAGNÓSTICO
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Mi', 'Suporte Tillit',
  'Como verificar logs do TillitPDV para diagnóstico remoto',
  'O TillitPDV gera dois arquivos de log distintos. Técnicos frequentemente não sabem onde encontrar ou qual consultar para cada tipo de problema.',
  'Dois logs principais, ambos em `~/tillitpdv/logs/`: 1. `tillitpdv.log` — log geral do sistema: boot, erros de comunicação, módulos, integrações. 2. `nf-api.log` — SOMENTE eventos de NFC-e: emissão, rejeições SEFAZ, contingência, cancelamentos. Para problemas fiscais: `nf-api.log`. Para tudo o mais: `tillitpdv.log`. Visualizar em tempo real: `tail -f ~/tillitpdv/logs/tillitpdv.log`. Filtrar erros: `grep -i "erro\|exception\|error" ~/tillitpdv/logs/tillitpdv.log | tail -50`.',
  'pdv',
  ARRAY['logs','tillitpdv.log','nf-api.log','diagnostico','tail','grep','linux'],
  'Técnico precisa verificar o que está acontecendo no PDV remotamente. Onde ficam os logs?',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Nu', 'Suporte Tillit',
  'Como verificar se a replicação do Concentrador para o PDV está ativa',
  'Se a replicação parar, o PDV fica com dados desatualizados: produtos, preços, promoções e clientes não são atualizados.',
  'No banco do Concentrador (Postgres), rodar: `SELECT * FROM pg_replication_slots;`. Verificar se o slot do PDV em questão está presente e se `active = true`. Se `active = false`: o PDV está offline ou com problema de conexão. Se o slot não existe: a SUBSCRIPTION precisa ser recriada. Para verificar última comunicação: `SELECT * FROM historico_comunicacao_pdv WHERE pdv_id = <id> ORDER BY created_at DESC LIMIT 10;`.',
  'integracao',
  ARRAY['replicacao','concentrador','pg_replication_slots','subscription','historico_comunicacao_pdv','pdv offline'],
  'Produtos novos cadastrados no AugeWEB não estão aparecendo no PDV. Como verificar a replicação?',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- ATUALIZAÇÃO DO PDV
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Xi', 'Suporte Tillit',
  'Como atualizar o TillitPDV para a versão mais recente',
  'O PDV pode ser atualizado via script automatizado ou manualmente. O script oficial é o caminho recomendado pois gerencia a parada e reinicialização corretamente.',
  '1. Abrir terminal no PDV (Ubuntu). 2. Rodar: `mkdir -p ~/.script_atualizacao && wget -O ~/.script_atualizacao/atualizacao_sistema.sh https://ovh.nextcloud.tillitbrasil.com.br/s/9HzeJgXFxnpXoQN/download && bash ~/.script_atualizacao/atualizacao_sistema.sh`. 3. Selecionar TillitPDV e a versão desejada. 4. O script para o PDV, substitui o JAR e reinicia. IMPORTANTE: fazer backup do banco antes de versões com migration grande: `sudo docker exec postgres_pdv pg_dump -U postgres -d tillitpdv -F c > ~/backups/tillitpdv-$(date +%F).dump`. Não pular muitas versões de uma vez.',
  'pdv',
  ARRAY['atualizacao','jar','script','atualizacao_sistema.sh','nextcloud','flyway','migration','backup'],
  'Como atualizar o TillitPDV? Tem versão nova disponível.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Omicron', 'Suporte Tillit',
  'PDV não inicia após atualização — erro de schema de banco',
  'Atualização trouxe migration nova (Flyway) que falhou ao ser aplicada. O banco ficou em estado intermediário.',
  '1. Verificar `~/tillitpdv/logs/tillitpdv.log` para identificar qual migration falhou e o erro exato. 2. Se a migration falhou por timeout ou lock: tentar reiniciar o PDV — Flyway tentará novamente. 3. Se o erro for de schema conflitante: restaurar o backup do banco feito antes da atualização: `cat ~/backups/tillitpdv-<data>.dump | sudo docker exec -i postgres_pdv pg_restore -U postgres -d tillitpdv --clean --if-exists`. 4. Voltar para o JAR anterior (rollback): parar PDV, restaurar o JAR de backup, reiniciar. 5. Após rollback com restore de banco: aplicar RESTAURARNUMEROCUPOM se necessário.',
  'pdv',
  ARRAY['atualizacao','flyway','migration','schema','rollback','jar','backup','restore','tillitpdv'],
  'Atualizei o TillitPDV e agora não abre mais. Log mostra erro de banco de dados / schema.',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- SITEF / TEF NO TILLITPDV
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Pi', 'Suporte Tillit',
  'Pagamento com cartão não funciona no TillitPDV — erro de comunicação SiTef',
  'O TillitPDV integra o SiTef via JNI (Java Native Interface). As libs nativas `libclisitef.so` e `libjCliSiTefI.so` ficam no diretório `pos_hub/`. Problemas podem ser de comunicação com o servidor SiTef ou das libs.',
  '1. Verificar se o servidor SiTef está acessível: `ping <ip_servidor_sitef>`. 2. Verificar se as libs nativas existem: `ls ~/workspace/pos_hub/lib*.so`. 3. Verificar logs do TEF em `~/tillitpdv/logs/tillitpdv.log` (filtrar "sitef" ou "clisitef"). 4. F11 na tela de venda abre o SITEF Gerencial (menu administrativo) — exige supervisor. 5. NUNCA deletar o arquivo `NaoExcluirControleCliSiTef` — guarda estado de transações pendentes.',
  'tef',
  ARRAY['sitef','tef','jni','libclisitef','cartao','pagamento','comunicacao','f11','naoexcluircontroleclisitef'],
  'Pagamento com cartão não está funcionando no PDV. Aparece erro de TEF ou comunicação.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Rho', 'Suporte Tillit',
  'Transação de cartão pendente no SiTef — valor debitado do cliente mas venda não finalizou',
  'O arquivo `NaoExcluirControleCliSiTef` guarda o estado de transações pendentes. Se for deletado acidentalmente ou o PDV travar durante pagamento, pode haver inconsistência entre o que foi cobrado e o que o sistema registrou.',
  '1. NÃO reiniciar o SiTef nem deletar nenhum arquivo de controle. 2. Verificar `NaoExcluirControleCliSiTef` — se existir, o SiTef sabe que há transação pendente e tentará reprocessar. 3. F11 na tela de venda → SITEF Gerencial → verificar transações pendentes. 4. Se a transação foi confirmada pelo adquirente mas não pelo PDV: o adquirente tem o comprovante — orientar consulta diretamente na operadora. 5. Para estorno: deve ser feito pelo processo da adquirente específica — não pelo sistema PDV.',
  'tef',
  ARRAY['transacao pendente','sitef','naoexcluircontroleclisitef','cartao','debito','estorno','adquirente'],
  'Cliente foi cobrado no cartão mas a venda não finalizou no PDV. O que fazer?',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- BACKUP E CERTIFICADO
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Sigma', 'Suporte Tillit',
  'Certificado digital A1 expirado — PDV não abre e não emite NFC-e',
  'O certificado A1 (.pfx) fica em `~/tillitpdv/certificados/`. O PDV valida na inicialização. Se expirar, o PDV bloqueia a emissão de NFC-e.',
  '1. Confirmar expiração: `openssl pkcs12 -in ~/tillitpdv/certificados/<arquivo>.pfx -nokeys -passin pass:<senha> | openssl x509 -noout -dates`. 2. Obter certificado renovado com a Certisign/Serasa/outra AC. 3. Copiar o novo .pfx para `~/tillitpdv/certificados/`. 4. Atualizar `application.yaml` com o caminho e senha do novo certificado se mudarem. 5. Reiniciar o TillitPDV. PREVENTIVO: manter cópia segura do certificado + senha em lugar diferente da máquina do PDV.',
  'fiscal',
  ARRAY['certificado','pfx','a1','expirado','nfc-e','sefaz','openssl','renovacao'],
  'PDV não abre ou não emite cupom. Mensagem de certificado inválido ou expirado.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Tau', 'Suporte Tillit',
  'Como fazer backup do TillitPDV antes de manutenção importante',
  'Técnico precisa fazer manutenção no PDV e quer garantir que pode reverter se algo der errado.',
  'Backups críticos antes de qualquer manutenção: 1. Banco local: `sudo docker exec postgres_pdv pg_dump -U postgres -d tillitpdv -F c > ~/backups/tillitpdv-$(date +%F).dump`. 2. Certificado: `cp ~/tillitpdv/certificados/*.pfx ~/backups/`. 3. Configuração: `cp ~/tillitpdv/application.yaml ~/backups/application-$(date +%F).yaml`. 4. JAR atual: `cp ~/tillitpdv/tillitpdv-*.jar ~/backups/tillitpdv.bkp-$(date +%F).jar`. ATENÇÃO: `application.yaml` contém senhas — não compartilhar por canais inseguros. Validar que o banco restaura num ambiente separado antes de considerar o backup confiável.',
  'pdv',
  ARRAY['backup','postgres_pdv','pg_dump','certificado','application.yaml','jar','manutencao','seguranca'],
  'Vou fazer manutenção no PDV. Como garantir que tenho backup completo?',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- PRODUTOS E REPLICAÇÃO
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Upsilon', 'Suporte Tillit',
  'Produto cadastrado no AugeWEB não aparece no PDV',
  'Os produtos são replicados do Concentrador para o PDV via SUBSCRIPTION PostgreSQL (`cargas_pdv_pub`). Se a replicação estiver com problema ou o produto não foi publicado corretamente, ele não chegará ao PDV.',
  '1. Verificar se o produto está ativo no AugeWEB (retaguarda). 2. Verificar se a replicação está ativa: `SELECT * FROM pg_replication_slots;` no Concentrador — slot deve estar com `active = true`. 3. Se o slot está ativo: aguardar alguns minutos para a replicação propagar. 4. Se o slot está inativo: verificar conectividade de rede entre PDV e Concentrador. 5. Consultar o produto diretamente no banco do PDV: `SELECT * FROM produtos WHERE ean = ''<ean>'' OR descricao ILIKE ''%<nome>%'';` (banco postgres_pdv, porta 5930). Se não estiver lá, o problema é de replicação.',
  'estoque',
  ARRAY['produto','replicacao','concentrador','subscription','cargas_pdv_pub','ean','pdv','auge'],
  'Cadastrei um produto novo no sistema mas ele não aparece no PDV para venda.',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Phi', 'Suporte Tillit',
  'Preço do produto diferente no PDV e no AugeWEB',
  'A tabela `precos` no PDV é replicada do Concentrador. Se houver atraso de replicação ou o slot estiver inativo, o PDV pode estar com preços desatualizados.',
  '1. Verificar o preço no banco do PDV: `SELECT p.descricao, pr.valor, pr.tipo_venda FROM produtos p JOIN precos pr ON p.id = pr.produto_id WHERE p.ean = ''<ean>'' AND pr.tipo_venda = 1;` (tipo_venda=1 é venda comum). 2. Comparar com o valor no AugeWEB. 3. Se diferente: verificar status da replicação (`pg_replication_slots` no Concentrador). 4. Se a replicação está ativa: verificar quando o preço foi alterado vs quando a replicação propagou. 5. Forçar sincronização: `SINCRONIZARVENDA` no campo de venda pode ajudar a forçar comunicação com Concentrador.',
  'estoque',
  ARRAY['preco','replicacao','produtos','precos','tipo_venda','concentrador','pdv','divergencia'],
  'O preço de um produto no PDV está diferente do que está cadastrado no sistema. Como corrigir?',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- IMPRESSORA E HARDWARE
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Chi', 'Suporte Tillit',
  'Impressora de cupom não imprime no TillitPDV — Ubuntu',
  'No TillitPDV (Ubuntu), a impressora é configurada via `application.yaml` com a porta serial (`/dev/Impressora` geralmente) e modelo. Problemas comuns: porta errada, permissão negada no Linux, cabo desconectado.',
  '1. Verificar se o dispositivo existe: `ls -la /dev/Impressora` ou `ls /dev/ttyUSB* /dev/ttyS*`. 2. Verificar permissão: usuário `pdv` precisa estar no grupo `dialout` (`groups pdv`). Se não estiver: `sudo usermod -aG dialout pdv` e reiniciar sessão. 3. Conferir porta e modelo em `~/tillitpdv/application.yaml` (campos `impressora.porta` e `impressora.modelo`). 4. Testar impressora fora do PDV: `echo "teste" > /dev/Impressora`. 5. Verificar cabo USB/serial físico.',
  'hardware',
  ARRAY['impressora','cupom','ubuntu','serial','dev','dialout','application.yaml','impressora.porta','linux'],
  'Impressora de cupom não está imprimindo no TillitPDV. Sistema mostra erro de impressora.',
  true, 'documentacao_tecnica'
),

-- ============================================================
-- ATALHOS / OPERAÇÃO
-- ============================================================
(
  'auge', 'seed_tillit', 'Loja Psi', 'Suporte Tillit',
  'Operador quer saber como consultar preço de produto sem iniciar venda',
  'O TillitPDV tem um modo de consulta de produto que pode ser ativado com F3, permitindo bipar o produto para ver o preço sem adicioná-lo ao carrinho.',
  'Pressionar F3 na tela de venda para entrar no modo consulta de produto (se o parâmetro `permiteModoConsultaProdutoPDV` estiver habilitado). Neste modo, bipar o produto mostra o preço sem adicionar à venda. Pressionar ESC ou F3 novamente para sair do modo consulta. Alternativa via digitação: `%<nome do produto>` no campo de venda para buscar por descrição parcial.',
  'pdv',
  ARRAY['consulta preco','f3','modo consulta','produto','atalho','operador','venda'],
  'Operador quer consultar o preço de um produto sem precisar abrir uma venda. Como fazer?',
  true, 'documentacao_tecnica'
),

(
  'auge', 'seed_tillit', 'Loja Omega', 'Suporte Tillit',
  'Desconto de um produto específico não está sendo aplicado na venda',
  'O TillitPDV tem o atalho Ctrl+O para ligar/desligar oferta de um item específico. Se foi pressionado por engano, o desconto é desativado para aquele item.',
  '1. Na lista de itens da venda, verificar se o item está com o flag de oferta desativado. 2. Digitar o número do item no campo de comando e pressionar Ctrl+O para alternar o estado do desconto/oferta. 3. Se o desconto não aparece em nenhum item: verificar se as promoções estão ativas (`PROMOCAOON` no campo de venda). 4. Verificar se `OFERTAON` está ativo. 5. Verificar tabela `promocoes` está replicada e vigente.',
  'pdv',
  ARRAY['desconto','oferta','ctrl+o','promocao','item','venda','atalho','ofertaoff'],
  'O desconto de promoção não está sendo aplicado em um produto específico na venda.',
  true, 'documentacao_tecnica'
);

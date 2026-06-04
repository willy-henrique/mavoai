/**
 * Base de Conhecimento AUGE — Automação e Gestão Empresarial
 *
 * Estrutura em módulos. O seletor injeta apenas o(s) módulo(s)
 * relevantes ao contexto do chamado, mantendo respostas focadas.
 */

export type AugeModule =
  | "fiscal"
  | "nfe"
  | "nfce"
  | "sat"
  | "sped"
  | "pdv"
  | "tef"
  | "balanca"
  | "estoque"
  | "cadastro_produto"
  | "financeiro"
  | "compras"
  | "hardware"
  | "impressora_elgin"
  | "banco_dados"
  | "instalacao"
  | "tributacao"
  | "certificado"
  | "clientes"
  | "fornecedores"
  | "perfil_movimento"
  | "vendas_retaguarda"
  | "contagem_estoque"
  | "financeiro_avancado"
  | "sintegra"
  | "filiais_usuarios"
  | "reforma_tributaria"
  | "geral"

// ─── Mapeamento de palavras-chave para módulos ────────────────────────────────

export const KEYWORD_MODULE_MAP: Record<string, AugeModule[]> = {
  // Fiscal genérico
  fiscal: ["fiscal"],
  sefaz: ["fiscal", "nfe"],
  xml: ["fiscal", "nfe"],
  rejeicao: ["fiscal", "nfe"],
  rejeição: ["fiscal", "nfe"],
  // Erro 12007 / DNS SEFAZ
  "12007": ["fiscal", "nfe"],
  "nome do servidor": ["fiscal", "nfe"],
  "sefaz fora": ["fiscal", "nfe"],
  "nao pode ser resolvido": ["fiscal", "nfe"],
  "erro http 0": ["fiscal", "nfe"],
  "erro interno 12007": ["fiscal", "nfe"],
  danfe: ["fiscal", "nfe", "vendas_retaguarda"],
  cfop: ["fiscal", "tributacao"],
  cst: ["fiscal", "tributacao"],
  "cst 000": ["tributacao"],
  "cst 010": ["tributacao"],
  "cst 020": ["tributacao"],
  "cst 040": ["tributacao"],
  "cst 060": ["tributacao"],
  "cst 090": ["tributacao"],
  csosn: ["fiscal", "tributacao"],
  "icms tt": ["tributacao"],
  "icms ii": ["tributacao"],
  "icms ff": ["tributacao"],
  "aliquota errada": ["tributacao"],
  "alíquota errada": ["tributacao"],
  "cst errado": ["tributacao"],
  "cst incorreto": ["tributacao"],
  "tributacao errada": ["tributacao"],
  "tributação errada": ["tributacao"],
  "base st": ["tributacao"],
  "icms st": ["tributacao"],
  mva: ["tributacao"],
  iva: ["tributacao"],
  ncm: ["fiscal", "tributacao", "cadastro_produto"],
  cest: ["fiscal", "tributacao", "cadastro_produto"],
  aliquota: ["fiscal", "tributacao"],
  alíquota: ["fiscal", "tributacao"],
  icms: ["fiscal", "tributacao"],
  pis: ["fiscal", "tributacao"],
  cofins: ["fiscal", "tributacao"],
  ipi: ["fiscal", "tributacao"],
  st: ["fiscal", "tributacao"],
  substituicao: ["fiscal", "tributacao"],
  substituição: ["fiscal", "tributacao"],

  // NF-e
  "nf-e": ["nfe"],
  nfe: ["nfe"],
  "nota fiscal eletronica": ["nfe"],
  "nota fiscal eletrônica": ["nfe"],
  emissao: ["nfe", "nfce"],
  emissão: ["nfe", "nfce"],
  autorizacao: ["nfe", "nfce", "filiais_usuarios"],
  autorização: ["nfe", "nfce", "filiais_usuarios"],
  cancelamento: ["nfe", "nfce"],
  carta: ["nfe"],
  contingencia: ["nfe"],
  contingência: ["nfe"],
  inutilizacao: ["nfe"],
  inutilização: ["nfe"],
  ambiente: ["nfe", "nfce"],
  homologacao: ["nfe", "nfce"],
  producao: ["nfe", "nfce"],
  série: ["nfe", "nfce"],
  serie: ["nfe", "nfce"],

  // NFC-e
  "nfc-e": ["nfce"],
  nfce: ["nfce"],
  cupom: ["nfce", "pdv"],
  qrcode: ["nfce"],
  "qr code": ["nfce"],
  csc: ["nfce"],
  "token csc": ["nfce"],

  // SAT
  sat: ["sat"],
  "cf-e": ["sat"],
  cfe: ["sat"],
  satcfe: ["sat"],
  ativacao: ["sat"],
  ativação: ["sat"],
  associacao: ["sat"],
  associação: ["sat"],

  // SPED
  sped: ["sped"],
  speed: ["sped"],
  efd: ["sped"],
  ecf: ["sped"],
  bloco: ["sped"],
  escrituracao: ["sped"],
  escrituração: ["sped"],
  "sped fiscal": ["sped"],
  "speed fiscal": ["sped"],
  "sped contribuicoes": ["sped"],
  "sped contribuições": ["sped"],
  "speed contribuicoes": ["sped"],
  "registro de entradas": ["sped"],
  "registro de saidas": ["sped"],
  "registro de saídas": ["sped"],
  "livro de entradas": ["sped"],
  "livro de saidas": ["sped"],
  "livro de saídas": ["sped"],
  "apuracao icms": ["sped"],
  "apuração icms": ["sped"],
  "apuracao do icms": ["sped"],
  "apuração do icms": ["sped"],
  "gerar sped": ["sped"],
  "gerar speed": ["sped"],
  "arquivo sped": ["sped"],
  "exportar sped": ["sped"],
  "exportados os dados": ["sped"],
  "contabilidade": ["sped"],

  // PDV / Caixa
  caixa: ["pdv"],
  pdv: ["pdv"],
  venda: ["pdv"],
  abertura: ["pdv"],
  fechamento: ["pdv"],
  sangria: ["pdv"],
  suprimento: ["pdv"],
  troco: ["pdv", "nfe"],
  "ausencia de troco": ["nfe"],
  "ausência de troco": ["nfe"],
  "pagamento maior que total": ["nfe"],
  "valor do pagamento maior": ["nfe"],
  "nota 1045": ["nfe", "nfce"],
  "erro 1045": ["nfe", "nfce"],
  "qrcode invalido": ["nfce"],
  "qrcode inválido": ["nfce"],
  "falha na validacao": ["nfe", "nfce"],
  "falha na validação": ["nfe", "nfce"],
  "atomic type": ["nfe", "nfce"],
  desconto: ["pdv"],
  acrescimo: ["pdv"],
  acréscimo: ["pdv"],
  devolucao: ["pdv", "nfe", "compras"],
  devolução: ["pdv", "nfe", "compras"],
  "nota de devolucao": ["pdv", "nfe"],
  "nota de devolução": ["pdv", "nfe"],
  "nf de devolucao": ["pdv", "nfe"],
  "gerar devolucao": ["pdv", "nfe"],
  "gerar devolução": ["pdv", "nfe"],
  "produto vencido": ["pdv", "nfe"],
  "dados tributarios": ["tributacao", "pdv"],
  "dados tributários": ["tributacao", "pdv"],
  troca: ["pdv"],
  "troca de mercadoria": ["pdv"],
  operador: ["pdv"],
  turno: ["pdv"],

  // TEF / Pagamento
  tef: ["tef"],
  pix: ["tef"],
  cartao: ["tef"],
  cartão: ["tef"],
  debito: ["tef"],
  débito: ["tef"],
  credito: ["tef"],
  crédito: ["tef"],
  pinpad: ["tef"],
  maquininha: ["tef"],
  adquirente: ["tef"],
  cielo: ["tef"],
  rede: ["tef"],
  stone: ["tef"],
  sitef: ["tef"],
  "codigo da loja": ["tef"],
  "código da loja": ["tef"],
  concentrador: ["tef"],
  "sincronizar pdv": ["tef"],
  "codigo sitef": ["tef"],
  "código sitef": ["tef"],
  "filial errada": ["tef"],
  "hora do log": ["tef"],

  // Balança
  balanca: ["balanca"],
  balança: ["balanca"],
  toledo: ["balanca"],
  filizola: ["balanca"],
  lider: ["balanca"],
  líder: ["balanca"],
  prix: ["balanca"],
  etiqueta: ["balanca"],
  peso: ["balanca"],
  serial: ["balanca", "hardware"],
  com1: ["balanca", "hardware"],
  com2: ["balanca", "hardware"],
  baud: ["balanca", "hardware"],
  "porta serial": ["balanca", "hardware"],

  // Estoque
  estoque: ["estoque"],
  inventario: ["estoque"],
  inventário: ["estoque"],
  movimentacao: ["estoque"],
  movimentação: ["estoque"],
  entrada: ["estoque", "compras"],
  saida: ["estoque"],
  saída: ["estoque"],
  transferencia: ["estoque"],
  transferência: ["estoque"],
  ajuste: ["estoque"],
  saldo: ["estoque"],
  lote: ["estoque"],
  validade: ["estoque"],

  // Cadastro de Produto
  produto: ["cadastro_produto"],
  ean: ["cadastro_produto"],
  gtin: ["cadastro_produto"],
  codigo: ["cadastro_produto"],
  código: ["cadastro_produto"],
  "codigo de barras": ["cadastro_produto"],
  "código de barras": ["cadastro_produto"],
  unidade: ["cadastro_produto"],
  fabricante: ["cadastro_produto"],
  colecao: ["cadastro_produto"],
  coleção: ["cadastro_produto"],
  descricao: ["cadastro_produto"],
  descrição: ["cadastro_produto"],
  preco: ["cadastro_produto"],
  preço: ["cadastro_produto"],
  margem: ["cadastro_produto"],
  custo: ["cadastro_produto"],
  nmercosul: ["cadastro_produto", "fiscal"],

  // Financeiro
  financeiro: ["financeiro"],
  boleto: ["financeiro"],
  conta: ["financeiro"],
  receber: ["financeiro"],
  pagar: ["financeiro"],
  pagamento: ["financeiro"],
  vencimento: ["financeiro"],
  baixa: ["financeiro"],
  conciliacao: ["financeiro"],
  conciliação: ["financeiro"],
  extrato: ["financeiro"],
  fluxo: ["financeiro"],

  // Compras / Entrada e Saída Retaguarda
  compra: ["compras"],
  fornecedor: ["compras"],
  pedido: ["compras"],
  nfe_entrada: ["compras", "nfe"],
  "entrada de nota": ["compras"],
  "entrada nf": ["compras"],
  "lancar nota": ["compras"],
  "lançar nota": ["compras"],
  "entrada fiscal": ["compras"],
  "movimentacao compras": ["compras"],
  "movimentação compras": ["compras"],
  "perfil 201": ["compras"],
  "perfil entrada": ["compras"],
  "consulta movimentacao": ["compras"],
  "consulta movimentação": ["compras"],
  "chave nfe": ["compras"],
  "chave de acesso": ["compras"],
  "vincular nota": ["compras"],
  duplicata: ["compras", "financeiro"],
  "saida de nota": ["compras"],
  "saída de nota": ["compras"],
  "nota de saida": ["compras"],
  "nota de saída": ["compras"],
  "movimentacao vendas": ["compras"],
  "movimentação vendas": ["compras"],
  "perfil 103": ["compras"],
  "tabela de precos": ["compras"],
  "tabela de preços": ["compras"],
  "retaguarda": ["compras"],

  // Hardware
  impressora: ["hardware"],
  "configurar impressora": ["hardware"],
  "instalar impressora": ["hardware"],
  "impressora nao imprime": ["hardware"],
  "impressora nao funciona": ["hardware"],
  "impressora de etiqueta": ["hardware"],
  "impressora de cupom": ["hardware"],
  leitor: ["hardware"],
  scanner: ["hardware"],
  gaveta: ["hardware"],
  "nao imprime": ["hardware"],
  "não imprime": ["hardware"],
  usb: ["hardware"],
  driver: ["hardware"],
  dispositivo: ["hardware"],
  "porta com": ["hardware", "balanca"],

  // Impressora Elgin i9 / i8 / i7
  elgin: ["impressora_elgin", "hardware"],
  "elgin i9": ["impressora_elgin"],
  "elgin i8": ["impressora_elgin"],
  "elgin i7": ["impressora_elgin"],
  "utility elgin": ["impressora_elgin"],
  "impressora elgin": ["impressora_elgin"],
  "impressora termica": ["impressora_elgin", "hardware"],
  "termica elgin": ["impressora_elgin"],
  "nao detecta impressora": ["impressora_elgin", "hardware"],
  "não detecta impressora": ["impressora_elgin", "hardware"],
  "impressora nao aparece": ["impressora_elgin", "hardware"],
  "impressora não aparece": ["impressora_elgin", "hardware"],
  "instalar elgin": ["impressora_elgin"],
  "driver elgin": ["impressora_elgin"],
  "utility i9": ["impressora_elgin"],
  "utility i8": ["impressora_elgin"],

  // Banco de dados
  banco: ["banco_dados"],
  backup: ["banco_dados"],
  restore: ["banco_dados"],
  restaurar: ["banco_dados"],
  corrompido: ["banco_dados"],
  lento: ["banco_dados"],
  performance: ["banco_dados"],
  conexao: ["banco_dados"],
  conexão: ["banco_dados"],
  firebird: ["banco_dados"],
  postgres: ["banco_dados"],
  sql: ["banco_dados"],

  // Instalação / Atualização
  instalar: ["instalacao"],
  instalacao: ["instalacao"],
  instalação: ["instalacao"],
  atualizar: ["instalacao"],
  atualizacao: ["instalacao"],
  atualização: ["instalacao"],
  versao: ["instalacao"],
  versão: ["instalacao"],
  dll: ["instalacao"],
  exe: ["instalacao"],
  setup: ["instalacao"],

  // Certificado Digital
  certificado: ["certificado"],
  "a1": ["certificado"],
  "a3": ["certificado"],
  token: ["certificado"],
  smartcard: ["certificado"],
  "smart card": ["certificado"],
  expirado: ["certificado"],
  vencido: ["certificado"],
  senha: ["certificado"],
  pfx: ["certificado"],

  // Clientes
  cliente: ["clientes"],
  "cadastro de cliente": ["clientes"],
  cpf: ["clientes", "fornecedores"],
  cnpj: ["clientes", "fornecedores"],
  "inscricao estadual": ["clientes", "fornecedores"],
  "inscrição estadual": ["clientes", "fornecedores"],
  "limite de credito": ["clientes"],
  "limite de crédito": ["clientes"],
  spc: ["clientes"],
  dataexclusao: ["clientes", "fornecedores", "cadastro_produto"],
  pessoas: ["clientes", "fornecedores"],
  "destinatario invalido": ["clientes", "nfe"],
  "destinatário inválido": ["clientes", "nfe"],
  "cliente bloqueado": ["clientes"],
  "credito bloqueado": ["clientes"],
  "crédito bloqueado": ["clientes"],

  // Fornecedores
  "cadastro de fornecedor": ["fornecedores"],
  "fornecedor nao encontrado": ["fornecedores"],
  "fornecedor não encontrado": ["fornecedores"],
  "xml do fornecedor": ["fornecedores", "compras", "nfe"],
  "importar xml": ["fornecedores", "compras", "nfe"],
  "recepcao de nfe": ["fornecedores", "compras", "nfe"],
  "recepção de nfe": ["fornecedores", "compras", "nfe"],
  "check-in": ["fornecedores", "compras"],
  "checkin": ["fornecedores", "compras"],
  "sem informacao": ["fornecedores"],
  "sem informação": ["fornecedores"],
  "razao social nao aparece": ["fornecedores"],
  "razão social não aparece": ["fornecedores"],
  "carga mobile": ["fornecedores"],
  "tela de cargas": ["fornecedores"],
  "self checkout": ["fornecedores", "pdv"],
  "selfcheckout": ["fornecedores", "pdv"],
  "notas conferencia": ["fornecedores", "compras"],
  "notas conferência": ["fornecedores", "compras"],
  "valor negativo": ["fornecedores", "estoque"],
  "valores negativos": ["fornecedores", "estoque"],
  "produto negativo": ["estoque", "fornecedores"],

  // Perfil de Movimento
  perfil: ["perfil_movimento"],
  perfilvenda: ["perfil_movimento"],
  "perfil de movimento": ["perfil_movimento"],
  "perfil de compra": ["perfil_movimento", "compras"],
  "perfil de venda": ["perfil_movimento", "vendas_retaguarda"],
  "perfil padrao": ["perfil_movimento"],
  "perfil padrão": ["perfil_movimento"],
  "modelo 55": ["nfe", "perfil_movimento"],
  "modelo 65": ["nfce", "perfil_movimento"],
  finalizadora: ["perfil_movimento", "vendas_retaguarda", "financeiro_avancado"],
  perfilfinalizadora: ["perfil_movimento"],
  "perfil fiscal": ["perfil_movimento", "fiscal"],
  "movimenta estoque": ["perfil_movimento", "estoque"],
  "gera financeiro": ["perfil_movimento", "financeiro_avancado"],

  // Vendas retaguarda
  fvendas: ["vendas_retaguarda"],
  cabven: ["vendas_retaguarda"],
  iteven: ["vendas_retaguarda"],
  orcamento: ["vendas_retaguarda"],
  orçamento: ["vendas_retaguarda"],
  "finalizar venda": ["vendas_retaguarda"],
  "venda nao gerou financeiro": ["vendas_retaguarda", "financeiro_avancado"],
  "venda não gerou financeiro": ["vendas_retaguarda", "financeiro_avancado"],
  protocolo: ["nfe", "vendas_retaguarda"],
  "cancelar venda": ["vendas_retaguarda", "nfe"],
  "excluir venda": ["vendas_retaguarda"],
  reimprimir: ["vendas_retaguarda", "nfe"],

  // Contagem de estoque
  contagem: ["contagem_estoque"],
  fcontagem: ["contagem_estoque"],
  "aplicar contagem": ["contagem_estoque"],
  movimentoperiodo: ["contagem_estoque"],
  grade: ["contagem_estoque", "estoque"],
  tamanho: ["contagem_estoque", "estoque"],
  "estoque negativo": ["contagem_estoque", "estoque"],
  "saldo negativo": ["contagem_estoque", "estoque"],
  "contagem de estoque": ["contagem_estoque"],
  "inventario fisico": ["contagem_estoque"],
  "inventário físico": ["contagem_estoque"],
  "autorizacao para aplicar": ["contagem_estoque", "filiais_usuarios"],

  // Financeiro avançado
  lancc: ["financeiro_avancado"],
  "contas a receber": ["financeiro_avancado"],
  "contas a pagar": ["financeiro_avancado"],
  titulo: ["financeiro_avancado"],
  título: ["financeiro_avancado"],
  fcontar: ["financeiro_avancado"],
  freceb: ["financeiro_avancado"],
  "baixar titulo": ["financeiro_avancado"],
  "baixar título": ["financeiro_avancado"],
  recebimento: ["financeiro_avancado"],
  prazo: ["financeiro_avancado", "perfil_movimento"],
  "fluxo de caixa": ["financeiro_avancado"],
  "transferencia entre contas": ["financeiro_avancado"],
  "transferência entre contas": ["financeiro_avancado"],
  deposito: ["financeiro_avancado"],
  depósito: ["financeiro_avancado"],
  "titulo nao aparece": ["financeiro_avancado"],
  "título não aparece": ["financeiro_avancado"],

  // Sintegra
  sintegra: ["sintegra"],
  fsintegra: ["sintegra"],
  "registro 50": ["sintegra"],
  "registro 54": ["sintegra"],
  "registro 60": ["sintegra"],
  "registro 74": ["sintegra"],
  "registro 75": ["sintegra"],
  "arquivo sintegra": ["sintegra"],
  "gerar sintegra": ["sintegra"],

  // Filiais e Usuários
  filial: ["filiais_usuarios"],
  usuario: ["filiais_usuarios"],
  usuário: ["filiais_usuarios"],
  grupo: ["filiais_usuarios"],
  direitos: ["filiais_usuarios"],
  modulos: ["filiais_usuarios"],
  módulos: ["filiais_usuarios"],
  permissao: ["filiais_usuarios"],
  permissão: ["filiais_usuarios"],
  "nao ve no menu": ["filiais_usuarios"],
  "não vê no menu": ["filiais_usuarios"],
  "opcao sumiu": ["filiais_usuarios"],
  "opção sumiu": ["filiais_usuarios"],
  "sem acesso": ["filiais_usuarios"],
  ibge: ["filiais_usuarios", "clientes", "nfe"],
  "codigo ibge": ["filiais_usuarios", "clientes", "nfe"],
  "código ibge": ["filiais_usuarios", "clientes", "nfe"],

  // Reforma Tributária
  "reforma tributaria": ["reforma_tributaria"],
  "reforma tributária": ["reforma_tributaria"],
  cbs: ["reforma_tributaria"],
  ibs: ["reforma_tributaria"],
  "classe tributaria": ["reforma_tributaria"],
  "classe tributária": ["reforma_tributaria"],
  id_reforma: ["reforma_tributaria"],
  "reforma tributaria nao aparece": ["reforma_tributaria", "filiais_usuarios"],
}

// ─── Conteúdo de cada módulo ──────────────────────────────────────────────────

const KNOWLEDGE: Record<AugeModule, string> = {

  geral: `AUGE ERP — Visão Geral
Produto: Sistema ERP brasileiro para varejo, atacado e serviços.
Módulos principais: Caixa/PDV, Fiscal, Estoque, Financeiro, Compras, Relatórios.
Integrações: SEFAZ (NF-e/NFC-e), SAT-CF-e, TEF, Balança, Impressora fiscal.
Banco de dados: Firebird (versões antigas) ou PostgreSQL (versões recentes).
Suporte atende: configuração, erros de operação, fiscal, hardware periférico, atualizações.`,

  fiscal: `MÓDULO FISCAL — AUGE ERP
Documentos emitidos: NF-e (modelo 55), NFC-e (modelo 65), SAT CF-e (modelo 59).
Campos críticos de qualquer documento fiscal:
  - CFOP: código de operação (3 ou 4 dígitos); erro de CFOP bloqueia autorização SEFAZ.
  - CST / CSOSN: tributação do item; Simples Nacional usa CSOSN (3 dígitos); Regime Normal usa CST (3 dígitos).
  - NCM: código de 8 dígitos da mercadoria; obrigatório na NF-e; deve corresponder ao produto.
  - CEST: 7 dígitos; obrigatório para produtos sujeitos a substituição tributária.
  - ICMS, PIS, COFINS, IPI: alíquotas e bases devem estar parametrizadas na alíquota tributária do produto.
Erros comuns:
  - Rejeição SEFAZ: verificar código de rejeição no XML de resposta (campo <xMotivo>).
  - Certificado expirado: causa rejeição 280 ou 999; renovar certificado A1/A3.
  - Data/hora do servidor divergente: causa rejeição 242; sincronizar relógio do servidor.
  - Ambiente incorreto (homologação x produção): checar configuração no sistema.
  - Série não cadastrada ou ambiente errado: conferir Cadastro > Séries.
Contingência: quando SEFAZ offline, emitir em contingência (DPEC ou FS-DA); regularizar ao voltar online.
Cancelamento: prazo máximo 24h após autorização; após isso, usar Carta de Correção ou NF de devolução.`,

  nfe: `NF-e (MODELO 55) — AUGE ERP
Fluxo de emissão: Gerar XML → Assinar com certificado → Enviar SEFAZ → Receber autorização → Imprimir DANFE.
Campos obrigatórios além do padrão fiscal: natureza da operação, dados do destinatário (CNPJ/CPF, IE, endereço).
Rejeições frequentes e causa raiz:
  - 204 / 999: certificado digital inválido ou expirado.
  - 206: CNPJ do emitente não cadastrado na SEFAZ.
  - 401: cliente com IE inválida; verificar cadastro do cliente.
  - 539: produto com NCM inválido; conferir tabela NCM vigente.
  - 559: CEST inválido ou ausente para produto com ST.
  - 228: certificado da série A3 com problema de leitura; verificar driver do token.
Carta de Correção (CC-e): apenas para campos não determinantes do valor; máximo 20 cartas por NF-e.
NF de entrada (compra): conferir CFOP de entrada, natureza de operação e tributação do fornecedor.
Inutilização: para numerações não usadas; não inutilizar sequências que terão nota cancelada.

ERRO 12007 — "O nome do servidor não pode ser resolvido" (CAUSA MAIS COMUM DE "SEFAZ FORA DO AR"):
Erro Interno: 12007 / Erro HTTP: 0 / Mensagem: "O nome do servidor não pode ser resolvido"
URL típica: https://nfe.sefaz.[estado].gov.br/nfe/services/NFeAutorizacao4?wsdl
CAUSA REAL: NÃO é a SEFAZ offline. É falha de resolução de DNS no computador ou rede local.
O Windows não consegue converter o nome do servidor SEFAZ em endereço IP.
Diagnóstico rápido (CMD): ping nfe.sefaz.go.gov.br
  → "Não foi possível resolver" = DNS com falha (causa confirmada)
  → Responde com IP = DNS ok, problema está em outro lugar
Solução:
  1. Trocar DNS da placa de rede para 8.8.8.8 / 8.8.4.4 (Google) ou 1.1.1.1 (Cloudflare)
  2. Reiniciar o roteador e aguardar 2 minutos
  3. Conferir data e hora do computador (certificado digital rejeita se errada)
  4. Testar abrir https://nfe.sefaz.go.gov.br no navegador — se não abrir, confirma DNS
  5. Se todas as máquinas falham: problema no provedor (ISP) — contatar a operadora
Atenção: clientes e atendentes frequentemente dizem "SEFAZ está fora do ar" para este erro.
Sempre pedir o código/mensagem exata antes de concluir que é a SEFAZ.

CASO REAL — REJEIÇÃO "AUSÊNCIA DE TROCO QUANDO O VALOR DOS PAGAMENTOS INFORMADOS FOR MAIOR QUE O TOTAL DA NOTA":
Causa: a NF-e (modelo 55) exige que, se a soma dos meios de pagamento informados for maior que o valor total da nota, a diferença seja declarada explicitamente como troco no XML (tag <vTroco>). Quando isso não é preenchido, a SEFAZ rejeita.
Situação típica: venda no PDV onde o cliente pagou valor acima do total (ex.: pagou R$50 numa nota de R$47,30) e o sistema não registrou o troco automaticamente.
Solução:
  1. Verificar na finalizadora da venda se o campo de troco está sendo calculado e gravado corretamente.
  2. Se for uma nota já rejeitada: corrigir o valor do pagamento para ser igual ao total da nota, OU registrar o troco corretamente na tag <vTroco> antes de reenviar.
  3. Se ocorrer em série: revisar o Perfil de Movimento — verificar se a configuração da finalizadora está somando corretamente pagamentos x total da nota.
  4. Em vendas no PDV: garantir que o fechamento do caixa calcule e registre o troco antes de gerar a NF-e.

CASO REAL — FALHA NA VALIDAÇÃO DA NOTA 1045 — ELEMENTO qrCode COM TIPO INVÁLIDO:
Mensagem exata: "Falha na validação dos dados da nota: 1045 — Element '{http://www.portalfiscal.inf.br/nfe}qrCode' is not a valid value of the local atomic type."
Causa: o conteúdo da tag <qrCode> no XML da NFC-e (modelo 65) não está no formato esperado pelo schema da SEFAZ. Geralmente ocorre quando: (1) a URL do QR Code está malformada ou muito longa, (2) há quebra de linha ou caractere inválido no conteúdo da tag, (3) mismatch de versão do schema NF-e (layout 4.00 vs 3.10), ou (4) o CSC/Token do estabelecimento está incorreto gerando uma chave inválida.
Solução:
  1. Verificar no XML gerado se o conteúdo da tag <qrCode> é uma URL válida e completa (começa com https://nfeweb.sefaz.go.gov.br ou domínio da SEFAZ do estado).
  2. Confirmar se o CSC (Código de Segurança do Contribuinte) e o Token da NFC-e estão corretos no cadastro da empresa — CSC inválido gera QR Code com hash incorreto.
  3. Verificar se a versão do layout NF-e configurada no AUGE está correta para o estado (geralmente 4.00).
  4. Se o problema ocorrer em múltiplas notas simultaneamente (ex.: 14 notas no Amendoeira, 70 no Alvorada), indica problema sistêmico de configuração — não é nota a nota.
  5. Após corrigir CSC/Token: regerar as notas pendentes.`,

  nfce: `NFC-e (MODELO 65) — AUGE ERP / PDV
Finalidade: nota fiscal eletrônica para consumidor final no PDV (substitui ECF/cupom fiscal).
Configuração mínima: CSC (Código de Segurança do Contribuinte) + Token + Série NFC-e + ambiente.
CSC e Token: gerados no portal da SEFAZ estadual; cada estabelecimento tem o seu; expiram periodicamente.
QR Code: gerado automaticamente com base no XML; obrigatório impressão junto ao DANFE NFC-e.
Contingência NFC-e: emissão offline com número de controle interno; sincronizar com SEFAZ em até 24h.
Cancelamento: prazo de 30 minutos após autorização (alguns estados permitem até 24h).
Erros comuns:
  - CSC/Token inválido: rejeição 656; regenerar no portal SEFAZ e atualizar no sistema.
  - Série duplicada: conferir configuração da série no cadastro de empresa.
  - QR Code não imprime: verificar driver da impressora e template do DANFE.
Devolução no PDV: gerar NF-e de devolução (modelo 55) referenciando a NFC-e original.`,

  sat: `SAT CF-e (MODELO 59) — AUGE ERP
Hardware: equipamento SAT homologado pela SEFAZ-SP (exclusivo São Paulo).
Ativação: equipamento precisa ser ativado com código fornecido pela SEFAZ-SP antes do uso.
Associação: vincular SAT ao CNPJ do estabelecimento via portal SEFAZ-SP.
Comunicação: SAT conecta via USB; requer DLL do fabricante instalada corretamente.
Erros comuns:
  - Código 2 (SAT em uso): fechar a sessão SAT aberta antes de tentar nova operação.
  - Código 5 (SAT bloqueado): prazo de envio de movimento expirado; regularizar via portal.
  - Código 6 (SAT desativado): equipamento desativado; contatar SEFAZ-SP.
  - DLL não encontrada: reinstalar software do fabricante (Toledo, Bematech, etc.).
  - Timeout de comunicação: verificar cabo USB, trocar porta USB, reiniciar serviço SAT.
Cancelamento CF-e: até 30 minutos após emissão; requer XML do CF-e original.
Extrato CF-e: impressão obrigatória; verificar impressora e template configurado.`,

  sped: `SPED FISCAL — AUGE ERP
Como gerar o arquivo SPED Fiscal (ou SPED Contribuições) no AUGE ERP.
A ordem é obrigatória: Entradas → Saídas → Apuração → Gerar arquivo.

PARTE 1 — REGISTROS DE ENTRADAS
  1. Com o sistema aberto, clique no menu "Fiscal".
  2. Clique em "Registros de Entradas".
  3. Informe o intervalo de tempo no campo "Período para Emissão":
     - Normalmente: primeiro dia do mês até o último dia do mês.
     - Se for parcial: do primeiro dia até a data atual.
  4. No campo "Filtrar por Notas", marque a opção "Todas".
  5. Clique no botão "Livro de Entrada".
  6. Aguarde. Quando aparecer a janela com a mensagem "Exportados os dados para a apuração!", significa que o Livro de Entrada foi gerado com sucesso. Clique em OK.
  7. Feche as janelas que abriram ao gerar os Registros de Entradas.

  ATENÇÃO: se aparecer uma listagem com números de cupons ou documentos ao gerar o Livro de Entrada, tire um print dessa tela. Essa listagem indica notas com inconsistência que precisam ser corrigidas antes de continuar.

PARTE 2 — REGISTROS DE SAÍDAS
  8. Ainda dentro do menu Fiscal, clique em "Registros de Saídas".
  9. Informe o mesmo intervalo de tempo do passo 3 no campo "Período para Emissão".
  10. No campo "Filtrar por Notas", marque a opção "Todas".
  11. Clique no botão "Livro de Saída".
  12. Aguarde. Quando aparecer a mensagem "Exportados os dados para a apuração!", o Livro de Saída foi gerado com sucesso. Clique em OK.
  13. Feche as janelas que abriram ao gerar os Registros de Saídas.

  ATENÇÃO: se aparecer uma listagem com números de cupons ou documentos ao gerar o Livro de Saída, tire um print dessa tela para correção.

PARTE 3 — APURAÇÃO E GERAÇÃO DO ARQUIVO
  14. Dentro do menu Fiscal, clique em "Apuração ICMS".
  15. Informe o mesmo intervalo de tempo no campo "Período para Emissão".
  16. Clique em "Mais", localizado na parte superior direita (ao lado do botão "Fechar").
  17. Escolha o arquivo que deseja gerar:
      - Opção 4: "Gerar Arquivo SPED Fiscal" (para o SPED Fiscal / EFD ICMS-IPI)
      - Opção 5: "Gerar Arquivo SPED Contribuições" (para o SPED Contribuições / EFD PIS-COFINS)
  18. Informe o local onde o arquivo será salvo e clique em "Salvar".
  19. Aguarde até aparecer a janela "Arquivo Gerado com Sucesso". Clique em OK.
  20. O arquivo estará disponível na pasta que você escolheu no passo 18.

PROBLEMAS COMUNS:
  - Apareceu listagem de documentos ao gerar Entradas ou Saídas: tirar print e corrigir as notas listadas antes de continuar.
  - Período errado: usar sempre do primeiro ao último dia do mês; mesmo geração parcial usa o mês completo.
  - Bloco de apuração zerado no arquivo: os Registros de Entradas ou Saídas não foram gerados; refazer os passos 1 a 13.
  - "Filtrar por Notas" não estava em "Todas": arquivo ficou incompleto; refazer com "Todas" marcado.
  - Arquivo rejeitado pelo validador SPED: verificar produto sem NCM no cadastro.`,

  pdv: `PDV / CAIXA — AUGE ERP
Abertura de caixa: operador informa valor de troco inicial; sistema registra turno/sessão.
Fechamento de caixa: conferência de valores por forma de pagamento; geração do relatório Z.
Sangria: retirada de numerário durante o turno; exige autorização conforme perfil.
Suprimento: entrada de numerário; registro com motivo.
Formas de pagamento disponíveis: dinheiro, cartão (TEF), PIX (TEF), cheque, crédito loja, convênio.
Desconto: pode ser por item ou pelo total; respeita limite de perfil do operador.
Devolução/Troca no PDV:
  PASSO 1: No PDV, acesse Movimentação → Devoluções (ou tecle o atalho configurado).
  PASSO 2: Informe o número da NF-e de saída original que originou a devolução.
  PASSO 3: Selecione os itens a devolver e confirme as quantidades.
  PASSO 4: Selecione o motivo da devolução (ex: produto vencido, defeito, troca).
  PASSO 5: O sistema gera automaticamente NF-e de devolução (modelo 55) referenciando a NF original.
  PASSO 6: Confirme e autorize — a NF-e de devolução é transmitida para a SEFAZ.
  Atenção: dados tributários (CST, CFOP, alíquotas) devem coincidir com a NF original.
  CFOP de devolução: 1201/2201 (compra devolvida) ou 5201/6201 (venda devolvida).
  Erro "dados tributários": verificar cadastro do produto — CST, NCM, alíquota devem estar preenchidos.
Orçamento: gerado sem emissão fiscal; convertido em venda ao confirmar.
Pedido de venda: pode gerar pré-venda; integra com separação de estoque.
Relatórios de caixa: caixa geral, vendas por operador, vendas por forma de pagamento, mapa de caixa.
Erros comuns:
  - Caixa já aberto por outro operador: verificar e fechar caixa pendente.
  - Venda travada: checar se NFC-e/SAT comunicou com SEFAZ; aguardar ou cancelar.
  - Forma de pagamento não aparece: verificar se está ativa no cadastro de formas de pagamento.`,

  tef: `TEF / PIX / CARTÃO — AUGE ERP
TEF (Transferência Eletrônica de Fundos): integração com maquininha via software (SiTef, PayGo, etc.).
Adquirentes suportados: Cielo, Rede, Stone, Getnet, Safrapay, PagSeguro e outros via SiTef.
PinPad: dispositivo de captura de senha; conecta via USB ou serial; requer driver específico.
PIX no TEF: geração de QR Code dinâmico via adquirente; confirmação automática.
Configuração TEF:
  - IP e porta do servidor TEF (SiTef/PayGo).
  - Código do estabelecimento (EC) junto à adquirente.
  - Código do terminal (número do POS).
Erros comuns:
  - Timeout de comunicação: servidor TEF offline ou IP/porta incorretos; verificar rede.
  - Transação não concluída: aguardar confirmação antes de fechar caixa; não cancelar manualmente.
  - PinPad não reconhecido: reinstalar driver, trocar porta USB, reiniciar serviço TEF.
  - PIX não confirmado: verificar conexão internet; aguardar webhook da adquirente.
  - Erro de autenticação: código EC ou terminal incorreto; conferir cadastro na adquirente.
Cancelamento/Estorno: requer senha administrativa; prazo varia por adquirente (geralmente D+0).

CASO REAL — SITEF COM CÓDIGO DE LOJA INCORRETO (TRANSAÇÕES INDO PARA FILIAL ERRADA):
Sintoma: transações TEF aprovadas mas creditadas/direcionadas para outra filial; caixas param sem motivo aparente; log SiTef mostra código da loja divergente do esperado.
Causa raiz: campo "Código da Loja SiTef" no concentrador configurado com código errado (ex.: 00000409 quando o correto era 01163226 para determinado CNPJ). O concentrador direciona todas as transações para a adquirente usando esse código — se pertence a outra filial, o crédito vai para lá.
Como identificar: verificar o código configurado no concentrador SiTef e comparar com o código correto fornecido pela adquirente (Elgin, Cielo, Rede etc.) para o CNPJ do estabelecimento.
Solução:
  1. Confirmar o código correto com a adquirente (Elgin/certificadora SiTef).
  2. Acessar o concentrador SiTef e alterar o Código da Loja para o valor correto.
  3. Salvar a configuração no concentrador.
  4. Propagação para os PDVs: ocorre automaticamente quando os terminais reconectam ao concentrador. Para forçar: reiniciar o serviço "SiTef" nos PDVs (serviços do Windows) ou reiniciar o caixa.
  5. Validar com uma transação teste no primeiro PDV antes de liberar todos.
ATENÇÃO sobre "hora do log incorreta": se os caixas pararam após a alteração no concentrador e o log SiTef mostra horário divergente, verifique se o horário do servidor/concentrador está sincronizado com os terminais — diferença de horário pode causar rejeição das transações pelos PDVs. Corrigir o horário do Windows nos terminais resolve.`,

  balanca: `BALANÇA — AUGE ERP
Marcas suportadas: Toledo, Filizola, Líder, Prix, Urano, Micheletti.
Comunicação: serial (RS-232/RS-485) ou TCP/IP (modelos mais novos).
Protocolos comuns: Toledo 8217, Filizola, Prix, Urano (configurados por modelo no AUGE).
Configuração serial:
  - Porta COM (ex.: COM1, COM3): verificar no Gerenciador de Dispositivos do Windows.
  - Baud rate: 9600 ou 19200 (depende do modelo; deve ser igual na balança e no sistema).
  - Data bits: 7 ou 8; Stop bits: 1 ou 2; Parity: none/even/odd.
Configuração TCP/IP:
  - IP da balança na rede local; porta padrão varia por modelo (geralmente 23 ou 4001).
Envio de produtos: produtos com flag "pesável" e PLU configurado são enviados para a balança.
PLU: código interno da balança; deve ser único e dentro do limite do modelo (ex.: 1 a 9999).
Etiqueta de balança: template configurado na balança ou pelo software do fabricante.
Erros comuns:
  - "Balança não responde": verificar cabo serial/rede, porta COM, baud rate, e se balança está ligada.
  - Porta COM em uso: outro software está usando a porta; fechar e reabrir o AUGE.
  - Peso incorreto: calibrar balança conforme manual do fabricante.
  - PLU não encontrado: produto não enviado para balança ou PLU errado; reenviar cadastro.
  - Erro de paridade: baud rate ou configuração serial diferente entre balança e sistema.
  - TCP timeout: IP incorreto ou balança offline na rede; pingar o IP da balança.`,

  estoque: `ESTOQUE — AUGE ERP
Movimentações: entrada (compra, devolução de cliente), saída (venda, devolução a fornecedor), transferência entre filiais, ajuste.
Inventário: contagem periódica; gera ajuste automático de saldo.
Lote e validade: rastreabilidade por lote; exige configuração no cadastro do produto.
Saldo negativo: permitido por configuração de empresa; se não permitido, bloqueia saída.
Custo médio: recalculado a cada entrada; base para relatórios de margem.
Conferência de entrada: ao receber mercadoria, conferir nota fiscal vs. quantidade física.
Transferência entre filiais: gera NF-e de transferência (CFOP 6.152 / 5.152).
Erros comuns:
  - Saldo divergente: verificar movimentações do período; checar estorno de notas.
  - Produto não sai do estoque: verificar se produto está ativo e com estoque disponível.
  - Entrada duplicada: verificar se NF de entrada já foi lançada (chave de acesso duplicada).
  - Inventário desatualizado: confirmar fechamento do inventário antes de iniciar novo período.`,

  cadastro_produto: `CADASTRO DE PRODUTO — AUGE ERP
Campos obrigatórios: PRODUTO (código), COLECAO, DESCRICAO, NREDUZIDO, UNIDADE, CLASSIFICACAO, FABRICANTE, ALIQUOTATRIBUTARIA.
Campos fiscais críticos: NCM (8 dígitos), CEST (7 dígitos — se sujeito a ST), NMERCOSUL (8 caracteres).
Código EAN/GTIN (CODIGO2): validar check digit EAN-13; sistema valida unicidade; impede dois EANs ativos no mesmo produto.
PLU (balança): código numérico para balança; deve respeitar limite do modelo.
Alíquota tributária: define ICMS, PIS, COFINS, IPI, ST para emissão fiscal; obrigatória.
Fluxo de inclusão: Incluir → preencher campos → Confirmar (BeforePost valida) → Gravar (AfterPost complementa).
Validações do BeforePost: formato do NCM, CEST, EAN; unicidade do código; campos obrigatórios preenchidos.
Exclusão lógica: produto excluído recebe DATAEXCLUSAO; não aparece em novas vendas; restaurável.
Produto composto/conjunto: vincula componentes; estoque baixado nos componentes.
Produto pesável: liga integração com balança; requer PLU e unidade KG ou similar.
Erros comuns:
  - "Campo obrigatório não preenchido": verificar lista de campos obrigatórios acima.
  - "EAN duplicado": conferir PROCODIGO para EAN já cadastrado em outro produto.
  - "NCM inválido": verificar tabela NCM vigente (TIPI); remover caracteres especiais.
  - "CEST inválido": verificar tabela CEST atual; produto pode não ter CEST (não obrigatório para todos).`,

  financeiro: `FINANCEIRO — AUGE ERP
Contas a receber: geradas automaticamente pelas vendas; podem ser geradas manualmente.
Contas a pagar: geradas por compras ou lançamento manual.
Baixa: registrar pagamento/recebimento; pode ser total ou parcial.
Boleto: integração bancária via CNAB; configurar convênio bancário (código do banco, agência, conta, carteira).
Conciliação bancária: importar extrato bancário (OFX/CNAB) e conciliar com lançamentos do sistema.
Juros e multa: calculados automaticamente sobre vencimento se configurado no convênio.
Fluxo de caixa: relatório de entradas e saídas previstas e realizadas por período.
Erros comuns:
  - Boleto não gerado: verificar configuração do convênio bancário (nosso número, carteira).
  - Baixa duplicada: verificar histórico de baixas antes de registrar nova.
  - Conciliação não fecha: conferir diferenças de centavos em juros/tarifas bancárias.
  - Conta a receber não criada após venda: verificar configuração de forma de pagamento (prazo).`,

  compras: `ENTRADA E SAÍDA DE NOTAS FISCAIS — AUGE RETAGUARDA

━━━ ENTRADA DE NOTAS FISCAIS ━━━
Caminho: Menu Movimentação → Compras

PASSO 1 — Selecionar perfil de entrada
  No campo inferior esquerdo da tela, digitar o número do perfil com asterisco e pressionar ENTER.
  Exemplo: *201 (perfil padrão de ENTRADA).
  Se não souber o número: pressionar INSERT ou clicar em "Mais" → "Consulta Movimentação".
  A consulta mostra todos os perfis com seus números.
  Perfis comuns: ENTRADA (201), ENTRADA REVENDA, ENTRADA BONIFICAÇÃO, OUTRAS ENTRADAS.
  Após digitar *201 + ENTER: o nome do perfil aparece acima do campo; o campo fica vazio.
  Com campo vazio, pressionar ENTER novamente para prosseguir.

PASSO 2 — Preencher cabeçalho da entrada
  Campos a preencher:
    - COMPRADOR: responsável pela compra (padrão: "FUNCIONÁRIO PADRÃO")
    - DATA DE EMISSÃO: data da nota fiscal (pode ser retroativa)
    - FORNECEDOR: exatamente como consta na NF; fornecedor errado gera erro
    - FORMA DE PAGAMENTO: conforme condições acordadas com o fornecedor
    - OPERAÇÃO FISCAL: normalmente "compra"
  Clicar na seta para avançar.

PASSO 3 — Importar itens da NF
  Bipar a chave da NF-e ou digitar a chave de acesso no campo abaixo da descrição do perfil.
  Os itens serão carregados automaticamente na tela.
  Conferência obrigatória antes de avançar:
    - Quantidade total de produtos
    - Quantidade individual de cada item
    - Valores totais de cada item
    - CFOP, CST e ICMS de cada item (e bases de cálculo)
    - Base de cálculo total e valor total da nota
  Todos os dados devem coincidir exatamente com a Nota Fiscal física/XML.

PASSO 4 — Vincular número da NF
  Informar: número da NF emitido pelo fornecedor, série, modelo, operação fiscal e chave.
  Clicar em "Avançar".

PASSO 5 — Pagamentos (se forma for duplicata)
  Dar duplo clique sobre o nome da duplicata.
  O sistema exibe as parcelas a pagar para essa NF.
  Verificar as informações e clicar em "GRAVAR".

PASSO 6 — Adicionar Título (módulo financeiro)
  Tela "Adicionar Título" abre automaticamente.
  Inserir data de vencimento e demais dados do acordo de pagamento.
  Clicar em "GRAVAR" → entrada concluída.

PASSO 7 — Confirmar entrada
  Ir em Consulta de Movimentação → filtrar pelo perfil inserido e pela data do documento.
  Se a NF aparecer na listagem: entrada realizada corretamente.

━━━ SAÍDA DE NOTAS FISCAIS (RETAGUARDA) ━━━
Caminho: Menu Movimentação → Vendas

PASSO 1 — Selecionar perfil de saída
  Digitar *103 + ENTER (perfil padrão de saída/venda).
  Nome do perfil exibido; campo fica vazio → pressionar ENTER para prosseguir.

PASSO 2 — Preencher cabeçalho da saída
  Campos a preencher:
    - DATA DE ENTREGA: data prevista de entrega ao cliente
    - CLIENTE: nome do cliente; se não estiver cadastrado, clicar no campo + INSERT para cadastrar
    - OPERAÇÃO FISCAL: escolher conforme tipo de saída (venda, remessa, devolução, etc.)
  Clicar em "Avançar".

PASSO 3 — Inserir produtos
  Na tela de itens, pressionar F9 para abrir "Tabela de Preços".
  Buscar produto por Código, EAN ou Descrição.
  Informar a quantidade desejada.
  Dar duplo clique no produto ou clicar no botão (+) para adicionar.
  Fechar a tela de produtos após incluir todos os itens.
  Conferir os itens e clicar em "Avançar".

PASSO 4 — Vincular Transportadora (se necessário)
  Informar dados da transportadora conforme exigência do frete ou correios.

PASSO 5 — Pagamento
  Informar forma de recebimento da NF-e (pressionar tecla correspondente à forma de pagamento).

PASSO 6 — Finalizar
  Revisar os dados da saída → avançar → processamento → NF de saída gerada com sucesso.

━━━ DIAGNÓSTICOS E ERROS COMUNS ━━━
Sintoma: "Fornecedor não encontrado" ao lançar entrada
  → Fornecedor não está cadastrado ou nome digitado diferente do cadastro; verificar cadastro de pessoas.

Sintoma: itens não carregam ao bipar a chave NF-e
  → Chave inválida, NF-e cancelada ou já lançada anteriormente; verificar chave de acesso.

Sintoma: CFOP/CST/ICMS incorretos nos itens importados
  → Conferir tributação do produto no cadastro e alíquota tributária; corrigir antes de gravar.

Sintoma: NF não aparece na Consulta de Movimentação após gravar
  → Verifique se o perfil e a data usados no filtro coincidem com os da entrada realizada.

Sintoma: cliente não encontrado ao lançar saída
  → Clicar no campo CLIENTE + INSERT para abrir tela de cadastro e incluir o cliente.

Sintoma: produto não aparece na Tabela de Preços (F9)
  → Produto inativo ou sem estoque (se configurado para bloquear saída sem saldo); verificar cadastro.

━━━ REFERÊNCIAS DE PERFIS PADRÃO ━━━
  *201 → ENTRADA (compra de fornecedor)
  *103 → SAÍDA / VENDA (retaguarda)
  Outros perfis: consultar via INSERT → "Consulta Movimentação" para ver lista completa.`,

  impressora_elgin: `IMPRESSORA ELGIN i9 (também vale para i7 e i8) — INSTALAÇÃO E CONFIGURAÇÃO NO AUGE ERP
Conexão: USB (procedimento abaixo). Sem configuração de porta COM, IP ou rede neste modelo padrão.
Tempo estimado: 15 a 30 minutos. Requer administrador Windows e acesso à internet.

━━━ INSTALAÇÃO PASSO A PASSO ━━━

ETAPA 1 — Baixar o Utilitário
1. Abra o navegador e pesquise no Google: utility elgin i9
2. Localize o arquivo "Software Utility Elgin i7, i8 e i9"
3. Faça o download e aguarde concluir

ETAPA 2 — Extrair e Instalar
1. Abra a pasta Downloads → localize o arquivo .zip baixado
2. Botão direito → Extrair Tudo → Extrair
3. Dentro da pasta extraída, localize Setup.exe ou Install.exe
4. Botão direito → Executar como administrador → Sim
5. Clique Avançar/Next até Concluir

ETAPA 3 — Conectar a Impressora
1. Verifique se a impressora está ligada (LED de energia aceso)
2. Conecte o cabo USB ao computador
3. Aguarde alguns segundos — Windows reconhece automaticamente

ETAPA 4 — Testar no Utilitário Elgin
1. Iniciar → pesquisar "Utility" ou "Elgin" → abrir o programa
2. Na lista de impressoras deve aparecer: ELGIN i9 | USB | Auto
3. Selecione a impressora → clique Teste/Test
4. Resultado esperado: impressora responde normalmente

ETAPA 5 — Confirmar no Windows
1. Iniciar → Configurações → Bluetooth e Dispositivos → Impressoras e Scanners
2. Deve aparecer "ELGIN i9" com status: Ocioso ou Pronta
3. Esse status confirma que a instalação foi concluída com sucesso

ETAPA 6 — Configurar no Auge ERP
1. Abra o Auge ERP e faça login
2. Menu: Sistema → Painel de Controle → Parâmetros
3. Localize a seção de impressão → selecione a impressora ELGIN i9
4. Salve as alterações
5. Faça um teste de impressão (cupom de teste ou relatório)
6. Resultado esperado: impressão sai normalmente pela Elgin i9

━━━ SOLUÇÃO DE PROBLEMAS ━━━

Impressora não aparece no Windows:
→ Verifique: cabo USB conectado, impressora ligada, driver instalado corretamente
→ Tente outra porta USB do computador
→ Reinstale o driver (Setup.exe como administrador)

Impressora aparece mas não imprime:
→ Confirme que está selecionada corretamente no Auge ERP (Sistema → Painel de Controle → Parâmetros)
→ Verifique se o status em Impressoras e Scanners é "Pronta" ou "Ociosa"
→ Reinicie o computador e tente novamente

Utilitário não encontra a impressora:
→ Verifique o cabo USB e se a impressora aparece em Impressoras e Scanners do Windows
→ Confirme que o driver foi instalado (deve aparecer no Gerenciador de Dispositivos sem "!" amarelo)
→ Reinstale o utilitário se necessário

━━━ CHECKLIST RESULTADO FINAL ━━━
✅ Driver instalado | ✅ Utilitário Elgin instalado
✅ Impressora reconhecida pelo Windows (status: Pronta/Ociosa)
✅ Comunicação testada no utilitário
✅ Impressora configurada no Auge ERP (Sistema → Painel de Controle → Parâmetros)
✅ Impressão funcionando normalmente`,

  hardware: `HARDWARE / PERIFÉRICOS — AUGE ERP
Impressora de cupom/etiqueta — CONFIGURAÇÃO PASSO A PASSO:
  PASSO 1: Instalar o driver da impressora (Bematech, Epson, Elgin, Daruma, Sweda) pelo site do fabricante.
  PASSO 2: Conectar a impressora via USB. No Gerenciador de Dispositivos, confirmar que a porta COM virtual foi criada (ex: COM3).
  PASSO 3: No AUGE, acessar Sistema → Configurações → Impressora (ou Periféricos).
  PASSO 4: Selecionar o modelo da impressora e a porta COM identificada no Passo 2.
  PASSO 5: Configurar largura do papel (58mm ou 80mm conforme o modelo).
  PASSO 6: Clicar em "Testar impressão" para validar. Se imprimir, salvar configuração.
  Impressora em rede (TCP/IP): informar IP e porta (padrão: 9100) em vez da porta COM.
Impressora de etiqueta (ZPL/EPL):
  PASSO 1: Instalar driver ZDesigner (Zebra) ou driver específico do fabricante.
  PASSO 2: No AUGE → Configurações → Etiquetas: selecionar o modelo e porta.
  PASSO 3: Configurar o template de etiqueta (tamanho, campos a imprimir).
  PASSO 4: Testar impressão de etiqueta de produto.
Leitor de código de barras:
  - USB HID: plug-and-play, não precisa de driver nem configuração.
  - Serial: configurar porta COM e baud rate (geralmente 9600).
  - Problema: lendo errado → verificar se o leitor envia Enter (CR/LF) no final.
Gaveta de dinheiro:
  - Conecta na impressora (porta RJ-11/RJ-12); abertura comandada pela impressora.
  - No AUGE: habilitar "abrir gaveta ao fechar venda" nas configurações do PDV.
Diagnóstico rápido de periférico:
  1. Verificar conexão física (cabo, porta USB).
  2. Verificar Gerenciador de Dispositivos — driver com erro?
  3. Testar em outro software (Bloco de Notas → imprimir) para isolar se é AUGE ou Windows.
  4. Verificar configuração de porta no AUGE (COM x, IP:porta).`,

  banco_dados: `BANCO DE DADOS — AUGE ERP
Banco utilizado: Firebird (versões legadas) ou PostgreSQL (versões recentes).
Backup: realizar diariamente; usar utilitário nativo (gbak para Firebird, pg_dump para PostgreSQL).
Restore: restaurar em ambiente de teste antes de restaurar em produção.
Corrupção de banco: sintoma — erro de "page corrupted" ou constraint violation genérica.
  Firebird: executar gfix -mend -full antes de restore.
  PostgreSQL: pg_dumpall + restore em instância limpa.
Performance lenta:
  - Verificar índices: tabelas grandes sem índice adequado causam lentidão.
  - Vacuum/ANALYZE (PostgreSQL): executar periodicamente para manter estatísticas.
  - Sweep (Firebird): configurar intervalo de sweep automático.
  - Hardware: verificar se disco é HDD (lento para I/O de banco); SSD recomendado.
Conexão recusada:
  - Verificar se serviço Firebird/PostgreSQL está rodando (services.msc / systemctl).
  - Verificar porta (Firebird: 3050; PostgreSQL: 5432 ou 5433).
  - Verificar firewall do servidor.
Usuários e permissões:
  - Firebird: usuário SYSDBA + senha masterkey padrão (alterar em produção).
  - PostgreSQL: usuário postgres; criar usuário específico para o AUGE.`,

  instalacao: `INSTALAÇÃO E ATUALIZAÇÃO — AUGE ERP
Processo de atualização:
  1. Fazer backup do banco ANTES de atualizar.
  2. Fechar o AUGE em todas as estações.
  3. Executar o instalador/setup na máquina servidora.
  4. Executar scripts de migração do banco (se solicitados pelo instalador).
  5. Atualizar estações clientes (copiar executável ou executar setup nas estações).
Rollback: restaurar backup feito antes da atualização; reinstalar versão anterior.
DLL ausente: erro "DLL não encontrada" — instalar redistribuíveis Visual C++ (x86 e x64).
Antivírus: pode bloquear executável do AUGE; adicionar exceção na pasta de instalação.
UAC (Windows): executar como Administrador na primeira instalação.
Instalação em rede: banco fica no servidor; estações acessam via IP ou nome do servidor.
Configuração de caminho do banco: arquivo de configuração (INI ou similar) nas estações; apontar para IP do servidor.
Erros comuns:
  - "Não encontrou o banco de dados": conferir IP do servidor e porta no arquivo de configuração.
  - Versão antiga nas estações: estações com versão diferente do servidor causam erros; atualizar todas.
  - Permissão negada na pasta: verificar permissões NTFS na pasta de instalação.`,

  tributacao: `TRIBUTAÇÃO — AUGE ERP
Alíquota tributária: tabela no cadastro do produto que define tributação para cada operação.

━━━ REGRAS CST x ALÍQUOTA x ICMS NO AUGE (Regime Normal) ━━━
O AUGE usa os códigos internos TT (Tributado), II (Isento) e FF (Fora/ST) para o campo ICMS na nota.
A combinação correta de CST, alíquotas e código ICMS é:

CST 000 — Tributado integralmente
  Alíquotas: IGUAIS (interno = externo; ex: 19→19, 12→12, 7→7)
  ICMS no AUGE: TT
  Uso: mercadoria sem redução de base, sem ST, tributada normalmente.

CST 020 — Tributação com redução de base de cálculo
  Alíquotas: DIFERENTES (interno > externo; ex: 19→7, 12→7)
  ICMS no AUGE: TT
  Uso: produto com benefício fiscal de redução de base; a alíquota efetiva é menor que a nominal.

CST 040 — Isento
  Alíquotas: ZERADAS (0→0)
  ICMS no AUGE: II
  Uso: mercadoria com isenção de ICMS; não há débito fiscal.

CST 060 — ICMS cobrado anteriormente por substituição tributária (saída ST)
  Alíquotas: ZERADAS (0→0)
  ICMS no AUGE: FF
  Uso: produto que já teve ICMS-ST recolhido na entrada; na saída não há novo débito.

CST 010 — Tributado e com cobrança de ICMS-ST
  Alíquotas: PREENCHIDAS (valores > 0 em interno e externo)
  ICMS no AUGE: FF
  Uso: produto sujeito à substituição tributária; o AUGE calcula Base ST e ICMS ST automaticamente se MVA/IVA estiver configurado.

CST 090 — Outras
  Alíquotas: QUALQUER valor (pode ter ou não)
  ICMS no AUGE: QUALQUER (TT, II ou FF dependendo da situação específica)
  Uso: situações atípicas não enquadradas nos demais CSTs.

━━━ DIAGNÓSTICO DE ERROS COMUNS DE CST NO AUGE ━━━
Sintoma: "ICMS aparece como TT mas deveria ser isento"
  → Verificar se CST está como 000 quando deveria ser 040; corrigir na alíquota tributária do produto.

Sintoma: "Alíquota interna e externa iguais mas CST é 020"
  → CST 020 exige redução (alíquotas diferentes); com alíquotas iguais, trocar para CST 000.

Sintoma: "Produto com ST mas ICMS aparece como TT"
  → CST deve ser 010 (saída com ST) e ICMS = FF; verificar se MVA/IVA está configurado na alíquota tributária.

Sintoma: "Base ST zerada para produto com CST 010"
  → Verificar configuração de MVA (%) e alíquota de ST por UF na tabela de alíquotas tributárias.

Sintoma: "Rejeição SEFAZ por CST incorreto"
  → Confirmar tabela CSOSN/CST vigente; CST 060 com ICMS > 0 é inconsistência que gera rejeição.

━━━ CSOSN (SIMPLES NACIONAL) ━━━
  CSOSN 102/400: sem crédito de ICMS; ICMS = II no AUGE.
  CSOSN 500: produto com ST recolhida anteriormente; ICMS = FF.
  CSOSN 201/202/203: com ST; ICMS = FF; exige MVA configurado.

PIS/COFINS:
  - CST 01: operação tributável à alíquota básica.
  - CST 07/08: operação isenta ou não tributável.
  - CST 49: outras operações de saída.
Substituição Tributária (ST):
  - IVA ou MVA: margem de valor agregado para cálculo da base de ST.
  - CEST: obrigatório para produtos com ST; 7 dígitos.
  - Estado destino: alíquota e MVA variam por estado; parametrizar por UF na alíquota tributária.
IPI:
  - Obrigatório para indústrias; verificar NCM e enquadramento.
  - CST IPI: 50 (saída tributada), 53 (saída não tributada), 99 (outras).
Pauta fiscal: alguns estados definem valor mínimo por pauta para cálculo do ICMS.
Benefício fiscal / Isenção: configurar CST 040 + ICMS II + alíquotas zeradas e informar fundamento legal na NF-e.`,

  clientes: `CADASTRO DE CLIENTES — AUGE ERP
Tela principal: FClientes | Tabela: PESSOAS com TIPO = 'C' | Módulo: _Clientes = 5

Campos obrigatórios para NFe (destinatário):
  - Nome/razão social
  - CPF (pessoa física) ou CNPJ (pessoa jurídica) — deve estar correto; rejeição SEFAZ 401 indica IE inválida
  - Inscrição Estadual (IE) — quando contribuinte; "ISENTO" para não contribuinte
  - Endereço completo: logradouro, bairro, CEP, cidade e UF
  - Código IBGE da cidade — obrigatório para NFe; se ausente causa rejeição

Outros campos importantes:
  - Apelido/nome fantasia
  - Telefone, email, observações
  - Limite de crédito — bloqueia venda quando saldo devedor ultrapassa o limite
  - Bloqueado: impede venda até liberação por usuário com direito de autorização

Diagnósticos frequentes:
  - "NFe rejeita por destinatário": conferir CPF/CNPJ, IE, endereço e código IBGE da cidade
  - "Cliente não aparece na consulta": verificar DATAEXCLUSAO (exclusão lógica) ou se foi cadastrado como fornecedor (TIPO='F')
  - "Venda bloqueia por crédito": verificar limite, títulos vencidos em LANCC, flag Bloqueado e direito de autorização do operador

ATENÇÃO: para NFe com consumidor final sem CPF, usar perfil de consumidor final — não precisa de cadastro completo, mas para NFe com destinatário identificado o cadastro deve estar correto.`,

  fornecedores: `CADASTRO DE FORNECEDORES — AUGE ERP
Tela principal: FFornecedores | Tabela: PESSOAS com TIPO = 'F' | Módulo: _Fornecedores = 7

Campos obrigatórios para importação de XML de NFe:
  - CNPJ: deve ser exatamente igual ao CNPJ do emitente no XML
  - Nome/razão social
  - Endereço completo e cidade com código IBGE

Outros campos:
  - Apelido
  - RG/Inscrição Estadual
  - Percentual simples (quando Simples Nacional)
  - Prazo, preço e configurações de fornecedor

Diagnósticos frequentes:
  - "Fornecedor não encontrado ao importar XML": conferir CNPJ do XML vs CNPJ cadastrado (pontuação/máscara pode divergir); cadastrar como tipo Fornecedor se não existir
  - "Fornecedor não aparece em compra": confirmar que cadastro é TIPO='F' e não tem DATAEXCLUSAO
  - "Divergência de dados fiscais": corrigir fornecedor primeiro; só depois reabrir/refazer o movimento

Vinculo produto/fornecedor:
  - Permite associar código do fornecedor ao produto interno
  - Facilita importação automática de XML sem vinculação manual por EAN
  - Se produto não tem EAN ou EAN diverge do XML, vinculo manual é necessário.

CASO REAL — NOTAS DE CONFERÊNCIA NO MOBILE/SELF-CHECKOUT EXIBINDO "SEM INFORMAÇÃO" NO LUGAR DA RAZÃO SOCIAL DO FORNECEDOR:
Sintoma: tela "Notas Conferência" no app mobile mostra o placeholder "SEM INFORMAÇÃO" onde deveria aparecer a razão social do fornecedor. Ocorre em múltiplas notas simultaneamente (ex.: 14 notas no self-checkout Amendoeira).
Causa raiz: o cadastro do fornecedor existe no AUGE mas não foi sincronizado para o mobile. Pode acontecer porque: (1) o fornecedor foi cadastrado após a última carga do mobile, (2) o fornecedor está vinculado apenas a uma filial específica e o mobile está configurado para outra, ou (3) o mobile nunca recebeu a carga de fornecedores.
Diagnóstico rápido:
  1. Verificar se o fornecedor existe em FFornecedores no AUGE (buscar pelo CNPJ da nota).
  2. Confirmar que o cadastro não tem DATAEXCLUSAO preenchida.
  3. Verificar se o fornecedor está vinculado à filial correta (o mobile carrega por filial).
Solução:
  1. No mobile: acessar a tela de "Cargas" e executar nova carga de fornecedores para sincronizar o cadastro atualizado.
  2. Se o fornecedor não existir: cadastrá-lo no AUGE com CNPJ correto e depois executar a carga no mobile.
  3. Se o fornecedor existir mas ainda não aparecer: verificar se ele está configurado como ativo na filial que o mobile utiliza — pode estar cadastrado em uma filial diferente da configurada no mobile.
  4. Após carga: reabrir a tela de Notas Conferência para verificar se a razão social passou a aparecer.

CASO REAL — VALORES DE PRODUTOS VINDO COMO NEGATIVOS NO SELF-CHECKOUT/MOBILE (~70 NOTAS):
Sintoma: lote de notas (ex.: 70 notas na filial Alvorada) com valores de produtos como negativos na conferência do mobile.
Causa provável: inconsistência na importação/sincronização dos itens da nota — o sinal do valor foi invertido durante o processamento (pode ser bug de conversão de tipo ou importação de XML com valores já negativos no fornecedor).
Diagnóstico: verificar no AUGE se as notas de entrada correspondentes têm itens com valor negativo; comparar com o XML original do fornecedor.
Solução:
  1. Verificar os XMLs das notas afetadas para confirmar se o valor negativo está no XML do fornecedor ou ocorreu no processamento.
  2. Se o problema for no processamento interno: reprocessar as notas manualmente.
  3. Escalar para análise técnica se ocorrer em volume (dezenas de notas), pois pode indicar bug sistêmico na importação do XML.`,

  perfil_movimento: `PERFIL DE MOVIMENTO — AUGE ERP (Conceito Central)
Tela: FPerfilVenda | Módulo: _PerfilVenda = 207

PRINCÍPIO FUNDAMENTAL:
"No Auge, antes de corrigir uma venda ou compra, confirme o perfil usado.
O perfil é quem decide se a operação movimenta estoque, financeiro e fiscal."

O que o perfil define:
  - Tipo da operação: venda, compra, devolução, transferência, orçamento, pedido, NFCe, NFe, ajuste
  - Entrada ou saída de estoque
  - Se incrementa numeração fiscal
  - Modelo fiscal: NFe modelo 55, NFCe modelo 65, cupom/ECF ou documento interno
  - Série
  - Formulário/relatório de impressão
  - Forma de fechamento
  - Regras de financeiro (gera título? qual conta? qual prazo?)
  - Regras de estoque (movimenta? qual filial?)
  - Regras de fiscal/livros (entra em Livro de Entradas/Saídas?)
  - Permissões por grupo de usuário

Perfis comuns:
  - Perfil padrão de compra (PerfilPadraoC)
  - Perfil padrão de venda (PerfilPadraoV)
  - Perfis de check-in/check-in NF
  - Perfis de devolução
  - Perfis de NFCe (modelo 65)
  - Perfis de NFe (modelo 55)

Diagnósticos diretos por perfil:
  - "Venda não gera financeiro" → perfil não está configurado para gerar financeiro; checar prazo e finalizadora no perfil
  - "Compra não entra no estoque" → perfil não movimenta estoque como entrada
  - "NFe não é gerada" → perfil com modelo errado, série não configurada ou sem numeração fiscal
  - "Documento aparece no lugar errado em relatórios" → perfil não entra em livros/relatórios ou data usada incorreta
  - "Usuário não consegue usar perfil" → verificar vinculo/permissão por grupo no perfil

Perguntas obrigatórias antes de diagnosticar venda/compra:
  - "Qual perfil de movimento foi usado?"
  - "A operação é venda, compra, devolução, transferência ou ajuste?"`,

  vendas_retaguarda: `VENDAS — AUGE ERP (Retaguarda)
Tela: FVendas | Módulo: _Vendas = 30 | Tabelas: CABVEN (cabeçalho), ITEVEN (itens), LANCC (financeiro)

Fluxo básico de uma venda:
  1. Movimentação → Vendas → escolher perfil de movimento
  2. Informar cliente (quando necessário)
  3. Informar vendedor, tabela de preço, prazo e dados do cabeçalho
  4. Inserir produtos por código interno, EAN ou pesquisa
  5. Conferir quantidade, preço, desconto, CFOP/tributação
  6. Finalizar (FFinalizar → FReceb → UControladorFaturamento)
  7. Informar finalizadoras: dinheiro, cheque, cartão, outros, haver, convênio
  8. Confirmar → emitir documento fiscal ou comprovante conforme perfil

Estados da NFe em uma venda:
  - Sem chave NFe: documento não gerou NFe
  - Chave preenchida, sem protocolo: NFe pendente ou com falha de envio
  - Protocolo preenchido: NFe autorizada pela SEFAZ
  - Protocolo "OFFLINE": NFCe em contingência

Cancelamento e exclusão:
  - Cancelar/excluir venda exige direito específico no grupo do usuário
  - Se NFe já tem protocolo (autorizada), cancelamento fiscal respeita prazo máximo de 24h
  - Parâmetro NaoExcluiVendaSeRecebido pode impedir exclusão de venda já recebida
  - Se apenas a impressão falhou → reimprimir, não cancelar
  - Se NFe ficou pendente → usar consulta/status/reenvio antes de emitir outra nota

Diagnósticos frequentes:
  - "Venda não gerou financeiro": confirmar perfil → prazo/finalizadora → venda finalizada?
  - "NFe não emite": conferir perfil (modelo 55), certificado, cadastros, CFOP e série
  - "Produto não entra na venda": produto bloqueado, sem preço, DATAEXCLUSAO ou EAN incorreto
  - "Não consigo cancelar": verificar direito, status da NFe (autorizada ou não) e prazo`,

  contagem_estoque: `CONTAGEM DE ESTOQUE — AUGE ERP
Tela: FContagem | Módulo: _Contagem = 34

Fluxo de contagem:
  1. Abrir Contagem
  2. Informar/ler produtos e quantidades (ou importar arquivo)
  3. Conferir divergências entre contagem e saldo atual
  4. Aplicar contagem em uma data específica
  5. Autorizar aplicação (exige direito _AutorizacaoParaAplicarContagem)
  6. Processar estoque

Conceitos técnicos importantes:
  - A contagem grava saldos em MOVIMENTOPERIODO — define o saldo do dia informado
  - A rotina pode apagar e regravar movimentos do dia de contagem
  - Produto bloqueado pode ser rejeitado na contagem
  - Estoque com grade: tamanho/cor precisam ser válidos para cada item da contagem

Estoque comum vs. grade:
  - Estoque comum: controle por produto sem variação de tamanho/cor
  - Estoque com grade: controle por combinação produto + tamanho + cor
  - Ao diagnosticar divergência, sempre confirmar qual tipo o produto usa

Diagnóstico de saldo divergente:
  - Perguntar: "A contagem foi digitada/importada ou foi aplicada?"
  - Perguntar: "Qual data foi informada ao aplicar?"
  - Perguntar: "Em qual filial?"
  - Verificar se houve contagem aplicada após a movimentação que está divergindo
  - Se produto tem grade, checar se tamanho/cor estão corretos
  - Verificar se houve compras/vendas canceladas ou excluídas no período`,

  financeiro_avancado: `FINANCEIRO — AUGE ERP (Completo)
Tabela central: LANCC (todos os lançamentos financeiros)
Telas: FContaR (Contas a Receber), FReceb (Recebimento/Baixa), FContaT (Transferência entre Contas), FDeposito

Estrutura LANCC — campos principais:
  - Filial, Lançamento, Conta, Status, Referente, Devedor
  - Documento, Data, Data de vencimento, Valor, Valor pago
  - Juros, Desconto, Outros, Origem, Lote, Convênio

Status comuns de lançamentos:
  - Aberto | Recebido/baixado | Depositado | Estornado | Excluído | Transferência

Fluxo financeiro de uma venda:
  1. Venda finalizada com prazo → título criado em aberto em LANCC
  2. Venda a vista/finalizadora → pode já criar lançamento fechado
  3. FReceb: baixa manual do título (total ou parcial com juros/desconto)
  4. FDeposito ou FContaT: mudam conta/status do lançamento
  5. Relatórios passam a considerar o lançamento

Fluxo financeiro de uma compra:
  1. Compra confirmada → duplicatas do XML ou prazo manual geram títulos do fornecedor
  2. Pagamento/baixa muda status
  3. Fluxo de caixa passa a considerar os valores

Diagnósticos frequentes:
  - "Título não aparece em Contas a Receber": mudar filtros (período, status, conta, filial, cliente)
  - "Baixa não fecha": conferir valor, desconto, juros, outros e finalizadora
  - "Venda não gerou financeiro": verificar perfil de movimento e finalizadora
  - "Compra não gerou financeiro": verificar prazo/duplicatas e se o perfil gera financeiro
  - "TEF não gravou documento": conferir transação e integração

Perguntas obrigatórias antes de orientar financeiro:
  - Período e filial
  - Data base: emissão, vencimento ou pagamento?
  - Status: aberto, pago, estornado, excluído?
  - Conta/perfil de conta
  - Cliente/fornecedor
  - Origem: venda, compra, transferência, manual?`,

  sintegra: `SINTEGRA — AUGE ERP
Tela: FSintegra | Módulo: _Sintegra = 231

O Sintegra é o arquivo eletrônico de informações fiscais exigido pela SEFAZ estadual.

Fluxo de geração:
  1. Informar período (mês/ano)
  2. Selecionar filial
  3. Marcar registros exigidos para o estado/situação
  4. Gerar arquivo
  5. Salvar arquivo no caminho escolhido

Registros principais:
  - Registro 50: nota fiscal (entrada/saída)
  - Registro 54: itens das notas fiscais
  - Registro 60M: resumo mensal de ECF/NFCe
  - Registro 60A: analítico de ECF
  - Registro 60R: registro por redução Z
  - Registro 60I: item de cupom/NFCe
  - Registro 61: vendas sem destinatário identificado (ECF legado)
  - Registro 70: NF de serviço de transporte
  - Registro 74: inventário/estoque (opcional, quando exigido)
  - Registro 75: código de produto e serviço

Diagnósticos frequentes:
  - "Arquivo saiu sem movimento": conferir período, filial e perfis (o perfil deve entrar em livros)
  - "Item sem NCM/unidade": cadastro de produto incompleto; corrigir NMERCOSUL e unidade
  - "Participante saiu errado": conferir CNPJ/CPF e razão social do cliente/fornecedor
  - "Registro de estoque diverge": conferir data de inventário/estoque usada
  - "Arquivo rejeitado na SEFAZ": verificar produtos sem NCM ou participantes sem dados fiscais`,

  filiais_usuarios: `FILIAIS, USUÁRIOS E DIREITOS — AUGE ERP

FILIAIS (FFiliais — módulo _Filiais = 16):
  Campos críticos para NFe/NFCe:
    - CNPJ da filial — deve coincidir com o certificado digital
    - Inscrição Estadual
    - Endereço completo: logradouro, bairro, CEP, cidade, UF
    - Código IBGE da cidade — obrigatório para NFe; ausência causa rejeição
  Diagnóstico: se NFe rejeita por emitente, conferir todos os campos acima
  Se filial não emite documento fiscal: conferir parâmetros, certificado e ambiente (produção/homologação)

USUÁRIOS E GRUPOS (FUsuarios, FGrupoUsuario):
  - Cada usuário pertence a um grupo
  - O grupo define quais módulos e ações estão disponíveis
  - Menu é montado dinamicamente por MODULOS e DIREITOS

DIREITOS (FDireitos):
  Autorizações sensíveis controladas por direito:
    - Desconto acima do limite
    - Excluir venda já finalizada
    - Alterar datas de documentos
    - Alterar valores após confirmação
    - Aplicar contagem de estoque (_AutorizacaoParaAplicarContagem)
    - Liberar crédito de cliente bloqueado
    - Alterar numeração fiscal

MODULOS (tabela):
  - PAGINA = 0: módulo fora do menu principal (acesso indireto, ex: Reforma Tributária)
  - PAGINA > 0: módulo exibido no menu da página correspondente

Diagnósticos frequentes:
  - "Tela não aparece no menu": verificar DIREITOS do grupo → verificar se módulo está ativo em MODULOS → verificar PAGINA
  - "Opção pediu senha/autorização": usuário autorizador precisa ter o direito correspondente
  - "Módulos 586/587/588 (Reforma) não aparecem": PAGINA deve ser 0; acesso via produto → Mais → Reforma tributária`,

  reforma_tributaria: `REFORMA TRIBUTÁRIA — AUGE ERP (IBS/CBS/Classe Tributária)
Módulos: CBS=586, IBS=587, Classe Tributária=588
Telas: FReformaCBS, FReformaIBS, FReformaClasseTrib

Finalidade:
  Cadastrar códigos, alíquotas e classes vinculadas à Reforma Tributária brasileira.
  Os cadastros são vinculados ao produto pelos campos:
    - ID_REFORMA_CBS → código CBS do produto
    - ID_REFORMA_IBS → código IBS do produto
    - ID_REFORMA_CLASSE → classe tributária do produto

Acesso no sistema:
  - Os módulos 586/587/588 ficam com MODULOS.PAGINA = 0 (fora do menu principal)
  - Acesso visual via cadastro de produto: botão "Mais" → "Reforma tributária"
  - NÃO devem aparecer no menu Fiscal — se aparecerem, corrigir PAGINA para 0

Diagnósticos:
  - "Opções de Reforma não aparecem no cadastro de produto":
    → Verificar se módulos 586, 587, 588 existem em MODULOS
    → Verificar se o grupo do usuário tem DIREITOS para esses módulos
  - "Aparecem no menu Fiscal indevidamente":
    → Corrigir MODULOS.PAGINA para 0 nos módulos 586/587/588
  - "Produto não salva os vínculos de Reforma":
    → Verificar se os cadastros CBS/IBS/Classe existem e estão ativos
    → Conferir campos ID_REFORMA_CBS, ID_REFORMA_IBS, ID_REFORMA_CLASSE no produto`,

  certificado: `CERTIFICADO DIGITAL — AUGE ERP
Tipos:
  - A1: arquivo PFX protegido por senha; válido 1 ano; instala no Windows Certificate Store.
  - A3: token USB ou smart card; válido 3 anos; requer driver do fabricante.
Instalação A1:
  1. Importar PFX no Windows (duplo clique → Instalar Certificado → Usuário Atual).
  2. No AUGE, selecionar o certificado no cadastro de empresa.
Instalação A3:
  1. Instalar driver do token (SafeNet, Gemalto, Certisign, etc.).
  2. Inserir token; aguardar reconhecimento.
  3. No AUGE, selecionar certificado A3 no cadastro de empresa; pode pedir PIN.
Erros comuns:
  - "Certificado expirado": renovar junto à Autoridade Certificadora (Certisign, Serasa, etc.).
  - "Certificado não encontrado": reimportar PFX ou reinstalar driver do token.
  - "Senha incorreta": verificar CAPS LOCK; senha do PFX (A1) é definida na emissão.
  - "Token não lido": trocar porta USB; reinstalar driver; testar em outro computador.
  - Rejeição SEFAZ 280: certificado inválido ou não autorizado para o CNPJ emitente.
Validade: verificar data de vencimento periodicamente; renovar com antecedência mínima de 30 dias.`,
}

// ─── Seletor de conhecimento ──────────────────────────────────────────────────

/**
 * Retorna o bloco de conhecimento relevante para o texto do problema.
 * Limita a 3 módulos para não sobrecarregar o prompt.
 */
export function selecionarConhecimento(texto: string, limite = 3): string {
  const textoNorm = texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")

  const modulosEncontrados = new Set<AugeModule>()

  for (const [keyword, modulos] of Object.entries(KEYWORD_MODULE_MAP)) {
    if (textoNorm.includes(keyword)) {
      for (const m of modulos) modulosEncontrados.add(m)
    }
    if (modulosEncontrados.size >= limite * 2) break
  }

  const selecionados = Array.from(modulosEncontrados).slice(0, limite)

  if (selecionados.length === 0) {
    return KNOWLEDGE.geral
  }

  return selecionados.map((m) => KNOWLEDGE[m]).join("\n\n---\n\n")
}

/**
 * Retorna o nome legível de um módulo para logs/resumos.
 */
export function nomearModulo(modulo: AugeModule): string {
  const nomes: Record<AugeModule, string> = {
    fiscal: "Fiscal",
    nfe: "NF-e",
    nfce: "NFC-e",
    sat: "SAT CF-e",
    sped: "SPED",
    pdv: "PDV/Caixa",
    tef: "TEF/Pagamentos",
    balanca: "Balança",
    estoque: "Estoque",
    cadastro_produto: "Cadastro de Produto",
    financeiro: "Financeiro",
    compras: "Compras",
    hardware: "Hardware/Periféricos",
    impressora_elgin: "Impressora Elgin i9/i8/i7",
    banco_dados: "Banco de Dados",
    instalacao: "Instalação/Atualização",
    tributacao: "Tributação",
    certificado: "Certificado Digital",
    clientes: "Cadastro de Clientes",
    fornecedores: "Cadastro de Fornecedores",
    perfil_movimento: "Perfil de Movimento",
    vendas_retaguarda: "Vendas (Retaguarda)",
    contagem_estoque: "Contagem de Estoque",
    financeiro_avancado: "Financeiro Avançado",
    sintegra: "Sintegra",
    filiais_usuarios: "Filiais/Usuários/Direitos",
    reforma_tributaria: "Reforma Tributária",
    geral: "Geral",
  }
  return nomes[modulo] ?? modulo
}

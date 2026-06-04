/**
 * lib/deterministic-resolver.ts
 *
 * Resolver de erros conhecidos — bypassa o LLM completamente.
 * Para os erros mais frequentes, a resposta é exata e não pode alucinar.
 *
 * Regra: se o texto do cliente contém um padrão reconhecível, retorna
 * a solução canônica. O orquestrador checa isso ANTES de chamar o LLM.
 */

export interface DeterministicMatch {
  errorKey: string
  solution: string
  confidence: 1.0
}

interface ErrorPattern {
  key: string
  patterns: RegExp[]
  solution: string
}

// ─── Catálogo de erros com solução exata ─────────────────────────────────────

const ERROR_CATALOG: ErrorPattern[] = [
  {
    key: "dns_12007",
    patterns: [
      /erro\s*1200[67]/i,
      /nome\s+do\s+servidor\s+n[aã]o\s+pode\s+ser\s+resolvido/i,
      /n[aã]o\s+foi\s+poss[ií]vel\s+resolver/i,
      /host\s+not\s+found/i,
      /server\s+not\s+found/i,
    ],
    solution: `Esse erro é falha de DNS — o computador não consegue encontrar o servidor da SEFAZ. Não é a SEFAZ fora do ar.

Passos:
1. Abre o CMD (Win + R → cmd → Enter)
2. Digita: ping nfe.sefaz.[seu-estado].gov.br — se disser "não foi possível resolver", confirma o DNS
3. Vai em Painel de Controle → Rede → Propriedades do adaptador → TCP/IP
4. DNS preferencial: 8.8.8.8 — DNS alternativo: 8.8.4.4
5. Clica OK e reinicia o roteador (desliga 30 segundos)
6. Testa emitir de novo

Me fala se funcionou.`,
  },
  {
    key: "certificado_vencido",
    patterns: [
      /certificado\s+(digital\s+)?(inv[aá]lido|vencido|expirado|n[aã]o\s+encontrado)/i,
      /rejei[cç][aã]o\s*280/i,
      /rejei[cç][aã]o\s*238/i,
      /certificate\s+expired/i,
      /validade\s+do\s+certificado/i,
      /a[13]\s+(inv[aá]lido|vencido|expirado)/i,
    ],
    solution: `O certificado digital está vencido ou inválido — precisa renovar ou reimportar.

Verifica o tipo do seu certificado:
- *A1 (arquivo .pfx)*: Reimportar em Sistema → Configurações → Certificado Digital → importar o .pfx e digitar a senha
- *A3 (token/smartcard)*: Verificar se o token está conectado e o driver instalado; se vencido, contatar a certificadora para renovação

Após importar, teste emitir uma NF-e em homologação primeiro.

Me fala qual o tipo do seu certificado (A1 ou A3) se o problema continuar.`,
  },
  {
    key: "rejeicao_252",
    patterns: [
      /rejei[cç][aã]o\s*252/i,
    ],
    solution: `Rejeição 252 — CNPJ do emitente inválido ou não cadastrado na SEFAZ.

Verifica:
1. Cadastro da empresa no AUGE: o CNPJ está digitado corretamente (sem ponto, traço, barra)?
2. A empresa está ativa na Receita Federal? (consultar em https://www.receita.fazenda.gov.br/pessoajuridica/cnpj/cnpjreva/cnpjreva_solicitacao.asp)
3. A Inscrição Estadual está correta e ativa?
4. O estado emissor bate com o endereço da empresa?

Me fala o CNPJ (só os números) para eu ajudar a identificar o problema.`,
  },
  {
    key: "rejeicao_539",
    patterns: [
      /rejei[cç][aã]o\s*539/i,
    ],
    solution: `Rejeição 539 — CSOSN inválido para o tipo de empresa.

Esse erro ocorre quando o CSOSN do produto não é permitido para o regime tributário da empresa (Simples Nacional vs. Regime Normal).

Verifica:
1. Qual o regime tributário da empresa? (Simples Nacional ou Lucro Presumido/Real?)
2. Acessa o cadastro do produto → aba Fiscal → campo CSOSN/CST
3. Simples Nacional usa CSOSN (101, 102, 400, 500, 900...)
4. Regime Normal usa CST (00, 10, 20, 40, 60...)
5. Corrige o CSOSN/CST e tenta emitir novamente

Qual o CSOSN que está no produto?`,
  },
  {
    key: "rejeicao_401",
    patterns: [
      /rejei[cç][aã]o\s*401/i,
    ],
    solution: `Rejeição 401 — IE do destinatário inválida para a UF.

Verifica no cadastro do cliente:
1. A Inscrição Estadual (IE) está digitada corretamente?
2. Se o cliente é pessoa física ou isento, o campo IE deve ser "ISENTO" ou vazio — nunca deixar números inválidos
3. Se for outra UF, a IE deve ser válida para aquele estado
4. Valida a IE no site da SEFAZ do estado do cliente

Me diz qual estado é o destinatário para eu verificar o formato correto da IE.`,
  },
  {
    key: "sitef_offline",
    patterns: [
      /sitef\s+(offline|fora\s+do\s+ar|n[aã]o\s+conecta|n[aã]o\s+responde)/i,
      /concentrador\s+sitef\s+(offline|parado|n[aã]o\s+inicia)/i,
      /clisitef\s+(n[aã]o\s+conecta|erro|falha)/i,
      /tef\s+n[aã]o\s+(conecta|funciona|comunica)/i,
    ],
    solution: `Problema de comunicação com o concentrador SiTef.

Verifica na máquina SERVIDOR (não no caixa):
1. Abre services.msc (Win + R → services.msc → Enter)
2. Procura o serviço "SiTef" ou "CliSiTef" — está rodando? Se não, clica com botão direito → Iniciar
3. Se o serviço não inicia, verifica o log em: C:\\Program Files\\Sitef\\log\\ (últimas linhas mostram o erro)

Nos caixas com problema:
4. Confirma o IP do servidor SiTef configurado no terminal (deve ser o IP do servidor, porta 4096)
5. Testa pingar o servidor: CMD → ping [ip-do-servidor]

Me fala se o serviço SiTef está rodando no servidor e qual erro aparece no log.`,
  },
  {
    key: "acesso_negado",
    patterns: [
      /acesso\s+negado/i,
      /usu[aá]rio\s+sem\s+permiss[aã]o/i,
      /access\s+denied/i,
      /sem\s+direito\s+(para|de|ao?)/i,
      /n[aã]o\s+tem\s+permiss[aã]o/i,
      /n[aã]o\s+autorizado/i,
    ],
    solution: `Problema de permissão de acesso — o usuário não tem o direito necessário.

Para liberar:
1. Acessa com um usuário administrador
2. Vai em Sistema → Usuários (FUsuarios) → abre o usuário com problema
3. Aba "Grupos" — verifica em qual grupo o usuário está
4. Vai em Sistema → Grupos de Usuários (FGrupoUsuario) → abre o grupo
5. Na aba de direitos, procura o direito relacionado ao que foi bloqueado e marca

Qual tela ou rotina está dando acesso negado? Assim consigo identificar o direito exato a liberar.`,
  },
  {
    key: "impressora_nao_imprime",
    patterns: [
      /impressora\s+n[aã]o\s+(imprime|funciona|responde|comunicao?)/i,
      /n[aã]o\s+imprime\s+(cupom|nota|danfe|relat[oó]rio)/i,
      /cupom\s+n[aã]o\s+(sai|imprime)/i,
    ],
    solution: `Vamos isolar se é o AUGE ou o Windows com problema.

Teste rápido:
1. Abre o *Bloco de Notas* do Windows → digita qualquer texto → Arquivo → Imprimir → seleciona a impressora → Imprimir
   - *Imprimiu pelo Bloco de Notas mas não pelo AUGE*: problema de configuração no AUGE (porta/modelo errado)
   - *Não imprimiu nem pelo Bloco de Notas*: problema de driver ou conexão — resolver isso primeiro

Se for problema no AUGE:
2. Sistema → Configurações → Impressora → confirma se o modelo e a porta COM estão corretos
3. Clica em "Testar impressão"

Me fala o resultado do teste com o Bloco de Notas.`,
  },
  {
    key: "titulo_nao_aparece",
    patterns: [
      /t[ií]tulo\s+n[aã]o\s+(aparece|encontra|acha|est[aá])/i,
      /contas\s+a\s+receber\s+n[aã]o\s+(aparece|mostra|lista)/i,
      /n[aã]o\s+encontra\s+o\s+t[ií]tulo/i,
      /t[ií]tulo\s+sumiu/i,
    ],
    solution: `Antes de qualquer coisa, verifica os filtros em Contas a Receber (FContaR):

1. *Período*: amplia o intervalo de datas (início bem anterior, fim bem posterior à data esperada)
2. *Status*: muda para "Todos" — o título pode estar pago ou cancelado
3. *Filial*: seleciona "Todas as filiais" — o título pode estar em outra filial
4. *Conta*: verifica se não está filtrando por conta específica

Se o título foi gerado por uma venda: confirma que a venda foi *finalizada* (não apenas digitada) e que o perfil de movimento tem "Gerar Financeiro" ativo.

O título apareceu com algum desses filtros?`,
  },
  {
    key: "elgin_i9_nao_aparece",
    patterns: [
      /elgin\s*i[789]\s*(n[aã]o\s*)?(aparece|detecta|encontra|reconhece|funciona)/i,
      /impressora\s*elgin\s*(n[aã]o\s*)?(aparece|detecta|encontra)/i,
      /utility\s*elgin\s*(n[aã]o\s*)?(encontra|detecta|mostra|v[eê])/i,
      /elgin\s*(n[aã]o\s*)?(aparece|detecta|encontra)\s*(no\s*)?(windows|sistema|auge)/i,
    ],
    solution: `Vamos identificar onde está o problema com a Elgin.

Primeiro teste — abre Impressoras e Scanners:
1. Iniciar → Configurações → Bluetooth e Dispositivos → Impressoras e Scanners
2. A "ELGIN i9" aparece lá?

Se NÃO aparece (problema de driver):
3. Certifique que a impressora está LIGADA (LED aceso) e o cabo USB conectado
4. Abre o Gerenciador de Dispositivos (Win + X → Gerenciador de Dispositivos)
5. Procura a Elgin — tem "!" amarelo? Indica driver com problema
6. Se o driver não está correto: pesquisa no Google "utility elgin i9", baixa e instala o Setup.exe como administrador
7. Tenta outra porta USB do computador

Se aparece no Windows mas não no Utilitário:
8. Reinstala o Utilitário Elgin (Setup.exe como administrador)
9. Depois abre o Utilitário → deve listar "ELGIN i9 | USB | Auto"

Me fala o que aparece em Impressoras e Scanners.`,
  },
  {
    key: "elgin_i9_nao_imprime_auge",
    patterns: [
      /elgin\s*(i[789])?\s*n[aã]o\s*imprime\s*(no\s*)?(auge|sistema|erp)/i,
      /impressora\s*elgin\s*n[aã]o\s*imprime/i,
      /n[aã]o\s*imprime\s*pela\s*elgin/i,
      /elgin\s*(i[789])?\s*n[aã]o\s*(est[aá]\s*)?imprimindo/i,
    ],
    solution: `A Elgin aparece no Windows mas não imprime pelo AUGE — vamos isolar o problema.

Teste rápido:
1. Abre o Bloco de Notas → digita qualquer texto → Arquivo → Imprimir → seleciona "ELGIN i9" → Imprimir
   - *Imprimiu pelo Bloco de Notas*: problema de configuração no AUGE (próximo passo)
   - *Não imprimiu*: problema de driver/Windows (reinstalar driver)

Se imprime pelo Windows mas não pelo AUGE:
2. No AUGE: Sistema → Painel de Controle → Parâmetros
3. Localize a seção de impressão → confirma se "ELGIN i9" está selecionada
4. Salva e testa novamente

Também confirma em Impressoras e Scanners:
5. O status da ELGIN i9 deve ser "Pronta" ou "Ociosa" (não "Offline" ou "Erro")

Me fala o resultado do teste com o Bloco de Notas.`,
  },
  {
    key: "elgin_instalar_driver",
    patterns: [
      /instalar\s*(driver\s*)?(da\s*)?elgin\s*(i[789])?/i,
      /como\s*instalar\s*(a\s*)?elgin/i,
      /configurar\s*(a\s*)?elgin\s*(i[789])?\s*(no\s*)?(auge|windows)/i,
      /elgin\s*(i[789])?\s*como\s*configur/i,
    ],
    solution: `Instalação da Elgin i9 no Auge ERP — passo a passo completo:

*1. Baixar o Utilitário*
Pesquise no Google: utility elgin i9
Baixe o arquivo "Software Utility Elgin i7, i8 e i9"

*2. Instalar o Driver*
Extraia o .zip → botão direito em Setup.exe → Executar como administrador → Avançar até Concluir

*3. Conectar e testar*
Ligue a impressora (LED aceso) → conecte o cabo USB
Abra o Utilitário Elgin → deve aparecer "ELGIN i9 | USB | Auto"
Clique em Teste — a impressora deve responder

*4. Confirmar no Windows*
Iniciar → Configurações → Bluetooth e Dispositivos → Impressoras e Scanners
Status deve ser "Pronta" ou "Ociosa"

*5. Configurar no AUGE*
Sistema → Painel de Controle → Parâmetros → selecione "ELGIN i9" → Salvar
Faça um teste de impressão

Me fala em qual etapa está travado.`,
  },
  {
    key: "banco_nao_conecta",
    patterns: [
      /banco\s+de\s+dados\s+n[aã]o\s+(conecta|responde|abre)/i,
      /connection\s+refused/i,
      /n[aã]o\s+foi\s+poss[ií]vel\s+conectar\s+ao\s+banco/i,
      /servidor\s+de\s+banco\s+n[aã]o\s+(responde|encontrado)/i,
      /firebird\s+(offline|parado|n[aã]o\s+inicia)/i,
    ],
    solution: `Problema de conexão com o banco de dados — o serviço Firebird pode estar parado.

No servidor onde fica o banco:
1. Abre services.msc (Win + R → services.msc)
2. Procura "Firebird Server" ou "FirebirdGuardian" — está parado? Clica direito → Iniciar
3. Se não iniciar, verifica o log do Firebird: geralmente em C:\\Program Files\\Firebird\\Firebird_X_X\\firebird.log

Nos clientes com problema:
4. Consegue pingar o servidor? (CMD → ping [ip-do-servidor])
5. O caminho do banco no AUGE está com o IP correto do servidor?

Me fala se o serviço Firebird está rodando no servidor.`,
  },
]

// ─── Normalizador ─────────────────────────────────────────────────────────────

function normalizar(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
}

// ─── Função principal ─────────────────────────────────────────────────────────

/**
 * Tenta resolver deterministicamente sem LLM.
 * Retorna null se nenhum padrão conhecido foi reconhecido.
 */
export function resolverDeterministico(
  texto: string,
): DeterministicMatch | null {
  const norm = normalizar(texto)

  for (const entry of ERROR_CATALOG) {
    for (const pattern of entry.patterns) {
      // Testa contra texto normalizado e original (alguns patterns precisam de acentos)
      if (pattern.test(norm) || pattern.test(texto)) {
        return {
          errorKey: entry.key,
          solution: entry.solution,
          confidence: 1.0,
        }
      }
    }
  }

  return null
}

/**
 * Verifica se há um erro conhecido no texto sem retornar a solução.
 * Útil para logging e métricas.
 */
export function identificarErroConhecido(texto: string): string | null {
  const norm = normalizar(texto)
  for (const entry of ERROR_CATALOG) {
    for (const pattern of entry.patterns) {
      if (pattern.test(norm) || pattern.test(texto)) return entry.key
    }
  }
  return null
}

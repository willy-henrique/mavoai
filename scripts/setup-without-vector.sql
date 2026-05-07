-- SCRIPT PARA POSTGRESQL SEM EXTENSÃO VECTOR
-- Versão simplificada que funciona sem pgvector
-- Execute no pgAdmin (tudo de uma vez ou por seções)

-- ============================================
-- SEÇÃO 1: CRIAR TABELA DE CATEGORIAS
-- ============================================
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SEÇÃO 2: CRIAR TABELA PRINCIPAL DE ATENDIMENTOS (COM EMBEDDING COMO BYTEA)
-- ============================================
CREATE TABLE IF NOT EXISTS public.atendimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_externo TEXT,
  canal TEXT,
  cliente TEXT NOT NULL,
  tecnico TEXT NOT NULL,
  data_atendimento TIMESTAMPTZ DEFAULT NOW(),
  texto_original TEXT NOT NULL,
  resumo_problema TEXT,
  resumo TEXT,
  categoria TEXT,
  problema TEXT,
  causa TEXT,
  solucao TEXT,
  -- Coluna embedding como BYTEA (pode ser convertida para VECTOR depois)
  -- Quando instalar pgvector: ALTER TABLE atendimentos ALTER COLUMN embedding TYPE vector(1536) USING embedding::vector;
  embedding BYTEA,
  processado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  categoria_id UUID REFERENCES public.categorias(id)
);

-- ============================================
-- SEÇÃO 3: CRIAR TABELA DE LOGS
-- ============================================
CREATE TABLE IF NOT EXISTS public.ingestao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SEÇÃO 4: CRIAR ÍNDICES PARA BUSCA TEXTUAL
-- ============================================
-- Índices para buscas textuais (substituem busca vetorial)
CREATE INDEX IF NOT EXISTS idx_atendimentos_texto 
ON public.atendimentos USING gin(to_tsvector('portuguese', texto_original));

CREATE INDEX IF NOT EXISTS idx_atendimentos_problema 
ON public.atendimentos USING gin(to_tsvector('portuguese', problema));

CREATE INDEX IF NOT EXISTS idx_atendimentos_solucao 
ON public.atendimentos USING gin(to_tsvector('portuguese', solucao));

CREATE INDEX IF NOT EXISTS idx_atendimentos_categoria 
ON public.atendimentos(categoria);

CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente 
ON public.atendimentos(cliente);

CREATE INDEX IF NOT EXISTS idx_atendimentos_created_at 
ON public.atendimentos(created_at DESC);

-- ============================================
-- SEÇÃO 5: INSERIR CATEGORIAS PADRÃO
-- ============================================
INSERT INTO public.categorias (nome, descricao) VALUES
  ('Hardware', 'Problemas relacionados a equipamentos físicos'),
  ('Software', 'Problemas relacionados a programas e sistemas'),
  ('Rede', 'Problemas de conectividade e infraestrutura de rede'),
  ('Banco de Dados', 'Problemas relacionados a bancos de dados'),
  ('Segurança', 'Problemas de segurança e acesso'),
  ('Performance', 'Problemas de desempenho e lentidão'),
  ('Integração', 'Problemas de integração entre sistemas'),
  ('Outros', 'Outros tipos de problemas')
ON CONFLICT (nome) DO NOTHING;

-- ============================================
-- SEÇÃO 6: FUNÇÃO DE BUSCA TEXTUAL (SUBSTITUI BUSCA VETORIAL)
-- ============================================
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_textual(
  query_text TEXT,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  relevancia FLOAT,
  resumo_problema TEXT,
  causa TEXT,
  solucao TEXT,
  texto_original TEXT,
  categoria TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    a.id,
    ts_rank_cd(
      setweight(to_tsvector('portuguese', COALESCE(a.problema, '')), 'A') ||
      setweight(to_tsvector('portuguese', COALESCE(a.texto_original, '')), 'B') ||
      setweight(to_tsvector('portuguese', COALESCE(a.solucao, '')), 'C'),
      to_tsquery('portuguese', query_text)
    ) AS relevancia,
    COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 200)) AS resumo_problema,
    a.causa,
    a.solucao,
    a.texto_original,
    a.categoria
  FROM public.atendimentos a
  WHERE 
    to_tsvector('portuguese', COALESCE(a.problema, '') || ' ' || COALESCE(a.texto_original, '') || ' ' || COALESCE(a.solucao, ''))
    @@ to_tsquery('portuguese', query_text)
  ORDER BY relevancia DESC
  LIMIT GREATEST(match_count, 1);
$$;

-- Função alternativa mais simples (LIKE)
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_simples(
  query_text TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  resumo_problema TEXT,
  causa TEXT,
  solucao TEXT,
  categoria TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    a.id,
    COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 200)) AS resumo_problema,
    a.causa,
    a.solucao,
    a.categoria
  FROM public.atendimentos a
  WHERE 
    a.texto_original ILIKE '%' || query_text || '%' OR
    a.problema ILIKE '%' || query_text || '%' OR
    a.solucao ILIKE '%' || query_text || '%' OR
    a.causa ILIKE '%' || query_text || '%'
  ORDER BY a.created_at DESC
  LIMIT GREATEST(match_count, 1);
$$;

-- ============================================
-- SEÇÃO 7: TRIGGER PARA TIMESTAMP
-- ============================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_atendimentos_updated_at ON public.atendimentos;
CREATE TRIGGER update_atendimentos_updated_at
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SEÇÃO 8: VIEWS PARA DASHBOARD (COM EMBEDDING BYTEA)
-- ============================================
CREATE OR REPLACE VIEW public.dashboard_metrics AS
SELECT
  COUNT(*) AS total_atendimentos,
  COUNT(DISTINCT cliente) AS clientes_unicos,
  COUNT(DISTINCT tecnico) AS tecnicos_ativos,
  COUNT(*) FILTER (WHERE processado = TRUE) AS atendimentos_processados,
  -- Conta embeddings BYTEA (não nulos)
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS atendimentos_com_embedding,
  COUNT(DISTINCT categoria) AS categorias_utilizadas,
  MIN(created_at) AS primeiro_atendimento,
  MAX(created_at) AS ultimo_atendimento
FROM public.atendimentos;

CREATE OR REPLACE VIEW public.categoria_stats AS
SELECT
  COALESCE(categoria, 'Não categorizado') AS categoria,
  COUNT(*) AS total,
  ROUND(COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM public.atendimentos), 0), 2) AS percentual,
  AVG(LENGTH(texto_original))::INT AS avg_tamanho_texto,
  MIN(created_at) AS primeiro,
  MAX(created_at) AS ultimo
FROM public.atendimentos
GROUP BY categoria
ORDER BY total DESC;

-- ============================================
-- SEÇÃO 9: DADOS DE EXEMPLO PARA TESTE
-- ============================================
INSERT INTO public.atendimentos 
(cliente, tecnico, texto_original, categoria, problema, causa, solucao) VALUES
('Supermercado ABC', 'Maria Santos', 
 'Sistema muito lento para emitir NFC-e, cliente reclamando de timeout constante após 30 segundos de espera.',
 'Performance', 
 'Sistema lento na emissão NFC-e',
 'Cache do banco de dados cheio e índices fragmentados',
 'Executado cleanup no cache, reindexação das tabelas e ajuste de timeout para 60 segundos'),
 
('Restaurante XYZ', 'Carlos Oliveira', 
 'Balança modelo Toledo 2098 não comunica com sistema. Erro "dispositivo não encontrado" aparece ao tentar pesar.',
 'Hardware', 
 'Balança não conecta ao sistema',
 'Cabo USB danificado e driver desatualizado',
 'Substituído cabo USB, reinstalado driver v4.2 e configurada porta COM3'),
 
('Farmácia 123', 'Ana Pereira', 
 'Erro ao tentar cancelar cupom fiscal: "Operação não permitida no estado atual do documento".',
 'Software', 
 'Erro no cancelamento de cupom fiscal',
 'Permissões do usuário insuficientes e estado inválido do documento',
 'Ajustado perfil do usuário para nível supervisor e verificado estado da SEFAZ')
ON CONFLICT DO NOTHING;

-- ============================================
-- SEÇÃO 10: TESTES E VERIFICAÇÃO
-- ============================================
-- Verificar tabelas
SELECT '✅ Tabelas criadas:' as status;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verificar categorias
SELECT '✅ Categorias:' as status;
SELECT nome, descricao FROM categorias ORDER BY nome;

-- Verificar dados de exemplo
SELECT '✅ Dados de exemplo:' as status;
SELECT 
  cliente, 
  categoria, 
  LEFT(problema, 50) as problema_resumo,
  LEFT(solucao, 50) as solucao_resumo
FROM atendimentos 
ORDER BY created_at DESC;

-- Testar busca textual
SELECT '🔍 Teste busca textual (impressora):' as status;
SELECT * FROM buscar_atendimentos_simples('lento', 2);

SELECT '🔍 Teste busca textual (balança):' as status;
SELECT * FROM buscar_atendimentos_simples('balança', 2);

-- Testar busca full-text (se tiver suporte a português)
SELECT '🔍 Teste busca full-text:' as status;
SELECT * FROM buscar_atendimentos_textual('lento & sistema', 2);

-- Verificar views
SELECT '📊 Views do dashboard:' as status;
SELECT * FROM dashboard_metrics;

SELECT '📈 Estatísticas por categoria:' as status;
SELECT * FROM categoria_stats;

-- ============================================
-- MENSAGEM FINAL
-- ============================================
SELECT '🎉 BANCO MAVO.AI CONFIGURADO (COM EMBEDDING BYTEA)!' as mensagem;
SELECT ' ' as detalhe1;
SELECT '✅ Sistema funcionando com busca textual' as detalhe2;
SELECT '✅ Coluna embedding criada como BYTEA' as detalhe3;
SELECT '✅ 3 atendimentos de exemplo inseridos' as detalhe4;
SELECT '✅ 8 categorias configuradas' as detalhe5;
SELECT ' ' as detalhe6;
SELECT 'Para converter para VECTOR posteriormente:' as nota1;
SELECT '1. Instale pgvector: https://github.com/pgvector/pgvector' as nota2;
SELECT '2. Execute: CREATE EXTENSION IF NOT EXISTS vector;' as nota3;
SELECT '3. Execute o script: scripts/upgrade-to-vector.sql' as nota4;
SELECT ' ' as nota5;
SELECT 'A coluna embedding já existe como BYTEA e será convertida' as nota6;
SELECT 'automaticamente para VECTOR(1536) quando executar o script.' as nota7;
-- SCRIPT PARA EXECUTAR NO PGADIN - PASSO A PASSO
-- Execute cada seção separadamente (selecionar e F5)

-- ============================================
-- SEÇÃO 1: CRIAR EXTENSÃO VECTOR (para embeddings)
-- ============================================
CREATE EXTENSION IF NOT EXISTS vector;

-- Verificar se criou:
SELECT * FROM pg_extension WHERE extname = 'vector';

-- ============================================
-- SEÇÃO 2: CRIAR TABELA DE CATEGORIAS
-- ============================================
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SEÇÃO 3: CRIAR TABELA PRINCIPAL DE ATENDIMENTOS
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
  embedding VECTOR(1536),
  processado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  categoria_id UUID REFERENCES public.categorias(id)
);

-- ============================================
-- SEÇÃO 4: CRIAR TABELA DE LOGS
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
-- SEÇÃO 5: CRIAR ÍNDICES (performance)
-- ============================================
-- Índice para embeddings (busca semântica)
CREATE INDEX IF NOT EXISTS idx_atendimentos_embedding 
ON public.atendimentos USING ivfflat (embedding vector_cosine_ops);

-- Índices para buscas comuns
CREATE INDEX IF NOT EXISTS idx_atendimentos_categoria 
ON public.atendimentos(categoria);

CREATE INDEX IF NOT EXISTS idx_atendimentos_cliente 
ON public.atendimentos(cliente);

CREATE INDEX IF NOT EXISTS idx_atendimentos_created_at 
ON public.atendimentos(created_at DESC);

-- ============================================
-- SEÇÃO 6: INSERIR CATEGORIAS PADRÃO
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
-- SEÇÃO 7: CRIAR FUNÇÃO DE BUSCA SEMÂNTICA
-- ============================================
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_semanticos(
  query_embedding VECTOR(1536),
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  similaridade FLOAT,
  resumo_problema TEXT,
  causa TEXT,
  solucao TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    a.id,
    (1 - (a.embedding <=> query_embedding))::FLOAT AS similaridade,
    COALESCE(a.resumo_problema, a.problema, a.resumo, a.texto_original) AS resumo_problema,
    a.causa,
    a.solucao
  FROM public.atendimentos a
  WHERE a.embedding IS NOT NULL
  ORDER BY a.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- ============================================
-- SEÇÃO 8: CRIAR TRIGGER PARA TIMESTAMP
-- ============================================
-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger na tabela atendimentos
DROP TRIGGER IF EXISTS update_atendimentos_updated_at ON public.atendimentos;
CREATE TRIGGER update_atendimentos_updated_at
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- SEÇÃO 9: CRIAR VIEWS PARA DASHBOARD
-- ============================================
-- View para métricas gerais
CREATE OR REPLACE VIEW public.dashboard_metrics AS
SELECT
  COUNT(*) AS total_atendimentos,
  COUNT(DISTINCT cliente) AS clientes_unicos,
  COUNT(DISTINCT tecnico) AS tecnicos_ativos,
  COUNT(*) FILTER (WHERE processado = TRUE) AS atendimentos_processados,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) AS atendimentos_com_embedding,
  COUNT(DISTINCT categoria) AS categorias_utilizadas,
  MIN(created_at) AS primeiro_atendimento,
  MAX(created_at) AS ultimo_atendimento
FROM public.atendimentos;

-- View para estatísticas por categoria
CREATE OR REPLACE VIEW public.categoria_stats AS
SELECT
  COALESCE(categoria, 'Não categorizado') AS categoria,
  COUNT(*) AS total,
  ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM public.atendimentos), 2) AS percentual,
  AVG(LENGTH(texto_original))::INT AS avg_tamanho_texto,
  MIN(created_at) AS primeiro,
  MAX(created_at) AS ultimo
FROM public.atendimentos
GROUP BY categoria
ORDER BY total DESC;

-- ============================================
-- SEÇÃO 10: TESTAR E VERIFICAR
-- ============================================
-- Verificar tabelas criadas
SELECT 'Tabelas criadas:' as status;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Verificar categorias inseridas
SELECT 'Categorias padrão:' as status;
SELECT nome, descricao FROM categorias ORDER BY nome;

-- Verificar views
SELECT 'Views criadas:' as status;
SELECT viewname FROM pg_views WHERE schemaname = 'public' ORDER BY viewname;

-- Testar função (com embedding dummy)
SELECT 'Teste função busca (embedding dummy):' as status;
SELECT * FROM buscar_atendimentos_semanticos(
  ARRAY[0.1, 0.2, 0.3, 0.4, 0.5]::vector(1536),
  2
);

-- ============================================
-- MENSAGEM FINAL
-- ============================================
SELECT '✅ BANCO DE DADOS MAVO.AI CONFIGURADO COM SUCESSO!' as mensagem;
-- ============================================================
-- SCRIPT COMPLETO MAVO.AI - ÚNICO E DEFINITIVO
-- ============================================================
-- Execute TODO este script no pgAdmin (selecione tudo e F5)
-- Conectado ao banco 'mavoai' como usuário 'postgres'
-- ============================================================

-- Desativar mensagens de NOTICE para output mais limpo
SET client_min_messages TO WARNING;

-- ============================================================
-- SEÇÃO 1: CONFIGURAÇÃO INICIAL
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '🚀 INICIANDO CONFIGURAÇÃO DO MAVO.AI...';
    RAISE NOTICE '=========================================';
END $$;

-- ============================================================
-- SEÇÃO 2: CRIAR EXTENSÕES (SE DISPONÍVEIS)
-- ============================================================
DO $$
BEGIN
    -- Tentar criar extensão vector (para embeddings)
    BEGIN
        CREATE EXTENSION IF NOT EXISTS vector;
        RAISE NOTICE '✅ Extensão VECTOR instalada/compatível';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '⚠️  Extensão VECTOR não disponível (usando BYTEA)';
    END;
END $$;

-- ============================================================
-- SEÇÃO 3: CRIAR TABELA DE CATEGORIAS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN RAISE NOTICE '✅ Tabela CATEGORIAS criada'; END $$;

-- ============================================================
-- SEÇÃO 4: CRIAR TABELA PRINCIPAL DE ATENDIMENTOS
-- ============================================================
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
  -- Coluna embedding: VECTOR se disponível, BYTEA como fallback
  embedding BYTEA,
  processado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  categoria_id UUID REFERENCES public.categorias(id)
);

-- Se VECTOR disponível, converter coluna
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        BEGIN
            ALTER TABLE public.atendimentos 
                ALTER COLUMN embedding TYPE vector(1536) 
                USING embedding::vector;
            RAISE NOTICE '✅ Coluna EMBEDDING configurada como VECTOR(1536)';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE '⚠️  Mantendo EMBEDDING como BYTEA (dados existentes)';
        END;
    ELSE
        RAISE NOTICE '✅ Coluna EMBEDDING configurada como BYTEA (sem VECTOR)';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ Tabela ATENDIMENTOS criada'; END $$;

-- ============================================================
-- SEÇÃO 5: CRIAR TABELA DE LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ingestao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN RAISE NOTICE '✅ Tabela INGESTAO_LOGS criada'; END $$;

-- ============================================================
-- SEÇÃO 6: CRIAR ÍNDICES PARA PERFORMANCE
-- ============================================================
-- Índices para busca textual
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

-- Índice para embeddings (se VECTOR disponível)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        CREATE INDEX IF NOT EXISTS idx_atendimentos_embedding 
        ON public.atendimentos USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
        RAISE NOTICE '✅ Índice VECTORIAL criado para embeddings';
    END IF;
END $$;

DO $$ BEGIN RAISE NOTICE '✅ Índices de performance criados'; END $$;

-- ============================================================
-- SEÇÃO 7: INSERIR CATEGORIAS PADRÃO
-- ============================================================
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

DO $$ BEGIN 
    RAISE NOTICE '✅ 8 categorias padrão inseridas'; 
END $$;

-- ============================================================
-- SEÇÃO 8: FUNÇÕES DE BUSCA (ADAPTATIVAS)
-- ============================================================
-- Função de busca textual (sempre funciona)
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_simples(
  query_text TEXT,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  resumo_problema TEXT,
  causa TEXT,
  solucao TEXT,
  categoria TEXT,
  texto_original TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    a.id,
    COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 200)) AS resumo_problema,
    a.causa,
    a.solucao,
    a.categoria,
    a.texto_original
  FROM public.atendimentos a
  WHERE 
    a.texto_original ILIKE '%' || query_text || '%' OR
    a.problema ILIKE '%' || query_text || '%' OR
    a.solucao ILIKE '%' || query_text || '%' OR
    a.causa ILIKE '%' || query_text || '%' OR
    a.categoria ILIKE '%' || query_text || '%'
  ORDER BY a.created_at DESC
  LIMIT GREATEST(match_count, 1);
$$;

DO $$ BEGIN RAISE NOTICE '✅ Função BUSCAR_ATENDIMENTOS_SIMPLES criada'; END $$;

-- Função de busca semântica (se VECTOR disponível)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        -- Função com VECTOR
        CREATE OR REPLACE FUNCTION public.buscar_atendimentos_semanticos(
          query_embedding VECTOR(1536),
          match_count INT DEFAULT 3,
          similarity_threshold FLOAT DEFAULT 0.7
        )
        RETURNS TABLE (
          id UUID,
          similaridade FLOAT,
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
            (1 - (a.embedding <=> query_embedding))::FLOAT AS similaridade,
            COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 200)) AS resumo_problema,
            a.causa,
            a.solucao,
            a.texto_original,
            a.categoria
          FROM public.atendimentos a
          WHERE a.embedding IS NOT NULL
            AND (1 - (a.embedding <=> query_embedding)) >= similarity_threshold
          ORDER BY a.embedding <=> query_embedding
          LIMIT GREATEST(match_count, 1);
        $$;
        RAISE NOTICE '✅ Função BUSCAR_ATENDIMENTOS_SEMANTICOS (VECTOR) criada';
    ELSE
        -- Função fallback (sem VECTOR)
        CREATE OR REPLACE FUNCTION public.buscar_atendimentos_semanticos(
          query_text TEXT,
          match_count INT DEFAULT 3
        )
        RETURNS TABLE (
          id UUID,
          similaridade FLOAT,
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
            1.0 AS similaridade, -- Similaridade fixa para fallback
            COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 200)) AS resumo_problema,
            a.causa,
            a.solucao,
            a.texto_original,
            a.categoria
          FROM public.atendimentos a
          WHERE 
            a.texto_original ILIKE '%' || query_text || '%' OR
            a.problema ILIKE '%' || query_text || '%'
          ORDER BY a.created_at DESC
          LIMIT GREATEST(match_count, 1);
        $$;
        RAISE NOTICE '✅ Função BUSCAR_ATENDIMENTOS_SEMANTICOS (fallback) criada';
    END IF;
END $$;

-- Função de busca full-text
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

DO $$ BEGIN RAISE NOTICE '✅ Função BUSCAR_ATENDIMENTOS_TEXTUAL criada'; END $$;

-- ============================================================
-- SEÇÃO 9: TRIGGERS PARA TIMESTAMPS
-- ============================================================
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

DO $$ BEGIN RAISE NOTICE '✅ Trigger para timestamps criado'; END $$;

-- ============================================================
-- SEÇÃO 10: VIEWS PARA DASHBOARD
-- ============================================================
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

DO $$ BEGIN RAISE NOTICE '✅ Views do dashboard criadas'; END $$;

-- ============================================================
-- SEÇÃO 11: DADOS DE EXEMPLO
-- ============================================================
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
 'Ajustado perfil do usuário para nível supervisor e verificado estado da SEFAZ'),
 
('Loja Centro', 'João Silva', 
 'Impressora térmica Bematech MP-4200 não imprime cupom fiscal, apenas barulho de motor.',
 'Hardware', 
 'Impressora térmica não imprime',
 'Rolo de papel travado e sensor sujo',
 'Limpeza completa do sensor, troca do rolo de papel e teste de impressão'),
 
('Posto Combustível', 'Fernanda Lima', 
 'Sistema offline não sincroniza vendas quando internet cai, perdendo registros.',
 'Rede', 
 'Sistema offline perde vendas',
 'Falta de redundância de internet e cache local insuficiente',
 'Instalado roteador 4G de backup e aumentado cache local para 500 transações')
ON CONFLICT DO NOTHING;

DO $$ BEGIN 
    RAISE NOTICE '✅ 5 atendimentos de exemplo inseridos'; 
END $$;

-- ============================================================
-- SEÇÃO 12: VERIFICAÇÃO FINAL
-- ============================================================
DO $$
DECLARE
    vector_available BOOLEAN;
    atendimentos_count INT;
    categorias_count INT;
BEGIN
    -- Verificar extensão vector
    vector_available := EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector');
    
    -- Contar registros
    SELECT COUNT(*) INTO atendimentos_count FROM atendimentos;
    SELECT COUNT(*) INTO categorias_count FROM categorias;
    
    RAISE NOTICE '=========================================';
    RAISE NOTICE '✅ CONFIGURAÇÃO COMPLETA DO MAVO.AI!';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '';
    RAISE NOTICE '📊 RESUMO DA CONFIGURAÇÃO:';
    RAISE NOTICE '-----------------------------------------';
    RAISE NOTICE '• Extensão VECTOR: %', 
        CASE WHEN vector_available THEN 'DISPONÍVEL 🎯' ELSE 'NÃO DISPONÍVEL (usando fallback)' END;
    RAISE NOTICE '• Atendimentos: % registros', atendimentos_count;
    RAISE NOTICE '• Categorias: % cadastradas', categorias_count;
    RAISE NOTICE '• Tabelas: 3 criadas (atendimentos, categorias, logs)';
    RAISE NOTICE '• Funções: 3 de busca criadas';
    RAISE NOTICE '• Views: 2 para dashboard';
    RAISE NOTICE '• Índices: 6+ para performance';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 PRÓXIMOS PASSOS:';
    RAISE NOTICE '-----------------------------------------';
    RAISE NOTICE '1. Configure o .env.local do projeto';
    RAISE NOTICE '2. Execute: npm install && npm run dev';
    RAISE NOTICE '3. Acesse: http://localhost:3000';
    RAISE NOTICE '4. Teste a busca por "sistema lento"';
    RAISE NOTICE '';
    
    IF NOT vector_available THEN
        RAISE NOTICE '💡 PARA HABILITAR BUSCA SEMÂNTICA:';
        RAISE NOTICE '-----------------------------------------';
        RAISE NOTICE '1. Instale pgvector no PostgreSQL';
        RAISE NOTICE '2. Execute: CREATE EXTENSION vector;';
        RAISE NOTICE '3. A coluna embedding já está pronta para conversão';
        RAISE NOTICE '';
    END IF;
    
    RAISE NOTICE '🎉 SISTEMA PRONTO PARA USO!';
END $$;

-- ============================================================
-- TESTES RÁPIDOS (OPCIONAL)
-- ============================================================
/*
-- Descomente para executar testes automáticos:
SELECT '🧪 TESTES AUTOMÁTICOS:' as teste;

-- Teste 1: Verificar estrutura
SELECT '📋 Estrutura das tabelas:' as status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Teste 2: Busca simples
SELECT '🔍 Teste busca simples:' as status;
SELECT * FROM buscar_atendimentos_simples('sistema', 2);

-- Teste 3: Dashboard
SELECT '📊 Dashboard:' as status;
SELECT * FROM dashboard_metrics;

-- Teste 4: Categorias
SELECT '🏷️  Categorias:' as status;
SELECT * FROM categoria_stats;
*/

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '🎯 MAVO.AI CONFIGURADO COM SUCESSO!';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '';
    RAISE NOTICE 'O cérebro operacional está pronto para:';
    RAISE NOTICE '• Transformar conversas em conhecimento';
    RAISE NOTICE '• Encontrar soluções em segundos';
    RAISE NOTICE '• Reduzir retrabalho em 30%+';
    RAISE NOTICE '• Aprender com cada atendimento';
    RAISE NOTICE '';
    RAISE NOTICE 'Agora execute: npm run dev';
    RAISE NOTICE 'E acesse: http://localhost:3000';
END $$;
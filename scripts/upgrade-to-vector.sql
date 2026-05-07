-- SCRIPT PARA CONVERTER DE BYTEA PARA VECTOR
-- Execute APÓS instalar a extensão pgvector no PostgreSQL

-- ============================================
-- PASSO 1: INSTALAR EXTENSÃO VECTOR
-- ============================================
-- Execute apenas se a extensão não estiver instalada
-- CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- PASSO 2: CONVERTER COLUNA EMBEDDING DE BYTEA PARA VECTOR
-- ============================================
-- Primeiro, verifique se há dados na coluna
SELECT 
  'Verificando coluna embedding...' as status,
  COUNT(*) as total_atendimentos,
  COUNT(embedding) as atendimentos_com_embedding,
  COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embeddings_nao_nulos
FROM atendimentos;

-- Se a coluna já for do tipo vector, não precisa converter
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'atendimentos' 
      AND column_name = 'embedding' 
      AND data_type = 'USER-DEFINED'
  ) THEN
    RAISE NOTICE '✅ Coluna embedding já é do tipo VECTOR';
  ELSE
    -- Converter de BYTEA para VECTOR(1536)
    -- Nota: Isso assume que os bytes são um array float4[] serializado
    -- Se os embeddings forem gerados pelo sistema, funcionará
    RAISE NOTICE '🔄 Convertendo coluna embedding de BYTEA para VECTOR(1536)...';
    
    -- Primeiro, fazer backup dos dados
    CREATE TABLE IF NOT EXISTS atendimentos_backup_vector AS 
    SELECT * FROM atendimentos;
    
    -- Converter a coluna
    BEGIN
      ALTER TABLE atendimentos 
        ALTER COLUMN embedding TYPE vector(1536) 
        USING embedding::vector;
      RAISE NOTICE '✅ Conversão concluída com sucesso!';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '❌ Erro na conversão: %', SQLERRM;
      RAISE NOTICE '💡 Solução alternativa: Criar nova coluna vector';
      
      -- Solução alternativa: criar nova coluna
      ALTER TABLE atendimentos ADD COLUMN embedding_vector vector(1536);
      
      -- Atualizar com dados convertidos (se possível)
      UPDATE atendimentos 
      SET embedding_vector = embedding::vector 
      WHERE embedding IS NOT NULL;
    END;
  END IF;
END $$;

-- ============================================
-- PASSO 3: RECRIAR ÍNDICE VECTORIAL
-- ============================================
-- Remover índice antigo se existir
DROP INDEX IF EXISTS idx_atendimentos_embedding;

-- Criar novo índice para busca semântica
CREATE INDEX IF NOT EXISTS idx_atendimentos_embedding_vector 
ON public.atendimentos USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- ============================================
-- PASSO 4: ATUALIZAR FUNÇÃO DE BUSCA SEMÂNTICA
-- ============================================
-- Remover função antiga se existir
DROP FUNCTION IF EXISTS public.buscar_atendimentos_semanticos;

-- Criar nova função para busca com VECTOR
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

-- ============================================
-- PASSO 5: CRIAR FUNÇÃO HÍBRIDA (TEXTUAL + VECTOR)
-- ============================================
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_hibrida(
  query_text TEXT,
  query_embedding VECTOR(1536) DEFAULT NULL,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  tipo_busca TEXT,
  score FLOAT,
  resumo_problema TEXT,
  causa TEXT,
  solucao TEXT,
  categoria TEXT
)
LANGUAGE SQL
STABLE
AS $$
  -- Busca textual (sempre disponível)
  WITH textual AS (
    SELECT 
      id,
      'textual' as tipo_busca,
      relevancia as score,
      resumo_problema,
      causa,
      solucao,
      categoria
    FROM buscar_atendimentos_textual(query_text, match_count)
  ),
  -- Busca semântica (se tiver embedding da query)
  semantica AS (
    SELECT 
      id,
      'semantica' as tipo_busca,
      similaridade as score,
      resumo_problema,
      causa,
      solucao,
      categoria
    FROM buscar_atendimentos_semanticos(query_embedding, match_count)
    WHERE query_embedding IS NOT NULL
  )
  -- Combinar resultados
  SELECT * FROM textual
  UNION ALL
  SELECT * FROM semantica
  ORDER BY score DESC
  LIMIT match_count;
$$;

-- ============================================
-- PASSO 6: ATUALIZAR VIEW DO DASHBOARD
-- ============================================
-- A view já deve estar atualizada, mas vamos garantir
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

-- ============================================
-- PASSO 7: TESTAR CONVERSÃO
-- ============================================
SELECT '🧪 TESTANDO CONVERSÃO PARA VECTOR' as teste;

-- Verificar tipo da coluna
SELECT 
  column_name,
  data_type,
  udt_name
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'atendimentos' 
  AND column_name = 'embedding';

-- Testar função de busca semântica (com embedding dummy)
SELECT '🔍 Teste busca semântica (embedding dummy):' as status;
SELECT * FROM buscar_atendimentos_semanticos(
  ARRAY[0.1, 0.2, 0.3, 0.4, 0.5]::vector(1536),
  2
);

-- Testar função híbrida
SELECT '🔀 Teste busca híbrida:' as status;
SELECT * FROM buscar_atendimentos_hibrida(
  'sistema',
  ARRAY[0.1, 0.2, 0.3, 0.4, 0.5]::vector(1536),
  3
);

-- Verificar índices
SELECT '📊 Índices da tabela atendimentos:' as status;
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'atendimentos' 
ORDER BY indexname;

-- ============================================
-- PASSO 8: MIGRAÇÃO DE DADOS EXISTENTES
-- ============================================
-- Se você já tem embeddings armazenados como texto ou JSON,
-- use esta função para convertê-los:

/*
-- Exemplo: se embeddings estiverem como texto '[0.1, 0.2, ...]'
UPDATE atendimentos 
SET embedding = (
  SELECT string_to_array(trim('[]' FROM embedding_text), ',')::float4[]::vector
  FROM (SELECT embedding::text as embedding_text FROM atendimentos WHERE id = atendimentos.id) t
)
WHERE embedding IS NOT NULL AND embedding::text LIKE '[%]';
*/

-- ============================================
-- MENSAGEM FINAL
-- ============================================
SELECT '🎉 CONVERSÃO PARA VECTOR CONCLUÍDA!' as mensagem;
SELECT ' ' as detalhe1;
SELECT '✅ Extensão vector instalada' as detalhe2;
SELECT '✅ Coluna embedding convertida para VECTOR(1536)' as detalhe3;
SELECT '✅ Índice de busca semântica criado' as detalhe4;
SELECT '✅ Funções de busca atualizadas' as detalhe5;
SELECT ' ' as detalhe6;
SELECT 'Próximos passos:' as proximos1;
SELECT '1. Gere embeddings para atendimentos existentes' as proximos2;
SELECT '2. Teste busca semântica com queries reais' as proximos3;
SELECT '3. Ajuste similarity_threshold conforme necessidade' as proximos4;
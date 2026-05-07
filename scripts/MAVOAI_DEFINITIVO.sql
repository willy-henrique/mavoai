-- ============================================================
-- SCRIPT MAVO.AI DEFINITIVO - REMOVE FUNÇÕES ANTES DE RECRIAR
-- ============================================================
-- Execute TODO este script no pgAdmin (selecione tudo e F5)
-- Conectado ao banco 'mavoai' como usuário 'postgres'
-- ============================================================

-- ============================================================
-- 1. REMOVER FUNÇÕES EXISTENTES (SE HOUVER)
-- ============================================================

DROP FUNCTION IF EXISTS public.buscar_atendimentos_simples(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.buscar_atendimentos_textual(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.buscar_atendimentos_semanticos(VECTOR, INTEGER, FLOAT);
DROP FUNCTION IF EXISTS public.buscar_atendimentos_semanticos(TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.buscar_atendimentos_hibrida(TEXT, VECTOR, INTEGER);

-- ============================================================
-- 2. REMOVER VIEWS EXISTENTES
-- ============================================================

DROP VIEW IF EXISTS public.dashboard_metrics;
DROP VIEW IF EXISTS public.categoria_stats;

-- ============================================================
-- 3. REMOVER TRIGGER E FUNÇÃO
-- ============================================================

DROP TRIGGER IF EXISTS update_atendimentos_updated_at ON public.atendimentos;
DROP FUNCTION IF EXISTS public.update_updated_at_column();

-- ============================================================
-- 4. CRIAR TABELAS (SE NÃO EXISTIREM)
-- ============================================================

-- Tabela de categorias
CREATE TABLE IF NOT EXISTS public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela principal de atendimentos
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
  -- Coluna embedding (será BYTEA ou VECTOR dependendo da extensão)
  embedding BYTEA,
  processado BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  categoria_id UUID REFERENCES public.categorias(id)
);

-- Tabela de logs
CREATE TABLE IF NOT EXISTS public.ingestao_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB,
  detalhes JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. CRIAR ÍNDICES (SE NÃO EXISTIREM)
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

-- ============================================================
-- 6. INSERIR CATEGORIAS PADRÃO (SE NÃO EXISTIREM)
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

-- ============================================================
-- 7. CRIAR FUNÇÕES DE BUSCA (NOVAS)
-- ============================================================

-- Função de busca simples (LIKE)
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

-- Função de busca textual (full-text)
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

-- ============================================================
-- 8. CRIAR TRIGGER PARA TIMESTAMPS
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_atendimentos_updated_at
  BEFORE UPDATE ON public.atendimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 9. CRIAR VIEWS PARA DASHBOARD
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

-- ============================================================
-- 10. INSERIR DADOS DE EXEMPLO (SE NÃO EXISTIREM)
-- ============================================================

-- Inserir apenas se não houver atendimentos
INSERT INTO public.atendimentos 
(cliente, tecnico, texto_original, categoria, problema, causa, solucao)
SELECT * FROM (VALUES
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
) AS novos_dados
WHERE NOT EXISTS (SELECT 1 FROM public.atendimentos LIMIT 1);

-- ============================================================
-- 11. VERIFICAÇÃO FINAL
-- ============================================================

DO $$
DECLARE
    atendimentos_count INT;
    categorias_count INT;
BEGIN
    -- Contar registros
    SELECT COUNT(*) INTO atendimentos_count FROM atendimentos;
    SELECT COUNT(*) INTO categorias_count FROM categorias;
    
    RAISE NOTICE '=========================================';
    RAISE NOTICE '✅ MAVO.AI CONFIGURADO COM SUCESSO!';
    RAISE NOTICE '=========================================';
    RAISE NOTICE '';
    RAISE NOTICE '📊 RESUMO:';
    RAISE NOTICE '-----------------------------------------';
    RAISE NOTICE '• Atendimentos: % registros', atendimentos_count;
    RAISE NOTICE '• Categorias: % cadastradas', categorias_count;
    RAISE NOTICE '• Tabelas: 3 configuradas';
    RAISE NOTICE '• Funções: 2 de busca criadas';
    RAISE NOTICE '• Views: 2 para dashboard';
    RAISE NOTICE '• Índices: 6 para performance';
    RAISE NOTICE '';
    RAISE NOTICE '🚀 PRÓXIMOS PASSOS:';
    RAISE NOTICE '-----------------------------------------';
    RAISE NOTICE '1. Execute: npm install && npm run dev';
    RAISE NOTICE '2. Acesse: http://localhost:3000';
    RAISE NOTICE '3. Teste busca por "sistema lento"';
    RAISE NOTICE '';
    RAISE NOTICE '🎉 SISTEMA PRONTO PARA USO!';
END $$;

-- ============================================================
-- 12. TESTES RÁPIDOS
-- ============================================================

-- Teste 1: Verificar estrutura
SELECT '📋 Estrutura das tabelas:' as status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;

-- Teste 2: Busca simples
SELECT '🔍 Teste busca simples (sistema):' as status;
SELECT * FROM buscar_atendimentos_simples('sistema', 2);

-- Teste 3: Dashboard
SELECT '📊 Dashboard:' as status;
SELECT * FROM dashboard_metrics;

-- Teste 4: Categorias
SELECT '🏷️  Categorias:' as status;
SELECT * FROM categoria_stats;

-- ============================================================
-- FIM DO SCRIPT
-- ============================================================

SELECT '';
SELECT '=========================================';
SELECT '🎯 MAVO.AI - CÉREBRO OPERACIONAL PRONTO!';
SELECT '=========================================';
SELECT '';
SELECT 'Funcionalidades disponíveis:';
SELECT '• ✅ Cadastro de atendimentos';
SELECT '• ✅ Busca textual inteligente';
SELECT '• ✅ Dashboard com analytics';
SELECT '• ✅ IA para resumo automático';
SELECT '• ✅ Sistema de categorias';
SELECT '• ✅ API REST completa';
SELECT '';
SELECT 'Agora execute: npm run dev';
SELECT 'E acesse: http://localhost:3000';
-- ============================================================
-- 015_knowledge_semantic_search.sql
-- Busca vetorial sobre knowledge_items PUBLICADOS (Fase 2 da Curadoria).
-- Espelha buscar_atendimentos_semanticos, mas só sobre conteúdo já
-- validado pelo Gerente de Curadoria (status = 'publicado').
-- ============================================================

CREATE OR REPLACE FUNCTION public.buscar_knowledge_semantico(
  query_embedding vector(1024),
  match_count     INT     DEFAULT 3,
  p_tenant_id     TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id uuid, similaridade float, resumo_problema text, causa text, solucao text,
  confianca numeric, prioridade int
)
LANGUAGE SQL STABLE AS $$
  SELECT k.id,
    (1 - (k.embedding <=> query_embedding))::float AS similaridade,
    k.pergunta AS resumo_problema,
    k.intencao AS causa,
    k.resposta_oficial AS solucao,
    k.confianca,
    k.prioridade
  FROM public.knowledge_items k
  WHERE k.embedding IS NOT NULL
    AND k.status = 'publicado'
    AND (p_tenant_id IS NULL OR k.tenant_id = p_tenant_id)
  ORDER BY k.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

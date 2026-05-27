DROP INDEX IF EXISTS atendimentos_embedding_idx;

ALTER TABLE public.atendimentos
  ALTER COLUMN embedding TYPE vector(1024) USING NULL::vector(1024);

CREATE OR REPLACE FUNCTION public.buscar_atendimentos_semanticos(
  query_embedding vector(1024),
  match_count int DEFAULT 3
)
RETURNS TABLE (id uuid, similaridade float, resumo_problema text, causa text, solucao text)
LANGUAGE sql STABLE AS $$
  SELECT a.id,
    (1 - (a.embedding <=> query_embedding))::float AS similaridade,
    COALESCE(a.resumo_problema, a.problema, a.resumo, a.texto_original) AS resumo_problema,
    a.causa, a.solucao
  FROM public.atendimentos a
  WHERE a.embedding IS NOT NULL
  ORDER BY a.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

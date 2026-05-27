-- Migration 006: Multi-tenant knowledge isolation
-- Run this BEFORE any code changes. Safe to re-run (idempotent).

-- 1. Organizations table
CREATE TABLE IF NOT EXISTS public.organizations (
  id           TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  description  TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.organizations (id, display_name, product_name, description)
VALUES ('auge', 'AUGE ERP', 'AUGE ERP', 'Sistema de automação e gestão empresarial para varejo')
ON CONFLICT (id) DO NOTHING;

-- 2. tenant_id column on atendimentos
ALTER TABLE public.atendimentos
  ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'auge';

UPDATE public.atendimentos
SET tenant_id = 'auge'
WHERE tenant_id IS NULL OR tenant_id = '';

CREATE INDEX IF NOT EXISTS atendimentos_tenant_idx
  ON public.atendimentos (tenant_id);

-- 3. Tenant-aware semantic search (NULL = global, backward compat)
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_semanticos(
  query_embedding vector(1024),
  match_count     INT DEFAULT 3,
  p_tenant_id     TEXT DEFAULT NULL
)
RETURNS TABLE (id uuid, similaridade float, resumo_problema text, causa text, solucao text)
LANGUAGE SQL STABLE AS $$
  SELECT a.id,
    (1 - (a.embedding <=> query_embedding))::float AS similaridade,
    COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 300)) AS resumo_problema,
    a.causa,
    a.solucao
  FROM public.atendimentos a
  WHERE a.embedding IS NOT NULL
    AND (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
  ORDER BY a.embedding <=> query_embedding
  LIMIT GREATEST(match_count, 1);
$$;

-- 4. Tenant-aware text search (NULL = global, backward compat)
CREATE OR REPLACE FUNCTION public.buscar_atendimentos_simples(
  query_text  TEXT,
  match_count INT DEFAULT 5,
  p_tenant_id TEXT DEFAULT NULL
)
RETURNS TABLE (id uuid, resumo_problema text, causa text, solucao text, categoria text, texto_original text)
LANGUAGE SQL STABLE AS $$
  SELECT a.id,
    COALESCE(a.resumo_problema, a.problema, a.resumo, LEFT(a.texto_original, 200)) AS resumo_problema,
    a.causa,
    a.solucao,
    a.categoria,
    a.texto_original
  FROM public.atendimentos a
  WHERE (p_tenant_id IS NULL OR a.tenant_id = p_tenant_id)
    AND (
      a.texto_original ILIKE '%' || query_text || '%'
      OR a.problema    ILIKE '%' || query_text || '%'
      OR a.solucao     ILIKE '%' || query_text || '%'
      OR a.causa       ILIKE '%' || query_text || '%'
      OR a.categoria   ILIKE '%' || query_text || '%'
    )
  ORDER BY a.created_at DESC
  LIMIT GREATEST(match_count, 1);
$$;

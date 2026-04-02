create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  created_at timestamptz default now()
);

create extension if not exists vector;

create table if not exists public.atendimentos (
  id uuid primary key default gen_random_uuid(),
  ticket_externo text,
  canal text,
  cliente text not null,
  tecnico text not null,
  data_atendimento timestamptz default now(),
  texto_original text not null,
  resumo_problema text,
  resumo text,
  categoria text,
  problema text,
  causa text,
  solucao text,
  embedding vector(1536),
  processado boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  categoria_id uuid references public.categorias(id)
);

create table if not exists public.ingestao_logs (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  status text not null,
  payload jsonb,
  detalhes jsonb,
  created_at timestamptz default now()
);

create index if not exists atendimentos_embedding_idx
on public.atendimentos
using ivfflat (embedding vector_cosine_ops)
with (lists = 100);

create or replace function public.buscar_atendimentos_semanticos(
  query_embedding vector(1536),
  match_count int default 3
)
returns table (
  id uuid,
  similaridade float,
  resumo_problema text,
  causa text,
  solucao text
)
language sql
stable
as $$
  select
    a.id,
    (1 - (a.embedding <=> query_embedding))::float as similaridade,
    coalesce(a.resumo_problema, a.problema, a.resumo, a.texto_original) as resumo_problema,
    a.causa,
    a.solucao
  from public.atendimentos a
  where a.embedding is not null
  order by a.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

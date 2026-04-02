create extension if not exists vector;

alter table if exists public.atendimentos
  add column if not exists resumo_problema text;

alter table if exists public.atendimentos
  add column if not exists categoria text;

alter table if exists public.atendimentos
  add column if not exists ticket_externo text;

alter table if exists public.atendimentos
  add column if not exists canal text;

create table if not exists public.ingestao_logs (
  id uuid primary key default gen_random_uuid(),
  origem text not null,
  status text not null,
  payload jsonb,
  detalhes jsonb,
  created_at timestamptz default now()
);

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'atendimentos'
      and column_name = 'embedding'
      and data_type <> 'USER-DEFINED'
  ) then
    alter table public.atendimentos
      alter column embedding type vector(1536)
      using nullif(embedding, '')::vector;
  end if;
exception
  when undefined_column then
    null;
end $$;

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

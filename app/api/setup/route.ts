import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    // Verificar se as tabelas ja existem
    const { error: checkError } = await supabase
      .from("categorias")
      .select("id")
      .limit(1)

    if (!checkError) {
      return NextResponse.json({
        message: "Tabelas ja existem",
        status: "ok",
      })
    }

    // Se as tabelas nao existem, precisamos criar via SQL
    // Note: Isso requer que as tabelas sejam criadas manualmente no Supabase Dashboard
    // ou via migration

    return NextResponse.json({
      message: "Tabelas precisam ser criadas. Execute o SQL no Supabase Dashboard.",
      sql: `
-- Categorias de atendimento
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  created_at timestamptz default now()
);

create extension if not exists vector;

-- Tabela principal de atendimentos
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
  categoria_id uuid references public.categorias(id),
  embedding vector(1536),
  processado boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
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

-- Inserir categorias iniciais
insert into public.categorias (nome, descricao) values
  ('Hardware', 'Problemas relacionados a equipamentos fisicos'),
  ('Software', 'Problemas com aplicativos e sistemas'),
  ('Rede', 'Problemas de conectividade e infraestrutura de rede'),
  ('Acesso', 'Problemas de login, permissoes e credenciais'),
  ('Email', 'Problemas com correio eletronico'),
  ('Impressora', 'Problemas com impressao'),
  ('Outro', 'Outros tipos de atendimento');
      `,
      status: "setup_required",
    })
  } catch (error) {
    console.error("Erro no setup:", error)
    return NextResponse.json(
      { error: "Erro ao verificar/criar tabelas" },
      { status: 500 }
    )
  }
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  try {
    const { data: categorias, error: catError } = await supabase
      .from("categorias")
      .select("*")
      .limit(1)

    const { data: atendimentos, error: atendError } = await supabase
      .from("atendimentos")
      .select("*")
      .limit(1)

    return NextResponse.json({
      categorias: {
        exists: !catError,
        error: catError?.message,
      },
      atendimentos: {
        exists: !atendError,
        error: atendError?.message,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Erro ao verificar tabelas" },
      { status: 500 }
    )
  }
}

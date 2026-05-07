@echo off
echo ========================================
echo  CONFIGURACAO DO BANCO DE DADOS - MAVO.AI
echo ========================================
echo.
echo Este script configura o banco de dados Supabase
echo com as tabelas necessarias para o sistema.
echo.

cd /d "C:\willydev\chat-inteligente"

echo.
echo 1. Verificando scripts SQL...
dir scripts\*.sql

echo.
echo 2. IMPORTANTE: Execute os scripts SQL manualmente no Supabase:
echo.
echo    Acesse: https://wakvnakntdynfkevqlxh.supabase.co
echo    Vá para SQL Editor
echo    Execute os scripts na ordem:
echo      - scripts\001_create_tables.sql
echo      - scripts\002_upgrade_semantic_search.sql
echo      - scripts\003_multisource_core.sql
echo.
echo 3. Verifique se as variaveis de ambiente estao configuradas:
echo    - NEXT_PUBLIC_SUPABASE_URL
echo    - NEXT_PUBLIC_SUPABASE_ANON_KEY
echo    - SUPABASE_SERVICE_ROLE_KEY
echo.

echo 4. Testando conexao com o banco...
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('ERRO: Variaveis de ambiente nao configuradas!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

supabase.from('atendimentos').select('count').then(({ data, error }) => {
  if (error) {
    console.error('ERRO na conexao:', error.message);
    process.exit(1);
  }
  console.log('SUCESSO: Conexao com Supabase estabelecida!');
  console.log('Total de atendimentos:', data?.[0]?.count || 0);
});
"

echo.
echo Configuracao concluida!
pause
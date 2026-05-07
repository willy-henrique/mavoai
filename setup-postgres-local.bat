@echo off
echo ========================================
echo  CONFIGURACAO POSTGRESQL 18 LOCAL - MAVO.AI
echo ========================================
echo.
echo Este script configura o PostgreSQL 18 local para o sistema.
echo.

cd /d "C:\willydev\chat-inteligente"

echo 1. Verificando PostgreSQL...
where psql >nul 2>nul
if %errorlevel% neq 0 (
    echo ERRO: PostgreSQL nao encontrado no PATH.
    echo Certifique-se de que o PostgreSQL 18 esta instalado.
    pause
    exit /b 1
)

echo.
echo 2. Criando banco de dados 'mavoai'...
psql -U postgres -c "CREATE DATABASE mavoai;" 2>nul
if %errorlevel% neq 0 (
    echo Banco 'mavoai' ja existe ou erro na criacao.
)

echo.
echo 3. Executando script de configuracao...
psql -U postgres -d mavoai -f "scripts\postgres-local-setup.sql"

if %errorlevel% neq 0 (
    echo ERRO ao executar script SQL.
    echo Execute manualmente no pgAdmin:
    echo   scripts\postgres-local-setup.sql
    pause
    exit /b 1
)

echo.
echo 4. Configurando variaveis de ambiente...
if not exist ".env.local" (
    copy ".env.local.postgres" ".env.local"
    echo Arquivo .env.local criado com configuracao PostgreSQL.
) else (
    echo.
    echo AVISO: .env.local ja existe.
    echo Compare com .env.local.postgres e ajuste manualmente:
    echo   DATABASE_URL=postgresql://postgres:1@localhost:5432/mavoai
)

echo.
echo 5. Instalando dependencia pg (PostgreSQL client)...
call npm install pg @types/pg

echo.
echo 6. Testando conexao...
node -e "
const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:1@localhost:5432/mavoai'
});

pool.query('SELECT NOW() as time, version() as version')
  .then(result => {
    console.log('SUCESSO: Conexao estabelecida!');
    console.log('Hora do servidor:', result.rows[0].time);
    console.log('Versao PostgreSQL:', result.rows[0].version.split()[0]);
    
    // Testar tabelas
    return pool.query(\`SELECT 
      (SELECT COUNT(*) FROM atendimentos) as atendimentos,
      (SELECT COUNT(*) FROM categorias) as categorias\`);
  })
  .then(result => {
    console.log('\\nEstatisticas:');
    console.log('Atendimentos:', result.rows[0].atendimentos);
    console.log('Categorias:', result.rows[0].categorias);
    process.exit(0);
  })
  .catch(error => {
    console.error('ERRO na conexao:', error.message);
    process.exit(1);
  });
"

echo.
echo ========================================
echo  CONFIGURACAO CONCLUIDA!
echo ========================================
echo.
echo Próximos passos:
echo 1. Execute: start-dev.bat
echo 2. Acesse: http://localhost:3000
echo 3. Teste: test-api.bat
echo.
pause
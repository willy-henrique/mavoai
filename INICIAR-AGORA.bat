@echo off
chcp 65001 >nul
cls

echo.
echo  ███╗   ███╗ █████╗ ██╗   ██╗ ██████╗      █████╗ ██╗
echo  ████╗ ████║██╔══██╗██║   ██║██╔═══██╗    ██╔══██╗██║
echo  ██╔████╔██║███████║██║   ██║██║   ██║    ███████║██║
echo  ██║╚██╔╝██║██╔══██║╚██╗ ██╔╝██║   ██║    ██╔══██║██║
echo  ██║ ╚═╝ ██║██║  ██║ ╚████╔╝ ╚██████╔╝    ██║  ██║██║
echo  ╚═╝     ╚═╝╚═╝  ╚═╝  ╚═══╝   ╚═════╝     ╚═╝  ╚═╝╚═╝
echo.
echo  Plataforma Cognitiva Operacional
echo  ================================================
echo.

cd /d "%~dp0"

:: ─── PASSO 1: Verificar dependências ─────────────────────────────────────────

echo [1/5] Verificando dependências...

where node >nul 2>&1
if errorlevel 1 (
    echo    ❌ Node.js não encontrado. Instale em: https://nodejs.org
    pause
    exit /b 1
)

where docker >nul 2>&1
if errorlevel 1 (
    echo    ❌ Docker não encontrado. Instale Docker Desktop: https://docker.com
    pause
    exit /b 1
)

node -e "require('pg')" >nul 2>&1
if errorlevel 1 (
    echo    📦 Instalando dependências npm...
    npm install
    if errorlevel 1 (
        echo    ❌ Erro no npm install
        pause
        exit /b 1
    )
)

echo    ✅ Node.js, Docker e dependências OK

:: ─── PASSO 2: Subir banco de dados ───────────────────────────────────────────

echo.
echo [2/5] Subindo PostgreSQL com pgvector (Docker)...
docker compose up -d >nul 2>&1
if errorlevel 1 (
    echo    ⚠️  docker compose falhou. Tentando sem permissão elevada...
    docker-compose up -d >nul 2>&1
)

echo    Aguardando banco ficar pronto (20 segundos)...
timeout /t 20 /nobreak >nul

:: Verificar se banco está online
:check_db
docker compose exec -T postgres pg_isready -U postgres -d mavoai >nul 2>&1
if errorlevel 1 (
    echo    Aguardando mais 10 segundos...
    timeout /t 10 /nobreak >nul
    goto check_db
)
echo    ✅ Banco de dados online (porta 5434)

:: ─── PASSO 3: Executar migrations ────────────────────────────────────────────

echo.
echo [3/5] Executando migrations do banco...
node scripts/migrate.mjs
if errorlevel 1 (
    echo.
    echo    ❌ Falha nas migrations. Verifique o erro acima.
    echo    Dica: confira se o DATABASE_URL no .env.local está correto
    echo    DATABASE_URL=postgresql://postgres:1@localhost:5434/mavoai
    pause
    exit /b 1
)
echo    ✅ Banco configurado com sucesso

:: ─── PASSO 4: Popular base de conhecimento (se ainda não foi) ────────────────

echo.
echo [4/5] Verificando base de conhecimento...

node -e "
const { Pool } = require('pg');
const fs = require('fs');
const env = fs.existsSync('.env.local') ? fs.readFileSync('.env.local','utf8') : '';
const url = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim() || 'postgresql://postgres:1@localhost:5434/mavoai';
const pool = new Pool({ connectionString: url });
pool.query('SELECT COUNT(*) as total FROM atendimentos WHERE canal = %27documentacao%27')
  .then(r => {
    const total = parseInt(r.rows[0].total);
    console.log(total);
    pool.end();
  })
  .catch(() => { console.log('0'); pool.end(); });
" > tmp_count.txt 2>&1

set /p DOC_COUNT=<tmp_count.txt
del tmp_count.txt >nul 2>&1

if "%DOC_COUNT%"=="0" (
    echo    📚 Importando documentação do AUGE ERP...
    node scripts/importar-treinamento-auge.mjs >nul 2>&1
    if not errorlevel 1 echo    ✅ Treinamento importado

    node scripts/importar-docs-auge.mjs >nul 2>&1
    if not errorlevel 1 echo    ✅ Documentação importada
) else (
    echo    ✅ Base de conhecimento já populada (%DOC_COUNT% documentos)
)

:: ─── PASSO 5: Iniciar servidor ───────────────────────────────────────────────

echo.
echo [5/5] Iniciando servidor Mavo.AI...
echo.
echo  ================================================
echo  🚀 SISTEMA INICIANDO
echo  ================================================
echo  Dashboard:   http://localhost:3000
echo  Health:      http://localhost:3000/api/health
echo  API Doc:     http://localhost:3000/api/config
echo  ================================================
echo.
echo  Para parar: Ctrl + C
echo  Para reiniciar: execute este .bat novamente
echo.

npm run dev

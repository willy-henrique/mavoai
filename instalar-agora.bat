@echo off
echo ========================================
echo  INSTALADOR RÁPIDO MAVO.AI (SEM VECTOR)
echo ========================================
echo.
echo Este script configura o MAVO.AI sem precisar da extensão vector.
echo.

cd /d "C:\willydev\chat-inteligente"

echo.
echo ETAPA 1: VERIFICANDO PRÉ-REQUISITOS
echo ====================================
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js não encontrado!
    echo Baixe em: https://nodejs.org/
    pause
    exit /b 1
)

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ npm não encontrado!
    echo Instale o Node.js completo.
    pause
    exit /b 1
)

echo ✅ Node.js: %node_version%
echo ✅ npm: %npm_version%

echo.
echo ETAPA 2: INSTALAR DEPENDÊNCIAS
echo ================================
echo Instalando pacotes Node.js...
call npm install
if %errorlevel% neq 0 (
    echo ❌ Erro ao instalar dependências.
    pause
    exit /b 1
)

echo Instalando driver PostgreSQL...
call npm install pg @types/pg
if %errorlevel% neq 0 (
    echo ⚠️  Aviso: Driver PostgreSQL pode falhar.
    echo O sistema tentará usar fallback.
)

echo.
echo ETAPA 3: CONFIGURAR ARQUIVO DE AMBIENTE
echo ========================================
if not exist ".env.local" (
    echo Criando .env.local...
    copy ".env.local.postgres" ".env.local"
    echo ✅ .env.local criado.
) else (
    echo ✅ .env.local já existe.
)

echo.
echo ETAPA 4: INSTRUÇÕES PARA O BANCO DE DADOS
echo ==========================================
echo.
echo ⚠️  PASSO MANUAL NECESSÁRIO NO PGADIN:
echo.
echo 1. Abra o pgAdmin 4
echo 2. Conecte-se ao PostgreSQL 18:
echo    - Host: localhost
echo    - Port: 5432  
echo    - Usuário: postgres
echo    - Senha: 1
echo.
echo 3. Crie o banco (se não existir):
echo    CREATE DATABASE mavoai;
echo.
echo 4. Execute o script SQL:
echo    - Conecte ao banco 'mavoai'
echo    - Abra: scripts\setup-without-vector.sql
echo    - Execute TODO o script (F5)
echo.
echo 5. Após executar, volte aqui e pressione Enter...
pause

echo.
echo ETAPA 5: TESTAR CONFIGURAÇÃO
echo =============================
echo Testando conexão com PostgreSQL...
node test-postgres-no-vector.js
if %errorlevel% neq 0 (
    echo.
    echo ❌ Falha no teste de conexão.
    echo Verifique:
    echo 1. PostgreSQL está rodando?
    echo 2. Banco 'mavoai' existe?
    echo 3. Script SQL foi executado?
    echo.
    echo Execute manualmente: node test-postgres-no-vector.js
    pause
    exit /b 1
)

echo.
echo ETAPA 6: INICIAR SISTEMA
echo =========================
echo.
echo ✅ CONFIGURAÇÃO CONCLUÍDA COM SUCESSO!
echo.
echo Para iniciar o sistema:
echo.
echo 1. EM UM TERMINAL, execute:
echo    npm run dev
echo    ou
echo    start-dev.bat
echo.
echo 2. EM OUTRO TERMINAL, teste:
echo    test-api.bat
echo.
echo 3. ACESSE NO NAVEGADOR:
echo    http://localhost:3000
echo.
echo 4. TESTE A BUSCA:
echo    - Acesse http://localhost:3000
echo    - Clique em "Buscar Soluções"
echo    - Digite: "sistema lento"
echo    - Deve mostrar resultados
echo.

echo ========================================
echo  MAVO.AI PRONTO PARA USO!
echo ========================================
echo.
echo Funcionalidades disponíveis:
echo ✅ Cadastro de atendimentos
echo ✅ Busca textual inteligente  
echo ✅ Dashboard com métricas
echo ✅ Sistema de categorias
echo ✅ IA para resumo automático
echo ✅ API REST completa
echo.
echo Pressione Enter para iniciar o servidor AGORA...
pause

echo.
echo Iniciando servidor MAVO.AI...
echo Acesse: http://localhost:3000
echo.
npm run dev
@echo off
echo ========================================
echo  START ALL - MAVO.AI COMPLETE SYSTEM
echo ========================================
echo.

echo PASSO 1: Iniciar PostgreSQL...
echo.
echo Abra o Services (services.msc) como Administrador
echo 1. Procure "PostgreSQL"
echo 2. Se estiver "Parado", clique direito -> "Iniciar"
echo 3. Se estiver "Em execução", clique direito -> "Reiniciar"
echo.
echo OU via CMD Admin:
echo   net start postgresql
echo.
pause

echo.
echo PASSO 2: Verificar conexão PostgreSQL...
echo.
psql -U postgres -d mavoai -c "SELECT NOW();"
echo.
if %errorlevel% neq 0 (
    echo ❌ PostgreSQL não conecta
    echo Execute no pgAdmin: scripts\MAVOAI_DEFINITIVO.sql
    pause
    exit /b 1
) else (
    echo ✅ PostgreSQL conectado
)

echo.
echo PASSO 3: Iniciar MAVO.AI...
echo.
echo Abra UM terminal como Admin e execute:
echo   cd C:\willydev\chat-inteligente
echo   npm run dev
echo.
echo Aguarde aparecer: "▲ Next.js 16.2.0 (Turbopack)"
echo.
pause

echo.
echo PASSO 4: Iniciar n8n (opcional)...
echo.
echo Para orquestração completa, inicie n8n:
echo.
echo Opção A (Docker):
echo   docker run -it --rm --name n8n -p 5678:5678 n8nio/n8n
echo.
echo Opção B (npm):
echo   n8n start
echo.
pause

echo.
echo PASSO 5: Testar sistema...
echo.
echo Abra OUTRO terminal e execute:
echo   cd C:\willydev\chat-inteligente
echo   node teste-rapido-sistema.js
echo.
echo Se tudo OK, aparecerá:
echo   ✅ PostgreSQL: CONECTADO
echo   ✅ Servidor Next.js: RODANDO
echo   ✅ Configuração: OK
echo.
pause

echo.
echo ========================================
echo  🎉 SISTEMA PRONTO PARA USO!
echo ========================================
echo.
echo ACESSE:
echo   Interface: http://localhost:3000
echo   API Health: http://localhost:3000/api/health
echo   n8n: http://localhost:5678 (se instalado)
echo.
echo TESTE RÁPIDO:
echo   curl http://localhost:3000/api/health
echo   Deve retornar: {"status":"ok"}
echo.
pause
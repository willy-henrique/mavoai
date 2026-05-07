@echo off
echo ========================================
echo  SETUP ULTRA RÁPIDO - MAVO.AI
echo ========================================
echo.
echo PASSO 1: Execute no pgAdmin:
echo.
echo   1. Conecte como postgres/1
echo   2. Crie banco 'mavoai' (se não existir)
echo   3. Execute TODO o script:
echo      scripts\MAVOAI_COMPLETO.sql
echo.
echo PASSO 2: Execute no terminal:
echo.
echo   cd C:\willydev\chat-inteligente
echo   npm install
echo   npm install pg @types/pg
echo   npm run dev
echo.
echo PASSO 3: Acesse:
echo.
echo   http://localhost:3000
echo.
echo ========================================
echo  PRONTO! Sistema 100%% configurado.
echo ========================================
echo.
pause
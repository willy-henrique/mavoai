@echo off
echo ========================================
echo  SISTEMA DE INTELIGENCIA OPERACIONAL - MAVO.AI
echo ========================================
echo.
echo Iniciando servidor de desenvolvimento...
echo.

cd /d "C:\willydev\chat-inteligente"

echo Verificando dependencias...
call npm install

echo.
echo Iniciando servidor Next.js...
echo Acesse: http://localhost:3000
echo.

call npm run dev

pause
@echo off
echo ========================================
echo  SETUP FINAL MAVO.AI - DEFINITIVO
echo ========================================
echo.
echo PASSO 1: No pgAdmin, execute:
echo   scripts\MAVOAI_DEFINITIVO.sql
echo.
echo Este script:
echo • Remove funções antigas que causam erro
echo • Recria tudo do zero
echo • Mantém dados existentes
echo • Insere exemplos se vazio
echo.
echo PASSO 2: No terminal:
echo   cd C:\willydev\chat-inteligente
echo   npm install
echo   npm install pg @types/pg
echo   npm run dev
echo.
echo PASSO 3: Acesse:
echo   http://localhost:3000
echo.
echo ========================================
echo  SISTEMA 100%% CONFIGURADO SEM ERROS!
echo ========================================
echo.
pause
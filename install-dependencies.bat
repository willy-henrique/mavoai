@echo off
echo ========================================
echo  INSTALACAO DE DEPENDENCIAS - MAVO.AI
echo ========================================
echo.
echo Instalando dependencias do Node.js...
echo.

cd /d "C:\willydev\chat-inteligente"

echo 1. Verificando Node.js e npm...
node --version
npm --version

echo.
echo 2. Instalando dependencias...
call npm install

echo.
echo 3. Verificando instalacao...
echo Dependencias principais:
echo - Next.js: ^16.2.0
echo - Supabase: ^2.49.1
echo - AI SDK: ^6.0.0
echo - React: ^19.2.4

echo.
echo 4. Copiando arquivo de ambiente...
if not exist ".env.local" (
  copy ".env.example" ".env.local"
  echo Arquivo .env.local criado. Configure as chaves API.
) else (
  echo Arquivo .env.local ja existe.
)

echo.
echo Instalacao concluida!
echo Execute start-dev.bat para iniciar o servidor.
pause
@echo off
echo ========================================
echo  SETUP N8N - ORQUESTRADOR MAVO.AI
echo ========================================
echo.

echo PASSO 1: Verificar configuração...
echo.
echo Verificando .env.local...
if exist .env.local (
    echo ✅ .env.local encontrado
) else (
    echo ❌ .env.local não encontrado
    pause
    exit /b 1
)

echo.
echo PASSO 2: Iniciar serviços necessários...
echo.
echo 🔧 PostgreSQL deve estar rodando (porta 5432)
echo 🔧 MAVO.AI deve estar rodando (npm run dev)
echo 🔧 WillTalk deve estar rodando (porta 4002)
echo.

echo PASSO 3: Instalar n8n (escolha uma opção)...
echo.
echo Opção A: Docker (recomendado)
echo   docker run -it --rm ^
echo     --name n8n ^
echo     -p 5678:5678 ^
echo     -v %USERPROFILE%\.n8n:/home/node/.n8n ^
echo     n8nio/n8n
echo.
echo Opção B: npm global
echo   npm install -g n8n
echo   n8n start
echo.
echo Opção C: n8n.cloud (produção)
echo   https://app.n8n.cloud/
echo.

echo PASSO 4: Configurar n8n...
echo.
echo 1. Acesse: http://localhost:5678
echo 2. Vá em Settings -> Environment Variables
echo 3. Adicione:
echo    • MAVOAI_URL: http://localhost:3000
echo    • MAVOAI_TOKEN: 9e24439a849860fd74f93190df8b5ebb8c2bc7922beceba5020b8a335f45e3e1
echo    • WILLTALK_URL: http://localhost:4002
echo.
echo 5. Importe workflow:
echo    • docs/n8n-workflow-willtalk-ingestao.json (simples)
echo    • docs/n8n-workflow-cerebro-completo.json (completo)
echo.

echo PASSO 5: Testar integração...
echo.
echo Execute o teste:
echo   node scripts/teste-integracao-n8n.js
echo.
echo Ou teste manualmente:
echo   curl -X POST http://localhost:5678/webhook/mavoai-ingest ^
echo     -H "Content-Type: application/json" ^
echo     -d "{^"ticket_id^":^"TEST-001^",^"cliente^":^"Teste^",^"mensagem^":^"Sistema lento^"}"
echo.

echo ========================================
echo  N8N CONFIGURADO PARA ORQUESTRAR MAVO.AI!
echo ========================================
echo.
echo Fluxo completo:
echo WhatsApp -> WillTalk -> n8n -> MAVO.AI -> IA -> Resposta -> WhatsApp
echo.
pause
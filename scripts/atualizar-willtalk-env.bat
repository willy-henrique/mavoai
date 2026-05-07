@echo off
echo ========================================
echo  ATUALIZAR .env DO WILLTALK PARA MAVO.AI
echo ========================================
echo.

set WILLTALK_ENV=C:\willydev\willtalk\.env

echo Verificando arquivo %WILLTALK_ENV%...
if not exist "%WILLTALK_ENV%" (
    echo ❌ Arquivo .env do WillTalk não encontrado!
    echo Localização esperada: %WILLTALK_ENV%
    pause
    exit /b 1
)

echo.
echo ✅ Arquivo encontrado. Fazendo backup...
copy "%WILLTALK_ENV%" "%WILLTALK_ENV%.backup.%date:~-4,4%%date:~-7,2%%date:~-10,2%"
echo Backup criado: %WILLTALK_ENV%.backup

echo.
echo ========================================
echo  ATUALIZANDO CONFIGURAÇÕES...
echo ========================================
echo.

echo 1. Removendo configurações antigas...
powershell -Command "(Get-Content '%WILLTALK_ENV%') | Where-Object { $_ -notmatch '^WILLTALK_WEBHOOK_URL=' -and $_ -notmatch '^CEREBRO_BASE_URL=' -and $_ -notmatch '^WILLTALK_N8N_ONLY=' -and $_ -notmatch '^MAVOAI_' } | Set-Content '%WILLTALK_ENV%.tmp'"
move /y "%WILLTALK_ENV%.tmp" "%WILLTALK_ENV%" > nul

echo.
echo 2. Adicionando novas configurações MAVO.AI...
(
echo.
echo # ====================
echo # INTEGRAÇÃO MAVO.AI (n8n)
echo # ====================
echo WILLTALK_WEBHOOK_URL=http://localhost:5678/webhook-test/03651a89-8f3b-4635-a06d-e97157750352
echo WILLTALK_WEBHOOK_TOKEN=seu-token-webhook-aqui
echo WILLTALK_WEBHOOK_EVENTS=ticket_created,ticket_updated,message_received,message_sent
echo WILLTALK_WEBHOOK_MAX_CHARS=12000
echo WILLTALK_WEBHOOK_ATTEMPTS=3
echo WILLTALK_WEBHOOK_TIMEOUT_MS=8000
echo.
echo # ====================
echo # AUTO-REPLY MAVO.AI
echo # ====================
echo WILLTALK_AUTO_REPLY_ENABLED=true
echo WILLTALK_AUTO_REPLY_ROUTE=/webhooks/cerebro/reply
echo WILLTALK_AUTO_REPLY_SOURCE=mavoai-operacional
echo WILLTALK_AUTO_REPLY_TOKEN=***REMOVED-MTALK-TOKEN***
echo.
echo # ====================
echo # MAVO.AI ENDPOINTS
echo # ====================
echo MAVOAI_BASE_URL=http://localhost:3000
echo MAVOAI_INGESTAO_URL=http://localhost:3000/api/ingestao/willtalk
echo MAVOAI_RESPOSTA_URL=http://localhost:3000/api/resposta-assistida
echo.
echo # ====================
echo # MODO DE OPERAÇÃO
echo # ====================
echo WILLTALK_N8N_ONLY=false
echo WILLTALK_TICKET_UPSERT_EMIT_WEBHOOKS=false
) >> "%WILLTALK_ENV%"

echo.
echo ========================================
echo  ✅ CONFIGURAÇÃO ATUALIZADA COM SUCESSO!
echo ========================================
echo.

echo CONFIGURAÇÕES ADICIONADAS:
echo • WILLTALK_WEBHOOK_URL=http://localhost:5678/webhook-test/03651a89-8f3b-4635-a06d-e97157750352
echo • WILLTALK_AUTO_REPLY_ENABLED=true
echo • WILLTALK_N8N_ONLY=false
echo • MAVOAI_BASE_URL=http://localhost:3000
echo.
echo PRÓXIMOS PASSOS:
echo 1. Reinicie o WillTalk: cd C:\willydev\willtalk && npm run dev
echo 2. Configure o n8n com o workflow: docs/n8n-workflow-mavoai-completo.json
echo 3. Teste a integração: node scripts/teste-integracao-n8n.js
echo.
echo Para verificar as alterações:
type "%WILLTALK_ENV%" | findstr /i "WILLTALK MAVOAI"
echo.
pause
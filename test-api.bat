@echo off
echo ========================================
echo  TESTE DE APIS - MAVO.AI
echo ========================================
echo.
echo Testando endpoints da API...
echo.

cd /d "C:\willydev\chat-inteligente"

echo 1. Testando health check...
curl -s http://localhost:3000/api/health

echo.
echo 2. Testando listagem de atendimentos...
curl -s http://localhost:3000/api/atendimentos

echo.
echo 3. Testando busca semantica (exemplo)...
curl -s -X POST http://localhost:3000/api/busca-semantica ^
  -H "Content-Type: application/json" ^
  -d "{\"query\": \"impressora nao imprime cupom fiscal\"}"

echo.
echo.
echo 4. Testando criacao de atendimento (exemplo)...
curl -s -X POST http://localhost:3000/api/atendimentos ^
  -H "Content-Type: application/json" ^
  -d "{\"cliente\": \"Teste Cliente\", \"tecnico\": \"Tecnico Teste\", \"texto_original\": \"Impressora nao imprime cupom fiscal\", \"categoria\": \"Hardware\"}"

echo.
echo.
echo Testes concluidos!
echo Verifique se o servidor esta rodando (start-dev.bat)
pause
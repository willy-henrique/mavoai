@echo off
echo ========================================
echo  CONFIGURADOR COMPLETO - MAVO.AI
echo ========================================
echo.
echo Este script configura TODO o sistema MAVO.AI
echo.

cd /d "C:\willydev\chat-inteligente"

echo ETAPA 1: INSTALAR DEPENDENCIAS
echo ================================
call npm install
if %errorlevel% neq 0 (
    echo ERRO: Falha ao instalar dependencias.
    pause
    exit /b 1
)

echo.
echo ETAPA 2: INSTALAR DRIVER POSTGRESQL
echo ====================================
call npm install pg @types/pg
if %errorlevel% neq 0 (
    echo AVISO: Falha ao instalar driver PostgreSQL.
    echo O sistema pode funcionar sem ele se usar Supabase.
)

echo.
echo ETAPA 3: CONFIGURAR ARQUIVO DE AMBIENTE
echo ========================================
if not exist ".env.local" (
    echo Criando .env.local a partir do template...
    copy ".env.local.postgres" ".env.local"
    echo.
    echo IMPORTANTE: Configure as chaves de API no .env.local:
    echo 1. Abra o arquivo .env.local
    echo 2. Configure EMBEDDING_API_KEY se quiser busca semantica
    echo 3. A chave do Groq ja esta configurada
) else (
    echo Arquivo .env.local ja existe.
    echo Verifique se contem a configuracao PostgreSQL:
    echo   DATABASE_URL=postgresql://postgres:1@localhost:5432/mavoai
)

echo.
echo ETAPA 4: INSTRUCOES PARA CONFIGURAR BANCO DE DADOS
echo ===================================================
echo.
echo PASSO CRITICO: Configure o banco de dados PostgreSQL
echo.
echo 1. Abra o pgAdmin 4
echo 2. Conecte-se ao PostgreSQL 18 (postgres/1)
echo 3. Crie o banco 'mavoai':
echo    - Clique direito em Databases -> Create -> Database
echo    - Nome: mavoai
echo    - Owner: postgres
echo 4. Execute o script SQL:
echo    - Clique direito no banco 'mavoai' -> Query Tool
echo    - Abra o arquivo: scripts\postgres-local-setup.sql
echo    - Execute todo o script (F5)
echo.
echo 5. Teste a conexao (em outro terminal):
echo    node test-postgres-connection.js
echo.

echo ETAPA 5: TESTAR CONFIGURACAO
echo =============================
echo.
echo Para testar a configuracao:
echo 1. Em UM terminal, inicie o servidor:
echo    start-dev.bat
echo.
echo 2. Em OUTRO terminal, teste as APIs:
echo    test-api.bat
echo.
echo 3. Acesse no navegador:
echo    http://localhost:3000
echo.

echo ETAPA 6: DADOS DE EXEMPLO (OPCIONAL)
echo =====================================
echo.
echo Para adicionar dados de exemplo, execute no pgAdmin:
echo.
echo INSERT INTO atendimentos (cliente, tecnico, texto_original, categoria, problema, causa, solucao) VALUES
echo ('Supermercado ABC', 'Maria Santos', 'Sistema lento ao emitir NFC-e', 'Performance', 'Sistema lento', 'Cache cheio', 'Limpeza de cache'),
echo ('Restaurante XYZ', 'Carlos Oliveira', 'Balança nao conecta', 'Hardware', 'Balança offline', 'Cabo USB', 'Substituicao de cabo'),
echo ('Farmacia 123', 'Ana Pereira', 'Erro ao cancelar cupom', 'Software', 'Erro cancelamento', 'Permissoes', 'Ajuste de permissoes');
echo.

echo ========================================
echo  CONFIGURACAO CONCLUIDA!
echo ========================================
echo.
echo Resumo:
echo - Dependencias Node.js: OK
echo - Driver PostgreSQL: Instalado
echo - Arquivo .env.local: Configurado
echo - Banco de dados: Configure manualmente no pgAdmin
echo.
echo Proximos passos:
echo 1. Configure o banco no pgAdmin (etapa 4)
echo 2. Teste a conexao: node test-postgres-connection.js
echo 3. Inicie: start-dev.bat
echo 4. Acesse: http://localhost:3000
echo.
pause
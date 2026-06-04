# ============================================================
# MAVO.AI — Aplicar scripts SQL no PostgreSQL local
# Executar no PowerShell como Administrador (ou usuario normal)
# na pasta C:\willydev\chat-inteligente
# ============================================================
# Uso: clique com botao direito -> "Executar com PowerShell"
# OU no terminal: cd C:\willydev\chat-inteligente; .\APLICAR-SQL-AGORA.ps1
# ============================================================

$ErrorActionPreference = "Stop"

$HOST_DB  = "localhost"
$PORT_DB  = "5434"
$USER_DB  = "postgres"
$PASS_DB  = "1"
$DB_NAME  = "mavoai"

$scripts = @(
    "scripts\000_SETUP_COMPLETO.sql",
    "scripts\012_specialist_agents.sql",
    "scripts\013_agent_prompts.sql",
    "training\seed-cases-all.sql",
    "training\seed-cases-tillit.sql"
)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  MAVO.AI — Aplicando scripts SQL" -ForegroundColor Cyan
Write-Host "  Banco: postgresql://$USER_DB@$HOST_DB`:$PORT_DB/$DB_NAME" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Localizar psql ──────────────────────────────────────────
$psql = $null

# 1) No PATH
$psql = (Get-Command psql -ErrorAction SilentlyContinue)?.Source

# 2) Docker exec (fallback quando psql nao esta no PATH)
$useDocker = $false
if (-not $psql) {
    Write-Host "psql nao encontrado no PATH — tentando via Docker..." -ForegroundColor Yellow
    $containers = docker ps --format "{{.Names}} {{.Image}}" 2>$null |
                  Where-Object { $_ -match "postgres" }
    if ($containers) {
        $containerName = ($containers -split " ")[0]
        Write-Host "Usando container Docker: $containerName" -ForegroundColor Yellow
        $useDocker = $true
    } else {
        Write-Host ""
        Write-Host "ERRO: psql nao encontrado e nenhum container Postgres ativo." -ForegroundColor Red
        Write-Host ""
        Write-Host "Solucoes:" -ForegroundColor Yellow
        Write-Host "  1) Instale psql: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
        Write-Host "     (selecione Command Line Tools durante a instalacao)" -ForegroundColor Yellow
        Write-Host "  2) OU adicione ao PATH: C:\Program Files\PostgreSQL\<versao>\bin" -ForegroundColor Yellow
        Write-Host "  3) OU certifique-se que o container Docker esta rodando." -ForegroundColor Yellow
        Write-Host ""
        Read-Host "Pressione Enter para sair"
        exit 1
    }
}

# ── Funcao para rodar um script SQL ─────────────────────────
function Run-SQL {
    param([string]$scriptPath)

    $absPath = Join-Path (Get-Location) $scriptPath

    if (-not (Test-Path $absPath)) {
        Write-Host "  [SKIP] Arquivo nao encontrado: $scriptPath" -ForegroundColor DarkYellow
        return
    }

    Write-Host "  Aplicando: $scriptPath ..." -ForegroundColor White

    $env:PGPASSWORD = $PASS_DB

    if ($useDocker) {
        # Copia o arquivo para dentro do container e executa
        $tmpName = [System.IO.Path]::GetFileName($absPath)
        docker cp $absPath "${containerName}:/tmp/${tmpName}" | Out-Null
        $output = docker exec -e PGPASSWORD=$PASS_DB $containerName `
            psql -h localhost -p 5432 -U $USER_DB -d $DB_NAME -f "/tmp/${tmpName}" 2>&1
    } else {
        $output = & $psql `
            -h $HOST_DB -p $PORT_DB -U $USER_DB -d $DB_NAME `
            -f $absPath 2>&1
    }

    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        Write-Host "  [ERRO] $scriptPath falhou (exit $exitCode)" -ForegroundColor Red
        Write-Host $output -ForegroundColor DarkRed
    } else {
        # Mostra apenas linhas relevantes (CREATE, INSERT, UPDATE, erros)
        $relevant = $output | Where-Object {
            $_ -match "^(CREATE|INSERT|UPDATE|ALTER|DROP|ERROR|ERRO|WARNING|AVISO|DO)"
        }
        if ($relevant) {
            $relevant | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
        }
        Write-Host "  [OK] $scriptPath" -ForegroundColor Green
    }
}

# ── Aplicar scripts em ordem ────────────────────────────────
$start = Get-Date

foreach ($script in $scripts) {
    Run-SQL $script
}

# ── Verificacao final ────────────────────────────────────────
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VERIFICACAO: specialist_agents (tenant auge)" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

$verifySQL = "SELECT domain, name, length(system_prompt) as chars FROM public.specialist_agents WHERE tenant_id = 'auge' ORDER BY domain;"

$env:PGPASSWORD = $PASS_DB

if ($useDocker) {
    $result = docker exec -e PGPASSWORD=$PASS_DB $containerName `
        psql -h localhost -p 5432 -U $USER_DB -d $DB_NAME -c $verifySQL 2>&1
} else {
    $result = & $psql `
        -h $HOST_DB -p $PORT_DB -U $USER_DB -d $DB_NAME `
        -c $verifySQL 2>&1
}

Write-Host $result -ForegroundColor White

# ── Contagem de casos de treinamento ────────────────────────
Write-Host ""
Write-Host "  Casos de treinamento inseridos:" -ForegroundColor Cyan

$countSQL = "SELECT canal, COUNT(*) as total FROM public.atendimentos WHERE canal IN ('seed_training','seed_tillit') GROUP BY canal ORDER BY canal;"

if ($useDocker) {
    $countResult = docker exec -e PGPASSWORD=$PASS_DB $containerName `
        psql -h localhost -p 5432 -U $USER_DB -d $DB_NAME -c $countSQL 2>&1
} else {
    $countResult = & $psql `
        -h $HOST_DB -p $PORT_DB -U $USER_DB -d $DB_NAME `
        -c $countSQL 2>&1
}

Write-Host $countResult -ForegroundColor White

$elapsed = (Get-Date) - $start
Write-Host ""
Write-Host "Concluido em $([math]::Round($elapsed.TotalSeconds, 1))s" -ForegroundColor Green
Write-Host ""
Read-Host "Pressione Enter para fechar"

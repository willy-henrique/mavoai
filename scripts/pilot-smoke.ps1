param(
  [string]$BaseUrl = "http://127.0.0.1:3100"
)

$ErrorActionPreference = "Stop"

Write-Host "== Pilot Smoke Test ==" -ForegroundColor Cyan
Write-Host "Base URL: $BaseUrl"

function Test-Endpoint($name, $scriptBlock) {
  try {
    $res = & $scriptBlock
    Write-Host "[OK] $name" -ForegroundColor Green
    return $res
  } catch {
    Write-Host "[FAIL] $name -> $($_.Exception.Message)" -ForegroundColor Red
    throw
  }
}

Test-Endpoint "health" {
  Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/health" | Out-Null
}

Test-Endpoint "metricas" {
  Invoke-RestMethod -Method GET -Uri "$BaseUrl/api/metricas" | Out-Null
}

Test-Endpoint "busca-semantica" {
  Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/busca-semantica" -ContentType "application/json" -Body '{"texto":"teste problema"}' | Out-Null
}

Test-Endpoint "resposta-assistida-debug" {
  Invoke-RestMethod -Method POST -Uri "$BaseUrl/api/resposta-assistida?debug=true" -ContentType "application/json" -Body '{"texto":"teste problema"}' | Out-Null
}

Write-Host "Smoke tests concluídos." -ForegroundColor Cyan


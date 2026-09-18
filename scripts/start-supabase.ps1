$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

if (-not (Test-Path "backend\.env")) { Copy-Item "backend\.env.example" "backend\.env" }
if (-not (Test-Path "frontend\.env")) { Copy-Item "frontend\.env.example" "frontend\.env" }

Write-Host "=== نظام رحلات السائقين — تشغيل محلي ===" -ForegroundColor Cyan
Write-Host "Backend يحتاج Supabase DATABASE_URL في backend\.env" -ForegroundColor Yellow

if (-not (Test-Path "backend\.venv\Scripts\python.exe")) {
    py -3.13 -m venv backend\.venv
}

& backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt

Write-Host ""
Write-Host "شغل Backend في نافذة: .\backend\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000" -ForegroundColor Green
Write-Host "وشغل Frontend في نافذة أخرى: cd frontend; npm run dev" -ForegroundColor Green

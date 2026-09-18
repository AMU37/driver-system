$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host '=== إعداد نظام رحلات السائقين مع Supabase ===' -ForegroundColor Cyan

if (!(Test-Path 'backend\.env')) {
  Copy-Item 'backend\.env.example' 'backend\.env'
  Write-Host 'تم إنشاء backend\.env — ضع DATABASE_URL من Supabase.' -ForegroundColor Yellow
}

if (!(Test-Path 'frontend\.env')) {
  Copy-Item 'frontend\.env.example' 'frontend\.env'
}

if (!(Test-Path 'backend\.venv')) {
  py -3.13 -m venv 'backend\.venv'
}

& 'backend\.venv\Scripts\python.exe' -m pip install -r 'backend\requirements.txt'
Set-Location 'frontend'
npm install
Set-Location $projectRoot

Write-Host ''
Write-Host 'اكتمل إعداد Python وNode.' -ForegroundColor Green
Write-Host 'عدّل backend\.env ثم شغل Backend وFrontend.' -ForegroundColor Yellow

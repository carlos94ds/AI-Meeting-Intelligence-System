# Eén commando om alles te installeren (eerste keer) en te starten (Windows PowerShell).
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path node_modules) -or -not (Test-Path frontend/node_modules) -or -not (Test-Path backend/.venv)) {
  npm run setup
}
npm run dev

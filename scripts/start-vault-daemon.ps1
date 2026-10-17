# Personal Encrypted Remote Vault - Daemon Launcher
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Personal Encrypted Remote Vault - Server Daemon" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location $WorkspaceRoot

# Check node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Node.js is not found in PATH. Please install Node.js (v20+)." -ForegroundColor Red
    pause
    exit 1
}

Write-Host "[1/2] Verifying build artifacts..." -ForegroundColor Yellow
npm run build --workspace=@personal-vault/server

Write-Host "[2/2] Launching Vault Daemon on 127.0.0.1:8743..." -ForegroundColor Green
node packages/server/dist/index.js

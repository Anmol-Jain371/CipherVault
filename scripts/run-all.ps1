# Personal Encrypted Remote Vault - Complete Stack Orchestrator
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Starting Personal Remote Vault Services (Daemon + Tunnel)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$ScriptDir = $PSScriptRoot

Write-Host "1. Launching Vault Server Daemon in separate window..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-File", "$ScriptDir\start-vault-daemon.ps1"

Start-Sleep -Seconds 2

Write-Host "2. Launching Cloudflare Quick Tunnel in separate window..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-File", "$ScriptDir\start-cloudflare-tunnel.ps1"

Write-Host ""
Write-Host "Both processes are now running in their respective windows." -ForegroundColor Cyan
Write-Host "1. Look at the Cloudflare window for your https://*.trycloudflare.com URL" -ForegroundColor Yellow
Write-Host "2. Set that URL in your College VS Code setting: personalVault.serverUrl" -ForegroundColor Yellow
Write-Host "3. In VS Code, run: 'Personal Vault: Connect & Unlock Vault'" -ForegroundColor Yellow

# Personal Encrypted Remote Vault - Cloudflare Quick Tunnel Launcher
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Cloudflare Quick Tunnel (Free Outbound HTTPS Proxy)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check if cloudflared is installed or available in common paths
$CloudflaredPath = $null
$CloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue

if ($CloudflaredCmd) {
    $CloudflaredPath = $CloudflaredCmd.Source
} elseif (Test-Path "C:\Program Files (x86)\cloudflared\cloudflared.exe") {
    $CloudflaredPath = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
    $CloudflaredPath = "C:\Program Files\cloudflared\cloudflared.exe"
}

if (-not $CloudflaredPath) {
    Write-Host "[!] cloudflared executable was not found." -ForegroundColor Yellow
    Write-Host "    You can install it instantly for free via Windows Package Manager:" -ForegroundColor White
    Write-Host "    winget install --id Cloudflare.cloudflared -e" -ForegroundColor Green
    exit 1
}

Write-Host ""
Write-Host "[*] Starting Cloudflare Quick Tunnel to local vault (http://127.0.0.1:8743)..." -ForegroundColor Green
Write-Host "[*] Look for your public HTTPS URL below (*.trycloudflare.com)" -ForegroundColor Yellow
Write-Host "[*] Copy that URL into your College VS Code setting: 'personalVault.serverUrl'" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

& $CloudflaredPath tunnel --url http://127.0.0.1:8743

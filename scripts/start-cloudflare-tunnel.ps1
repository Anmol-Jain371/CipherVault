# Personal Encrypted Remote Vault - Cloudflare Quick Tunnel Launcher
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Cloudflare Quick Tunnel (Free Outbound HTTPS Proxy)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Check if cloudflared is installed
$CloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue

if (-not $CloudflaredCmd) {
    Write-Host "[!] cloudflared executable was not found in your PATH." -ForegroundColor Yellow
    Write-Host "    You can install it instantly for free via Windows Package Manager:" -ForegroundColor White
    Write-Host "    winget install --id Cloudflare.cloudflared -e" -ForegroundColor Green
    Write-Host ""
    Write-Host "    Or download the standalone executable from:" -ForegroundColor White
    Write-Host "    https://github.com/cloudflare/cloudflared/releases/latest" -ForegroundColor Cyan
    Write-Host ""
    $installChoice = Read-Host "Would you like to install cloudflared now via winget? (y/n)"
    if ($installChoice -eq 'y' -or $installChoice -eq 'Y') {
        winget install --id Cloudflare.cloudflared -e
        $CloudflaredCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
    } else {
        exit 1
    }
}

Write-Host ""
Write-Host "[*] Starting Cloudflare Quick Tunnel to local vault (http://127.0.0.1:8743)..." -ForegroundColor Green
Write-Host "[*] Look for your public HTTPS URL below (*.trycloudflare.com)" -ForegroundColor Yellow
Write-Host "[*] Copy that URL into your College VS Code setting: 'personalVault.serverUrl'" -ForegroundColor Cyan
Write-Host "----------------------------------------------------------" -ForegroundColor DarkGray

cloudflared tunnel --url http://127.0.0.1:8743

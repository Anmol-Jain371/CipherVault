@echo off
title Cloudflare Quick Tunnel
echo ==========================================================
echo   Cloudflare Quick Tunnel (Free Outbound HTTPS Proxy)
echo ==========================================================

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    echo [!] cloudflared executable not found in PATH.
    echo     Install via winget: winget install --id Cloudflare.cloudflared -e
    echo     Or download from: https://github.com/cloudflare/cloudflared/releases/latest
    pause
    exit /b 1
)

echo [*] Launching Cloudflare Quick Tunnel to http://127.0.0.1:8743...
echo [*] Copy the generated https://*.trycloudflare.com URL into VS Code settings.
echo ----------------------------------------------------------
cloudflared tunnel --url http://127.0.0.1:8743
pause

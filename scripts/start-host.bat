@echo off
title CipherVault - Host Launch Control
cd /d "%~dp0.."
echo ==========================================================
echo   CipherVault - Launching Host Daemon & Cloudflare Tunnel
echo ==========================================================
echo.
start "CipherVault Daemon" cmd /k "scripts\start-vault-daemon.bat"
timeout /t 2 /nobreak >nul
start "CipherVault Tunnel" cmd /k "scripts\start-cloudflare-tunnel.bat"
echo.
echo ==========================================================
echo  [SUCCESS] Both Daemon and Tunnel launched in background!
echo ==========================================================
echo  1. The Daemon encrypts and serves your files.
echo  2. The Tunnel gives you the https://*.trycloudflare.com URL.
echo  Keep both windows running while you are at college!
echo ==========================================================
echo.
pause

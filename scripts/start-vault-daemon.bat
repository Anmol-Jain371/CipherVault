@echo off
title Personal Vault Server Daemon
echo ==========================================================
echo   Personal Encrypted Remote Vault - Server Daemon
echo ==========================================================

cd /d "%~dp0.."

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH.
    pause
    exit /b 1
)

echo [1/2] Compiling daemon...
call npm run build:server

echo [2/2] Starting daemon on 127.0.0.1:8743...
node packages/server/dist/index.js
pause

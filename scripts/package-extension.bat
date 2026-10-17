@echo off
title Package VS Code Extension
echo ==========================================================
echo   Packaging Personal Vault VS Code Extension (.vsix)
echo ==========================================================

cd /d "%~dp0..\packages\extension"

echo Packaging extension bundle...
call npx -y @vscode/vsce package --no-dependencies --allow-missing-repository

echo.
echo ==========================================================
echo Extension bundle ready:
dir *.vsix
echo ==========================================================
pause

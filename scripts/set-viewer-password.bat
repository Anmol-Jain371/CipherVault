@echo off
title CipherVault - Configure College Lab Viewer Password
cd /d "%~dp0.."
node scripts/local-vault-ops.mjs set-viewer-password %*
pause

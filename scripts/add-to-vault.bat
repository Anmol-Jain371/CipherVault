@echo off
title CipherVault - Ingest File or Folder
cd /d "%~dp0.."
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0add-to-vault.ps1" "%~1"
pause

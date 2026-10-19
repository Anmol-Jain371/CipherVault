# Personal Encrypted Remote Vault - Local Operations Tool (Home Host Only)
# Safely import or export files directly on the home machine without network exposure.
param (
    [Parameter(Mandatory=$false, Position=0)]
    [ValidateSet('init', 'import', 'export', 'list', 'set-viewer-password')]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$Source,

    [Parameter(Mandatory=$false)]
    [Alias('VaultPath', 'Dest')]
    [string]$Destination,

    [Parameter(Mandatory=$false)]
    [string]$Path,

    [Parameter(Mandatory=$false)]
    [string]$ViewerPassword,

    [Parameter(Mandatory=$false)]
    [switch]$Overwrite
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  CipherVault - Local Host Tool (Host / Dominator Ops)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location $WorkspaceRoot

if (-not $Action) {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action init" -ForegroundColor White
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action import -Source <fileOrDir> [-Destination <vaultPath>] [-Overwrite]" -ForegroundColor White
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action export -Source <vaultPath> -Destination <localPath>" -ForegroundColor White
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action list [-Path <vaultPath>]" -ForegroundColor White
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action set-viewer-password [-ViewerPassword <password>]" -ForegroundColor White
    exit 0
}

$cliArgs = @("scripts/local-vault-ops.mjs", $Action)
if ($Source) { $cliArgs += @("--source", $Source) }
if ($Destination) { $cliArgs += @("--dest", $Destination) }
if ($Path) { $cliArgs += @("--path", $Path) }
if ($ViewerPassword) { $cliArgs += @("--viewerPassword", $ViewerPassword) }
if ($Overwrite) { $cliArgs += "--overwrite" }

node @cliArgs

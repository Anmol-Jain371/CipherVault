# Personal Encrypted Remote Vault - Local Operations Tool (Home Host Only)
# Safely import or export files directly on the home machine without network exposure.
param (
    [Parameter(Mandatory=$false, Position=0)]
    [ValidateSet('init', 'import', 'export', 'list')]
    [string]$Action,

    [Parameter(Mandatory=$false)]
    [string]$Source,

    [Parameter(Mandatory=$false)]
    [string]$Destination,

    [Parameter(Mandatory=$false)]
    [string]$Path,

    [Parameter(Mandatory=$false)]
    [switch]$Overwrite
)

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Personal Vault - Local Host Tool (Secure Offline Ops)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location $WorkspaceRoot

if (-not $Action) {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action init" -ForegroundColor White
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action import -Source <fileOrDir> [-Destination <vaultPath>] [-Overwrite]" -ForegroundColor White
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action export -Source <vaultPath> -Destination <localPath>" -ForegroundColor White
    Write-Host "  .\scripts\local-vault-ops.ps1 -Action list [-Path <vaultPath>]" -ForegroundColor White
    exit 0
}

$cliArgs = @("scripts/local-vault-ops.mjs", $Action)
if ($Source) { $cliArgs += @("--source", $Source) }
if ($Destination) { $cliArgs += @("--dest", $Destination) }
if ($Path) { $cliArgs += @("--path", $Path) }
if ($Overwrite) { $cliArgs += "--overwrite" }

node @cliArgs

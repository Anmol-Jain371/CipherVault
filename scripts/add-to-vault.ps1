param (
    [Parameter(Position=0)]
    [string]$Source,

    [Parameter(Mandatory=$false)]
    [string]$Destination,

    [Parameter(Mandatory=$false)]
    [switch]$Overwrite
)

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
Set-Location $WorkspaceRoot

# If no path passed, show a Windows File Picker dialog
if (-not $Source) {
    Add-Type -AssemblyName System.Windows.Forms
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  CipherVault - File / Folder Ingestion Picker" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "1. Press 1 for a single File" -ForegroundColor Yellow
    Write-Host "2. Press 2 for an entire Folder" -ForegroundColor Yellow
    $choice = Read-Host "Choose option (1 or 2, default is 1)"

    if ($choice -eq "2") {
        $folderDialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $folderDialog.Description = "Select a Folder to Ingest into CipherVault"
        if ($folderDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $Source = $folderDialog.SelectedPath
        } else {
            Write-Host "Cancelled." -ForegroundColor Yellow
            exit 0
        }
    } else {
        $fileDialog = New-Object System.Windows.Forms.OpenFileDialog
        $fileDialog.Title = "Select a File to Ingest into CipherVault"
        $fileDialog.InitialDirectory = [Environment]::GetFolderPath("Desktop")
        if ($fileDialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
            $Source = $fileDialog.FileName
        } else {
            Write-Host "Cancelled." -ForegroundColor Yellow
            exit 0
        }
    }
}

if (-not (Test-Path $Source)) {
    Write-Host "[ERROR] Path does not exist: $Source" -ForegroundColor Red
    pause
    exit 1
}

$Item = Get-Item $Source
if (-not $Destination) {
    $Destination = "/" + $Item.Name
}

Write-Host ""
Write-Host "Ready to Ingest:" -ForegroundColor Green
Write-Host "  Source:      $Source" -ForegroundColor White
Write-Host "  Destination: $Destination" -ForegroundColor White
Write-Host ""

$cliArgs = @("scripts/local-vault-ops.mjs", "import", "--source", $Source, "--dest", $Destination, "--overwrite")
node @cliArgs

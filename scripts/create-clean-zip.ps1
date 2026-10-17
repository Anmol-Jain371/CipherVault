# Script to create a pristine source zip archive without any node_modules or build artifacts
$rootDir = "C:\Users\anmol\.gemini\antigravity-ide\scratch\personal-vault"
$zipPath = "C:\Users\anmol\.gemini\antigravity-ide\scratch\personal-vault-source.zip"
$tempDir = "C:\Users\anmol\.gemini\antigravity-ide\scratch\vault-clean-export"

if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

New-Item -ItemType Directory -Path $tempDir | Out-Null

# Copy root files
Copy-Item "$rootDir\package.json" "$tempDir\"
Copy-Item "$rootDir\tsconfig.base.json" "$tempDir\"
Copy-Item "$rootDir\README.md" "$tempDir\"
Copy-Item "$rootDir\.gitignore" "$tempDir\"
Copy-Item "$rootDir\.editorconfig" "$tempDir\"

# Copy docs
Copy-Item "$rootDir\docs" "$tempDir\docs" -Recurse

# Copy scripts
Copy-Item "$rootDir\scripts" "$tempDir\scripts" -Recurse

# Copy packages selectively
$packages = @('shared', 'server', 'extension')
foreach ($pkg in $packages) {
    $srcPkg = "$rootDir\packages\$pkg"
    $dstPkg = "$tempDir\packages\$pkg"
    New-Item -ItemType Directory -Path $dstPkg | Out-Null
    
    Copy-Item "$srcPkg\package.json" "$dstPkg\"
    Copy-Item "$srcPkg\tsconfig.json" "$dstPkg\"
    if (Test-Path "$srcPkg\.env.example") { Copy-Item "$srcPkg\.env.example" "$dstPkg\" }
    if (Test-Path "$srcPkg\.vscodeignore") { Copy-Item "$srcPkg\.vscodeignore" "$dstPkg\" }
    if (Test-Path "$srcPkg\resources") { Copy-Item "$srcPkg\resources" "$dstPkg\resources" -Recurse }
    
    Copy-Item "$srcPkg\src" "$dstPkg\src" -Recurse
    Copy-Item "$srcPkg\test" "$dstPkg\test" -Recurse
}

# Compress
Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -Force
Copy-Item $zipPath "C:\Users\anmol\.gemini\antigravity-ide\brain\44f0c700-1f39-4ceb-a55d-1650434a5f5c\personal-vault-source.zip" -Force

Remove-Item $tempDir -Recurse -Force

$item = Get-Item $zipPath
Write-Host "Pristine source zip created: $($item.FullName) ($([math]::Round($item.Length / 1KB, 2)) KB)" -ForegroundColor Green

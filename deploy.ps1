$ErrorActionPreference = 'Stop'

$atualizador = Join-Path $PSScriptRoot 'update-windows.ps1'
if (-not (Test-Path -LiteralPath $atualizador)) {
    throw "Atualizador nao encontrado: $atualizador"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $atualizador
exit $LASTEXITCODE

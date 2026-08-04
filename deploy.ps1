$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$atualizador = Join-Path $PSScriptRoot 'update-windows.ps1'
if (-not (Test-Path -LiteralPath $atualizador -PathType Leaf)) {
    throw "Atualizador nao encontrado: $atualizador"
}

# O atualizador consulta e valida origin/main em uma area isolada antes de
# interromper os processos. Ele tambem restaura commit e dependencias se a
# nova versao nao responder ao /ready.
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $atualizador `
    -ProcessosParaManterParados 'julian-amplaytv' `
    -GerarPacoteCliente
exit $LASTEXITCODE

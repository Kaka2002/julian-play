$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $git) {
    throw 'git.exe nao encontrado no PATH.'
}

& $git.Source pull --ff-only
if ($LASTEXITCODE -ne 0) {
    throw "git pull terminou com codigo $LASTEXITCODE."
}

$atualizador = Join-Path $PSScriptRoot 'update-windows.ps1'
if (-not (Test-Path -LiteralPath $atualizador)) {
    throw "Atualizador nao encontrado: $atualizador"
}

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $atualizador -PularGit
exit $LASTEXITCODE

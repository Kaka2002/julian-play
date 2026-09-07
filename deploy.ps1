$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# Falha antes de qualquer preparação ou troca de versão quando o terminal não
# consegue controlar o mesmo daemon PM2 usado pela produção. Isso evita um
# deploy aplicado parcialmente com mensagem final ambígua.
$env:PM2_HOME = Join-Path $env:USERPROFILE '.pm2'
$pm2 = Get-Command 'pm2.cmd' -ErrorAction SilentlyContinue
if (-not $pm2) {
    throw 'pm2.cmd não foi encontrado. Instale/configure o PM2 antes do deploy.'
}
& $pm2.Source jlist --silent *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Não foi possível controlar o PM2. Abra o PowerShell como Administrador e execute novamente o deploy.'
}

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

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $git) {
    throw 'git.exe nao encontrado no PATH.'
}

$commitAntesAtualizacao = (& $git.Source rev-parse HEAD).Trim()

& $git.Source pull --ff-only
if ($LASTEXITCODE -ne 0) {
    throw "git pull terminou com codigo $LASTEXITCODE."
}

$commitDepoisAtualizacao = (& $git.Source rev-parse HEAD).Trim()
$arquivosDependencia = @()
if ($commitAntesAtualizacao -and $commitDepoisAtualizacao) {
    $arquivosDependencia = @(& $git.Source diff --name-only $commitAntesAtualizacao $commitDepoisAtualizacao -- package.json package-lock.json)
}

$atualizador = Join-Path $PSScriptRoot 'update-windows.ps1'
if (-not (Test-Path -LiteralPath $atualizador)) {
    throw "Atualizador nao encontrado: $atualizador"
}

$argumentosAtualizador = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $atualizador, '-PularGit')
if ($arquivosDependencia.Count -eq 0) {
    $argumentosAtualizador += '-PularDependencias'
}

& powershell.exe @argumentosAtualizador
exit $LASTEXITCODE

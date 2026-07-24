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
    $arquivosDeploy = @(& $git.Source diff --name-only $commitAntesAtualizacao $commitDepoisAtualizacao -- deploy.ps1 update-windows.ps1)
    if ($arquivosDeploy.Count -gt 0 -and $env:JULIAN_DEPLOY_REEXECUTADO -ne '1') {
        $env:JULIAN_DEPLOY_REEXECUTADO = '1'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath
        exit $LASTEXITCODE
    }
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
$codigoAtualizacao = $LASTEXITCODE
if ($codigoAtualizacao -ne 0) {
    exit $codigoAtualizacao
}

$geradorPacote = Join-Path $PSScriptRoot 'entrega-cliente-local\USO_INTERNO_NAO_ENVIAR\GERAR-ARTEFATOS-ENTREGA.ps1'
if (-not (Test-Path -LiteralPath $geradorPacote)) {
    throw "Gerador do pacote de instalacao local nao encontrado: $geradorPacote"
}

Write-Host "`n==> Atualizando os arquivos de entrega ao cliente" -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $geradorPacote -Retencao 5
if ($LASTEXITCODE -ne 0) {
    throw "A geracao do pacote de instalacao terminou com codigo $LASTEXITCODE."
}

exit 0

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

$git = Get-Command git.exe -ErrorAction SilentlyContinue
if (-not $git) {
    throw 'git.exe nao encontrado no PATH.'
}

$commitAntesAtualizacao = (& $git.Source rev-parse HEAD).Trim()

# Versoes antigas podiam executar npm install antes de package-lock.json ser
# versionado. Preserve esse artefato gerado antes do primeiro pull que passa a
# rastrear o arquivo, evitando bloquear o deploy sem tocar em dados persistentes.
& $git.Source fetch origin main
if ($LASTEXITCODE -ne 0) {
    throw "git fetch terminou com codigo $LASTEXITCODE."
}

$packageLock = Join-Path $PSScriptRoot 'package-lock.json'
& $git.Source ls-files --error-unmatch -- package-lock.json 2>$null | Out-Null
$packageLockRastreadoLocal = $LASTEXITCODE -eq 0
& $git.Source cat-file -e origin/main:package-lock.json 2>$null
$packageLockExisteNoRemoto = $LASTEXITCODE -eq 0
if ((Test-Path -LiteralPath $packageLock) -and -not $packageLockRastreadoLocal -and $packageLockExisteNoRemoto) {
    $pastaRecuperacao = Join-Path $PSScriptRoot 'backups\deploy-recovery'
    New-Item -ItemType Directory -Path $pastaRecuperacao -Force | Out-Null
    $sufixo = Get-Date -Format 'yyyyMMdd-HHmmss'
    $destinoRecuperacao = Join-Path $pastaRecuperacao "package-lock.prepull-$sufixo.json"
    Move-Item -LiteralPath $packageLock -Destination $destinoRecuperacao
    Write-Host "package-lock.json legado preservado em $destinoRecuperacao"
}

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
$argumentosAtualizador += @('-ProcessosParaManterParados', 'julian-amplaytv', '-GerarPacoteCliente')
if ($arquivosDependencia.Count -eq 0) {
    $argumentosAtualizador += '-PularDependencias'
}

& powershell.exe @argumentosAtualizador
$codigoAtualizacao = $LASTEXITCODE
if ($codigoAtualizacao -ne 0) {
    exit $codigoAtualizacao
}

exit 0

$ErrorActionPreference = 'Stop'

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if (-not $pm2) {
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
}

if (-not $pm2) {
    throw 'PM2 nao foi encontrado no PATH deste usuario.'
}

$env:PM2_HOME = Join-Path $env:USERPROFILE '.pm2'
& $pm2.Source resurrect

if ($LASTEXITCODE -ne 0) {
    throw "PM2 resurrect terminou com codigo $LASTEXITCODE."
}

function TestarProcessoPm2Online {
    param([Parameter(Mandatory = $true)][string]$Nome)

    $pids = @(& $pm2.Source pid $Nome 2>$null)
    if ($LASTEXITCODE -ne 0) {
        return $false
    }

    foreach ($linha in $pids) {
        $pidEncontrado = 0
        if ([int]::TryParse(([string]$linha).Trim(), [ref]$pidEncontrado) -and $pidEncontrado -gt 0) {
            return $true
        }
    }

    return $false
}

function IniciarProcessoPm2SeNecessario {
    param(
        [Parameter(Mandatory = $true)][string]$Nome,
        [Parameter(Mandatory = $true)][string]$ArquivoEcossistema
    )

    if (TestarProcessoPm2Online -Nome $Nome) {
        return $false
    }

    if (-not (Test-Path -LiteralPath $ArquivoEcossistema -PathType Leaf)) {
        throw "Arquivo de configuracao PM2 ausente: $ArquivoEcossistema"
    }

    & $pm2.Source start $ArquivoEcossistema --only $Nome --update-env
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel iniciar o processo PM2 $Nome. Codigo $LASTEXITCODE."
    }

    return $true
}

$configuracaoInstalacao = Join-Path $PSScriptRoot '.julian-play-install.json'
$ecossistemaPainel = Join-Path $PSScriptRoot 'ecosystem.config.js'
$alterouLista = $false

if (Test-Path -LiteralPath $configuracaoInstalacao -PathType Leaf) {
    $instalacao = Get-Content -LiteralPath $configuracaoInstalacao -Raw | ConvertFrom-Json
    $nomePainel = ([string]$instalacao.appName).Trim()

    if ($nomePainel) {
        if (IniciarProcessoPm2SeNecessario -Nome $nomePainel -ArquivoEcossistema $ecossistemaPainel) {
            $alterouLista = $true
        }
    }

    if ($nomePainel -eq 'julian-play-admin') {
        $configuracaoMaster = Join-Path $PSScriptRoot '.julian-master-install.json'
        $ecossistemaMaster = Join-Path $PSScriptRoot 'master\ecosystem.config.js'

        if (Test-Path -LiteralPath $configuracaoMaster -PathType Leaf) {
            $master = Get-Content -LiteralPath $configuracaoMaster -Raw | ConvertFrom-Json
            $nomeMaster = ([string]$master.appName).Trim()
            if (-not $nomeMaster) {
                $nomeMaster = 'julian-master'
            }

            if (IniciarProcessoPm2SeNecessario -Nome $nomeMaster -ArquivoEcossistema $ecossistemaMaster) {
                $alterouLista = $true
            }
        }
    }
}

if ($alterouLista) {
    & $pm2.Source save --force
    if ($LASTEXITCODE -ne 0) {
        throw "PM2 save terminou com codigo $LASTEXITCODE."
    }
}

$ErrorActionPreference = 'Stop'

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if (-not $pm2) {
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
}

if (-not $pm2) {
    throw 'PM2 nao foi encontrado no PATH deste usuario.'
}

$env:PM2_HOME = Join-Path $env:USERPROFILE '.pm2'

# Quando o Windows acabou de ligar, aguarda a rede e os servicos basicos antes
# de abrir os Chromes invisiveis do WhatsApp. Isso preserva a sessao existente
# e reduz a chance de o cliente ficar preso em "Aguardando QR Code" no boot.
try {
    $iniciadoEm = (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
    $segundosDesdeBoot = [int][Math]::Floor(((Get-Date) - $iniciadoEm).TotalSeconds)
    $esperaInicial = [Math]::Max(0, 25 - $segundosDesdeBoot)
    if ($esperaInicial -gt 0) {
        Write-Output "Aguardando $esperaInicial segundo(s) apos o boot antes de iniciar o PM2."
        Start-Sleep -Seconds $esperaInicial
    }
} catch {
    Write-Warning "Nao foi possivel verificar o tempo desde o boot: $($_.Exception.Message)"
}

& $pm2.Source resurrect

if ($LASTEXITCODE -ne 0) {
    throw "PM2 resurrect terminou com codigo $LASTEXITCODE."
}

function RecriarProcessoPm2ComConfiguracaoRegistrada {
    param(
        [Parameter(Mandatory = $true)][string]$Nome,
        [Parameter(Mandatory = $true)][string]$ArquivoEcossistema
    )

    if (-not (Test-Path -LiteralPath $ArquivoEcossistema -PathType Leaf)) {
        throw "Arquivo de configuracao PM2 ausente: $ArquivoEcossistema"
    }

    # O resurrect recupera tambem as variaveis de ambiente antigas. Recriar os
    # processos registrados evita que DATA_DIR de outra instalacao seja usado.
    & $pm2.Source delete $Nome 2>$null
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
        if (RecriarProcessoPm2ComConfiguracaoRegistrada -Nome $nomePainel -ArquivoEcossistema $ecossistemaPainel) {
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

            if (RecriarProcessoPm2ComConfiguracaoRegistrada -Nome $nomeMaster -ArquivoEcossistema $ecossistemaMaster) {
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

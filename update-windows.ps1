param(
    [string]$NomeProcesso = 'julian-play',
    [string]$PastaDados = '',
    [switch]$PularGit
)

$ErrorActionPreference = 'Stop'
$diretorioProjeto = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $diretorioProjeto

$arquivoInstalacao = Join-Path $diretorioProjeto '.julian-play-install.json'
if (Test-Path -LiteralPath $arquivoInstalacao) {
    try {
        $configInstalacao = Get-Content -LiteralPath $arquivoInstalacao -Raw | ConvertFrom-Json
        if (-not $PSBoundParameters.ContainsKey('NomeProcesso') -and $configInstalacao.appName) {
            $NomeProcesso = [string]$configInstalacao.appName
        }
        if (-not $PSBoundParameters.ContainsKey('PastaDados') -and $configInstalacao.dataDir) {
            $PastaDados = [string]$configInstalacao.dataDir
        }
    } catch {
        throw "O arquivo .julian-play-install.json esta invalido: $($_.Exception.Message)"
    }
}

function Etapa([string]$mensagem) {
    Write-Host "`n==> $mensagem" -ForegroundColor Cyan
}

function ExigirComando([string]$nome) {
    $comando = Get-Command $nome -ErrorAction SilentlyContinue
    if (-not $comando) {
        throw "$nome nao foi encontrado no PATH."
    }
    return $comando
}

if (-not $PastaDados) {
    $PastaDados = if ($env:JULIAN_PLAY_DATA_DIR) { $env:JULIAN_PLAY_DATA_DIR } else { $diretorioProjeto }
}
$PastaDados = [IO.Path]::GetFullPath($PastaDados)

$npm = ExigirComando 'npm.cmd'
$pm2 = ExigirComando 'pm2.cmd'
$git = $null
if (-not $PularGit) {
    $git = ExigirComando 'git.exe'
    $alteracoes = & $git.Source status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel verificar o repositorio Git.'
    }
    if ($alteracoes) {
        throw 'Existem alteracoes locais no codigo. Salve-as no Git antes de atualizar para evitar perda.'
    }
}

Etapa 'Parando o aplicativo com seguranca'
& $pm2.Source stop $NomeProcesso
if ($LASTEXITCODE -ne 0) {
    Write-Warning 'O processo nao estava cadastrado no PM2; a atualizacao continuara.'
}
Start-Sleep -Seconds 4

try {
    Etapa 'Criando backup antes da atualizacao'
    $banco = Join-Path $PastaDados 'clientes.db'
    if (Test-Path -LiteralPath $banco) {
        $pastaBackup = Join-Path $PastaDados 'backups'
        New-Item -ItemType Directory -Path $pastaBackup -Force | Out-Null
        $destino = Join-Path $pastaBackup ("antes-atualizar-{0}.db" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
        Copy-Item -LiteralPath $banco -Destination $destino -Force
        Write-Host "Backup criado: $destino" -ForegroundColor Green
    } else {
        Write-Warning 'Banco clientes.db nao encontrado na pasta de dados informada.'
    }

    if (-not $PularGit) {
        Etapa 'Baixando a versao publicada no GitHub'
        & $git.Source pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            throw "git pull terminou com codigo $LASTEXITCODE."
        }
    }

    Etapa 'Atualizando dependencias'
    & $npm.Source ci --omit=dev
    if ($LASTEXITCODE -ne 0) {
        throw "npm ci terminou com codigo $LASTEXITCODE."
    }

    Etapa 'Validando arquivos principais'
    & node --check bot.js
    if ($LASTEXITCODE -ne 0) { throw 'bot.js possui erro de sintaxe.' }
    & node --check ecosystem.config.js
    if ($LASTEXITCODE -ne 0) { throw 'ecosystem.config.js possui erro de sintaxe.' }

    $env:JULIAN_PLAY_APP_NAME = $NomeProcesso
    $env:JULIAN_PLAY_DATA_DIR = $PastaDados

    Etapa 'Iniciando a versao atualizada'
    & $pm2.Source startOrReload (Join-Path $diretorioProjeto 'ecosystem.config.js') --only $NomeProcesso --update-env
    if ($LASTEXITCODE -ne 0) {
        throw "PM2 startOrReload terminou com codigo $LASTEXITCODE."
    }
    & $pm2.Source save --force
    if ($LASTEXITCODE -ne 0) {
        throw "PM2 save terminou com codigo $LASTEXITCODE."
    }

    & $pm2.Source status
    Write-Host '`nAtualizacao concluida com sucesso.' -ForegroundColor Green
} catch {
    Write-Error $_
    Write-Warning "A atualizacao falhou. O backup foi preservado em: $PastaDados\backups"
    Write-Warning "Depois de corrigir o erro, execute: pm2 start ecosystem.config.js --only $NomeProcesso --update-env"
    exit 1
}

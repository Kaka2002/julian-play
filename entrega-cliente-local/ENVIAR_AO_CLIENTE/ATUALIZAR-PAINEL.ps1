param(
    [ValidateRange(1, 65535)]
    [int]$Porta = 10000,

    [string]$PastaInstalacao = 'C:\JulianPlay\app',

    [string]$PastaDados = 'C:\JulianPlay\dados',

    [string]$NomeProcesso = 'julian-play-cliente',

    [string]$NomeLocal = 'julianplay.local'
)

$ErrorActionPreference = 'Stop'

function Etapa($texto) {
    Write-Host "`n==> $texto" -ForegroundColor Cyan
}

function ExigirComando($nome, $mensagem) {
    $cmd = Get-Command $nome -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw $mensagem
    }
    return $cmd
}

function CopiarSeExistir($origem, $destino) {
    if (Test-Path -LiteralPath $origem) {
        Copy-Item -LiteralPath $origem -Destination $destino -Force
    }
}

function TestarAdministrador {
    $identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidade)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function GarantirAdministrador {
    if (TestarAdministrador) { return }

    Write-Host 'A atualizacao precisa de permissao de administrador para encerrar o painel antigo.' -ForegroundColor Yellow
    Write-Host 'Confirme a janela de permissao do Windows para continuar.' -ForegroundColor Yellow

    $argumentosElevados = @(
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', "`"$PSCommandPath`"",
        '-Porta', [string]$Porta,
        '-PastaInstalacao', "`"$PastaInstalacao`"",
        '-PastaDados', "`"$PastaDados`"",
        '-NomeProcesso', "`"$NomeProcesso`"",
        '-NomeLocal', "`"$NomeLocal`""
    )

    try {
        $processoElevado = Start-Process powershell.exe -Verb RunAs -ArgumentList $argumentosElevados -Wait -PassThru
        exit $processoElevado.ExitCode
    } catch {
        throw 'A permissao de administrador foi cancelada. Execute novamente e clique em Sim na janela do Windows.'
    }
}

GarantirAdministrador

function ExecutarPm2Opcional([string[]]$argumentos) {
    $pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
    if (-not $pm2) {
        return
    }

    $acaoAnterior = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $pm2.Source @argumentos *> $null
    } catch {
        # O processo pode nao existir ou ja estar parado.
    } finally {
        $ErrorActionPreference = $acaoAnterior
        $global:LASTEXITCODE = 0
    }
}

function PararPm2Local([string]$nomeProcesso) {
    ExecutarPm2Opcional @('stop', $nomeProcesso)
    ExecutarPm2Opcional @('delete', $nomeProcesso)
    Start-Sleep -Seconds 5
}

function ConfigurarNomeLocal([string]$nomeLocal) {
    if ([string]::IsNullOrWhiteSpace($nomeLocal) -or -not (TestarAdministrador)) {
        return $false
    }

    $hosts = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
    $linha = "127.0.0.1 $nomeLocal"
    $conteudo = ''
    if (Test-Path -LiteralPath $hosts) {
        $conteudo = Get-Content -LiteralPath $hosts -Raw
    }

    if ($conteudo -notmatch "(?im)^\s*127\.0\.0\.1\s+$([regex]::Escape($nomeLocal))\s*$") {
        Add-Content -LiteralPath $hosts -Value "`r`n$linha"
    }

    return $true
}

function ObterPastaBaseInstalacao([string]$pastaInstalacao) {
    $caminho = [IO.Path]::GetFullPath($pastaInstalacao).TrimEnd('\')
    $base = Split-Path -Parent $caminho
    if ([string]::IsNullOrWhiteSpace($base)) {
        return 'C:\JulianPlay'
    }
    return $base
}

function PararProcessosDaInstalacao([string]$pastaInstalacao) {
    $pastaNormalizada = [IO.Path]::GetFullPath($pastaInstalacao).TrimEnd('\')
    $pastaBusca = $pastaNormalizada.Replace('\', '\\')
    $processos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.ProcessId -ne $PID -and
            $_.Name -in @('node.exe', 'chrome.exe', 'msedge.exe', 'cmd.exe', 'powershell.exe', 'pwsh.exe') -and
            $_.CommandLine -and
            ($_.CommandLine -like "*$pastaNormalizada*" -or $_.CommandLine -like "*$pastaBusca*")
        })

    foreach ($processo in $processos) {
        try {
            Write-Host "Encerrando processo preso da instalacao: $($processo.Name) $($processo.ProcessId)" -ForegroundColor Yellow
            Stop-Process -Id $processo.ProcessId -Force -ErrorAction Stop
        } catch {
            Write-Host "Aviso: nao foi possivel encerrar $($processo.Name) $($processo.ProcessId): $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }

    if ($processos.Count -gt 0) {
        Start-Sleep -Seconds 3
    }
}

function TrocarPastaInstalacaoComTentativas([string]$pastaAtual, [string]$pastaNova, [string]$backupApp) {
    for ($tentativa = 1; $tentativa -le 8; $tentativa++) {
        try {
            Move-Item -LiteralPath $pastaAtual -Destination $backupApp -Force
            Move-Item -LiteralPath $pastaNova -Destination $pastaAtual -Force
            return
        } catch {
            if ($tentativa -ge 8) {
                throw
            }

            Write-Host "Arquivo em uso durante a troca. Tentativa $tentativa/8; aguardando e limpando processos do painel..." -ForegroundColor Yellow
            PararProcessosDaInstalacao $pastaAtual
            Start-Sleep -Seconds (3 + $tentativa)
        }
    }
}

function ExecutarRobocopy([string]$origem, [string]$destino, [string[]]$argumentosExtras) {
    $robocopy = Join-Path $env:SystemRoot 'System32\robocopy.exe'
    if (-not (Test-Path -LiteralPath $robocopy)) {
        throw 'Robocopy nao encontrado no Windows.'
    }

    & $robocopy $origem $destino @argumentosExtras | Out-Host
    $codigo = $LASTEXITCODE
    $global:LASTEXITCODE = 0

    if ($codigo -gt 7) {
        throw "Robocopy terminou com codigo $codigo."
    }
}

function AtualizarPastaInstalacaoEmUso([string]$pastaAtual, [string]$pastaNova, [string]$backupApp) {
    $pastasIgnoradas = @(
        'node_modules',
        '.git',
        '.wwebjs_auth',
        '.wwebjs_cache',
        '.wwebjs_auth_backup',
        '.wwebjs_cache_backup',
        'backups',
        'outputs'
    )

    $arquivosIgnorados = @(
        'clientes.db',
        '*.log',
        '*.pid'
    )

    Write-Host "Criando copia de seguranca da instalacao atual em $backupApp" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $backupApp -Force | Out-Null
    $argumentosBackup = @('/E', '/R:1', '/W:1', '/NFL', '/NDL', '/NP', '/XD') + $pastasIgnoradas + @('/XF') + $arquivosIgnorados
    ExecutarRobocopy $pastaAtual $backupApp $argumentosBackup

    Write-Host 'Copiando arquivos atualizados sem mover a pasta principal...' -ForegroundColor Yellow
    $argumentosAtualizacao = @('/E', '/R:3', '/W:2', '/NFL', '/NDL', '/NP', '/XD') + $pastasIgnoradas + @('/XF') + $arquivosIgnorados
    ExecutarRobocopy $pastaNova $pastaAtual $argumentosAtualizacao
}

function RestaurarOuReabrirPainelLocal([string]$pastaInstalacao, [string]$backupApp, [string]$nomeProcesso, [int]$porta, [string]$pastaDados) {
    if ((Test-Path -LiteralPath $backupApp) -and -not (Test-Path -LiteralPath $pastaInstalacao)) {
        Write-Host 'Restaurando versao anterior...' -ForegroundColor Yellow
        Move-Item -LiteralPath $backupApp -Destination $pastaInstalacao -Force
    }

    $instaladorAtual = Join-Path $pastaInstalacao 'install-windows.ps1'
    if (Test-Path -LiteralPath $instaladorAtual) {
        Write-Host 'Reabrindo o painel local...' -ForegroundColor Yellow
        & powershell -NoProfile -ExecutionPolicy Bypass -File $instaladorAtual -Porta $porta -NomeProcesso $nomeProcesso -PastaDados $pastaDados -InstalacaoLocal
        $global:LASTEXITCODE = 0
        return
    }

    ExecutarPm2Opcional @('restart', $nomeProcesso, '--update-env')
}

$pacote = Join-Path $PSScriptRoot 'julian-play-app.zip'
if (-not (Test-Path -LiteralPath $pacote)) {
    throw 'Arquivo julian-play-app.zip nao encontrado nesta pasta. Solicite o pacote atualizado ao fornecedor.'
}

$arquivoHash = "$pacote.sha256"
if (-not (Test-Path -LiteralPath $arquivoHash)) {
    throw 'Arquivo de validacao julian-play-app.zip.sha256 nao encontrado. Solicite um pacote completo ao fornecedor.'
}
$hashEsperado = ((Get-Content -LiteralPath $arquivoHash -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
$hashAtual = (Get-FileHash -LiteralPath $pacote -Algorithm SHA256).Hash.ToLowerInvariant()
if (-not $hashEsperado -or $hashAtual -ne $hashEsperado) {
    throw 'O ZIP da atualizacao esta incompleto ou foi alterado. A atualizacao foi cancelada antes de tocar na instalacao.'
}
Write-Host "Pacote validado por SHA-256: $hashAtual" -ForegroundColor Green

Etapa 'Verificando instalacao atual'
$PastaInstalacao = [IO.Path]::GetFullPath($PastaInstalacao)
$PastaDados = [IO.Path]::GetFullPath($PastaDados)
$PastaBase = ObterPastaBaseInstalacao $PastaInstalacao
New-Item -ItemType Directory -Path $PastaBase -Force | Out-Null
if (-not (Test-Path -LiteralPath $PastaInstalacao)) {
    throw "Instalacao local nao encontrada em $PastaInstalacao. Execute primeiro o instalador do painel."
}

if (-not (Test-Path -LiteralPath (Join-Path $PastaInstalacao 'package.json'))) {
    throw "A pasta $PastaInstalacao nao parece conter uma instalacao valida do painel."
}

Etapa 'Verificando programas obrigatorios'
ExigirComando 'node' 'Node.js nao encontrado. Instale em https://nodejs.org/ e execute novamente.' | Out-Null
ExigirComando 'npm.cmd' 'npm nao encontrado. Reinstale o Node.js e execute novamente.' | Out-Null

Etapa 'Configurando endereco local'
$nomeLocalConfigurado = ConfigurarNomeLocal $NomeLocal
$urlPainel = if ($nomeLocalConfigurado) { "http://$NomeLocal`:$Porta" } else { "http://localhost:$Porta" }

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if (-not $pm2) {
    throw 'PM2 nao encontrado. Execute primeiro a instalacao completa do painel.'
}

Etapa 'Criando backup dos dados'
New-Item -ItemType Directory -Path $PastaDados -Force | Out-Null
$pastaBackup = Join-Path $PastaDados 'backups'
New-Item -ItemType Directory -Path $pastaBackup -Force | Out-Null
$data = Get-Date -Format 'yyyyMMdd-HHmmss'

$banco = Join-Path $PastaDados 'clientes.db'
if (Test-Path -LiteralPath $banco) {
    $backupBanco = Join-Path $pastaBackup "antes-atualizar-$data.db"
    Copy-Item -LiteralPath $banco -Destination $backupBanco -Force
    Write-Host "Backup do banco criado: $backupBanco" -ForegroundColor Green
} else {
    Write-Host 'Banco de dados ainda nao encontrado; seguindo a atualizacao.' -ForegroundColor Yellow
}

$backupApp = Join-Path $PastaBase "app-backup-atualizacao-$data"
$pastaTemporaria = Join-Path $PastaBase "app-novo-$data"

Etapa 'Parando o painel local'
PararPm2Local $NomeProcesso
PararProcessosDaInstalacao $PastaInstalacao

try {
    Etapa 'Extraindo pacote atualizado'
    if (Test-Path -LiteralPath $pastaTemporaria) {
        Remove-Item -LiteralPath $pastaTemporaria -Recurse -Force
    }
    New-Item -ItemType Directory -Path $pastaTemporaria -Force | Out-Null
    Expand-Archive -LiteralPath $pacote -DestinationPath $pastaTemporaria -Force

    $subpastas = @(Get-ChildItem -LiteralPath $pastaTemporaria -Directory)
    if (-not (Test-Path -LiteralPath (Join-Path $pastaTemporaria 'package.json')) -and $subpastas.Count -eq 1) {
        Get-ChildItem -LiteralPath $subpastas[0].FullName -Force | Move-Item -Destination $pastaTemporaria -Force
        Remove-Item -LiteralPath $subpastas[0].FullName -Force
    }

    if (-not (Test-Path -LiteralPath (Join-Path $pastaTemporaria 'package.json'))) {
        throw 'Pacote atualizado invalido: package.json nao encontrado.'
    }

    Etapa 'Preservando configuracao local'
    CopiarSeExistir (Join-Path $PastaInstalacao '.julian-play-install.json') (Join-Path $pastaTemporaria '.julian-play-install.json')
    CopiarSeExistir (Join-Path $PastaInstalacao '.env') (Join-Path $pastaTemporaria '.env')

    Etapa 'Trocando arquivos do sistema'
    AtualizarPastaInstalacaoEmUso $PastaInstalacao $pastaTemporaria $backupApp

    $instalador = Join-Path $PastaInstalacao 'install-windows.ps1'
    if (-not (Test-Path -LiteralPath $instalador)) {
        throw 'Pacote atualizado invalido: install-windows.ps1 nao encontrado.'
    }

    Etapa 'Aplicando atualizacao'
    & powershell -NoProfile -ExecutionPolicy Bypass -File $instalador -Porta $Porta -NomeProcesso $NomeProcesso -PastaDados $PastaDados -InstalacaoLocal
    if ($LASTEXITCODE -ne 0) {
        throw "Atualizacao terminou com codigo $LASTEXITCODE."
    }

    Etapa 'Atualizacao finalizada'
    Write-Host "Painel: $urlPainel" -ForegroundColor Green
    if ($nomeLocalConfigurado) {
        Write-Host "Endereco alternativo: http://localhost:$Porta" -ForegroundColor Yellow
    }
    Write-Host "Backup da versao anterior: $backupApp" -ForegroundColor Yellow
    Start-Process $urlPainel
} catch {
    Write-Host "`nFalha na atualizacao: $($_.Exception.Message)" -ForegroundColor Red

    RestaurarOuReabrirPainelLocal $PastaInstalacao $backupApp $NomeProcesso $Porta $PastaDados

    throw
} finally {
    if (Test-Path -LiteralPath $pastaTemporaria) {
        Remove-Item -LiteralPath $pastaTemporaria -Recurse -Force -ErrorAction SilentlyContinue
    }
}

Read-Host 'Pressione ENTER para fechar'

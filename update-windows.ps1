param(
    [string]$NomeProcesso = 'julian-play',
    [string]$PastaDados = '',
    [switch]$PularGit,
    [switch]$PularDependencias,
    [string[]]$ProcessosParaManterParados = @(),
    [switch]$GerarPacoteCliente
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

function AdicionarProcessoJulian([System.Collections.Generic.List[string]]$lista, [string]$nome) {
    $nomeLimpo = [string]$nome
    if ($nomeLimpo -and $nomeLimpo -like 'julian-*' -and -not $lista.Contains($nomeLimpo)) {
        $lista.Add($nomeLimpo)
    }
}

function ObterProcessosJulian($pm2, [string]$nomePrincipal) {
    $nomes = [System.Collections.Generic.List[string]]::new()

    try {
        $saida = (& $pm2.Source jlist --silent 2>$null) -join "`n"
        $inicioJson = $saida.IndexOf('[')
        if ($inicioJson -ge 0) {
            $listaPm2 = $saida.Substring($inicioJson) | ConvertFrom-Json
            @($listaPm2 | Where-Object { $_.name -like 'julian-*' } | Select-Object -ExpandProperty name -Unique) |
                ForEach-Object { AdicionarProcessoJulian $nomes $_ }
        }
    } catch {
        Write-Warning 'Nao foi possivel listar todos os processos pelo PM2; usando a lista conhecida.'
    }

    AdicionarProcessoJulian $nomes $nomePrincipal

    $arquivoMaster = Join-Path $diretorioProjeto '.julian-master-install.json'
    if (Test-Path -LiteralPath $arquivoMaster) {
        AdicionarProcessoJulian $nomes 'julian-master'
        try {
            $configMaster = Get-Content -LiteralPath $arquivoMaster -Raw | ConvertFrom-Json
            if ($configMaster.clientsDir -and (Test-Path -LiteralPath $configMaster.clientsDir)) {
                Get-ChildItem -LiteralPath $configMaster.clientsDir -Directory |
                    Where-Object { $_.Name -ne '_arquivados' } |
                    ForEach-Object { AdicionarProcessoJulian $nomes "julian-$($_.Name)" }
            }
        } catch {
            Write-Warning 'Nao foi possivel ler as instalacoes comerciais; a atualizacao continuara.'
        }
    }

    return @($nomes)
}

function EncerrarProcessosResiduaisJulian([string[]]$raizes) {
    $raizesValidas = @($raizes |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') } |
        Select-Object -Unique)

    if ($raizesValidas.Count -eq 0) {
        return
    }

    $processos = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $linhaComando = $_.CommandLine
            $_.ProcessId -ne $PID -and
            $_.Name -in @('node.exe', 'chrome.exe') -and
            $linhaComando -and
            ($raizesValidas | Where-Object { $linhaComando -like "*$_*" })
        })

    foreach ($processo in $processos) {
        try {
            Write-Host "Encerrando processo residual $($processo.Name) PID $($processo.ProcessId)." -ForegroundColor Yellow
            Stop-Process -Id $processo.ProcessId -Force -ErrorAction Stop
        } catch {
            Write-Warning "Nao foi possivel encerrar o PID $($processo.ProcessId): $($_.Exception.Message)"
        }
    }

    if ($processos.Count -gt 0) {
        Start-Sleep -Seconds 3
    }
}

if (-not $PastaDados) {
    $PastaDados = if ($env:JULIAN_PLAY_DATA_DIR) { $env:JULIAN_PLAY_DATA_DIR } else { $diretorioProjeto }
}
$PastaDados = [IO.Path]::GetFullPath($PastaDados)

$npm = ExigirComando 'npm.cmd'
$pm2 = ExigirComando 'pm2.cmd'
$processosJulian = ObterProcessosJulian $pm2 $NomeProcesso
foreach ($processoAdicional in $ProcessosParaManterParados) {
    AdicionarProcessoJulian $processosJulian $processoAdicional
}

$git = $null
$commitAntesAtualizacao = $null
$dependenciasAlteradas = -not $PularDependencias
if (-not $PularGit) {
    $git = ExigirComando 'git.exe'
    $alteracoes = & $git.Source status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel verificar o repositorio Git.'
    }
    if ($alteracoes) {
        throw 'Existem alteracoes locais no codigo. Salve-as no Git antes de atualizar para evitar perda.'
    }
    $commitAntesAtualizacao = (& $git.Source rev-parse HEAD).Trim()
}

Etapa 'Parando as instalacoes Julian Play com seguranca'
foreach ($processo in $processosJulian) {
    & $pm2.Source stop $processo
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "O processo $processo nao estava ativo; a atualizacao continuara."
    }
}
Start-Sleep -Seconds 4

$raizesProcessos = [System.Collections.Generic.List[string]]::new()
$raizesProcessos.Add($diretorioProjeto)
$raizesProcessos.Add($PastaDados)
$arquivoMasterProcessos = Join-Path $diretorioProjeto '.julian-master-install.json'
if (Test-Path -LiteralPath $arquivoMasterProcessos) {
    try {
        $configMasterProcessos = Get-Content -LiteralPath $arquivoMasterProcessos -Raw | ConvertFrom-Json
        if ($configMasterProcessos.clientsDir) {
            $raizesProcessos.Add([string]$configMasterProcessos.clientsDir)
        }
    } catch {
        Write-Warning 'Nao foi possivel ler a pasta das instalacoes comerciais para limpeza de processos.'
    }
}
EncerrarProcessosResiduaisJulian $raizesProcessos.ToArray()

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

    $arquivoMaster = Join-Path $diretorioProjeto '.julian-master-install.json'
    if (Test-Path -LiteralPath $arquivoMaster) {
        $configMaster = Get-Content -LiteralPath $arquivoMaster -Raw | ConvertFrom-Json
        if ($configMaster.clientsDir -and (Test-Path -LiteralPath $configMaster.clientsDir)) {
            Get-ChildItem -LiteralPath $configMaster.clientsDir -Directory |
                Where-Object { $_.Name -ne '_arquivados' } |
                ForEach-Object {
                    $bancoCliente = Join-Path $_.FullName 'clientes.db'
                    if (Test-Path -LiteralPath $bancoCliente) {
                        $backupsCliente = Join-Path $_.FullName 'backups'
                        New-Item -ItemType Directory -Path $backupsCliente -Force | Out-Null
                        $backupCliente = Join-Path $backupsCliente ("antes-atualizar-{0}.db" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
                        Copy-Item -LiteralPath $bancoCliente -Destination $backupCliente -Force
                        Write-Host "Backup do cliente criado: $backupCliente" -ForegroundColor Green
                    }
                }
        }
    }

    if (-not $PularGit) {
        Etapa 'Baixando a versao publicada no GitHub'
        & $git.Source pull --ff-only
        if ($LASTEXITCODE -ne 0) {
            throw "git pull terminou com codigo $LASTEXITCODE."
        }

        $commitDepoisAtualizacao = (& $git.Source rev-parse HEAD).Trim()
        if ($commitAntesAtualizacao -and $commitDepoisAtualizacao) {
            $arquivosDependencia = @(& $git.Source diff --name-only $commitAntesAtualizacao $commitDepoisAtualizacao -- package.json package-lock.json)
            $dependenciasAlteradas = $arquivosDependencia.Count -gt 0
        }
    }

    if ($dependenciasAlteradas) {
        Etapa 'Atualizando dependencias'
        $env:PUPPETEER_SKIP_DOWNLOAD = 'true'
        $env:PUPPETEER_SKIP_CHROME_DOWNLOAD = 'true'
        & $npm.Source ci --omit=dev
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci terminou com codigo $LASTEXITCODE."
        }
    } else {
        Etapa 'Dependencias sem alteracao'
        Write-Host 'package.json e package-lock.json nao mudaram; npm ci foi pulado para evitar bloqueio do sqlite no Windows.' -ForegroundColor Green
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
    foreach ($processo in ($processosJulian | Where-Object {
        $_ -ne $NomeProcesso -and $_ -notin $ProcessosParaManterParados
    })) {
        & $pm2.Source restart $processo
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Nao foi possivel reiniciar $processo. Se for uma instalacao incompleta, recrie pelo Painel Mestre."
        }
    }
    foreach ($processo in $ProcessosParaManterParados) {
        & $pm2.Source stop $processo
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "Nao foi possivel manter $processo parado; confira o cadastro no PM2."
        }
    }
    & $pm2.Source save --force
    if ($LASTEXITCODE -ne 0) {
        throw "PM2 save terminou com codigo $LASTEXITCODE."
    }

    & $pm2.Source status

    if ($GerarPacoteCliente) {
        Etapa 'Recriando o pacote de instalacao local'
        $geradorPacote = Join-Path $diretorioProjeto 'entrega-cliente-local\USO_INTERNO_NAO_ENVIAR\CRIAR-PACOTE-APP.ps1'
        if (-not (Test-Path -LiteralPath $geradorPacote)) {
            throw "Gerador do pacote local nao encontrado: $geradorPacote"
        }
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $geradorPacote
        if ($LASTEXITCODE -ne 0) {
            throw "Geracao do pacote local terminou com codigo $LASTEXITCODE."
        }
    }

    Write-Host '`nAtualizacao concluida com sucesso.' -ForegroundColor Green
} catch {
    Write-Error $_
    Write-Warning "A atualizacao falhou. O backup foi preservado em: $PastaDados\backups"
    Write-Warning 'Tentando restaurar a execucao da versao instalada...'
    try {
        & $pm2.Source startOrReload (Join-Path $diretorioProjeto 'ecosystem.config.js') --only $NomeProcesso --update-env
        if ($LASTEXITCODE -eq 0) {
            foreach ($processo in ($processosJulian | Where-Object {
                $_ -ne $NomeProcesso -and $_ -notin $ProcessosParaManterParados
            })) {
                & $pm2.Source restart $processo 2>$null | Out-Host
            }
            foreach ($processo in $ProcessosParaManterParados) {
                & $pm2.Source stop $processo 2>$null | Out-Host
            }
            & $pm2.Source save --force
            Write-Warning 'O aplicativo foi reiniciado, mas a atualizacao precisa ser corrigida.'
        } else {
            Write-Warning "Nao foi possivel reiniciar. Execute: pm2 start ecosystem.config.js --only $NomeProcesso --update-env"
        }
    } catch {
        Write-Warning "Nao foi possivel reiniciar. Execute: pm2 start ecosystem.config.js --only $NomeProcesso --update-env"
    }
    exit 1
}

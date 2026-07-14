param(
    [ValidateRange(1, 65535)]
    [int]$Porta = 10000,

    [string]$NomeProcesso = 'julian-play',

    [string]$PastaDados = '',

    [ValidateSet(0, 15, 30)]
    [int]$AvaliacaoDias = 0,

    [switch]$SemInicioAutomatico,

    [switch]$AbrirFirewall,

    [switch]$PularDependencias
)

$ErrorActionPreference = 'Stop'
$diretorioProjeto = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $diretorioProjeto

function Etapa([string]$mensagem) {
    Write-Host "`n==> $mensagem" -ForegroundColor Cyan
}

function ExigirComando([string]$nome, [string]$orientacao) {
    $comando = Get-Command $nome -ErrorAction SilentlyContinue
    if (-not $comando) {
        throw "$nome nao foi encontrado. $orientacao"
    }
    return $comando
}

function TestarAdministrador {
    $identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidade)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function CriarBackupLocal([string]$dados) {
    $banco = Join-Path $dados 'clientes.db'
    if (-not (Test-Path -LiteralPath $banco)) {
        return $null
    }

    $pastaBackup = Join-Path $dados 'backups'
    New-Item -ItemType Directory -Path $pastaBackup -Force | Out-Null
    $data = Get-Date -Format 'yyyyMMdd-HHmmss'
    $destino = Join-Path $pastaBackup "antes-instalar-$data.db"
    Copy-Item -LiteralPath $banco -Destination $destino -Force
    return $destino
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
    AdicionarProcessoJulian $nomes 'julian-master'

    $arquivoMaster = Join-Path $diretorioProjeto '.julian-master-install.json'
    if (Test-Path -LiteralPath $arquivoMaster) {
        try {
            $configMaster = Get-Content -LiteralPath $arquivoMaster -Raw | ConvertFrom-Json
            if ($configMaster.clientsDir -and (Test-Path -LiteralPath $configMaster.clientsDir)) {
                Get-ChildItem -LiteralPath $configMaster.clientsDir -Directory |
                    Where-Object { $_.Name -ne '_arquivados' } |
                    ForEach-Object { AdicionarProcessoJulian $nomes "julian-$($_.Name)" }
            }
        } catch {
            Write-Warning 'Nao foi possivel ler as instalacoes comerciais; a instalacao continuara.'
        }
    }

    return @($nomes)
}

function ExecutarPm2Opcional($pm2, [string[]]$argumentos) {
    $acaoAnterior = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & $pm2.Source @argumentos *> $null
    } catch {
        # Alguns comandos do PM2 retornam erro quando o processo ainda nao existe.
    } finally {
        $ErrorActionPreference = $acaoAnterior
        $global:LASTEXITCODE = 0
    }
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

if (-not (Test-Path -LiteralPath (Join-Path $diretorioProjeto 'package.json'))) {
    throw 'Execute este instalador dentro da pasta completa do julian-play.'
}

Etapa 'Validando Node.js, npm e Chrome'
$node = ExigirComando 'node' 'Instale o Node.js 20 ou superior.'
$npm = ExigirComando 'npm.cmd' 'Reinstale o Node.js incluindo o npm.'
$versaoNode = (& $node.Source --version).TrimStart('v').Split('.')[0]
if ([int]$versaoNode -lt 20) {
    throw 'O julian-play requer Node.js 20 ou superior.'
}

$caminhosChrome = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if (-not $caminhosChrome) {
    throw 'Google Chrome nao foi encontrado. Instale o Chrome antes de continuar.'
}

if (-not $PastaDados) {
    $PastaDados = $diretorioProjeto
}
$PastaDados = [IO.Path]::GetFullPath($PastaDados)
New-Item -ItemType Directory -Path $PastaDados -Force | Out-Null

if ($PastaDados -ne [IO.Path]::GetFullPath($diretorioProjeto)) {
    Etapa 'Migrando dados existentes para a pasta escolhida'
    $itensPersistentes = @('clientes.db', '.wwebjs_auth', 'backups')
    foreach ($item in $itensPersistentes) {
        $origem = Join-Path $diretorioProjeto $item
        $destino = Join-Path $PastaDados $item
        if ((Test-Path -LiteralPath $origem) -and -not (Test-Path -LiteralPath $destino)) {
            Copy-Item -LiteralPath $origem -Destination $destino -Recurse -Force
            Write-Host "Migrado: $item" -ForegroundColor Green
        }
    }
}

$arquivoInstalacao = Join-Path $diretorioProjeto '.julian-play-install.json'
$configAnterior = $null
if (Test-Path -LiteralPath $arquivoInstalacao) {
    try {
        $configAnterior = Get-Content -LiteralPath $arquivoInstalacao -Raw | ConvertFrom-Json
    } catch {
        Write-Warning 'A configuracao anterior da instalacao nao pode ser lida e sera recriada.'
    }
}

if (-not $PSBoundParameters.ContainsKey('AvaliacaoDias') -and $null -ne $configAnterior -and $null -ne $configAnterior.trialDays) {
    $AvaliacaoDias = [int]$configAnterior.trialDays
}

$codigoFornecedor = if ($null -ne $configAnterior -and $configAnterior.licenseAdminToken) {
    [string]$configAnterior.licenseAdminToken
} else {
    ([guid]::NewGuid().ToString('N').Substring(0, 20)).ToUpperInvariant()
}
$arquivoChavePublica = Join-Path $diretorioProjeto 'config\license-public-key.pem'
$chavePublicaAnterior = if ($null -ne $configAnterior -and $configAnterior.licensePublicKey) { [string]$configAnterior.licensePublicKey } else { '' }
$chavePublicaPacote = if (Test-Path -LiteralPath $arquivoChavePublica) { Get-Content -LiteralPath $arquivoChavePublica -Raw } else { '' }
$chavePublicaLicenca = if ($chavePublicaPacote -like '*-----BEGIN PUBLIC KEY-----*') {
    $chavePublicaPacote
} elseif ($chavePublicaAnterior -like '*-----BEGIN PUBLIC KEY-----*') {
    $chavePublicaAnterior
} else {
    ''
}

$configInstalacao = [ordered]@{
    appName = $NomeProcesso
    port = $Porta
    dataDir = $PastaDados
    trialDays = $AvaliacaoDias
    licenseAdminToken = $codigoFornecedor
    licensePublicKey = $chavePublicaLicenca
}
$jsonInstalacao = $configInstalacao | ConvertTo-Json
$utf8SemBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($arquivoInstalacao, $jsonInstalacao, $utf8SemBom)

Etapa 'Preservando os dados atuais'
$backup = CriarBackupLocal $PastaDados
if ($backup) {
    Write-Host "Backup criado: $backup" -ForegroundColor Green
} else {
    Write-Host 'Instalacao nova: ainda nao existe banco para copiar.'
}

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
$processosPausados = @()
if ($pm2) {
    Etapa 'Parando as instalacoes Julian Play antes de atualizar dependencias'
    $processosPausados = ObterProcessosJulian $pm2 $NomeProcesso
    foreach ($processo in $processosPausados) {
        ExecutarPm2Opcional $pm2 @('stop', $processo)
    }
    Start-Sleep -Seconds 4
}

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

$ocupantes = @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)
if ($ocupantes.Count -gt 0) {
    $pids = ($ocupantes | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "A porta $Porta ainda esta ocupada pelo PID $pids. Encerre esse processo e execute novamente."
}

if (-not $PularDependencias) {
    Etapa 'Instalando dependencias do projeto'
    $env:PUPPETEER_SKIP_DOWNLOAD = 'true'
    $env:PUPPETEER_SKIP_CHROME_DOWNLOAD = 'true'
    $lockfile = Join-Path $diretorioProjeto 'package-lock.json'
    $shrinkwrap = Join-Path $diretorioProjeto 'npm-shrinkwrap.json'
    if ((Test-Path -LiteralPath $lockfile) -or (Test-Path -LiteralPath $shrinkwrap)) {
        & $npm.Source ci --omit=dev
    } else {
        Write-Warning 'package-lock.json nao encontrado; usando npm install para preparar as dependencias.'
        & $npm.Source install --omit=dev
    }
    if ($LASTEXITCODE -ne 0) {
        throw "npm terminou com codigo $LASTEXITCODE."
    }
}

if (-not $pm2) {
    Etapa 'Instalando o gerenciador PM2'
    & $npm.Source install --global pm2
    if ($LASTEXITCODE -ne 0) {
        throw "A instalacao do PM2 terminou com codigo $LASTEXITCODE."
    }
    $pm2 = ExigirComando 'pm2.cmd' 'Feche e abra o PowerShell e execute novamente.'
}

Etapa 'Configurando uma unica instancia no PM2'
ExecutarPm2Opcional $pm2 @('delete', $NomeProcesso)
Start-Sleep -Seconds 2

$ocupantes = @(Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue)
if ($ocupantes.Count -gt 0) {
    $pids = ($ocupantes | Select-Object -ExpandProperty OwningProcess -Unique) -join ', '
    throw "A porta $Porta ainda esta ocupada pelo PID $pids. Encerre esse processo e execute novamente."
}

$env:JULIAN_PLAY_APP_NAME = $NomeProcesso
$env:JULIAN_PLAY_PORT = [string]$Porta
$env:JULIAN_PLAY_DATA_DIR = $PastaDados

& $pm2.Source start (Join-Path $diretorioProjeto 'ecosystem.config.js') --only $NomeProcesso --update-env
if ($LASTEXITCODE -ne 0) {
    throw "PM2 start terminou com codigo $LASTEXITCODE."
}
foreach ($processo in ($processosPausados | Where-Object { $_ -ne $NomeProcesso })) {
    & $pm2.Source restart $processo
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Nao foi possivel reiniciar $processo. Se for uma instalacao incompleta, recrie pelo Painel Mestre."
    }
}
& $pm2.Source save --force
if ($LASTEXITCODE -ne 0) {
    throw "PM2 save terminou com codigo $LASTEXITCODE."
}

if (-not $SemInicioAutomatico) {
    Etapa 'Configurando inicio automatico com o Windows'
    if (TestarAdministrador) {
        $acao = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$diretorioProjeto\start-pm2.ps1`""
        $gatilho = New-ScheduledTaskTrigger -AtStartup
        $usuario = [Security.Principal.WindowsIdentity]::GetCurrent().Name
        $principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType S4U -RunLevel Highest
        $configuracao = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
        Register-ScheduledTask -TaskName 'Julian Play - Iniciar PM2' -Action $acao -Trigger $gatilho -Principal $principal -Settings $configuracao -Force | Out-Null
        Write-Host 'Tarefa de inicializacao criada.' -ForegroundColor Green
    } else {
        $startup = [Environment]::GetFolderPath('Startup')
        $atalho = Join-Path $startup 'julian-play-pm2.cmd'
        "@echo off`r`npowershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$diretorioProjeto\start-pm2.ps1`"`r`n" | Set-Content -LiteralPath $atalho -Encoding ASCII
        Write-Warning 'PowerShell sem Administrador: o PM2 iniciara no proximo login do Windows, nao antes do login.'
    }
}

if ($AbrirFirewall) {
    Etapa 'Configurando o Firewall do Windows'
    if (-not (TestarAdministrador)) {
        Write-Warning 'Abra o PowerShell como Administrador para criar a regra de firewall.'
    } else {
        Remove-NetFirewallRule -DisplayName 'Julian Play - Painel' -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName 'Julian Play - Painel' -Direction Inbound -Protocol TCP -LocalPort $Porta -Action Allow | Out-Null
        Write-Host "Porta TCP $Porta liberada no firewall." -ForegroundColor Green
    }
}

Etapa 'Instalacao concluida'
& $pm2.Source status
Write-Host "Painel local: http://localhost:$Porta" -ForegroundColor Green
Write-Host "Codigo do fornecedor: $codigoFornecedor" -ForegroundColor Yellow
if ($AvaliacaoDias -in @(15, 30)) {
    Write-Host "Avaliacao automatica configurada: $AvaliacaoDias dias" -ForegroundColor Yellow
}
Write-Host 'Abra /qr para conectar o WhatsApp e /manutencao para executar o diagnostico.'

param(
    [string]$NomeProcesso = 'julian-play',
    [string]$PastaDados = '',
    [switch]$PularGit,
    [switch]$PularDependencias,
    [string[]]$ProcessosParaManterParados = @(),
    [switch]$GerarPacoteCliente,
    [int]$TempoSaudeSegundos = 120
)

$ErrorActionPreference = 'Stop'
$diretorioProjeto = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path)).TrimEnd('\')
Set-Location $diretorioProjeto

# Todos os pontos de inicializacao do projeto usam o mesmo daemon. Sem isso,
# um deploy pode consultar um PM2 e reiniciar outro.
$env:PM2_HOME = Join-Path $env:USERPROFILE '.pm2'

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

if (-not $PastaDados) {
    $PastaDados = if ($env:JULIAN_PLAY_DATA_DIR) { $env:JULIAN_PLAY_DATA_DIR } else { $diretorioProjeto }
}
$PastaDados = [IO.Path]::GetFullPath($PastaDados)

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

function ExecutarComando {
    param(
        [Parameter(Mandatory = $true)]$Comando,
        [Parameter(Mandatory = $true)][string[]]$Argumentos,
        [Parameter(Mandatory = $true)][string]$MensagemErro,
        [string]$Diretorio = ''
    )

    $diretorioAnterior = (Get-Location).Path
    try {
        if ($Diretorio) { Set-Location $Diretorio }
        # Mostra a saida ao operador sem deixa-la escapar pelo pipeline da
        # funcao. PrepararRelease deve devolver somente o caminho da release.
        & $Comando.Source @Argumentos | Out-Host
        $codigoSaida = $LASTEXITCODE
        if ($codigoSaida -ne 0) {
            throw "$MensagemErro Codigo $codigoSaida."
        }
    } finally {
        Set-Location $diretorioAnterior
    }
}

function AdicionarProcessoJulian([System.Collections.Generic.List[string]]$lista, [string]$nome) {
    $nomeLimpo = [string]$nome
    if ($nomeLimpo -and $nomeLimpo -like 'julian-*' -and -not $lista.Contains($nomeLimpo)) {
        $lista.Add($nomeLimpo)
    }
}

function ObterListaPm2($pm2, $node) {
    $saida = (& $pm2.Source jlist --silent 2>$null) -join "`n"
    if ($LASTEXITCODE -ne 0) {
        throw 'Nao foi possivel consultar o daemon PM2 configurado.'
    }

    # O ambiente do Windows pode conter, ao mesmo tempo, chaves como username
    # e USERNAME. Elas sao validas em JSON, mas o ConvertFrom-Json do Windows
    # PowerShell 5.1 as considera duplicadas. O Node normaliza somente os quatro
    # campos usados pelo deploy e nunca devolve segredos do ambiente do PM2.
    $normalizador = Join-Path $diretorioProjeto 'scripts\normalizar-pm2-jlist.js'
    if (-not (Test-Path -LiteralPath $normalizador -PathType Leaf)) {
        throw "Normalizador da lista do PM2 nao encontrado: $normalizador"
    }
    $arquivoTemporario = Join-Path ([IO.Path]::GetTempPath()) ("julian-pm2-{0}.json" -f ([guid]::NewGuid().ToString('N')))
    try {
        [IO.File]::WriteAllText($arquivoTemporario, $saida, (New-Object Text.UTF8Encoding($false)))
        $saidaNormalizada = (& $node.Source $normalizador $arquivoTemporario 2>&1) -join "`n"
        if ($LASTEXITCODE -ne 0) {
            throw "Nao foi possivel normalizar a lista do PM2: $saidaNormalizada"
        }
        return @($saidaNormalizada | ConvertFrom-Json)
    } finally {
        if (Test-Path -LiteralPath $arquivoTemporario) {
            Remove-Item -LiteralPath $arquivoTemporario -Force
        }
    }
}

function ObterProcessosJulian($pm2, [string]$nomePrincipal) {
    $nomes = [System.Collections.Generic.List[string]]::new()
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
            throw "Nao foi possivel ler as instalacoes comerciais: $($_.Exception.Message)"
        }
    }
    return @($nomes)
}

function ObterEstadoProcessos($pm2, $node, [string[]]$nomes) {
    $porNome = @{}
    foreach ($item in (ObterListaPm2 $pm2 $node)) {
        if ($item.name -notin $nomes) { continue }
        $porta = 0
        [void][int]::TryParse([string]$item.pm2_env.PORT, [ref]$porta)
        $porNome[[string]$item.name] = [PSCustomObject]@{
            nome = [string]$item.name
            status = [string]$item.pm2_env.status
            estavaOnline = [string]$item.pm2_env.status -eq 'online'
            porta = $porta
        }
    }
    foreach ($nome in $nomes) {
        if (-not $porNome.ContainsKey($nome)) {
            $porNome[$nome] = [PSCustomObject]@{
                nome = $nome
                status = 'ausente'
                estavaOnline = $false
                porta = 0
            }
        }
    }
    return $porNome
}

function EncerrarProcessosResiduaisJulian([string[]]$raizes) {
    $raizesValidas = @($raizes |
        Where-Object { $_ -and (Test-Path -LiteralPath $_) } |
        ForEach-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') } |
        Select-Object -Unique)
    if ($raizesValidas.Count -eq 0) { return }

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
    if ($processos.Count -gt 0) { Start-Sleep -Seconds 3 }
}

function ValidarPowerShell([string]$arquivo) {
    $tokens = $null
    $erros = $null
    [void][Management.Automation.Language.Parser]::ParseFile($arquivo, [ref]$tokens, [ref]$erros)
    if ($erros.Count -gt 0) {
        throw "PowerShell invalido em $arquivo`: $($erros[0].Message)"
    }
}

function PrepararRelease {
    param(
        [Parameter(Mandatory = $true)]$Git,
        [Parameter(Mandatory = $true)]$Npm,
        [Parameter(Mandatory = $true)]$Node,
        [Parameter(Mandatory = $true)][string]$CommitAlvo,
        [Parameter(Mandatory = $true)][bool]$InstalarDependencias
    )

    $raizTemporaria = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    $pastaRelease = Join-Path $raizTemporaria ("julian-play-release-{0}" -f ([Guid]::NewGuid().ToString('N')))
    $arquivoZip = "$pastaRelease.zip"
    New-Item -ItemType Directory -Path $pastaRelease -Force | Out-Null

    try {
        ExecutarComando -Comando $Git -Argumentos @('archive', '--format=zip', "--output=$arquivoZip", $CommitAlvo) -MensagemErro 'Nao foi possivel preparar o codigo candidato.' -Diretorio $diretorioProjeto
        Expand-Archive -LiteralPath $arquivoZip -DestinationPath $pastaRelease -Force
        Remove-Item -LiteralPath $arquivoZip -Force

        if ($InstalarDependencias) {
            Etapa 'Instalando dependencias na area isolada'
            $env:PUPPETEER_SKIP_DOWNLOAD = 'true'
            $env:PUPPETEER_SKIP_CHROME_DOWNLOAD = 'true'
            ExecutarComando -Comando $Npm -Argumentos @('ci', '--omit=dev') -MensagemErro 'A instalacao isolada de dependencias falhou.' -Diretorio $pastaRelease
        } else {
            $env:NODE_PATH = Join-Path $diretorioProjeto 'node_modules'
        }

        Etapa 'Validando a versao candidata antes de parar producao'
        $javascript = @(& $Git.Source diff --name-only "$CommitAlvo^" $CommitAlvo -- '*.js' '*.cjs' 2>$null)
        if ($LASTEXITCODE -ne 0 -or $javascript.Count -eq 0) {
            $javascript = @('bot.js', 'master/app.js', 'ecosystem.config.js', 'master/ecosystem.config.js')
        }
        foreach ($relativo in ($javascript | Select-Object -Unique)) {
            $arquivo = Join-Path $pastaRelease $relativo
            if (Test-Path -LiteralPath $arquivo -PathType Leaf) {
                ExecutarComando -Comando $Node -Argumentos @('--check', $arquivo) -MensagemErro "Erro de sintaxe em $relativo."
            }
        }

        Get-ChildItem -LiteralPath $pastaRelease -Filter '*.ps1' -File |
            ForEach-Object { ValidarPowerShell $_.FullName }

        # Testes internos usam bancos temporarios e DISABLE_WHATSAPP; nao tocam
        # nas sessoes nem nos bancos ativos.
        $env:DISABLE_WHATSAPP = '1'
        ExecutarComando -Comando $Npm -Argumentos @('test') -MensagemErro 'Os testes da versao candidata falharam.' -Diretorio $pastaRelease
        return $pastaRelease
    } catch {
        if (Test-Path -LiteralPath $arquivoZip) { Remove-Item -LiteralPath $arquivoZip -Force }
        if (Test-Path -LiteralPath $pastaRelease) { Remove-Item -LiteralPath $pastaRelease -Recurse -Force }
        throw
    } finally {
        Remove-Item Env:NODE_PATH -ErrorAction SilentlyContinue
        Remove-Item Env:DISABLE_WHATSAPP -ErrorAction SilentlyContinue
    }
}

function CalcularSha256Arquivo([string]$arquivo) {
    $fluxo = [IO.File]::OpenRead($arquivo)
    try {
        $sha = [Security.Cryptography.SHA256]::Create()
        try { return ([BitConverter]::ToString($sha.ComputeHash($fluxo))).Replace('-', '') }
        finally { $sha.Dispose() }
    } finally {
        $fluxo.Dispose()
    }
}

function CopiarBancoFechado {
    param(
        [Parameter(Mandatory = $true)][string]$Origem,
        [Parameter(Mandatory = $true)][string]$PastaBackup,
        [Parameter(Mandatory = $true)][string]$NomeBackup,
        [Parameter(Mandatory = $true)]$Node
    )
    New-Item -ItemType Directory -Path $PastaBackup -Force | Out-Null
    $destino = Join-Path $PastaBackup $NomeBackup
    Copy-Item -LiteralPath $Origem -Destination $destino
    $verificador = Join-Path $diretorioProjeto 'scripts\verificar-banco-sqlite.js'
    ExecutarComando -Comando $Node -Argumentos @($verificador, $destino) -MensagemErro "O backup $NomeBackup falhou no PRAGMA quick_check."
    $hashOrigem = CalcularSha256Arquivo $Origem
    $hashDestino = CalcularSha256Arquivo $destino
    if ($hashOrigem -ne $hashDestino) {
        throw "O backup $NomeBackup nao corresponde ao banco de origem."
    }
    [PSCustomObject]@{
        versao = 1
        arquivo = $NomeBackup
        criadoEm = (Get-Date).ToUniversalTime().ToString('o')
        tamanho = (Get-Item -LiteralPath $destino).Length
        hashSha256 = $hashDestino
        integridade = 'ok'
        finalidade = 'antes_atualizacao'
    } | ConvertTo-Json | Set-Content -LiteralPath "$destino.json" -Encoding UTF8
    Write-Host "Backup verificado: $destino" -ForegroundColor Green
    return $destino
}

function CriarBackupsAntesAtualizacao($Node) {
    $carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
    $banco = Join-Path $PastaDados 'clientes.db'
    if (Test-Path -LiteralPath $banco) {
        $pastaBackup = Join-Path $PastaDados 'backups'
        [void](CopiarBancoFechado -Origem $banco -PastaBackup $pastaBackup -NomeBackup "antes-atualizar-$carimbo.db" -Node $Node)
    } else {
        Write-Warning 'Banco clientes.db nao encontrado na pasta de dados informada.'
    }

    $arquivoMaster = Join-Path $diretorioProjeto '.julian-master-install.json'
    if (-not (Test-Path -LiteralPath $arquivoMaster)) { return }
    $configMaster = Get-Content -LiteralPath $arquivoMaster -Raw | ConvertFrom-Json
    if ($configMaster.dataDir) {
        $bancoMaster = Join-Path ([string]$configMaster.dataDir) 'master.db'
        if (Test-Path -LiteralPath $bancoMaster) {
            $backupsMaster = Join-Path ([string]$configMaster.dataDir) 'backups'
            [void](CopiarBancoFechado -Origem $bancoMaster -PastaBackup $backupsMaster -NomeBackup "master-antes-atualizar-$carimbo.db" -Node $Node)
        }
    }
    if (-not $configMaster.clientsDir -or -not (Test-Path -LiteralPath $configMaster.clientsDir)) { return }
    Get-ChildItem -LiteralPath $configMaster.clientsDir -Directory |
        Where-Object { $_.Name -ne '_arquivados' } |
        ForEach-Object {
            $bancoCliente = Join-Path $_.FullName 'clientes.db'
            if (Test-Path -LiteralPath $bancoCliente) {
                $backupsCliente = Join-Path $_.FullName 'backups'
                [void](CopiarBancoFechado -Origem $bancoCliente -PastaBackup $backupsCliente -NomeBackup "antes-atualizar-$carimbo.db" -Node $Node)
            }
        }
}

function PararProcessosOnline($pm2, $estados) {
    foreach ($estado in $estados.Values | Where-Object { $_.estavaOnline }) {
        Write-Host "Parando $($estado.nome)..." -ForegroundColor Yellow
        & $pm2.Source stop $estado.nome | Out-Null
        $codigoSaida = $LASTEXITCODE
        if ($codigoSaida -ne 0) { throw "Nao foi possivel parar $($estado.nome). Codigo $codigoSaida." }
    }
    Start-Sleep -Seconds 3
}

function IniciarProcessosAnteriores($pm2, $estados) {
    $ecosistemaPrincipal = Join-Path $diretorioProjeto 'ecosystem.config.js'
    $ecosistemaMaster = Join-Path $diretorioProjeto 'master\ecosystem.config.js'
    foreach ($estado in $estados.Values | Where-Object { $_.estavaOnline -and $_.nome -notin $ProcessosParaManterParados }) {
        Write-Host "Iniciando $($estado.nome)..." -ForegroundColor Cyan
        if ($estado.nome -eq $NomeProcesso) {
            & $pm2.Source startOrReload $ecosistemaPrincipal --only $estado.nome --update-env | Out-Null
        } elseif ($estado.nome -eq 'julian-master') {
            & $pm2.Source startOrReload $ecosistemaMaster --only $estado.nome --update-env | Out-Null
        } else {
            # Instalacoes comerciais ja possuem DATA_DIR, porta, licenca e
            # sessao proprios no PM2. Nao importe o ambiente do deploy nelas.
            & $pm2.Source restart $estado.nome | Out-Null
        }
        $codigoSaida = $LASTEXITCODE
        if ($codigoSaida -ne 0) { throw "Nao foi possivel iniciar $($estado.nome). Codigo $codigoSaida." }
    }
}

function AguardarSaude($pm2, $node, $estados, [string]$versaoEsperada) {
    $limite = (Get-Date).AddSeconds([Math]::Max(30, $TempoSaudeSegundos))
    $proximoAviso = Get-Date
    $pendentes = @($estados.Values | Where-Object {
        $_.estavaOnline -and $_.nome -notin $ProcessosParaManterParados
    })
    Write-Host "Aguardando prontidao de $($pendentes.Count) processo(s), limite de $TempoSaudeSegundos segundo(s)..." -ForegroundColor Cyan
    do {
        $listaAtual = ObterListaPm2 $pm2 $node
        $falhas = [System.Collections.Generic.List[string]]::new()
        foreach ($estado in $pendentes) {
            $pm2Atual = $listaAtual | Where-Object { $_.name -eq $estado.nome } | Select-Object -First 1
            if (-not $pm2Atual -or $pm2Atual.pm2_env.status -ne 'online') {
                $falhas.Add("$($estado.nome): PM2 $($pm2Atual.pm2_env.status)")
                continue
            }
            if ($estado.porta -le 0) {
                $falhas.Add("$($estado.nome): porta desconhecida")
                continue
            }
            try {
                $resposta = Invoke-RestMethod -Uri "http://127.0.0.1:$($estado.porta)/ready" -TimeoutSec 5
                if (-not $resposta.ok -or -not $resposta.ready) { $falhas.Add("$($estado.nome): readiness sem ok") }
                elseif ($versaoEsperada -and [string]$resposta.version -ne $versaoEsperada) {
                    $falhas.Add("$($estado.nome): versao $($resposta.version), esperada $versaoEsperada")
                }
            } catch {
                $falhas.Add("$($estado.nome): health indisponivel")
            }
        }
        if ($falhas.Count -eq 0) {
            Write-Host 'Prontidao confirmada.' -ForegroundColor Green
            return
        }
        $agora = Get-Date
        if ($agora -ge $proximoAviso) {
            $restantes = [Math]::Max(0, [int][Math]::Ceiling(($limite - $agora).TotalSeconds))
            Write-Host "Ainda aguardando ($restantes s): $($falhas -join '; ')" -ForegroundColor Yellow
            $proximoAviso = $agora.AddSeconds(15)
        }
        if ((Get-Date) -ge $limite) {
            throw "A nova versao nao ficou saudavel: $($falhas -join '; ')."
        }
        Start-Sleep -Seconds 3
    } while ($true)
}

function RemoverTemporarioSeguro([string]$caminho) {
    if (-not $caminho -or -not (Test-Path -LiteralPath $caminho)) { return }
    $resolvido = [IO.Path]::GetFullPath($caminho).TrimEnd('\')
    $raizTemporaria = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
    if (-not $resolvido.StartsWith("$raizTemporaria\", [StringComparison]::OrdinalIgnoreCase)) {
        throw "Recusa ao remover pasta fora do temporario: $resolvido"
    }
    Remove-Item -LiteralPath $resolvido -Recurse -Force
}

$npm = ExigirComando 'npm.cmd'
$node = ExigirComando 'node.exe'
$pm2 = ExigirComando 'pm2.cmd'
$git = ExigirComando 'git.exe'
$listaProcessosJulian = [System.Collections.Generic.List[string]]::new()
foreach ($processoEncontrado in (ObterProcessosJulian $pm2 $NomeProcesso)) {
    AdicionarProcessoJulian $listaProcessosJulian $processoEncontrado
}
foreach ($processoAdicional in $ProcessosParaManterParados) {
    AdicionarProcessoJulian $listaProcessosJulian $processoAdicional
}
$processosJulian = $listaProcessosJulian.ToArray()
$estadosAntes = ObterEstadoProcessos $pm2 $node $processosJulian
$processosSemPorta = @($estadosAntes.Values | Where-Object {
    $_.estavaOnline -and $_.nome -notin $ProcessosParaManterParados -and $_.porta -le 0
})
if ($processosSemPorta.Count -gt 0) {
    throw "Porta nao identificada antes de parar producao: $((@($processosSemPorta | ForEach-Object { $_.nome })) -join ', ')."
}
$commitAntesAtualizacao = (& $git.Source rev-parse HEAD).Trim()
$commitAlvo = $commitAntesAtualizacao
$dependenciasAlteradas = -not $PularDependencias
$pastaRelease = ''
$pastaNodeAnterior = ''
$pastaNodeFalha = ''
$trocouDependencias = $false
$parouProducao = $false
$atualizouCodigo = $false

if (-not $PularGit) {
    $alteracoes = & $git.Source status --porcelain --untracked-files=no
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel verificar o repositorio Git.' }
    if ($alteracoes) { throw 'Existem alteracoes locais no codigo. Salve-as no Git antes de atualizar para evitar perda.' }

    Etapa 'Consultando a versao publicada sem alterar producao'
    ExecutarComando -Comando $git -Argumentos @('fetch', 'origin', 'main') -MensagemErro 'git fetch falhou.' -Diretorio $diretorioProjeto
    $commitAlvo = (& $git.Source rev-parse 'origin/main').Trim()
    if (-not $commitAlvo) { throw 'Nao foi possivel identificar origin/main.' }
}

try {
    $resultadoPreparacao = @(PrepararRelease -Git $git -Npm $npm -Node $node -CommitAlvo $commitAlvo -InstalarDependencias $dependenciasAlteradas)
    $pastaRelease = [string]($resultadoPreparacao | Select-Object -Last 1)
    $raizTemporariaEsperada = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ([string]::IsNullOrWhiteSpace($pastaRelease) -or -not (Test-Path -LiteralPath $pastaRelease -PathType Container)) {
        throw 'A preparacao nao devolveu uma pasta de release valida.'
    }
    $pastaRelease = [IO.Path]::GetFullPath($pastaRelease)
    if (-not $pastaRelease.StartsWith($raizTemporariaEsperada, [StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($pastaRelease) -notlike 'julian-play-release-*') {
        throw "A pasta preparada esta fora da area temporaria autorizada: $pastaRelease"
    }

    Etapa 'Parando somente os processos que estavam online'
    PararProcessosOnline $pm2 $estadosAntes
    $parouProducao = $true

    $raizesProcessos = [System.Collections.Generic.List[string]]::new()
    $raizesProcessos.Add($diretorioProjeto)
    $raizesProcessos.Add($PastaDados)
    $arquivoMasterProcessos = Join-Path $diretorioProjeto '.julian-master-install.json'
    if (Test-Path -LiteralPath $arquivoMasterProcessos) {
        $configMasterProcessos = Get-Content -LiteralPath $arquivoMasterProcessos -Raw | ConvertFrom-Json
        if ($configMasterProcessos.clientsDir) { $raizesProcessos.Add([string]$configMasterProcessos.clientsDir) }
    }
    EncerrarProcessosResiduaisJulian $raizesProcessos.ToArray()

    Etapa 'Criando backups com os bancos fechados'
    CriarBackupsAntesAtualizacao $node

    if (-not $PularGit -and $commitAlvo -ne $commitAntesAtualizacao) {
        Etapa 'Aplicando o commit previamente validado'
        ExecutarComando -Comando $git -Argumentos @('merge', '--ff-only', $commitAlvo) -MensagemErro 'Nao foi possivel aplicar o commit validado.' -Diretorio $diretorioProjeto
        $atualizouCodigo = $true
    }

    if ($dependenciasAlteradas) {
        Etapa 'Trocando dependencias somente depois da instalacao aprovada'
        $nodeAtivo = Join-Path $diretorioProjeto 'node_modules'
        $nodeCandidato = Join-Path $pastaRelease 'node_modules'
        $pastaRecuperacao = Join-Path $PastaDados 'backups\deploy-recovery'
        New-Item -ItemType Directory -Path $pastaRecuperacao -Force | Out-Null
        $pastaNodeAnterior = Join-Path $pastaRecuperacao ("node_modules-{0}-{1}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $commitAntesAtualizacao.Substring(0, 7))
        if (Test-Path -LiteralPath $nodeAtivo) { Move-Item -LiteralPath $nodeAtivo -Destination $pastaNodeAnterior }
        try {
            Move-Item -LiteralPath $nodeCandidato -Destination $nodeAtivo
            $trocouDependencias = $true
        } catch {
            if ((Test-Path -LiteralPath $pastaNodeAnterior) -and -not (Test-Path -LiteralPath $nodeAtivo)) {
                Move-Item -LiteralPath $pastaNodeAnterior -Destination $nodeAtivo
            }
            throw
        }
    }

    Etapa 'Iniciando a versao validada'
    IniciarProcessosAnteriores $pm2 $estadosAntes
    $versaoEsperada = (Get-Content -LiteralPath (Join-Path $diretorioProjeto 'package.json') -Raw | ConvertFrom-Json).version
    AguardarSaude $pm2 $node $estadosAntes $versaoEsperada
    & $pm2.Source save --force
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel salvar o estado aprovado do PM2.' }

    if ($GerarPacoteCliente) {
        Etapa 'Recriando o pacote de instalacao local'
        $geradorPacote = Join-Path $diretorioProjeto 'entrega-cliente-local\USO_INTERNO_NAO_ENVIAR\CRIAR-PACOTE-APP.ps1'
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $geradorPacote
        if ($LASTEXITCODE -ne 0) { throw "Geracao do pacote local terminou com codigo $LASTEXITCODE." }
    }

    Write-Host "`nAtualizacao concluida e saude confirmada. Commit: $commitAlvo" -ForegroundColor Green
} catch {
    $falha = $_
    Write-Warning "Atualizacao recusada ou revertida: $($falha.Exception.Message)"
    if ($parouProducao) {
        Write-Warning 'Restaurando automaticamente a ultima versao funcional...'
        try {
            $listaAtualRollback = @(ObterListaPm2 $pm2 $node)
            foreach ($estado in $estadosAntes.Values | Where-Object { $_.estavaOnline }) {
                $atual = $listaAtualRollback | Where-Object { $_.name -eq $estado.nome } | Select-Object -First 1
                if (-not $atual -or $atual.pm2_env.status -ne 'online') { continue }
                Write-Host "Parando $($estado.nome) para rollback..." -ForegroundColor Yellow
                & $pm2.Source stop $estado.nome | Out-Null
                $codigoSaida = $LASTEXITCODE
                if ($codigoSaida -ne 0) { throw "Nao foi possivel parar $($estado.nome) para rollback. Codigo $codigoSaida." }
            }
            if ($atualizouCodigo) {
                ExecutarComando -Comando $git -Argumentos @('reset', '--hard', $commitAntesAtualizacao) -MensagemErro 'Falha ao restaurar o commit anterior.' -Diretorio $diretorioProjeto
            }
            if ($trocouDependencias -and (Test-Path -LiteralPath $pastaNodeAnterior)) {
                $nodeAtivo = Join-Path $diretorioProjeto 'node_modules'
                if (Test-Path -LiteralPath $nodeAtivo) {
                    $pastaNodeFalha = Join-Path (Split-Path -Parent $pastaNodeAnterior) ("node_modules-rejeitado-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
                    Move-Item -LiteralPath $nodeAtivo -Destination $pastaNodeFalha
                }
                Move-Item -LiteralPath $pastaNodeAnterior -Destination $nodeAtivo
            }
            IniciarProcessosAnteriores $pm2 $estadosAntes
            $versaoAnterior = (Get-Content -LiteralPath (Join-Path $diretorioProjeto 'package.json') -Raw | ConvertFrom-Json).version
            AguardarSaude $pm2 $node $estadosAntes $versaoAnterior
            & $pm2.Source save --force
            Write-Warning "Rollback confirmado no commit $commitAntesAtualizacao."
        } catch {
            Write-Error "O rollback automatico tambem falhou: $($_.Exception.Message)"
        }
    }
    throw $falha
} finally {
    if ($pastaRelease) { RemoverTemporarioSeguro $pastaRelease }
}

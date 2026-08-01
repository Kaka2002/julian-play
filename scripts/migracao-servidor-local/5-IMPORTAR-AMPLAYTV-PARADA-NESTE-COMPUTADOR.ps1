param(
    [Parameter(Mandatory=$true)][string]$Pacote,
    [Parameter(Mandatory=$true)][string]$AmbienteSeguro,
    [string]$ProjetoLocal = 'D:\julian-play',
    [string]$DadosMaster = 'D:\JulianPlayDados\master',
    [string]$DadosCliente = 'D:\JulianPlayDados\clientes\amplaytv',
    [string]$Slug = 'amplaytv',
    [string]$ProcessoPm2 = 'julian-amplaytv',
    [int]$Porta = 11004,
    [switch]$ConfirmarOrigemParada
)

$ErrorActionPreference = 'Stop'

function Exigir([bool]$condicao, [string]$mensagem) {
    if (-not $condicao) { throw $mensagem }
}

function ObterValor($objeto, [string]$nome, $padrao = '') {
    if ($null -ne $objeto) {
        $propriedade = $objeto.PSObject.Properties[$nome]
        if ($null -ne $propriedade -and $null -ne $propriedade.Value -and [string]$propriedade.Value -ne '') {
            return [string]$propriedade.Value
        }
    }
    return $padrao
}

function ValidarBanco([string]$banco) {
    $env:JULIAN_MIGRATION_DB = $banco
    try {
        & node.exe -e "const sqlite3=require('sqlite3').verbose();const db=new sqlite3.Database(process.env.JULIAN_MIGRATION_DB,sqlite3.OPEN_READONLY);db.get('PRAGMA quick_check',[],(e,r)=>{const v=r&&Object.values(r)[0];console.log(e||v);db.close();if(e||v!=='ok')process.exitCode=1})"
        if ($LASTEXITCODE -ne 0) { throw "Banco invalido: $banco" }
    } finally {
        Remove-Item Env:JULIAN_MIGRATION_DB -ErrorAction SilentlyContinue
    }
}

function ExecutarPm2Opcional([string]$acao, [string]$processo) {
    & cmd.exe /d /c "pm2.cmd $acao $processo >nul 2>nul"
}

function NormalizarCaminhoRelativo([string]$valor) {
    $relativo = ([string]$valor).Replace('/','\')
    while ($relativo.StartsWith('.\', [StringComparison]::Ordinal)) {
        $relativo = $relativo.Substring(2)
    }
    return $relativo
}

Exigir $ConfirmarOrigemParada 'Confirme que a AMPLAYTV esta parada no servidor e use -ConfirmarOrigemParada.'
Exigir (Test-Path -LiteralPath $Pacote -PathType Leaf) 'Pacote da AMPLAYTV nao encontrado.'
Exigir (Test-Path -LiteralPath $AmbienteSeguro -PathType Leaf) 'Arquivo de ambiente seguro nao encontrado.'
Exigir (Test-Path -LiteralPath (Join-Path $ProjetoLocal 'package.json') -PathType Leaf) 'Projeto local nao encontrado.'
Exigir (Test-Path -LiteralPath (Join-Path $DadosMaster 'master.db') -PathType Leaf) 'Banco do Painel Mestre local nao encontrado.'
Exigir ($null -ne (Get-Command node.exe -ErrorAction SilentlyContinue)) 'Node.js nao encontrado.'
Exigir ($null -ne (Get-Command pm2.cmd -ErrorAction SilentlyContinue)) 'PM2 nao encontrado.'
Exigir ($null -ne (Get-Command tar.exe -ErrorAction SilentlyContinue)) 'tar.exe nao encontrado.'

$pacoteCompleto = [IO.Path]::GetFullPath($Pacote)
if (Test-Path -LiteralPath "$pacoteCompleto.sha256" -PathType Leaf) {
    $hashEsperado = ((Get-Content -LiteralPath "$pacoteCompleto.sha256" -Raw).Trim() -split '\s+')[0]
    $hashRecebido = (Get-FileHash -LiteralPath $pacoteCompleto -Algorithm SHA256).Hash
    Exigir ($hashEsperado -eq $hashRecebido) 'O SHA-256 do pacote da AMPLAYTV nao confere.'
}

$projetoCompleto = [IO.Path]::GetFullPath($ProjetoLocal).TrimEnd('\')
$dadosMasterCompleto = [IO.Path]::GetFullPath($DadosMaster).TrimEnd('\')
$dadosClienteCompleto = [IO.Path]::GetFullPath($DadosCliente).TrimEnd('\')
$raizClientes = [IO.Path]::GetFullPath('D:\JulianPlayDados\clientes').TrimEnd('\') + '\'
$ambienteCompleto = [IO.Path]::GetFullPath($AmbienteSeguro)
Exigir ($dadosClienteCompleto.StartsWith($raizClientes, [StringComparison]::OrdinalIgnoreCase)) 'A AMPLAYTV deve permanecer em D:\JulianPlayDados\clientes.'
Exigir ($dadosClienteCompleto -ne $raizClientes.TrimEnd('\')) 'A pasta raiz de clientes nao pode ser usada como destino.'
Exigir (-not $ambienteCompleto.StartsWith($projetoCompleto + '\', [StringComparison]::OrdinalIgnoreCase)) 'O ambiente seguro deve ficar fora do repositorio.'
Exigir ($Porta -ge 1 -and $Porta -le 65535) 'Porta invalida.'

$pidPm2 = (& pm2.cmd pid $ProcessoPm2 2>$null | Select-Object -Last 1)
$pidAtivo = 0
[void][int]::TryParse([string]$pidPm2, [ref]$pidAtivo)
Exigir ($pidAtivo -eq 0) "O processo $ProcessoPm2 ja esta ativo neste computador. A importacao nao o interrompera."
$portaAtiva = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
Exigir ($null -eq $portaAtiva) "A porta $Porta ja esta em uso neste computador."

$ambienteMigrado = Get-Content -LiteralPath $ambienteCompleto -Raw | ConvertFrom-Json
Exigir ([string]$ambienteMigrado.formato -eq 'julian-play-ambiente-seguro-v1') 'Formato do ambiente seguro invalido.'
$ambienteCliente = $ambienteMigrado.amplaytv
Exigir ($null -ne $ambienteCliente) 'O ambiente seguro nao contem a configuracao da AMPLAYTV. Gere um novo arquivo no servidor.'
$token = ObterValor $ambienteCliente 'LICENSE_ADMIN_TOKEN' ''
$usuario = ObterValor $ambienteCliente 'PANEL_USER' ''
$senhaHash = ObterValor $ambienteCliente 'PANEL_PASSWORD_HASH' ''
$senhaLegada = ObterValor $ambienteCliente 'PANEL_PASSWORD' ''
$chaveDados = ObterValor $ambienteCliente 'JULIAN_SECRET_KEY' ''
Exigir ([bool]$token.Trim()) 'LICENSE_ADMIN_TOKEN da AMPLAYTV ausente.'
Exigir ([bool]$usuario.Trim()) 'PANEL_USER da AMPLAYTV ausente.'
Exigir ([bool]$senhaHash.Trim() -or [bool]$senhaLegada.Trim()) 'Senha do painel da AMPLAYTV ausente.'
$materialCofre = if ([bool]$chaveDados.Trim()) { $chaveDados } else { $token }
Exigir ([bool]$materialCofre.Trim()) 'A chave do cofre da AMPLAYTV nao foi encontrada.'
if (-not [bool]$chaveDados.Trim()) {
    Write-Warning 'AMPLAYTV usa LICENSE_ADMIN_TOKEN como chave legada do cofre; o mesmo token sera preservado.'
}

$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$temporario = "D:\MigracaoJulianPlay\Temporario-AMPLAYTV-$carimbo"
$backup = "D:\MigracaoJulianPlay\AntesImportacao-AMPLAYTV-$carimbo"
New-Item -ItemType Directory -Path $temporario,$backup -Force | Out-Null
$dadosAnterioresMovidos = $false
$masterAlterado = $false

try {
    & tar.exe -x -f $pacoteCompleto -C $temporario
    if ($LASTEXITCODE -ne 0) { throw "tar.exe nao conseguiu extrair o pacote (codigo $LASTEXITCODE)." }

    $manifestoPath = Join-Path $temporario 'manifesto.json'
    Exigir (Test-Path -LiteralPath $manifestoPath -PathType Leaf) 'Manifesto ausente no pacote.'
    $manifesto = Get-Content -LiteralPath $manifestoPath -Raw | ConvertFrom-Json
    Exigir ([string]$manifesto.formato -eq 'julian-play-cliente-parado-v1') 'Formato do pacote da AMPLAYTV invalido.'
    Exigir ([string]$manifesto.slug -eq $Slug) 'O pacote nao pertence a AMPLAYTV.'
    Exigir ([bool]$manifesto.processoConfirmadoParado) 'O pacote nao confirma que o processo estava parado na origem.'

    foreach ($item in @($manifesto.arquivos)) {
        $relativo = NormalizarCaminhoRelativo ([string]$item.caminho)
        Exigir (-not [IO.Path]::IsPathRooted($relativo)) "Caminho absoluto proibido no manifesto: $relativo"
        Exigir ($relativo -notmatch '(^|\\)\.\.(\\|$)') "Caminho fora do destino proibido no manifesto: $relativo"
        $arquivo = Join-Path $temporario $relativo
        if (-not (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
            $recuperado = Get-ChildItem -LiteralPath $temporario -File -Recurse -Force |
                Where-Object { $_.Name -ne 'manifesto.json' -and $_.Length -eq [long]$item.tamanho } |
                Where-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -eq [string]$item.sha256 } |
                Select-Object -First 1
            if ($recuperado) {
                New-Item -ItemType Directory -Path (Split-Path -Parent $arquivo) -Force | Out-Null
                Copy-Item -LiteralPath $recuperado.FullName -Destination $arquivo -Force
                Write-Warning "Nome reconstruido pelo SHA-256: $($item.caminho)"
            }
        }
        Exigir (Test-Path -LiteralPath $arquivo -PathType Leaf) "Arquivo ausente: $($item.caminho)"
        Exigir ((Get-Item -LiteralPath $arquivo).Length -eq [long]$item.tamanho) "Tamanho divergente: $($item.caminho)"
        $hash = (Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash
        Exigir ($hash -eq [string]$item.sha256) "Hash divergente: $($item.caminho)"
    }

    $permitidos = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    [void]$permitidos.Add('manifesto.json')
    foreach ($item in @($manifesto.arquivos)) {
        [void]$permitidos.Add((NormalizarCaminhoRelativo ([string]$item.caminho)))
    }
    Get-ChildItem -LiteralPath $temporario -File -Recurse -Force | ForEach-Object {
        $relativo = $_.FullName.Substring($temporario.Length + 1).Replace('/','\')
        if (-not $permitidos.Contains($relativo)) {
            Remove-Item -LiteralPath $_.FullName -Force
        }
    }

    ValidarBanco (Join-Path $temporario 'clientes.db')
    ValidarBanco (Join-Path $dadosMasterCompleto 'master.db')

    Copy-Item -LiteralPath (Join-Path $dadosMasterCompleto 'master.db') -Destination (Join-Path $backup 'master.db') -Force
    if (Test-Path -LiteralPath $dadosClienteCompleto) {
        Move-Item -LiteralPath $dadosClienteCompleto -Destination (Join-Path $backup 'dados-anteriores')
        $dadosAnterioresMovidos = $true
    }
    New-Item -ItemType Directory -Path $dadosClienteCompleto -Force | Out-Null

    foreach ($item in @($manifesto.arquivos)) {
        $relativo = NormalizarCaminhoRelativo ([string]$item.caminho)
        $origem = Join-Path $temporario $relativo
        $destino = Join-Path $dadosClienteCompleto $relativo
        New-Item -ItemType Directory -Path (Split-Path -Parent $destino) -Force | Out-Null
        Copy-Item -LiteralPath $origem -Destination $destino -Force
    }

    $segredosComuns = @('LICENSE_ADMIN_TOKEN','LICENSE_PRIVATE_KEY','LICENSE_PUBLIC_KEY','LICENSE_ROLE','LICENSE_CUSTOMER_NAME','LICENSE_DEFAULT_MODE','LICENSE_DEFAULT_TRIAL_DAYS','LICENSE_SIGNING_SECRET','JULIAN_SECRET_KEY','JULIAN_SECRET_KEY_PREVIOUS','SECURITY_SIGNING_SECRET','TRUST_PROXY')
    $segredosPainel = @('PANEL_USER','PANEL_PASSWORD','PANEL_PASSWORD_HASH','PANEL_TOTP_SECRET','PANEL_SETUP_TOKEN','PANEL_SESSION_HOURS','PANEL_COOKIE_SECURE','PANEL_LOGIN_MAX_ATTEMPTS','PANEL_LOGIN_LOCK_MINUTES')
    $segredosRenovacao = @('RENOVACAO_HORA_ENVIO','RENOVACAO_MINUTO_ENVIO')
    $envProcesso = [ordered]@{
        NODE_ENV = 'production'
        JULIAN_PLAY_APP_NAME = $ProcessoPm2
        JULIAN_PLAY_INSTALL_MODE = 'server'
        PORT = [string]$Porta
        DATA_DIR = $dadosClienteCompleto
    }
    foreach ($nome in ($segredosComuns + $segredosPainel + $segredosRenovacao)) {
        $valor = ObterValor $ambienteCliente $nome $null
        if ($null -ne $valor) { $envProcesso[$nome] = [string]$valor }
    }
    $configuracaoPm2 = [ordered]@{
        apps = @([ordered]@{
            name = $ProcessoPm2
            cwd = $projetoCompleto
            script = (Join-Path $projetoCompleto 'bot.js')
            instances = 1
            exec_mode = 'fork'
            autorestart = $true
            watch = $false
            restart_delay = 10000
            kill_timeout = 30000
            max_memory_restart = '500M'
            env = $envProcesso
        })
    }
    $conteudoEcossistema = "module.exports = $($configuracaoPm2 | ConvertTo-Json -Depth 8);`n"
    [IO.File]::WriteAllText(
        (Join-Path $dadosClienteCompleto 'ecosystem.config.cjs'),
        $conteudoEcossistema,
        [Text.UTF8Encoding]::new($false)
    )

    $env:JULIAN_MASTER_DB = Join-Path $dadosMasterCompleto 'master.db'
    $env:JULIAN_CLIENT_SLUG = $Slug
    $env:JULIAN_CLIENT_DATA = $dadosClienteCompleto
    $env:JULIAN_CLIENT_PROCESS = $ProcessoPm2
    $env:JULIAN_CLIENT_PORT = [string]$Porta
    $masterAlterado = $true
    try {
        & node.exe (Join-Path $projetoCompleto 'scripts\migracao-servidor-local\adaptar-cliente-parado.js')
        if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel adaptar o cadastro local da AMPLAYTV.' }
    } finally {
        Remove-Item Env:JULIAN_MASTER_DB,Env:JULIAN_CLIENT_SLUG,Env:JULIAN_CLIENT_DATA,Env:JULIAN_CLIENT_PROCESS,Env:JULIAN_CLIENT_PORT -ErrorAction SilentlyContinue
    }

    ValidarBanco (Join-Path $dadosClienteCompleto 'clientes.db')
    ValidarBanco (Join-Path $dadosMasterCompleto 'master.db')
    ExecutarPm2Opcional 'delete' $ProcessoPm2
    & pm2.cmd save --force | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'PM2 nao conseguiu salvar a lista com a AMPLAYTV parada.' }

    Write-Host 'AMPLAYTV importada e cadastrada no Painel Mestre sem iniciar o robo.' -ForegroundColor Green
    Write-Host "Dados: $dadosClienteCompleto" -ForegroundColor Green
    Write-Host "Backup anterior: $backup" -ForegroundColor Yellow
    Write-Warning 'Nao inicie a AMPLAYTV enquanto o cliente estiver usando a instalacao local dele.'
} catch {
    if ($masterAlterado -and (Test-Path -LiteralPath (Join-Path $backup 'master.db'))) {
        Copy-Item -LiteralPath (Join-Path $backup 'master.db') -Destination (Join-Path $dadosMasterCompleto 'master.db') -Force
    }
    if (Test-Path -LiteralPath $dadosClienteCompleto) {
        Remove-Item -LiteralPath $dadosClienteCompleto -Recurse -Force
    }
    if ($dadosAnterioresMovidos -and (Test-Path -LiteralPath (Join-Path $backup 'dados-anteriores'))) {
        Move-Item -LiteralPath (Join-Path $backup 'dados-anteriores') -Destination $dadosClienteCompleto
    }
    throw
} finally {
    Remove-Item -LiteralPath $temporario -Recurse -Force -ErrorAction SilentlyContinue
}

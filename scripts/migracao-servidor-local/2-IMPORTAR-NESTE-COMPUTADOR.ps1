param(
    [Parameter(Mandatory=$true)][string]$Pacote,
    [string]$ProjetoLocal = 'D:\julian-play',
    [string]$DadosAdministrador = 'D:\JulianPlayDados\admin',
    [string]$DadosMaster = 'D:\JulianPlayDados\master',
    [string]$DadosClientes = 'D:\JulianPlayDados\clientes',
    [string]$AmbienteSeguro,
    [switch]$ConfirmarServidorParado
)

$ErrorActionPreference = 'Stop'

function Exigir([bool]$condicao, [string]$mensagem) {
    if (-not $condicao) { throw $mensagem }
}

function ValidarBanco([string]$banco, [string]$projeto) {
    $env:JULIAN_MIGRATION_DB = $banco
    try {
        & node.exe -e "const sqlite3=require('sqlite3').verbose();const db=new sqlite3.Database(process.env.JULIAN_MIGRATION_DB);db.get('PRAGMA quick_check',[],(e,r)=>{const v=r&&Object.values(r)[0];console.log(e||v);db.close();if(e||v!=='ok')process.exitCode=1})"
        if ($LASTEXITCODE -ne 0) { throw "Banco invalido: $banco" }
    } finally {
        Remove-Item Env:JULIAN_MIGRATION_DB -ErrorAction SilentlyContinue
    }
}

function ExecutarPm2Opcional([string]$acao, [string]$processo) {
    # Processos migrados podem ainda nao existir nesta maquina. Execute pelo
    # cmd para que a mensagem esperada do PM2 nao seja promovida a excecao
    # pelo ErrorActionPreference=Stop do Windows PowerShell 5.1.
    & cmd.exe /d /c "pm2.cmd $acao $processo >nul 2>nul"
}

function ObterValor($objeto, [string]$nome, $padrao = '') {
    if ($null -ne $objeto) {
        $propriedade = $objeto.PSObject.Properties[$nome]
        if ($null -ne $propriedade -and $null -ne $propriedade.Value -and [string]$propriedade.Value -ne '') {
            return $propriedade.Value
        }
    }
    return $padrao
}

function AplicarAmbienteSeguro($objeto, [string[]]$permitidas) {
    if ($null -eq $objeto) { return }
    foreach ($nome in $permitidas) {
        $valor = ObterValor $objeto $nome $null
        if ($null -ne $valor) {
            [Environment]::SetEnvironmentVariable($nome, [string]$valor, 'Process')
        }
    }
}

function LimparAmbienteSeguro([string[]]$nomes) {
    foreach ($nome in $nomes) {
        Remove-Item "Env:$nome" -ErrorAction SilentlyContinue
    }
}

Exigir $ConfirmarServidorParado 'Confirme primeiro que julian-play e julian-master estao parados no servidor e use -ConfirmarServidorParado.'
Exigir (Test-Path -LiteralPath $Pacote -PathType Leaf) 'Pacote de migracao nao encontrado.'
Exigir (Test-Path -LiteralPath (Join-Path $ProjetoLocal 'package.json')) 'Projeto local nao encontrado.'
Exigir ([IO.Path]::GetFullPath($DadosAdministrador) -ne 'C:\JulianPlay\dados') 'A instalacao local independente nunca pode ser sobrescrita.'
Exigir ([IO.Path]::GetPathRoot($DadosAdministrador) -eq 'D:\') 'Os dados migrados do administrador devem permanecer no disco D:.'
Exigir ([IO.Path]::GetPathRoot($DadosMaster) -eq 'D:\') 'Os dados migrados do Painel Mestre devem permanecer no disco D:.'
Exigir ($null -ne (Get-Command node.exe -ErrorAction SilentlyContinue)) 'Node.js nao encontrado.'
Exigir ($null -ne (Get-Command pm2.cmd -ErrorAction SilentlyContinue)) 'PM2 nao encontrado.'

$ambienteMigrado = $null
if ($AmbienteSeguro) {
    Exigir (Test-Path -LiteralPath $AmbienteSeguro -PathType Leaf) 'Arquivo de ambiente seguro nao encontrado.'
    $caminhoAmbienteSeguro = [IO.Path]::GetFullPath($AmbienteSeguro)
    $raizProjeto = [IO.Path]::GetFullPath($ProjetoLocal).TrimEnd('\') + '\'
    Exigir (-not $caminhoAmbienteSeguro.StartsWith($raizProjeto, [StringComparison]::OrdinalIgnoreCase)) 'O ambiente seguro deve ficar fora do repositorio.'
    $ambienteMigrado = Get-Content -LiteralPath $caminhoAmbienteSeguro -Raw | ConvertFrom-Json
}

$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$temporario = "D:\MigracaoJulianPlay\Temporario-$carimbo"
$backup = "D:\MigracaoJulianPlay\AntesImportacao-$carimbo"
New-Item -ItemType Directory -Path $temporario,$backup -Force | Out-Null

try {
    Expand-Archive -LiteralPath $Pacote -DestinationPath $temporario -Force
    $manifestoPath = Join-Path $temporario 'manifesto.json'
    Exigir (Test-Path -LiteralPath $manifestoPath) 'Manifesto ausente no pacote.'
    $manifesto = Get-Content -LiteralPath $manifestoPath -Raw | ConvertFrom-Json
    foreach ($item in @($manifesto.arquivos)) {
        $arquivo = Join-Path $temporario ([string]$item.caminho)
        if (-not (Test-Path -LiteralPath $arquivo -PathType Leaf)) {
            $recuperado = Get-ChildItem -LiteralPath $temporario -File -Recurse -Force |
                Where-Object { $_.Length -eq [long]$item.tamanho } |
                Where-Object { (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash -eq [string]$item.sha256 } |
                Select-Object -First 1
            if ($recuperado) {
                New-Item -ItemType Directory -Path (Split-Path -Parent $arquivo) -Force | Out-Null
                Copy-Item -LiteralPath $recuperado.FullName -Destination $arquivo -Force
                Write-Warning "Nome reconstruido pelo SHA-256: $($item.caminho)"
            }
        }
        Exigir (Test-Path -LiteralPath $arquivo -PathType Leaf) "Arquivo ausente: $($item.caminho)"
        $hash = (Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash
        Exigir ($hash -eq [string]$item.sha256) "Hash divergente: $($item.caminho)"
    }

    $permitidos = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
    [void]$permitidos.Add('manifesto.json')
    foreach ($item in @($manifesto.arquivos)) {
        [void]$permitidos.Add(([string]$item.caminho).Replace('/','\').TrimStart('.','\'))
    }
    Get-ChildItem -LiteralPath $temporario -File -Recurse -Force | ForEach-Object {
        $relativo = $_.FullName.Substring($temporario.Length + 1).Replace('/','\')
        if (-not $permitidos.Contains($relativo)) {
            Remove-Item -LiteralPath $_.FullName -Force
        }
    }

    Set-Location $ProjetoLocal
    ValidarBanco (Join-Path $temporario 'admin\clientes.db') $ProjetoLocal
    ValidarBanco (Join-Path $temporario 'master\master.db') $ProjetoLocal

    # Resolva e valide toda a configuracao antes de parar processos ou mover
    # qualquer dado local. Uma credencial ausente encerra somente o preflight.
    $configAdminOrigem = Join-Path $temporario '.julian-play-install.json'
    $configAdminPacote = if (Test-Path -LiteralPath $configAdminOrigem) {
        Get-Content -LiteralPath $configAdminOrigem -Raw | ConvertFrom-Json
    } else { $null }
    $ambienteAdmin = if ($null -ne $ambienteMigrado) { $ambienteMigrado.admin } else { $null }
    $tokenAdmin = ObterValor $configAdminPacote 'licenseAdminToken' (ObterValor $ambienteAdmin 'LICENSE_ADMIN_TOKEN' '')
    Exigir ([bool]([string]$tokenAdmin).Trim()) 'Configuracao do administrador ausente e LICENSE_ADMIN_TOKEN nao foi fornecido no ambiente seguro.'
    $configAdmin = [ordered]@{
        appName = 'julian-play-admin'
        port = 10001
        dataDir = $DadosAdministrador
        trialDays = [int](ObterValor $configAdminPacote 'trialDays' (ObterValor $ambienteAdmin 'LICENSE_DEFAULT_TRIAL_DAYS' 0))
        licenseAdminToken = [string]$tokenAdmin
        licensePublicKey = [string](ObterValor $configAdminPacote 'licensePublicKey' (ObterValor $ambienteAdmin 'LICENSE_PUBLIC_KEY' ''))
        installMode = 'server'
    }

    $configMasterOrigem = Join-Path $temporario '.julian-master-install.json'
    $configMasterPacote = if (Test-Path -LiteralPath $configMasterOrigem) {
        Get-Content -LiteralPath $configMasterOrigem -Raw | ConvertFrom-Json
    } else { $null }
    $ambienteMaster = if ($null -ne $ambienteMigrado) { $ambienteMigrado.master } else { $null }
    $usuarioMaster = ObterValor $configMasterPacote 'user' (ObterValor $ambienteMaster 'MASTER_USER' '')
    $senhaMaster = ObterValor $configMasterPacote 'passwordHash' (ObterValor $ambienteMaster 'MASTER_PASSWORD_HASH' '')
    Exigir ([bool]([string]$usuarioMaster).Trim() -and [bool]([string]$senhaMaster).Trim()) 'Credenciais do Painel Mestre ausentes no pacote e no ambiente seguro.'
    $tokenMaster = ObterValor $configMasterPacote 'licenseAdminToken' (ObterValor $ambienteMaster 'LICENSE_ADMIN_TOKEN' $tokenAdmin)
    $configMaster = [ordered]@{
        port = 9000
        user = [string]$usuarioMaster
        passwordHash = [string]$senhaMaster
        totpSecret = [string](ObterValor $configMasterPacote 'totpSecret' (ObterValor $ambienteMaster 'MASTER_TOTP_SECRET' ''))
        sessionSecret = [string](ObterValor $configMasterPacote 'sessionSecret' (ObterValor $ambienteMaster 'MASTER_SESSION_SECRET' $tokenMaster))
        dataDir = $DadosMaster
        clientsDir = $DadosClientes
        archiveDir = (Join-Path $DadosClientes '_arquivados')
        baseDomain = [string](ObterValor $configMasterPacote 'baseDomain' (ObterValor $ambienteMaster 'MASTER_BASE_DOMAIN' 'julianplay.com.br'))
        firstPort = [int](ObterValor $configMasterPacote 'firstPort' (ObterValor $ambienteMaster 'MASTER_FIRST_PORT' 11001))
        licenseAdminToken = [string]$tokenMaster
        licenseSigningSecret = [string](ObterValor $configMasterPacote 'licenseSigningSecret' (ObterValor $ambienteMaster 'LICENSE_SIGNING_SECRET' $tokenMaster))
        licenseSigningPrivateKey = [string](ObterValor $configMasterPacote 'licenseSigningPrivateKey' (ObterValor $ambienteMaster 'LICENSE_PRIVATE_KEY' ''))
        licensePublicKey = [string](ObterValor $configMasterPacote 'licensePublicKey' (ObterValor $ambienteMaster 'LICENSE_PUBLIC_KEY' ''))
    }

    foreach ($processo in @('julian-play-admin','julian-master','julian-amplaytv')) {
        ExecutarPm2Opcional 'stop' $processo
    }

    if (Test-Path -LiteralPath $DadosAdministrador) {
        Move-Item -LiteralPath $DadosAdministrador -Destination (Join-Path $backup 'admin-anterior')
    }
    if (Test-Path -LiteralPath (Join-Path $DadosMaster 'master.db')) {
        New-Item -ItemType Directory -Path (Join-Path $backup 'master-anterior') -Force | Out-Null
        Copy-Item -LiteralPath (Join-Path $DadosMaster 'master.db') -Destination (Join-Path $backup 'master-anterior\master.db') -Force
    }
    foreach ($config in @('.julian-play-install.json','.julian-master-install.json')) {
        $atual = Join-Path $ProjetoLocal $config
        if (Test-Path -LiteralPath $atual) { Copy-Item -LiteralPath $atual -Destination (Join-Path $backup $config) -Force }
    }

    New-Item -ItemType Directory -Path $DadosAdministrador,$DadosMaster,$DadosClientes -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $temporario 'admin\clientes.db') -Destination (Join-Path $DadosAdministrador 'clientes.db') -Force
    foreach ($nome in @('.wwebjs_auth','backups','assets','database','migrations')) {
        $origem = Join-Path $temporario "admin\$nome"
        if (Test-Path -LiteralPath $origem) { Copy-Item -LiteralPath $origem -Destination (Join-Path $DadosAdministrador $nome) -Recurse -Force }
    }
    Copy-Item -LiteralPath (Join-Path $temporario 'master\master.db') -Destination (Join-Path $DadosMaster 'master.db') -Force

    $configAdmin | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ProjetoLocal '.julian-play-install.json') -Encoding UTF8

    $configMaster | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ProjetoLocal '.julian-master-install.json') -Encoding UTF8

    $env:JULIAN_MASTER_DB = Join-Path $DadosMaster 'master.db'
    $env:JULIAN_ADMIN_DATA = $DadosAdministrador
    try {
        & node.exe (Join-Path $ProjetoLocal 'scripts\migracao-servidor-local\adaptar-cadastro-local.js')
        if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel adaptar o cadastro local do administrador.' }
    } finally {
        Remove-Item Env:JULIAN_MASTER_DB,Env:JULIAN_ADMIN_DATA -ErrorAction SilentlyContinue
    }

    $segredosComuns = @('LICENSE_ADMIN_TOKEN','LICENSE_PRIVATE_KEY','LICENSE_PUBLIC_KEY','LICENSE_ROLE','LICENSE_CUSTOMER_NAME','LICENSE_DEFAULT_MODE','LICENSE_DEFAULT_TRIAL_DAYS','LICENSE_SIGNING_SECRET','JULIAN_SECRET_KEY','JULIAN_SECRET_KEY_PREVIOUS','SECURITY_SIGNING_SECRET','TRUST_PROXY')
    $segredosPainel = @('PANEL_USER','PANEL_PASSWORD','PANEL_PASSWORD_HASH','PANEL_TOTP_SECRET','PANEL_SETUP_TOKEN','PANEL_SESSION_HOURS','PANEL_COOKIE_SECURE','PANEL_LOGIN_MAX_ATTEMPTS','PANEL_LOGIN_LOCK_MINUTES')
    AplicarAmbienteSeguro $ambienteAdmin ($segredosComuns + $segredosPainel)
    $env:JULIAN_PLAY_APP_NAME = 'julian-play-admin'
    $env:JULIAN_PLAY_PORT = '10001'
    $env:JULIAN_PLAY_DATA_DIR = $DadosAdministrador
    $env:JULIAN_PLAY_INSTALL_MODE = 'server'
    ExecutarPm2Opcional 'delete' 'julian-play-admin'
    & pm2.cmd start (Join-Path $ProjetoLocal 'ecosystem.config.js') --only julian-play-admin --update-env | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar julian-play-admin.' }
    LimparAmbienteSeguro ($segredosComuns + $segredosPainel)
    $segredosMaster = @('MASTER_USER','MASTER_PASSWORD_HASH','MASTER_TOTP_SECRET','MASTER_SESSION_SECRET','MASTER_LOGIN_MAX_ATTEMPTS','MASTER_LOGIN_LOCK_MINUTES','MASTER_PUBLIC_URL')
    AplicarAmbienteSeguro $ambienteMaster ($segredosComuns + $segredosMaster)
    ExecutarPm2Opcional 'delete' 'julian-master'
    & pm2.cmd start (Join-Path $ProjetoLocal 'master\ecosystem.config.js') --only julian-master --update-env | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar julian-master.' }
    ExecutarPm2Opcional 'stop' 'julian-amplaytv'
    & pm2.cmd save --force | Out-Host
    LimparAmbienteSeguro ($segredosComuns + $segredosMaster)

    Write-Host 'Importacao concluida. Nao encerre o servidor ate validar portas, login, banco, WhatsApp e Cloudflare.' -ForegroundColor Green
    Write-Host "Backup local anterior: $backup" -ForegroundColor Yellow
} finally {
    Remove-Item -LiteralPath $temporario -Recurse -Force -ErrorAction SilentlyContinue
}

param(
    [Parameter(Mandatory=$true)][string]$Pacote,
    [string]$ProjetoLocal = 'D:\julian-play',
    [string]$DadosAdministrador = 'D:\JulianPlayDados\admin',
    [string]$DadosMaster = 'D:\JulianPlayDados\master',
    [string]$DadosClientes = 'D:\JulianPlayDados\clientes',
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

Exigir $ConfirmarServidorParado 'Confirme primeiro que julian-play e julian-master estao parados no servidor e use -ConfirmarServidorParado.'
Exigir (Test-Path -LiteralPath $Pacote -PathType Leaf) 'Pacote de migracao nao encontrado.'
Exigir (Test-Path -LiteralPath (Join-Path $ProjetoLocal 'package.json')) 'Projeto local nao encontrado.'
Exigir ([IO.Path]::GetFullPath($DadosAdministrador) -ne 'C:\JulianPlay\dados') 'A instalacao local independente nunca pode ser sobrescrita.'
Exigir ([IO.Path]::GetPathRoot($DadosAdministrador) -eq 'D:\') 'Os dados migrados do administrador devem permanecer no disco D:.'
Exigir ([IO.Path]::GetPathRoot($DadosMaster) -eq 'D:\') 'Os dados migrados do Painel Mestre devem permanecer no disco D:.'
Exigir ($null -ne (Get-Command node.exe -ErrorAction SilentlyContinue)) 'Node.js nao encontrado.'
Exigir ($null -ne (Get-Command pm2.cmd -ErrorAction SilentlyContinue)) 'PM2 nao encontrado.'

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
        Exigir (Test-Path -LiteralPath $arquivo -PathType Leaf) "Arquivo ausente: $($item.caminho)"
        $hash = (Get-FileHash -LiteralPath $arquivo -Algorithm SHA256).Hash
        Exigir ($hash -eq [string]$item.sha256) "Hash divergente: $($item.caminho)"
    }

    Set-Location $ProjetoLocal
    ValidarBanco (Join-Path $temporario 'admin\clientes.db') $ProjetoLocal
    ValidarBanco (Join-Path $temporario 'master\master.db') $ProjetoLocal

    foreach ($processo in @('julian-play-admin','julian-master','julian-amplaytv')) {
        & pm2.cmd stop $processo 2>$null | Out-Null
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
    foreach ($nome in @('.wwebjs_auth','backups')) {
        $origem = Join-Path $temporario "admin\$nome"
        if (Test-Path -LiteralPath $origem) { Copy-Item -LiteralPath $origem -Destination (Join-Path $DadosAdministrador $nome) -Recurse -Force }
    }
    Copy-Item -LiteralPath (Join-Path $temporario 'master\master.db') -Destination (Join-Path $DadosMaster 'master.db') -Force

    $configAdminOrigem = Join-Path $temporario '.julian-play-install.json'
    Exigir (Test-Path -LiteralPath $configAdminOrigem) 'Configuracao do administrador ausente.'
    $configAdmin = Get-Content -LiteralPath $configAdminOrigem -Raw | ConvertFrom-Json
    $configAdmin.appName = 'julian-play-admin'
    $configAdmin.port = 10001
    $configAdmin.dataDir = $DadosAdministrador
    $configAdmin.installMode = 'server'
    $configAdmin | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ProjetoLocal '.julian-play-install.json') -Encoding UTF8

    $configMasterOrigem = Join-Path $temporario '.julian-master-install.json'
    Exigir (Test-Path -LiteralPath $configMasterOrigem) 'Configuracao do Painel Mestre ausente.'
    $configMaster = Get-Content -LiteralPath $configMasterOrigem -Raw | ConvertFrom-Json
    $configMaster.dataDir = $DadosMaster
    $configMaster.clientsDir = $DadosClientes
    $configMaster.archiveDir = (Join-Path $DadosClientes '_arquivados')
    $configMaster.port = 9000
    $configMaster | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $ProjetoLocal '.julian-master-install.json') -Encoding UTF8

    $env:JULIAN_MASTER_DB = Join-Path $DadosMaster 'master.db'
    $env:JULIAN_ADMIN_DATA = $DadosAdministrador
    & node.exe -e "const sqlite3=require('sqlite3').verbose();const db=new sqlite3.Database(process.env.JULIAN_MASTER_DB);db.run(\"UPDATE instalacoes SET processoPm2='julian-play-admin', porta=10001, pastaDados=? WHERE processoPm2='julian-play' OR porta=10000\",[process.env.JULIAN_ADMIN_DATA],e=>{if(e){console.error(e);process.exitCode=1}db.close()})"
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel adaptar o cadastro local do administrador.' }
    Remove-Item Env:JULIAN_MASTER_DB,Env:JULIAN_ADMIN_DATA -ErrorAction SilentlyContinue

    $env:JULIAN_PLAY_APP_NAME = 'julian-play-admin'
    $env:JULIAN_PLAY_PORT = '10001'
    $env:JULIAN_PLAY_DATA_DIR = $DadosAdministrador
    $env:JULIAN_PLAY_INSTALL_MODE = 'server'
    & pm2.cmd delete julian-play-admin 2>$null | Out-Null
    & pm2.cmd start (Join-Path $ProjetoLocal 'ecosystem.config.js') --only julian-play-admin --update-env | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar julian-play-admin.' }
    & pm2.cmd delete julian-master 2>$null | Out-Null
    & pm2.cmd start (Join-Path $ProjetoLocal 'master\ecosystem.config.js') --only julian-master --update-env | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao iniciar julian-master.' }
    & pm2.cmd stop julian-amplaytv 2>$null | Out-Null
    & pm2.cmd save --force | Out-Host

    Write-Host 'Importacao concluida. Nao encerre o servidor ate validar portas, login, banco, WhatsApp e Cloudflare.' -ForegroundColor Green
    Write-Host "Backup local anterior: $backup" -ForegroundColor Yellow
} finally {
    Remove-Item -LiteralPath $temporario -Recurse -Force -ErrorAction SilentlyContinue
}

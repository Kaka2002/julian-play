param(
    [string]$Dominio = 'gestao.julianplay.com.br',
    [string]$DominioBase = 'julianplay.com.br',
    [ValidateRange(1, 65535)][int]$Porta = 9000,
    [ValidateRange(1024, 65535)][int]$PrimeiraPortaCliente = 11001,
    [string]$Usuario = 'admin',
    [string]$Senha = ''
)

$ErrorActionPreference = 'Stop'
$projeto = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projeto

function Etapa([string]$mensagem) { Write-Host "`n==> $mensagem" -ForegroundColor Cyan }

if (-not $Senha) {
    $segura = Read-Host 'Informe a senha do Painel Mestre (minimo 8 caracteres)' -AsSecureString
    $ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($segura)
    try { $Senha = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro) }
}
if ($Senha.Length -lt 8) { throw 'A senha do Painel Mestre precisa ter pelo menos 8 caracteres.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js nao encontrado.' }
$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if (-not $pm2) { throw 'PM2 nao encontrado.' }

Etapa 'Gerando credenciais seguras do Painel Mestre'
$env:JULIAN_MASTER_PASSWORD_TEMP = $Senha
$hash = & node -e "const {criarHashSenha}=require('./services/passwordService'); process.stdout.write(criarHashSenha(process.env.JULIAN_MASTER_PASSWORD_TEMP));"
Remove-Item Env:JULIAN_MASTER_PASSWORD_TEMP -ErrorAction SilentlyContinue
if ($LASTEXITCODE -ne 0 -or -not $hash) { throw 'Nao foi possivel gerar o hash da senha.' }

$dadosMaster = 'C:\JulianPlayMaster'
$clientes = 'C:\JulianPlayClientes'
$caddyDir = Join-Path $dadosMaster 'caddy'
$arquivoConfig = Join-Path $projeto '.julian-master-install.json'
New-Item -ItemType Directory -Path $dadosMaster, $clientes, $caddyDir -Force | Out-Null

$config = [ordered]@{
    domain = $Dominio
    baseDomain = $DominioBase
    port = $Porta
    firstPort = $PrimeiraPortaCliente
    user = $Usuario
    passwordHash = [string]$hash
    dataDir = $dadosMaster
    clientsDir = $clientes
    archiveDir = (Join-Path $clientes '_arquivados')
    caddyDir = $caddyDir
    caddyExe = 'C:\caddy\caddy.exe'
    caddyConfig = 'C:\caddy\Caddyfile'
}
$json = $config | ConvertTo-Json
[IO.File]::WriteAllText($arquivoConfig, $json, (New-Object Text.UTF8Encoding($false)))

Etapa 'Integrando o Painel Mestre ao Caddy'
$caddyFile = 'C:\caddy\Caddyfile'
$caddyExe = 'C:\caddy\caddy.exe'
if (-not (Test-Path -LiteralPath $caddyFile) -or -not (Test-Path -LiteralPath $caddyExe)) {
    throw 'Caddy nao encontrado em C:\caddy.'
}
$backupCaddy = "$caddyFile.antes-master-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $caddyFile -Destination $backupCaddy -Force
$importacao = 'import C:/JulianPlayMaster/caddy/*.caddy'
$conteudoCaddy = Get-Content -LiteralPath $caddyFile -Raw
if ($conteudoCaddy -notmatch [regex]::Escape($importacao)) {
    Add-Content -LiteralPath $caddyFile -Value "`r`n$importacao`r`n" -Encoding ASCII
}
@"
$Dominio {
    reverse_proxy 127.0.0.1:$Porta
    encode gzip
}
"@ | Set-Content -LiteralPath (Join-Path $caddyDir 'master.caddy') -Encoding ASCII

& $caddyExe validate --config $caddyFile
if ($LASTEXITCODE -ne 0) {
    Copy-Item -LiteralPath $backupCaddy -Destination $caddyFile -Force
    throw 'Caddyfile invalido. O arquivo anterior foi restaurado.'
}

Etapa 'Iniciando o Painel Mestre'
try {
    & $pm2.Source delete julian-master 2>$null | Out-Host
} catch {
    # Na primeira instalacao o processo ainda nao existe.
}
& $pm2.Source start (Join-Path $projeto 'master\ecosystem.config.js') --only julian-master
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel iniciar julian-master no PM2.' }
& $pm2.Source save --force
& $caddyExe reload --config $caddyFile
if ($LASTEXITCODE -ne 0) { throw 'Painel iniciado, mas o Caddy nao recarregou.' }

Etapa 'Painel Mestre instalado'
Write-Host "URL: https://$Dominio" -ForegroundColor Green
Write-Host "Usuario: $Usuario" -ForegroundColor Yellow
Write-Host 'Cadastre no DNS um registro A para gestao e um registro A curinga (*) apontando para este servidor.' -ForegroundColor Yellow
& $pm2.Source status

param(
    [ValidateRange(1, 65535)]
    [int]$Porta = 10000,

    [string]$PastaInstalacao = 'C:\JulianPlay\app',

    [string]$PastaDados = 'C:\JulianPlay\dados'
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

function TestarAdministrador {
    $identidade = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identidade)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

$pacote = Join-Path $PSScriptRoot 'julian-play-app.zip'
if (-not (Test-Path -LiteralPath $pacote)) {
    throw 'Arquivo julian-play-app.zip nao encontrado nesta pasta. Solicite o pacote oficial ao fornecedor.'
}

Etapa 'Verificando programas obrigatorios'
ExigirComando 'node' 'Node.js nao encontrado. Instale em https://nodejs.org/ e execute novamente.' | Out-Null
ExigirComando 'npm.cmd' 'npm nao encontrado. Reinstale o Node.js e execute novamente.' | Out-Null

$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
if ($chromePaths.Count -eq 0) {
    throw 'Google Chrome nao encontrado. Instale em https://www.google.com/chrome/ e execute novamente.'
}

Etapa 'Preparando pastas'
New-Item -ItemType Directory -Path $PastaInstalacao, $PastaDados -Force | Out-Null

if (Test-Path -LiteralPath (Join-Path $PastaInstalacao 'package.json')) {
    $backup = "C:\JulianPlay\app-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item -LiteralPath $PastaInstalacao -Destination $backup -Force
    New-Item -ItemType Directory -Path $PastaInstalacao -Force | Out-Null
    Write-Host "Instalacao anterior movida para $backup" -ForegroundColor Yellow
}

Etapa 'Extraindo pacote oficial'
Expand-Archive -LiteralPath $pacote -DestinationPath $PastaInstalacao -Force

$subpastas = @(Get-ChildItem -LiteralPath $PastaInstalacao -Directory)
if (-not (Test-Path -LiteralPath (Join-Path $PastaInstalacao 'package.json')) -and $subpastas.Count -eq 1) {
    Get-ChildItem -LiteralPath $subpastas[0].FullName -Force | Move-Item -Destination $PastaInstalacao -Force
    Remove-Item -LiteralPath $subpastas[0].FullName -Force
}

$instalador = Join-Path $PastaInstalacao 'install-windows.ps1'
if (-not (Test-Path -LiteralPath $instalador)) {
    throw 'Pacote invalido: install-windows.ps1 nao encontrado dentro do app.'
}

Etapa 'Instalando painel'
$argumentos = @(
    '-ExecutionPolicy', 'Bypass',
    '-File', $instalador,
    '-Porta', [string]$Porta,
    '-NomeProcesso', 'julian-play-cliente',
    '-PastaDados', $PastaDados
)

if (TestarAdministrador) {
    $argumentos += '-AbrirFirewall'
}

& powershell @argumentos
if ($LASTEXITCODE -ne 0) {
    throw "Instalador terminou com codigo $LASTEXITCODE."
}

Etapa 'Instalacao finalizada'
Write-Host "Painel: http://localhost:$Porta" -ForegroundColor Green
Write-Host "Licenca: http://localhost:$Porta/licenca" -ForegroundColor Green
Write-Host "WhatsApp: http://localhost:$Porta/qr" -ForegroundColor Green
Start-Process "http://localhost:$Porta"

Read-Host 'Pressione ENTER para fechar'

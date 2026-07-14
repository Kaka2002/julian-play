$ErrorActionPreference = 'Stop'

function Titulo($texto) {
    Write-Host "`n==> $texto" -ForegroundColor Cyan
}

function Ok($texto) {
    Write-Host "OK - $texto" -ForegroundColor Green
}

function Falha($texto) {
    Write-Host "PENDENTE - $texto" -ForegroundColor Yellow
}

$pendencias = 0

Titulo 'Verificando Windows'
$versao = [Environment]::OSVersion.Version
if ($versao.Major -ge 10) {
    Ok "Windows compativel: $versao"
} else {
    Falha "Use Windows 10 ou Windows 11. Versao detectada: $versao"
    $pendencias += 1
}

Titulo 'Verificando Node.js'
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
    $versaoNodeTexto = (& $node.Source --version).Trim()
    $versaoNode = [int]($versaoNodeTexto.TrimStart('v').Split('.')[0])
    if ($versaoNode -ge 20) {
        Ok "Node.js instalado: $versaoNodeTexto"
    } else {
        Falha "Node.js precisa ser versao 20 ou superior. Baixe em https://nodejs.org/"
        $pendencias += 1
    }
} else {
    Falha 'Node.js nao encontrado. Baixe em https://nodejs.org/'
    $pendencias += 1
}

Titulo 'Verificando npm'
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
if ($npm) {
    Ok 'npm encontrado'
} else {
    Falha 'npm nao encontrado. Reinstale o Node.js marcando a opcao npm.'
    $pendencias += 1
}

Titulo 'Verificando Google Chrome'
$chromePaths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if ($chromePaths.Count -gt 0) {
    Ok "Chrome encontrado: $($chromePaths[0])"
} else {
    Falha 'Google Chrome nao encontrado. Baixe em https://www.google.com/chrome/'
    $pendencias += 1
}

Titulo 'Verificando pacote do painel'
$pacote = Join-Path $PSScriptRoot 'julian-play-app.zip'
if (Test-Path -LiteralPath $pacote) {
    Ok 'Pacote oficial julian-play-app.zip encontrado'
} else {
    Falha 'Arquivo julian-play-app.zip nao encontrado nesta pasta. Solicite ao fornecedor.'
    $pendencias += 1
}

Titulo 'Resultado'
if ($pendencias -eq 0) {
    Write-Host 'Computador pronto para instalar.' -ForegroundColor Green
} else {
    Write-Host "Existem $pendencias pendencia(s). Corrija antes de instalar." -ForegroundColor Yellow
}

Read-Host 'Pressione ENTER para fechar'

param(
    [string]$PastaEntrega = (Join-Path $PSScriptRoot '..\ENVIAR_AO_CLIENTE')
)

$ErrorActionPreference = 'Stop'
$pastaResolvida = (Resolve-Path -LiteralPath $PastaEntrega).Path
$pacote = Join-Path $pastaResolvida 'julian-play-app.zip'
$instalador = Join-Path $pastaResolvida 'INSTALAR.exe'
if (-not (Test-Path -LiteralPath $pacote -PathType Leaf)) { throw "Pacote nao encontrado: $pacote" }
if (-not (Test-Path -LiteralPath $instalador -PathType Leaf)) { throw "Instalador nao encontrado: $instalador" }

$testeRaiz = Join-Path ([System.IO.Path]::GetTempPath()) ("julian-play-instalacao-limpa-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testeRaiz | Out-Null
try {
    Expand-Archive -LiteralPath $pacote -DestinationPath $testeRaiz -Force
    $obrigatorios = @('package.json', 'bot.js', 'supervisor.js', 'database\sqlite.js', 'routes\clientesRoute.js')
    foreach ($relativo in $obrigatorios) {
        if (-not (Test-Path -LiteralPath (Join-Path $testeRaiz $relativo) -PathType Leaf)) {
            throw "Arquivo obrigatorio ausente no pacote: $relativo"
        }
    }
    $proibidos = Get-ChildItem -LiteralPath $testeRaiz -Recurse -Force -ErrorAction Stop |
        Where-Object {
            $_.Name -eq '.git' -or
            $_.Name -eq '.wwebjs_auth' -or
            $_.Extension -eq '.db' -or
            $_.Name -match '(^|\\)(backups?|dados)$'
        }
    if ($proibidos) {
        throw "O pacote limpo contem dados persistentes proibidos: $($proibidos.FullName -join ', ')"
    }
    Write-Host "Pacote aprovado para instalacao limpa: $pacote" -ForegroundColor Green
} finally {
    if (Test-Path -LiteralPath $testeRaiz) {
        Remove-Item -LiteralPath $testeRaiz -Recurse -Force
    }
}

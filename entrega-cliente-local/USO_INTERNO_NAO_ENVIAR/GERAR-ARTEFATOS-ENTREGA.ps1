param(
    [int]$Retencao = 5,
    [string]$PastaArtefatos = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ARTEFATOS_GERADOS')
)

$ErrorActionPreference = 'Stop'
if ($Retencao -lt 1) { throw 'A retencao deve ser de pelo menos um pacote.' }

$pastaInterna = $PSScriptRoot
$pastaEntrega = Join-Path (Split-Path -Parent $pastaInterna) 'ENVIAR_AO_CLIENTE'
$raizProjeto = Split-Path -Parent (Split-Path -Parent $pastaInterna)
$packageJson = Join-Path $raizProjeto 'package.json'
$geradorApp = Join-Path $pastaInterna 'CRIAR-PACOTE-APP.ps1'

if (-not (Test-Path -LiteralPath $packageJson)) { throw "package.json nao encontrado: $packageJson" }
if (-not (Test-Path -LiteralPath $geradorApp)) { throw "Gerador do aplicativo nao encontrado: $geradorApp" }
if (-not (Test-Path -LiteralPath $pastaEntrega)) { throw "Pasta de entrega nao encontrada: $pastaEntrega" }

$versao = [string]((Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json).version)
if ([string]::IsNullOrWhiteSpace($versao)) { throw 'Versao do sistema nao definida no package.json.' }
$versaoSegura = $versao -replace '[^0-9A-Za-z._-]', '-'
$data = Get-Date -Format 'yyyyMMdd-HHmmss'

Write-Host '==> Gerando aplicativo limpo e instalador local' -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $geradorApp
if ($LASTEXITCODE -ne 0) { throw "Gerador do aplicativo terminou com codigo $LASTEXITCODE." }

New-Item -ItemType Directory -Path $PastaArtefatos -Force | Out-Null
$nomeZip = "ENVIAR_AO_CLIENTE-v$versaoSegura-$data.zip"
$zip = Join-Path $PastaArtefatos $nomeZip

Compress-Archive -Path (Join-Path $pastaEntrega '*') -DestinationPath $zip -CompressionLevel Optimal -Force
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$arquivoHash = "$zip.sha256"
[IO.File]::WriteAllText($arquivoHash, "$hash  $nomeZip`r`n", (New-Object Text.UTF8Encoding($false)))

$pacotes = @(Get-ChildItem -LiteralPath $PastaArtefatos -File -Filter 'ENVIAR_AO_CLIENTE-v*.zip' | Sort-Object LastWriteTime -Descending)
foreach ($antigo in ($pacotes | Select-Object -Skip $Retencao)) {
    $caminhoCompleto = [IO.Path]::GetFullPath($antigo.FullName)
    $pastaCompleta = [IO.Path]::GetFullPath($PastaArtefatos).TrimEnd('\') + '\'
    if (-not $caminhoCompleto.StartsWith($pastaCompleta, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Artefato fora da pasta autorizada: $caminhoCompleto"
    }
    Remove-Item -LiteralPath $caminhoCompleto -Force
    $hashAntigo = "$caminhoCompleto.sha256"
    if (Test-Path -LiteralPath $hashAntigo) { Remove-Item -LiteralPath $hashAntigo -Force }
    Write-Host "Pacote antigo removido pela retencao: $($antigo.Name)" -ForegroundColor DarkYellow
}

# Remove somente formatos legados de entrega na raiz. Bancos, sessoes e backups nao sao tocados.
$raizEntrega = Split-Path -Parent $pastaInterna
foreach ($legado in @(Get-ChildItem -LiteralPath $raizEntrega -File -Filter 'ENVIAR_AO_CLIENTE*.zip')) {
    Remove-Item -LiteralPath $legado.FullName -Force
    $hashLegado = "$($legado.FullName).sha256"
    if (Test-Path -LiteralPath $hashLegado) { Remove-Item -LiteralPath $hashLegado -Force }
    Write-Host "Artefato legado removido: $($legado.Name)" -ForegroundColor DarkYellow
}

Write-Host "Artefato: $zip" -ForegroundColor Green
Write-Host "Hash: $arquivoHash" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor Green
Write-Host "Retencao: ultimos $Retencao pacote(s)" -ForegroundColor Green

[PSCustomObject]@{
    Versao = $versao
    CriadoEm = (Get-Date).ToString('o')
    Zip = $zip
    HashArquivo = $arquivoHash
    Sha256 = $hash
}

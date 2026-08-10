$ErrorActionPreference = 'Stop'

$pastaInterna = $PSScriptRoot
$raizEntrega = Split-Path -Parent $pastaInterna
$pastaEntrega = Join-Path $raizEntrega 'ENVIAR_AO_CLIENTE'
$raizProjeto = Split-Path -Parent $raizEntrega
$packageJson = Join-Path $raizProjeto 'package.json'
$geradorApp = Join-Path $pastaInterna 'CRIAR-PACOTE-APP.ps1'
$pastaArtefatosAntigos = Join-Path $raizEntrega 'ARTEFATOS_GERADOS'
$zip = Join-Path $raizEntrega 'ENVIAR_AO_CLIENTE.zip'
$arquivoHash = "$zip.sha256"

if (-not (Test-Path -LiteralPath $packageJson)) { throw "package.json nao encontrado: $packageJson" }
if (-not (Test-Path -LiteralPath $geradorApp)) { throw "Gerador do aplicativo nao encontrado: $geradorApp" }
if (-not (Test-Path -LiteralPath $pastaEntrega)) { throw "Pasta de entrega nao encontrada: $pastaEntrega" }

$versao = [string]((Get-Content -LiteralPath $packageJson -Raw | ConvertFrom-Json).version)
if ([string]::IsNullOrWhiteSpace($versao)) { throw 'Versao do sistema nao definida no package.json.' }

function RemoverArtefatoGerado {
    param([System.IO.FileInfo]$Arquivo, [string]$PastaPermitida)

    $caminhoCompleto = [IO.Path]::GetFullPath($Arquivo.FullName)
    $pastaCompleta = [IO.Path]::GetFullPath($PastaPermitida).TrimEnd('\') + '\'
    if (-not $caminhoCompleto.StartsWith($pastaCompleta, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Artefato fora da pasta autorizada: $caminhoCompleto"
    }
    Remove-Item -LiteralPath $caminhoCompleto -Force
    $hashAntigo = "$caminhoCompleto.sha256"
    if (Test-Path -LiteralPath $hashAntigo) { Remove-Item -LiteralPath $hashAntigo -Force }
    Write-Host "Pacote externo antigo removido: $($Arquivo.Name)" -ForegroundColor DarkYellow
}

Write-Host '==> Gerando aplicativo limpo e instalador local' -ForegroundColor Cyan
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $geradorApp
if ($LASTEXITCODE -ne 0) { throw "Gerador do aplicativo terminou com codigo $LASTEXITCODE." }

# Limpa somente ZIPs antigos criados por este gerador. Bancos, sessoes,
# backups e qualquer arquivo fora da pasta de entrega permanecem intocados.
if (Test-Path -LiteralPath $pastaArtefatosAntigos) {
    foreach ($antigo in @(Get-ChildItem -LiteralPath $pastaArtefatosAntigos -File -Filter 'ENVIAR_AO_CLIENTE-v*.zip')) {
        RemoverArtefatoGerado -Arquivo $antigo -PastaPermitida $pastaArtefatosAntigos
    }
}
foreach ($padraoAntigo in @('ENVIAR_AO_CLIENTE-v*.zip', 'ENVIAR_AO_CLIENTE-*.zip', 'JULIAN-PLAY-*.zip')) {
    foreach ($antigo in @(Get-ChildItem -LiteralPath $raizEntrega -File -Filter $padraoAntigo)) {
        if ($antigo.FullName -ne $zip) {
            RemoverArtefatoGerado -Arquivo $antigo -PastaPermitida $raizEntrega
        }
    }
}

# O arquivo externo tem sempre o mesmo nome e e substituido de modo atomico
# pelo Compress-Archive apos o pacote interno ter sido validado acima.
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
if (Test-Path -LiteralPath $arquivoHash) { Remove-Item -LiteralPath $arquivoHash -Force }
Compress-Archive -Path (Join-Path $pastaEntrega '*') -DestinationPath $zip -CompressionLevel Optimal
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($arquivoHash, "$hash  ENVIAR_AO_CLIENTE.zip`r`n", (New-Object Text.UTF8Encoding($false)))

Write-Host "Artefato: $zip" -ForegroundColor Green
Write-Host "Hash: $arquivoHash" -ForegroundColor Green
Write-Host "SHA-256: $hash" -ForegroundColor Green
Write-Host 'Politica: um unico ZIP externo, substituido a cada geracao.' -ForegroundColor Green

[PSCustomObject]@{
    Versao = $versao
    CriadoEm = (Get-Date).ToString('o')
    Zip = $zip
    HashArquivo = $arquivoHash
    Sha256 = $hash
}

param(
    [string]$OrigemDados = 'C:\JulianPlayClientes\amplaytv',
    [string]$Saida = 'C:\MigracaoJulianPlay',
    [string]$ProcessoPm2 = 'julian-amplaytv',
    [int]$Porta = 11004,
    [switch]$ConfirmarParada
)

$ErrorActionPreference = 'Stop'

function Exigir([bool]$condicao, [string]$mensagem) {
    if (-not $condicao) { throw $mensagem }
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

Exigir $ConfirmarParada 'Confirme que a AMPLAYTV esta parada no servidor e use -ConfirmarParada.'
Exigir (Test-Path -LiteralPath $OrigemDados -PathType Container) 'Pasta de dados da AMPLAYTV nao encontrada.'
Exigir (Test-Path -LiteralPath (Join-Path $OrigemDados 'clientes.db') -PathType Leaf) 'Banco da AMPLAYTV nao encontrado.'
Exigir ($null -ne (Get-Command node.exe -ErrorAction SilentlyContinue)) 'Node.js nao encontrado.'
Exigir ($null -ne (Get-Command pm2.cmd -ErrorAction SilentlyContinue)) 'PM2 nao encontrado.'
Exigir ($null -ne (Get-Command tar.exe -ErrorAction SilentlyContinue)) 'tar.exe nao encontrado.'

$pidPm2 = (& pm2.cmd pid $ProcessoPm2 2>$null | Select-Object -Last 1)
$pidAtivo = 0
[void][int]::TryParse([string]$pidPm2, [ref]$pidAtivo)
Exigir ($pidAtivo -eq 0) "O processo $ProcessoPm2 ainda esta ativo no servidor. Pare-o antes de exportar."
$portaAtiva = Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
Exigir ($null -eq $portaAtiva) "A porta $Porta ainda esta em uso no servidor."

ValidarBanco (Join-Path $OrigemDados 'clientes.db')
New-Item -ItemType Directory -Path $Saida -Force | Out-Null

$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$trabalho = Join-Path $env:TEMP "JulianPlay-Amplaytv-$carimbo"
New-Item -ItemType Directory -Path $trabalho -Force | Out-Null

try {
    $arquivos = Get-ChildItem -LiteralPath $OrigemDados -File -Recurse -Force |
        Where-Object { $_.FullName -notlike "*\.wwebjs_cache\*" } |
        Where-Object { $_.Name -ne 'ecosystem.config.cjs' -and $_.Name -notlike '*.pid' } |
        ForEach-Object {
            [pscustomobject]@{
                caminho = $_.FullName.Substring($OrigemDados.Length).TrimStart('\')
                tamanho = $_.Length
                sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
            }
        }

    $manifesto = [ordered]@{
        formato = 'julian-play-cliente-parado-v1'
        criadoEm = (Get-Date).ToString('o')
        origem = $env:COMPUTERNAME
        slug = 'amplaytv'
        processoPm2 = $ProcessoPm2
        porta = $Porta
        processoConfirmadoParado = $true
        arquivos = @($arquivos)
    }
    $manifesto | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $trabalho 'manifesto.json') -Encoding UTF8

    $zip = Join-Path $Saida "JulianPlay-AMPLAYTV-Parada-$carimbo.zip"
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
    & tar.exe -a -c -f $zip `
        --exclude='.wwebjs_cache' `
        --exclude='ecosystem.config.cjs' `
        --exclude='*.pid' `
        -C $OrigemDados . `
        -C $trabalho manifesto.json
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $zip -PathType Leaf)) {
        throw "tar.exe nao conseguiu criar o pacote da AMPLAYTV (codigo $LASTEXITCODE)."
    }

    $hashZip = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
    Set-Content -LiteralPath "$zip.sha256" -Value "$hashZip  $([IO.Path]::GetFileName($zip))" -Encoding ASCII
    Write-Host "Pacote da AMPLAYTV criado sem iniciar o robo: $zip" -ForegroundColor Green
    Write-Host "SHA-256: $hashZip" -ForegroundColor Green
} finally {
    Remove-Item -LiteralPath $trabalho -Recurse -Force -ErrorAction SilentlyContinue
}

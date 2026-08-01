param(
    [string]$ProjetoServidor = 'C:\bots\julian-play',
    [string]$Saida = 'C:\MigracaoJulianPlay',
    [switch]$CorteFinal
)

$ErrorActionPreference = 'Stop'

function Exigir([bool]$condicao, [string]$mensagem) {
    if (-not $condicao) { throw $mensagem }
}

function ExecutarPm2([string[]]$argumentos) {
    & pm2.cmd @argumentos | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "PM2 terminou com codigo ${LASTEXITCODE}: $($argumentos -join ' ')" }
}

$projeto = [IO.Path]::GetFullPath($ProjetoServidor)
Exigir (Test-Path -LiteralPath (Join-Path $projeto 'clientes.db')) 'Banco administrador nao encontrado.'
Exigir (Test-Path -LiteralPath 'C:\JulianPlayMaster\master.db') 'Banco do Painel Mestre nao encontrado.'
Exigir ($null -ne (Get-Command pm2.cmd -ErrorAction SilentlyContinue)) 'PM2 nao encontrado.'

$carimbo = Get-Date -Format 'yyyyMMdd-HHmmss'
$raiz = Join-Path $Saida "Exportacao-$carimbo"
$conteudo = Join-Path $raiz 'conteudo'
$admin = Join-Path $conteudo 'admin'
$master = Join-Path $conteudo 'master'
New-Item -ItemType Directory -Path $admin,$master -Force | Out-Null

$processosParados = [System.Collections.Generic.List[string]]::new()
$exportacaoConcluida = $false
try {
    foreach ($processo in @('julian-play','julian-master','julian-amplaytv')) {
        $pidPm2 = (& pm2.cmd pid $processo 2>$null | Select-Object -Last 1)
        if ($processo -eq 'julian-amplaytv') {
            ExecutarPm2 @('stop',$processo)
            continue
        }
        if ($pidPm2 -and [int]$pidPm2 -gt 0) {
            ExecutarPm2 @('stop',$processo)
            $processosParados.Add($processo)
        }
    }
    ExecutarPm2 @('save','--force')
    Start-Sleep -Seconds 4

    Copy-Item -LiteralPath (Join-Path $projeto 'clientes.db') -Destination (Join-Path $admin 'clientes.db') -Force
    foreach ($nome in @('.wwebjs_auth','backups','assets','migrations')) {
        $origem = Join-Path $projeto $nome
        if (Test-Path -LiteralPath $origem) {
            Copy-Item -LiteralPath $origem -Destination (Join-Path $admin $nome) -Recurse -Force
        }
    }
    $avisosForaHorario = Join-Path $projeto 'database\avisos-fora-horario.json'
    if (Test-Path -LiteralPath $avisosForaHorario -PathType Leaf) {
        $databaseAdmin = Join-Path $admin 'database'
        New-Item -ItemType Directory -Path $databaseAdmin -Force | Out-Null
        Copy-Item -LiteralPath $avisosForaHorario -Destination (Join-Path $databaseAdmin 'avisos-fora-horario.json') -Force
    }
    $backupLegado = Join-Path $projeto 'clientes_backup_antes_manutencao.db'
    if (Test-Path -LiteralPath $backupLegado -PathType Leaf) {
        $backupsAdmin = Join-Path $admin 'backups'
        New-Item -ItemType Directory -Path $backupsAdmin -Force | Out-Null
        Copy-Item -LiteralPath $backupLegado -Destination (Join-Path $backupsAdmin 'legado-clientes_backup_antes_manutencao.db') -Force
    }
    foreach ($nome in @('.julian-play-install.json','.julian-master-install.json')) {
        $origem = Join-Path $projeto $nome
        if (Test-Path -LiteralPath $origem) {
            Copy-Item -LiteralPath $origem -Destination (Join-Path $conteudo $nome) -Force
        }
    }
    Copy-Item -LiteralPath 'C:\JulianPlayMaster\master.db' -Destination (Join-Path $master 'master.db') -Force

    $arquivos = Get-ChildItem -LiteralPath $conteudo -File -Recurse -Force | ForEach-Object {
        [pscustomobject]@{
            caminho = $_.FullName.Substring($conteudo.Length + 1)
            tamanho = $_.Length
            sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    }
    $manifesto = [ordered]@{
        criadoEm = (Get-Date).ToString('o')
        origem = $env:COMPUTERNAME
        corteFinal = [bool]$CorteFinal
        arquivos = @($arquivos)
    }
    $manifesto | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $conteudo 'manifesto.json') -Encoding UTF8

    $zip = Join-Path $Saida "JulianPlay-Servidor-$carimbo.zip"
    Compress-Archive -Path (Join-Path $conteudo '*') -DestinationPath $zip -Force
    $hashZip = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
    Set-Content -LiteralPath "$zip.sha256" -Value "$hashZip  $([IO.Path]::GetFileName($zip))" -Encoding ASCII
    $exportacaoConcluida = $true
    Write-Host "Pacote criado: $zip" -ForegroundColor Green
    Write-Host "SHA-256: $hashZip" -ForegroundColor Green
} finally {
    if (-not $CorteFinal -or -not $exportacaoConcluida) {
        foreach ($processo in $processosParados) {
            try { ExecutarPm2 @('start',$processo,'--update-env') } catch { Write-Warning $_.Exception.Message }
        }
        try { ExecutarPm2 @('save','--force') } catch { Write-Warning $_.Exception.Message }
        if ($CorteFinal -and -not $exportacaoConcluida) {
            Write-Warning 'A exportacao falhou; os processos foram religados automaticamente.'
        }
    } else {
        Write-Warning 'CORTE FINAL: julian-play, julian-master e julian-amplaytv devem permanecer parados neste servidor.'
    }
}

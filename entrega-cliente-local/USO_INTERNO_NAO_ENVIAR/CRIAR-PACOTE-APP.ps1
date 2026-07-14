param(
    [string]$Destino = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ENVIAR_AO_CLIENTE\julian-play-app.zip')
)

$ErrorActionPreference = 'Stop'
$raizProjeto = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$temporario = Join-Path $env:TEMP ("julian-play-app-{0}" -f ([guid]::NewGuid().ToString('N')))

function DeveIgnorarCaminho($item) {
    $nome = $item.Name
    $relativo = $item.FullName.Substring($raizProjeto.Length).TrimStart('\', '/')
    $partes = $relativo -split '[\\/]'
    $pastasIgnoradas = @(
        '.git',
        'node_modules',
        '.wwebjs_auth',
        '.wwebjs_cache',
        'backups',
        'entrega-cliente-local',
        '.agents',
        '.codex',
        'data'
    )

    foreach ($parte in $partes) {
        if ($pastasIgnoradas -contains $parte) { return $true }
    }

    if ($nome -like '*.db') { return $true }
    if ($nome -like '*.sqlite') { return $true }
    if ($nome -like '*.sqlite3') { return $true }
    if ($nome -like '*.log') { return $true }
    if ($nome -like '.julian-*-install.json') { return $true }

    return $false
}

New-Item -ItemType Directory -Path $temporario -Force | Out-Null

Get-ChildItem -LiteralPath $raizProjeto -Force -Recurse | ForEach-Object {
    if (DeveIgnorarCaminho $_) { return }

    $relativo = $_.FullName.Substring($raizProjeto.Length).TrimStart('\', '/')
    $destinoItem = Join-Path $temporario $relativo

    if ($_.PSIsContainer) {
        New-Item -ItemType Directory -Path $destinoItem -Force | Out-Null
        return
    }

    New-Item -ItemType Directory -Path (Split-Path -Parent $destinoItem) -Force | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $destinoItem -Force
}

$configMestre = Join-Path $raizProjeto '.julian-master-install.json'
if (Test-Path -LiteralPath $configMestre) {
    try {
        $dadosMestre = Get-Content -LiteralPath $configMestre -Raw | ConvertFrom-Json
        if ($dadosMestre.licensePublicKey) {
            $pastaConfigPacote = Join-Path $temporario 'config'
            New-Item -ItemType Directory -Path $pastaConfigPacote -Force | Out-Null
            [IO.File]::WriteAllText(
                (Join-Path $pastaConfigPacote 'license-public-key.pem'),
                [string]$dadosMestre.licensePublicKey,
                (New-Object Text.UTF8Encoding($false))
            )
        }
    } catch {
        Write-Warning 'Nao foi possivel incluir a chave publica de licenca no pacote.'
    }
}

if (Test-Path -LiteralPath $Destino) {
    Remove-Item -LiteralPath $Destino -Force
}

New-Item -ItemType Directory -Path (Split-Path -Parent $Destino) -Force | Out-Null
Compress-Archive -Path (Join-Path $temporario '*') -DestinationPath $Destino -Force
Remove-Item -LiteralPath $temporario -Recurse -Force

Write-Host "Pacote criado: $Destino" -ForegroundColor Green
Write-Host 'Envie ao cliente somente a pasta ENVIAR_AO_CLIENTE.' -ForegroundColor Yellow

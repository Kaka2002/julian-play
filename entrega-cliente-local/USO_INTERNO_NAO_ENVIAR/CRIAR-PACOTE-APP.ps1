param(
    [string]$Destino = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ENVIAR_AO_CLIENTE\julian-play-app.zip')
)

$ErrorActionPreference = 'Stop'
$raizProjeto = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$temporario = Join-Path $env:TEMP ("julian-play-app-{0}" -f ([guid]::NewGuid().ToString('N')))

function CopiarItemSeguro($origem, $destino) {
    $nome = Split-Path $origem -Leaf
    $ignorar = @(
        '.git',
        'node_modules',
        '.wwebjs_auth',
        '.wwebjs_cache',
        'backups',
        'database',
        'entrega-cliente-local',
        '.agents',
        '.codex'
    )

    if ($ignorar -contains $nome) { return }
    if ($nome -like '*.db') { return }
    if ($nome -like '*.log') { return }
    if ($nome -like '.julian-*-install.json') { return }

    Copy-Item -LiteralPath $origem -Destination $destino -Recurse -Force
}

New-Item -ItemType Directory -Path $temporario -Force | Out-Null

Get-ChildItem -LiteralPath $raizProjeto -Force | ForEach-Object {
    CopiarItemSeguro $_.FullName $temporario
}

if (Test-Path -LiteralPath $Destino) {
    Remove-Item -LiteralPath $Destino -Force
}

New-Item -ItemType Directory -Path (Split-Path -Parent $Destino) -Force | Out-Null
Compress-Archive -Path (Join-Path $temporario '*') -DestinationPath $Destino -Force
Remove-Item -LiteralPath $temporario -Recurse -Force

Write-Host "Pacote criado: $Destino" -ForegroundColor Green
Write-Host 'Envie ao cliente somente a pasta ENVIAR_AO_CLIENTE.' -ForegroundColor Yellow

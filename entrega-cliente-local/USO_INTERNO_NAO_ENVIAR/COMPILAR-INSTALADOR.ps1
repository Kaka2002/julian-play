param(
    [string]$Destino = (Join-Path (Split-Path -Parent $PSScriptRoot) 'ENVIAR_AO_CLIENTE\INSTALAR.exe')
)

$ErrorActionPreference = 'Stop'
$fonte = Join-Path $PSScriptRoot 'InstaladorGrafico.cs'
$compiladores = @(
    "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe",
    "$env:WINDIR\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)
$compilador = $compiladores | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $compilador) { throw 'Compilador C# do Windows nao encontrado.' }
if (-not (Test-Path -LiteralPath $fonte)) { throw "Codigo-fonte nao encontrado: $fonte" }

New-Item -ItemType Directory -Path (Split-Path -Parent $Destino) -Force | Out-Null
& $compilador /nologo /target:winexe /optimize+ /platform:anycpu /reference:System.dll /reference:System.Drawing.dll /reference:System.Windows.Forms.dll /out:$Destino $fonte
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $Destino)) { throw "Compilacao terminou com codigo $LASTEXITCODE." }

Write-Host "Instalador compilado: $Destino" -ForegroundColor Green

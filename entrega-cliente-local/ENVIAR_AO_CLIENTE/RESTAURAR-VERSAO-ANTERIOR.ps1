param([string]$PastaBase='C:\JulianPlay',[string]$NomeProcesso='julian-play-cliente',[int]$Porta=10000,[string]$PastaDados='C:\JulianPlay\dados')
$ErrorActionPreference='Stop';$base=[IO.Path]::GetFullPath($PastaBase).TrimEnd('\');if($base -ne 'C:\JulianPlay'){throw 'Por seguranca, informe explicitamente a pasta C:\JulianPlay.'}
$app=Join-Path $base 'app';$anterior=Get-ChildItem -LiteralPath $base -Directory -Filter 'app-backup-atualizacao-*'|Sort-Object LastWriteTime -Descending|Select-Object -First 1
if(-not $anterior){throw 'Nenhuma versao anterior encontrada.'}
Write-Host "Versao que sera restaurada: $($anterior.FullName)" -ForegroundColor Yellow
if((Read-Host 'Digite RESTAURAR para continuar') -ne 'RESTAURAR'){throw 'Operacao cancelada.'}
& pm2.cmd stop $NomeProcesso 2>$null;$resgate=Join-Path $base ("app-antes-rollback-{0}" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
if(Test-Path $app){Move-Item -LiteralPath $app -Destination $resgate};Move-Item -LiteralPath $anterior.FullName -Destination $app
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $app 'install-windows.ps1') -Porta $Porta -NomeProcesso $NomeProcesso -PastaDados $PastaDados -InstalacaoLocal
Write-Host "Versao anterior restaurada. A versao substituida ficou em $resgate" -ForegroundColor Green

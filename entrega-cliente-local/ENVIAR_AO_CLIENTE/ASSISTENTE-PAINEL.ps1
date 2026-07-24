$ErrorActionPreference='Stop'
Write-Host 'JULIAN PLAY - ASSISTENTE' -ForegroundColor Cyan
Write-Host '1 - Diagnosticar computador';Write-Host '2 - Instalar painel';Write-Host '3 - Atualizar painel';Write-Host '4 - Abrir painel';Write-Host '5 - Voltar para versao anterior';Write-Host '6 - Copiar diagnostico para suporte'
$opcao=Read-Host 'Escolha uma opcao'
$scripts=@{'1'='DIAGNOSTICO-INSTALACAO.ps1';'2'='INSTALAR-PAINEL.ps1';'3'='ATUALIZAR-PAINEL.ps1';'4'='ABRIR-PAINEL.ps1';'5'='RESTAURAR-VERSAO-ANTERIOR.ps1'}
if($opcao -eq '6'){& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'DIAGNOSTICO-INSTALACAO.ps1') -Copiar;exit}
if(-not $scripts[$opcao]){throw 'Opcao invalida.'}
if($opcao -in @('2','3')){& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'DIAGNOSTICO-INSTALACAO.ps1')}
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $scripts[$opcao])

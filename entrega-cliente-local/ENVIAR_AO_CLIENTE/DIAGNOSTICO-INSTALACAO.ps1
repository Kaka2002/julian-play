param([int]$Porta=10000,[string]$PastaInstalacao='C:\JulianPlay\app',[string]$PastaDados='C:\JulianPlay\dados',[switch]$Copiar)
$ErrorActionPreference='Continue'
$linhas=[Collections.Generic.List[string]]::new()
function Add($nome,$status,$detalhe){$linhas.Add("[$status] $nome - $detalhe")}
$admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Add 'Administrador' $(if($admin){'OK'}else{'ATENCAO'}) $(if($admin){'Permissao elevada'}else{'Execute como administrador para instalar/atualizar'})
foreach($cmd in @('node','npm.cmd','pm2.cmd')){$item=Get-Command $cmd -ErrorAction SilentlyContinue;Add $cmd $(if($item){'OK'}else{'ERRO'}) $(if($item){$item.Source}else{'Nao encontrado no PATH'})}
$chrome=@("$env:ProgramFiles\Google\Chrome\Application\chrome.exe","${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe","$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")|Where-Object{Test-Path -LiteralPath $_}|Select-Object -First 1
Add 'Chrome' $(if($chrome){'OK'}else{'ATENCAO'}) $(if($chrome){$chrome}else{'Nao encontrado nos caminhos padrao'})
$portaOcupada=Get-NetTCPConnection -LocalPort $Porta -State Listen -ErrorAction SilentlyContinue
Add "Porta $Porta" $(if($portaOcupada){'ATENCAO'}else{'OK'}) $(if($portaOcupada){"Em uso pelo PID $($portaOcupada.OwningProcess -join ',')"}else{'Disponivel'})
$unidade=Get-PSDrive -Name ([IO.Path]::GetPathRoot($PastaInstalacao).TrimEnd(':\')) -ErrorAction SilentlyContinue
if($unidade){Add 'Disco livre' $(if($unidade.Free -ge 5GB){'OK'}else{'ERRO'}) ("{0:N2} GB" -f ($unidade.Free/1GB))}
Add 'Instalacao atual' $(if(Test-Path (Join-Path $PastaInstalacao 'package.json')){'OK'}else{'ATENCAO'}) $PastaInstalacao
$packageAtual=Join-Path $PastaInstalacao 'package.json';if(Test-Path $packageAtual){try{$versao=(Get-Content $packageAtual -Raw|ConvertFrom-Json).version;Add 'Versao instalada' 'OK' $versao}catch{Add 'Versao instalada' 'ERRO' $_.Exception.Message}}
Add 'Banco preservado' $(if(Test-Path (Join-Path $PastaDados 'clientes.db')){'OK'}else{'ATENCAO'}) (Join-Path $PastaDados 'clientes.db')
$zip=Join-Path $PSScriptRoot 'julian-play-app.zip';$sha="$zip.sha256"
if((Test-Path $zip)-and(Test-Path $sha)){$esperado=((Get-Content $sha -Raw).Trim()-split '\s+')[0];$atual=(Get-FileHash $zip -Algorithm SHA256).Hash;Add 'Pacote ZIP' $(if($atual -eq $esperado){'OK'}else{'ERRO'}) "SHA-256 $atual"}else{Add 'Pacote ZIP' 'ERRO' 'ZIP ou SHA-256 ausente'}
$relatorio=@("Julian Play - diagnostico",(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'),"Computador: $env:COMPUTERNAME","")+@($linhas)
$destino=Join-Path $PSScriptRoot ("diagnostico-suporte-{0}.txt" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
$relatorio|Set-Content -LiteralPath $destino -Encoding UTF8;$relatorio|ForEach-Object{Write-Host $_}
if($Copiar){$relatorio -join "`r`n"|Set-Clipboard;Write-Host 'Diagnostico copiado para a area de transferencia.' -ForegroundColor Green}
Write-Host "Relatorio: $destino" -ForegroundColor Cyan

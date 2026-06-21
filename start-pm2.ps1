$ErrorActionPreference = 'Stop'

$pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
if (-not $pm2) {
    $pm2 = Get-Command pm2 -ErrorAction SilentlyContinue
}

if (-not $pm2) {
    throw 'PM2 nao foi encontrado no PATH deste usuario.'
}

$env:PM2_HOME = Join-Path $env:USERPROFILE '.pm2'
& $pm2.Source resurrect

if ($LASTEXITCODE -ne 0) {
    throw "PM2 resurrect terminou com codigo $LASTEXITCODE."
}

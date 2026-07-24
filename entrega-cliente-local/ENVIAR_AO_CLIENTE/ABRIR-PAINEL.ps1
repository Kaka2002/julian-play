param(
    [ValidateRange(1, 65535)]
    [int]$Porta = 10000,

    [string]$NomeLocal = 'julianplay.local'
)

function TestarUrl([string]$url) {
    try {
        $resposta = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3
        return [int]$resposta.StatusCode -ge 200 -and [int]$resposta.StatusCode -lt 500
    } catch {
        return $false
    }
}

$urlLocal = "http://$NomeLocal`:$Porta"
$urlPadrao = "http://localhost:$Porta"

if (-not (TestarUrl $urlLocal) -and -not (TestarUrl $urlPadrao)) {
    $configuracao = 'C:\JulianPlay\app\.julian-play-install.json'
    if (Test-Path -LiteralPath $configuracao) {
        try {
            $dados = Get-Content -LiteralPath $configuracao -Raw | ConvertFrom-Json
            $nomeProcesso = [string]$dados.appName
            if ($nomeProcesso -and $dados.installMode -eq 'local') {
                $pm2 = Get-Command pm2.cmd -ErrorAction SilentlyContinue
                if ($pm2) {
                    & $pm2.Source restart $nomeProcesso --update-env
                    Start-Sleep -Seconds 4
                }
            }
        } catch {
            Write-Warning "Nao foi possivel reiniciar automaticamente o painel: $($_.Exception.Message)"
        }
    }
}

if (TestarUrl $urlLocal) {
    Start-Process $urlLocal
} else {
    Start-Process $urlPadrao
}

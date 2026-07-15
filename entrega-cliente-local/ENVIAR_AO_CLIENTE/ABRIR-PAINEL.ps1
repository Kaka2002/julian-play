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

if (TestarUrl $urlLocal) {
    Start-Process $urlLocal
} else {
    Start-Process $urlPadrao
}

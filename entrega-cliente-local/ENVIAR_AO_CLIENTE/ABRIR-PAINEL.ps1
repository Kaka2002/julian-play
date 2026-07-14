param(
    [ValidateRange(1, 65535)]
    [int]$Porta = 10000
)

Start-Process "http://localhost:$Porta"

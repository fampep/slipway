# Forwards local http://127.0.0.1:8080 -> Slipway on the Linux dedi.
$Key  = 'C:\Users\fampep\upbrr\tunnel_key'
$Host_ = 'fampep@198.50.123.153'
$Port = 6969
$Local = 8080
$Remote = 8080
$Log = Join-Path $PSScriptRoot 'slipway-tunnel.log'

Write-Host "Slipway tunnel: http://127.0.0.1:$Local  ->  dedi:$Remote"
while ($true) {
    Add-Content -LiteralPath $Log -Value "[$(Get-Date -Format s)] connecting"
    & ssh.exe -N -p $Port -i $Key -o BatchMode=yes -o ExitOnForwardFailure=yes `
        -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ConnectTimeout=20 `
        -L "127.0.0.1:${Local}:127.0.0.1:${Remote}" $Host_ 2>&1 |
        ForEach-Object { Add-Content -LiteralPath $Log -Value "  $_"; $_ }
    Add-Content -LiteralPath $Log -Value "[$(Get-Date -Format s)] tunnel closed (exit $LASTEXITCODE); retrying in 10 s"
    Start-Sleep -Seconds 10
}

# Sync Slipway to the Linux dedi and build with Docker there (Linux-only runtime).
param(
    [string]$RemoteDir = '/home/fampep/slipway',
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$Key  = 'C:\Users\fampep\upbrr\tunnel_key'
$Host_ = 'fampep@198.50.123.153'
$Port = 6969
$Root = Split-Path -Parent $PSScriptRoot

function Invoke-Remote([string]$Cmd) {
    & ssh.exe -p $Port -i $Key -o BatchMode=yes -o ConnectTimeout=20 $Host_ $Cmd
    if ($LASTEXITCODE -ne 0) { throw "ssh failed: $Cmd" }
}

Write-Host "==> Ensuring remote dir $RemoteDir"
Invoke-Remote "mkdir -p $RemoteDir"

$tar = Join-Path $env:TEMP 'slipway-deploy.tgz'
Write-Host "==> Packing project"
Push-Location $Root
try {
    if (Test-Path $tar) { Remove-Item $tar -Force }
    tar -czf $tar `
        --exclude=.git --exclude=data --exclude=web/node_modules --exclude=web/dist `
        --exclude=slipway.exe --exclude='*.exe' `
        .
} finally {
    Pop-Location
}

Write-Host "==> Uploading to dedi"
& scp.exe -P $Port -i $Key -o BatchMode=yes $tar "${Host_}:/tmp/slipway-deploy.tgz"
if ($LASTEXITCODE -ne 0) { throw 'scp failed' }

Write-Host "==> Extracting on Linux"
Invoke-Remote "mkdir -p $RemoteDir && tar -xzf /tmp/slipway-deploy.tgz -C $RemoteDir && rm -f /tmp/slipway-deploy.tgz && chmod +x $RemoteDir/deploy/remote-install.sh"

if (-not $SkipInstall) {
    Write-Host "==> docker compose build/up on dedi"
    Invoke-Remote "cd $RemoteDir && bash deploy/remote-install.sh"
}

Write-Host @"

Slipway is on the Linux dedi at $RemoteDir
Tunnel in:
  powershell -File $Root\scripts\slipway-tunnel.ps1
Then open http://127.0.0.1:8080
"@

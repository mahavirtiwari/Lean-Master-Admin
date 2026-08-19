<#
    Starts the MCLS portal.

    One process, one port. The API serves the built Angular app as well as the
    JSON endpoints, so there is no dev server, no proxy and nothing to keep in
    sync — which is what a demo needs.

        .\scripts\start-portal.ps1

    Then open  http://localhost:5199

    Pass -Dev to run the Angular dev server on :4200 instead, with hot reload,
    proxying to the API on :5199. Use that while changing front-end code.
#>

[CmdletBinding()]
param(
    [string] $SqlInstance = '.\SQLEXPRESS',
    [int]    $Port        = 5199,
    [switch] $Dev,
    [switch] $SkipBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

Write-Host ''
Write-Host '  MCLS Portal' -ForegroundColor Green
Write-Host '  --------------------------------------------------' -ForegroundColor DarkGray

# --------------------------------------------------------------- database ---
# Checked first: if SQL is down the API starts and then fails its startup
# probe, which is a far more confusing error than this one.
Write-Host '  SQL Server        ' -NoNewline
& sqlcmd -S $SqlInstance -d MCLS -E -C -I -h -1 -W -Q "SET NOCOUNT ON; SELECT 1;" > $null 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host 'UNREACHABLE' -ForegroundColor Red
    Write-Host "  Could not reach $SqlInstance / MCLS." -ForegroundColor Yellow
    Write-Host '  Start the "SQL Server (SQLEXPRESS)" service and try again.' -ForegroundColor Yellow
    exit 1
}
Write-Host 'ok' -ForegroundColor Green

# ---------------------------------------------------------- portal bundle ---
$dist = Join-Path $root 'frontend\dist\mcls-portal\browser'

if (-not $Dev) {
    if ($SkipBuild -and (Test-Path (Join-Path $dist 'index.html'))) {
        Write-Host '  Portal bundle     reusing existing build' -ForegroundColor DarkGray
    }
    else {
        Write-Host '  Portal bundle     building (about 30s)...' -NoNewline
        Push-Location (Join-Path $root 'frontend')
        & npx ng build > $null 2>&1
        $buildOk = $LASTEXITCODE -eq 0
        Pop-Location

        if (-not $buildOk -or -not (Test-Path (Join-Path $dist 'index.html'))) {
            Write-Host ' FAILED' -ForegroundColor Red
            Write-Host '  Run "npx ng build" in frontend\ to see the error.' -ForegroundColor Yellow
            exit 1
        }
        Write-Host ' ok' -ForegroundColor Green
    }
}

# -------------------------------------------------------------------- API ---
Write-Host "  API + portal      starting on port $Port" -ForegroundColor DarkGray

# -NoExit keeps the window open, and the window is yours: it survives whatever
# else closes, which a hidden background process does not.
Start-Process -FilePath 'powershell' -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location '$root\backend\src\MCLS.Api'; " +
    "`$env:ASPNETCORE_ENVIRONMENT='Development'; " +
    "dotnet run --no-launch-profile --urls http://0.0.0.0:$Port"
)

Write-Host '  Waiting for it to come up' -NoNewline
$ready = $false

foreach ($attempt in 1..60) {
    Start-Sleep -Seconds 2
    try {
        $null = Invoke-RestMethod -Uri "http://localhost:$Port/health/ready" -TimeoutSec 3
        $ready = $true
        break
    }
    catch { Write-Host '.' -NoNewline }
}

if (-not $ready) {
    Write-Host ' TIMED OUT' -ForegroundColor Red
    Write-Host '  Check the API window for the error.' -ForegroundColor Yellow
    exit 1
}
Write-Host ' ok' -ForegroundColor Green

# --------------------------------------------------------- optional: dev ---
if ($Dev) {
    Write-Host '  Angular dev       starting on port 4200' -ForegroundColor DarkGray
    Start-Process -FilePath 'powershell' -ArgumentList @(
        '-NoExit', '-Command',
        "Set-Location '$root\frontend'; npm start"
    )
}

$url = if ($Dev) { 'http://localhost:4200' } else { "http://localhost:$Port" }

Write-Host ''
Write-Host '  --------------------------------------------------' -ForegroundColor DarkGray
Write-Host "  Portal   $url" -ForegroundColor Green
Write-Host "  Swagger  http://localhost:$Port/swagger" -ForegroundColor DarkGray
Write-Host ''
Write-Host '  Sign in' -ForegroundColor DarkGray
Write-Host '    User ID   MCLS-MIN-000001'
Write-Host '    Password  the value of Bootstrap:AdminPassword'
Write-Host '    plus the 5-character security code shown on screen'
Write-Host ''
Write-Host '  Leave the API window open. Closing it stops the portal.' -ForegroundColor DarkGray
Write-Host ''

Start-Process $url

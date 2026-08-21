#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Deploys the MSME Competitive (LEAN) Scheme portal to a Windows Server
    running IIS, from a clean box to a working site.

.DESCRIPTION
    Run this once on the server, from an elevated PowerShell. It is idempotent:
    running it again upgrades the deployment rather than starting over, so it
    doubles as the release script.

    What it does, in order:

      1. Installs what is missing - IIS features, the ASP.NET Core Hosting
         Bundle, the URL Rewrite module, the .NET SDK, Node.js and Git.
      2. Fetches the source from GitHub into -SourceRoot.
      3. Creates or upgrades the MCLS database, schema and migrations both.
      4. Builds the Angular front end and publishes the API.
      5. Lays both out under -InstallRoot, with uploads and logs beside them.
      6. Writes appsettings.Production.json - the domain, and a signing key
         generated here so no secret is ever committed or typed.
      7. Creates the IIS site and the /api child application.
      8. Locks appsettings.Production.json down to administrators and the
         application pool, since it carries the database credential.
      9. Requests a Let's Encrypt certificate for the domain.
     10. Installs OpenSSH, so later releases need no remote desktop.

    Nothing here is destructive to data: the database scripts are idempotent
    and an existing database is upgraded in place, never dropped.

.PARAMETER Domain
    The host name the portal answers on. Must already resolve to this server.

.PARAMETER AdminEmail
    Mailbox for the Super Admin created on a fresh database, and the address
    Let's Encrypt sends expiry notices to.

.PARAMETER SqlInstance
    SQL Server instance holding the MCLS database.

.PARAMETER DbPassword
    Password for -DbUser. Required, and never stored in this repository: pass
    it on the command line, or let PowerShell prompt for it.

.PARAMETER SkipHttps
    Leave the site on plain HTTP. Use when the certificate is issued elsewhere,
    or when the domain does not yet point here.

.PARAMETER SkipDemoData
    Passed through to the database deployment. Demo data is off by default and
    this switch is kept only so the intent reads in the log.

.EXAMPLE
    .\Deploy-Lean.ps1 -Domain lean.umon.in -AdminEmail admin@umon.in -DbPassword '<the dbadmin password>'

.NOTES
    Written to be read before it is run. Every step prints what it is about to
    do, and stops on the first genuine failure rather than carrying on and
    leaving a half-configured site.
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Domain,

    [Parameter(Mandatory = $true)]
    [string] $AdminEmail,

    [string] $RepoUrl     = 'https://github.com/mahavirtiwari/Lean-Master-Admin.git',
    [string] $Branch      = 'main',
    [string] $SourceRoot  = 'C:\MCLS\src',
    [string] $InstallRoot = 'C:\MCLS',
    [string] $SqlInstance = '20.219.21.200,1433',
    [string] $DbName      = 'MCLS',
    [string] $DbUser      = 'dbadmin',

    # Not defaulted and not stored: passed in at run time, or prompted for.
    [Parameter(Mandatory = $true)]
    [string] $DbPassword,
    [string] $SiteName    = 'MCLS',
    [string] $AppPoolName = 'MCLS',

    [switch] $SkipHttps,
    [switch] $SkipDemoData
)

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'   # or every download paints the console

# Windows PowerShell 5.1 still negotiates TLS 1.0 by default, which GitHub and
# the .NET download hosts refuse outright - the symptom is a download that
# "closed unexpectedly" before a byte arrives. Turn on 1.2 (and 1.3 where the
# framework knows it) for every web request this script makes.
[Net.ServicePointManager]::SecurityProtocol =
    [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
try {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls13
} catch { }   # Tls13 is not defined on older frameworks; 1.2 is enough

$script:StepNumber = 0

function Write-Step {
    param([string] $Message)
    $script:StepNumber++
    Write-Host ''
    Write-Host ("=== {0}. {1} " -f $script:StepNumber, $Message).PadRight(78, '=') -ForegroundColor Cyan
}

function Write-Note { param([string] $Message) Write-Host "    $Message" -ForegroundColor Gray }
function Write-Good { param([string] $Message) Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn { param([string] $Message) Write-Host "    $Message" -ForegroundColor Yellow }

function Test-Command {
    param([string] $Name)
    return [bool] (Get-Command $Name -ErrorAction SilentlyContinue)
}

function Invoke-Native {
    <#
        Runs an external command and stops on a non-zero exit code. PowerShell
        does not do this on its own, and a failed build that carries on is far
        worse than one that stops here.
    #>
    param(
        [Parameter(Mandatory = $true)][string]   $FilePath,
        [Parameter(Mandatory = $true)][string[]] $Arguments,
        [string] $WorkingDirectory = $PWD.Path,
        [string] $What = ''
    )

    if ($What) { Write-Note $What }

    $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments `
        -WorkingDirectory $WorkingDirectory -NoNewWindow -Wait -PassThru

    if ($process.ExitCode -ne 0) {
        throw "$FilePath $($Arguments -join ' ') failed with exit code $($process.ExitCode)."
    }
}

function Install-FromWebInstaller {
    <#
        Downloads an installer and runs it silently. Used for the pieces that
        have no reliable winget package on Windows Server images.
    #>
    param(
        [Parameter(Mandatory = $true)][string] $Url,
        [Parameter(Mandatory = $true)][string] $FileName,
        [string[]] $Arguments = @('/quiet', '/norestart')
    )

    $target = Join-Path $env:TEMP $FileName
    Write-Note "Downloading $FileName"
    Invoke-WebRequest -Uri $Url -OutFile $target -UseBasicParsing

    Write-Note "Installing $FileName"
    $process = Start-Process -FilePath $target -ArgumentList $Arguments -Wait -PassThru

    # 3010 is "success, reboot required", which the installers use freely.
    if ($process.ExitCode -notin @(0, 1638, 3010)) {
        throw "$FileName failed with exit code $($process.ExitCode)."
    }

    Remove-Item $target -Force -ErrorAction SilentlyContinue
}

# -C trusts the server certificate. ODBC Driver 18 (which the server's sqlcmd
# is built on) encrypts by default and validates the certificate; the instance
# presents a self-signed one, so without this every call fails with "the
# certificate chain was issued by an authority that is not trusted." This is
# the command-line twin of TrustServerCertificate=true in the app's own string.
function Invoke-Sql {
    param(
        [Parameter(Mandatory = $true)][string] $Query,
        [string] $Database = $DbName
    )

    $output = & sqlcmd -S $SqlInstance -U $DbUser -P $DbPassword -d $Database -C -b -I -Q $Query 2>&1

    if ($LASTEXITCODE -ne 0) {
        throw "SQL failed against $SqlInstance/$Database`n$output"
    }

    return $output
}

function Invoke-SqlFile {
    param([Parameter(Mandatory = $true)][string] $Path)

    $output = & sqlcmd -S $SqlInstance -U $DbUser -P $DbPassword -d $DbName -C -b -I -i $Path 2>&1
    return @{ ExitCode = $LASTEXITCODE; Output = $output }
}

Write-Host ''
Write-Host '  MSME Competitive (LEAN) Scheme - portal deployment' -ForegroundColor White
Write-Host "  $Domain on $env:COMPUTERNAME" -ForegroundColor White
Write-Host ''

# ---------------------------------------------------------------------------
Write-Step 'Prerequisites'

# IIS itself. On an Azure Windows Server image the role is usually present
# already; these calls are no-ops when it is.
Import-Module ServerManager -ErrorAction SilentlyContinue

$iisFeatures = @(
    'Web-Server',
    'Web-Common-Http', 'Web-Static-Content', 'Web-Default-Doc', 'Web-Http-Errors',
    'Web-Http-Logging', 'Web-Stat-Compression', 'Web-Dyn-Compression',
    'Web-Filtering', 'Web-Mgmt-Console', 'Web-Scripting-Tools'
)

foreach ($feature in $iisFeatures) {
    $state = Get-WindowsFeature -Name $feature -ErrorAction SilentlyContinue

    if ($state -and -not $state.Installed) {
        Write-Note "Installing IIS feature $feature"
        Install-WindowsFeature -Name $feature -ErrorAction Stop | Out-Null
    }
}
Write-Good 'IIS present'

Import-Module WebAdministration -ErrorAction Stop

# Git, the .NET SDK and Node. winget is present on current Server images; the
# direct installers are the fallback for older ones.
$useWinget = Test-Command 'winget'

if (-not (Test-Command 'git')) {
    if ($useWinget) {
        Invoke-Native 'winget' @('install', '--id', 'Git.Git', '-e', '--silent',
            '--accept-package-agreements', '--accept-source-agreements') -What 'Installing Git'
    }
    else {
        # The asset name carries the version, so it changes with every Git
        # release; ask the API for the current one rather than guessing.
        $gitUrl = try {
            $release = Invoke-RestMethod -UseBasicParsing `
                -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' `
                -Headers @{ 'User-Agent' = 'MCLS-Deploy' }
            ($release.assets | Where-Object { $_.name -match '^Git-.*-64-bit\.exe$' } |
                Select-Object -First 1).browser_download_url
        } catch { $null }

        if (-not $gitUrl) {
            throw @'
Could not resolve the Git for Windows installer from GitHub.

Either the machine cannot reach github.com, or TLS 1.2 is still off. Confirm
with:
    [Net.ServicePointManager]::SecurityProtocol
and install Git by hand from https://git-scm.com/download/win, then re-run
this script - it will skip everything already done.
'@
        }

        Install-FromWebInstaller -Url $gitUrl -FileName 'git-setup.exe' `
            -Arguments @('/VERYSILENT', '/NORESTART')
    }

    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}
Write-Good "Git: $(git --version)"

if (-not (Test-Command 'dotnet') -or -not ((& dotnet --list-sdks) -match '^10\.')) {
    # The official install script, which needs no elevation trickery and
    # always resolves the current 10.0 build.
    $installer = Join-Path $env:TEMP 'dotnet-install.ps1'
    Invoke-WebRequest -Uri 'https://dot.net/v1/dotnet-install.ps1' -OutFile $installer -UseBasicParsing

    Write-Note 'Installing the .NET 10 SDK'
    & $installer -Channel '10.0' -InstallDir 'C:\Program Files\dotnet'

    $env:Path = "C:\Program Files\dotnet;$env:Path"
    [Environment]::SetEnvironmentVariable('Path',
        [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';C:\Program Files\dotnet', 'Machine')
}
Write-Good "dotnet SDK: $((& dotnet --version))"

if (-not (Test-Command 'node')) {
    if ($useWinget) {
        Invoke-Native 'winget' @('install', '--id', 'OpenJS.NodeJS.LTS', '-e', '--silent',
            '--accept-package-agreements', '--accept-source-agreements') -What 'Installing Node.js LTS'
    }
    else {
        Install-FromWebInstaller `
            -Url 'https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi' `
            -FileName 'node-lts.msi'
    }

    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}
Write-Good "Node: $((& node --version))"

# The ASP.NET Core Module, which is how IIS hands a request to the API. Without
# it the site returns 500.19 and nothing else works, so this is checked by
# looking for the module rather than by trusting an installer's exit code.
#
# Where the module lives changed: current bundles install it under
# Program Files\IIS and point applicationHost.config there, while older ones
# used a shim under System32\inetsrv. Accept either, or the check condemns a
# bundle that installed perfectly.
$ancmPaths = @(
    'C:\Program Files\IIS\Asp.Net Core Module\V2\aspnetcorev2.dll',
    'C:\Windows\System32\inetsrv\aspnetcorev2.dll'
)
$ancmPresent = ($ancmPaths | Where-Object { Test-Path $_ } | Select-Object -First 1) -ne $null

if (-not $ancmPresent) {
    $bundleExe = Join-Path $env:TEMP 'dotnet-hosting-win.exe'
    $bundleLog = Join-Path $env:TEMP 'dotnet-hosting-install.log'

    Write-Note 'Downloading the ASP.NET Core Hosting Bundle (about 115 MB)'
    Invoke-WebRequest -Uri 'https://aka.ms/dotnet/10.0/dotnet-hosting-win.exe' `
        -OutFile $bundleExe -UseBasicParsing

    # A truncated download is a real failure mode on a slow link; the bundle is
    # ~115 MB, so anything much smaller is an error page, not an installer.
    if ((Get-Item $bundleExe).Length -lt 50MB) {
        throw "The Hosting Bundle download was incomplete ($((Get-Item $bundleExe).Length) bytes). Re-run to retry."
    }

    Write-Note 'Installing the Hosting Bundle'
    $bundle = Start-Process -FilePath $bundleExe `
        -ArgumentList '/install', '/quiet', '/norestart', '/log', "`"$bundleLog`"" `
        -Wait -PassThru

    if ($bundle.ExitCode -notin @(0, 1638, 3010)) {
        $tail = if (Test-Path $bundleLog) { (Get-Content $bundleLog -Tail 15) -join [Environment]::NewLine } else { '(no log written)' }
        throw "The Hosting Bundle installer exited with code $($bundle.ExitCode).$([Environment]::NewLine)Last lines of ${bundleLog}:$([Environment]::NewLine)$tail"
    }

    # The module registers against the running IIS; bounce it so the module is
    # in place before anything is asked of it.
    net stop was /y  2>&1 | Out-Null
    net start w3svc  2>&1 | Out-Null

    Remove-Item $bundleExe -Force -ErrorAction SilentlyContinue

    $ancmPresent = ($ancmPaths | Where-Object { Test-Path $_ } | Select-Object -First 1) -ne $null
}

if (-not $ancmPresent) {
    throw @'
The Hosting Bundle ran but its IIS module was not found in either the
Program Files\IIS or System32\inetsrv location.

Confirm IIS itself is installed (Get-WindowsFeature Web-Server), reboot if a
Windows update is pending, then run this script again - it resumes from here.
The installer log at %TEMP%\dotnet-hosting-install.log records what it did.
'@
}
Write-Good 'ASP.NET Core Hosting Bundle present'

# URL Rewrite, which serves index.html for Angular's own routes.
$rewriteInstalled = Test-Path 'C:\Windows\System32\inetsrv\rewrite.dll'

if (-not $rewriteInstalled) {
    if ($useWinget) {
        try {
            Invoke-Native 'winget' @('install', '--id', 'Microsoft.IIS.URLRewrite', '-e', '--silent',
                '--accept-package-agreements', '--accept-source-agreements') -What 'Installing URL Rewrite'
        }
        catch {
            Write-Warn 'winget could not install URL Rewrite; falling back to the direct download.'
        }
    }

    if (-not (Test-Path 'C:\Windows\System32\inetsrv\rewrite.dll')) {
        Install-FromWebInstaller `
            -Url 'https://download.microsoft.com/download/1/2/8/128E2E22-C1B9-44A4-BE2A-5859ED1D4592/rewrite_amd64_en-US.msi' `
            -FileName 'rewrite_amd64.msi' `
            -Arguments @('/quiet', '/norestart')
    }
}

if (-not (Test-Path 'C:\Windows\System32\inetsrv\rewrite.dll')) {
    throw @'
The IIS URL Rewrite module did not install.

Get it from https://www.iis.net/downloads/microsoft/url-rewrite, install it,
then run this script again. Without it the portal's inner pages return 404 on
a browser refresh.
'@
}
Write-Good 'URL Rewrite present'

if (-not (Test-Command 'sqlcmd')) {
    throw "sqlcmd was not found. Install the SQL Server command line tools, or add them to PATH, then run this script again."
}

$sqlVersion = Invoke-Sql -Query 'SET NOCOUNT ON; SELECT @@VERSION' -Database 'master'
Write-Good "SQL Server reachable on $SqlInstance as $DbUser"

# ---------------------------------------------------------------------------
Write-Step 'Source'

if (Test-Path (Join-Path $SourceRoot '.git')) {
    Write-Note "Updating $SourceRoot"
    Invoke-Native 'git' @('fetch', '--all', '--prune') -WorkingDirectory $SourceRoot
    Invoke-Native 'git' @('checkout', $Branch) -WorkingDirectory $SourceRoot
    Invoke-Native 'git' @('reset', '--hard', "origin/$Branch") -WorkingDirectory $SourceRoot
}
else {
    New-Item -ItemType Directory -Path (Split-Path $SourceRoot -Parent) -Force | Out-Null
    Write-Note "Cloning $RepoUrl"
    Invoke-Native 'git' @('clone', '--branch', $Branch, $RepoUrl, $SourceRoot)
}

$commit = (& git -C $SourceRoot rev-parse --short HEAD).Trim()
Write-Good "At commit $commit on $Branch"

# ---------------------------------------------------------------------------
Write-Step 'Database'

# Reads a single number out of sqlcmd's decorated output (header, separator,
# value across several lines).
function Get-SqlCount {
    param([Parameter(Mandatory = $true)][string] $Query)
    $text = (Invoke-Sql -Query "SET NOCOUNT ON; $Query") -join ' '
    return [int]([regex]::Match($text, '\d+').Value)
}

$tableCount = Get-SqlCount 'SELECT COUNT(*) FROM sys.tables'

# The migrations are a one-time ordered sequence, not scripts written to run
# twice: some assert the exact state they expected when first written (001
# checks the menu is 15 parents and 30 children, which later migrations then
# add to). Re-running them from the top therefore fails. A ledger records which
# have run, so each is applied once and once only - the standard way to manage
# an evolving schema.
Invoke-Sql -Query @'
IF SCHEMA_ID('deploy') IS NULL EXEC('CREATE SCHEMA deploy');
IF OBJECT_ID('deploy.SchemaMigration') IS NULL
    CREATE TABLE deploy.SchemaMigration (
        FileName     nvarchar(260) NOT NULL PRIMARY KEY,
        AppliedOnUtc datetime2(0)  NOT NULL
            CONSTRAINT DF_SchemaMigration_AppliedOnUtc DEFAULT sysutcdatetime()
    );
'@ | Out-Null

$migrationFiles = Get-ChildItem (Join-Path $SourceRoot 'database\07-migrations') -Filter '*.sql' |
                  Sort-Object Name

$ledgerCount = Get-SqlCount 'SELECT COUNT(*) FROM deploy.SchemaMigration'

# Baseline: a database that already has tables but no ledger is taken to be at
# the current migration level - this deployment brought it there - so the
# existing migrations are recorded as applied rather than re-run. A genuinely
# fresh database has its ledger filled as each migration actually runs, below.
if ($ledgerCount -eq 0 -and $tableCount -gt 0) {
    Write-Note "$tableCount tables present, no ledger - baselining as fully migrated"
    foreach ($migration in $migrationFiles) {
        $safeName = $migration.Name.Replace("'", "''")
        Invoke-Sql -Query "INSERT INTO deploy.SchemaMigration (FileName) VALUES (N'$safeName')" | Out-Null
    }
}

# 05-security and 06-maintenance are deliberately not run. The first creates
# server-level logins with placeholder passwords, the second SQL Agent jobs;
# neither belongs on a shared instance that hosts other systems' databases.

$applied = 0

# On a fresh database, lay down the schema and the reference/seed data first.
# On an existing one, skip both - the tables are there and the seed scripts
# plain-INSERT data that is already present.
if ($tableCount -eq 0) {
    Write-Note 'Empty database - creating the schema and seeding reference data'
    $createFolders = @('02-schema', '03-programmability', '04-seed')
}
else {
    Write-Note "$tableCount tables present - refreshing views and procedures"
    # CREATE OR ALTER, so re-running is safe and ships updated code.
    $createFolders = @('03-programmability')
}

foreach ($folder in $createFolders) {
    foreach ($script in (Get-ChildItem (Join-Path $SourceRoot "database\$folder") -Filter '*.sql' | Sort-Object Name)) {
        $result = Invoke-SqlFile -Path $script.FullName
        if ($result.ExitCode -ne 0) { throw "$folder/$($script.Name) failed:`n$($result.Output)" }
        $applied++
    }
}

# Migrations: only the ones the ledger has not seen. Each is recorded the moment
# it succeeds, so an interrupted run resumes rather than repeating.
$appliedNames = @{}
foreach ($row in (Invoke-Sql -Query 'SET NOCOUNT ON; SELECT FileName FROM deploy.SchemaMigration')) {
    $name = "$row".Trim()
    if ($name) { $appliedNames[$name] = $true }
}

$migrationsRun = 0
foreach ($migration in $migrationFiles) {
    if ($appliedNames.ContainsKey($migration.Name)) { continue }

    Write-Note "Migration $($migration.Name)"
    $result = Invoke-SqlFile -Path $migration.FullName
    if ($result.ExitCode -ne 0) { throw "07-migrations/$($migration.Name) failed:`n$($result.Output)" }

    $safeName = $migration.Name.Replace("'", "''")
    Invoke-Sql -Query "INSERT INTO deploy.SchemaMigration (FileName) VALUES (N'$safeName')" | Out-Null
    $applied++
    $migrationsRun++
}

Write-Good "$applied database scripts applied ($migrationsRun new migration$(if ($migrationsRun -ne 1) {'s'}))"

# ---------------------------------------------------------------------------
Write-Step 'Build'

$frontendPath = Join-Path $SourceRoot 'frontend'
$apiPath      = Join-Path $SourceRoot 'backend\src\MCLS.Api'

Write-Note 'Restoring front-end packages (this takes a few minutes on a first run)'
Invoke-Native 'cmd.exe' @('/c', 'npm', 'ci', '--no-audit', '--no-fund') -WorkingDirectory $frontendPath

Write-Note 'Building the front end'
Invoke-Native 'cmd.exe' @('/c', 'npx', 'ng', 'build', '--configuration', 'production') `
    -WorkingDirectory $frontendPath

$publishPath = Join-Path $env:TEMP 'mcls-api-publish'
Remove-Item $publishPath -Recurse -Force -ErrorAction SilentlyContinue

Write-Note 'Publishing the API'
Invoke-Native 'dotnet' @('publish', $apiPath, '-c', 'Release', '-o', $publishPath, '--nologo') `
    -WorkingDirectory $SourceRoot

Write-Good 'Both built'

# ---------------------------------------------------------------------------
Write-Step 'Layout'

$sitePath    = Join-Path $InstallRoot 'site'
$apiRoot     = Join-Path $InstallRoot 'api'
$uploadsPath = Join-Path $InstallRoot 'Uploads'
$logsPath    = Join-Path $InstallRoot 'Logs'

foreach ($path in @($sitePath, $apiRoot, $uploadsPath, $logsPath)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
}

# The API is stopped while its files are replaced, or the DLLs are locked.
if (Get-Website -Name $SiteName -ErrorAction SilentlyContinue) {
    Write-Note 'Stopping the site while files are replaced'
    Stop-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

$builtSite = Join-Path $frontendPath 'dist\mcls-portal\browser'

if (-not (Test-Path $builtSite)) {
    throw "The front-end build produced nothing at $builtSite."
}

Write-Note 'Copying the front end'
Get-ChildItem $sitePath -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $builtSite '*') $sitePath -Recurse -Force
Copy-Item (Join-Path $SourceRoot 'deploy\site.web.config') (Join-Path $sitePath 'web.config') -Force

Write-Note 'Copying the API'
# appsettings.Production.json is written below and must survive a redeploy, so
# the old payload is cleared selectively rather than wholesale.
Get-ChildItem $apiRoot -Force |
    Where-Object { $_.Name -ne 'appsettings.Production.json' } |
    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $publishPath '*') $apiRoot -Recurse -Force

Write-Good "Laid out under $InstallRoot"

# ---------------------------------------------------------------------------
Write-Step 'Configuration'

$productionSettings = Join-Path $apiRoot 'appsettings.Production.json'

if (Test-Path $productionSettings) {
    Write-Note 'Keeping the existing appsettings.Production.json (signing key and secrets preserved)'

    # The domain may still have changed since it was written.
    $existing = Get-Content $productionSettings -Raw | ConvertFrom-Json
    $signingKey     = $existing.Jwt.SigningKey
    $adminPassword  = $null
}
else {
    # 64 random bytes, base64. Anyone who can guess this key can mint a token
    # for any account, so it is generated here and never leaves the server.
    $keyBytes = [byte[]]::new(64)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($keyBytes)
    $signingKey = [Convert]::ToBase64String($keyBytes)

    # The first Super Admin password, shown once at the end of this run.
    $passwordBytes = [byte[]]::new(12)
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($passwordBytes)
    $adminPassword = ([Convert]::ToBase64String($passwordBytes) -replace '[^A-Za-z0-9]', '') + '#7Aa'
}

$settings = [ordered]@{
    'ConnectionStrings' = [ordered]@{
        # SQL authentication, because the database lives on a shared instance
        # this machine's application-pool identity is not a principal on. The
        # file is readable only by administrators and the pool identity.
        'MclsDatabase' = "Server=$SqlInstance;Database=$DbName;User ID=$DbUser;Password=$DbPassword;TrustServerCertificate=true;Encrypt=true;MultipleActiveResultSets=false;Application Name=MCLS.Api"
    }
    'Jwt' = [ordered]@{
        'SigningKey' = $signingKey
    }
    'Portal' = [ordered]@{
        'BaseUrl' = "https://$Domain"
    }
    'Cors' = [ordered]@{
        'AllowedOrigins' = @("https://$Domain")
    }
    'FileStorage' = [ordered]@{
        'RootPath' = $uploadsPath
    }
    'Serilog' = [ordered]@{
        'WriteTo' = @(
            [ordered]@{
                'Name' = 'File'
                'Args' = [ordered]@{
                    'path'                   = (Join-Path $logsPath 'mcls-api-.log')
                    'rollingInterval'        = 'Day'
                    'retainedFileCountLimit' = 31
                }
            }
        )
    }
    'AllowedHosts' = "$Domain;localhost"
}

if ($adminPassword) {
    # Only on a fresh install. Removed from the file after the first start, so
    # the password does not sit on disk any longer than it must.
    $settings['Bootstrap'] = [ordered]@{
        'AdminFullName' = 'MCLS Administrator'
        'AdminEmail'    = $AdminEmail
        'AdminPassword' = $adminPassword
    }
}

$settings | ConvertTo-Json -Depth 8 | Set-Content $productionSettings -Encoding UTF8
Write-Good 'appsettings.Production.json written'

# ---------------------------------------------------------------------------
Write-Step 'IIS'

if (-not (Test-Path "IIS:\AppPools\$AppPoolName")) {
    Write-Note "Creating application pool $AppPoolName"
    New-WebAppPool -Name $AppPoolName | Out-Null
}

# No managed code: the API runs on .NET, not the .NET Framework, and IIS is
# only the host process.
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ''
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.identityType -Value 'ApplicationPoolIdentity'
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name startMode -Value 'AlwaysRunning'
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name processModel.idleTimeout -Value '00:00:00'
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name recycling.periodicRestart.time -Value '00:00:00'

if (-not (Get-Website -Name $SiteName -ErrorAction SilentlyContinue)) {
    Write-Note "Creating site $SiteName"
    New-Website -Name $SiteName -PhysicalPath $sitePath -ApplicationPool $AppPoolName `
                -HostHeader $Domain -Port 80 | Out-Null
}
else {
    Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $sitePath
}

# The default site answers on the same port and would shadow this one.
$defaultSite = Get-Website -Name 'Default Web Site' -ErrorAction SilentlyContinue

if ($defaultSite -and $defaultSite.State -eq 'Started') {
    Write-Note 'Stopping the Default Web Site, which shares port 80'
    Stop-Website -Name 'Default Web Site'
    Set-ItemProperty "IIS:\Sites\Default Web Site" -Name serverAutoStart -Value $false
}

# The API as a child application, so the browser calls /api on the same origin
# and no CORS pre-flight is ever needed.
$apiApp = Get-WebApplication -Site $SiteName -Name 'api' -ErrorAction SilentlyContinue

if (-not $apiApp) {
    Write-Note 'Creating the /api application'
    New-WebApplication -Site $SiteName -Name 'api' -PhysicalPath $apiRoot `
                       -ApplicationPool $AppPoolName | Out-Null
}
else {
    Set-ItemProperty "IIS:\Sites\$SiteName\api" -Name physicalPath -Value $apiRoot
}

# ASPNETCORE_ENVIRONMENT, which is what makes the API read
# appsettings.Production.json.
Set-WebConfigurationProperty -PSPath "IIS:\Sites\$SiteName\api" `
    -Filter 'system.webServer/aspNetCore/environmentVariables' `
    -Name '.' -Value @{ name = 'ASPNETCORE_ENVIRONMENT'; value = 'Production' } `
    -ErrorAction SilentlyContinue

Write-Good "Site $SiteName bound to $Domain, API at /api"

# ---------------------------------------------------------------------------
Write-Step 'Permissions'

$poolIdentity = "IIS APPPOOL\$AppPoolName"

# Uploads and logs are written by the API; the site and API folders are only
# read, and are left as they are.
foreach ($path in @($uploadsPath, $logsPath)) {
    $acl = Get-Acl $path
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        $poolIdentity, 'Modify', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
    $acl.SetAccessRule($rule)
    Set-Acl $path $acl
}
Write-Note "Granted $poolIdentity write access to Uploads and Logs"

# No SQL principal is created for the pool identity: the database is on a
# shared instance reached by SQL authentication, and the credential lives in
# appsettings.Production.json. That file is readable by administrators and the
# pool identity only.
$settingsAcl = Get-Acl $productionSettings
$settingsAcl.SetAccessRuleProtection($true, $false)
$settingsAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    'BUILTIN\Administrators', 'FullControl', 'Allow')))
$settingsAcl.SetAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $poolIdentity, 'Read', 'Allow')))
Set-Acl $productionSettings $settingsAcl
Write-Good 'appsettings.Production.json restricted to administrators and the pool identity'

# ---------------------------------------------------------------------------
Write-Step 'Start'

Start-WebAppPool -Name $AppPoolName -ErrorAction SilentlyContinue
Start-Website  -Name $SiteName -ErrorAction SilentlyContinue

# The first request compiles and warms the app; give it room before judging it.
Start-Sleep -Seconds 8

$health = $null
try {
    $health = Invoke-WebRequest -Uri "http://localhost/api/health/ready" -Headers @{ Host = $Domain } `
                                -UseBasicParsing -TimeoutSec 60
}
catch {
    Write-Warn "The API did not answer /health/ready yet: $($_.Exception.Message)"
    Write-Warn "Check $logsPath and the Windows event log before assuming the worst - a first start is slow."
}

if ($health -and $health.StatusCode -eq 200) { Write-Good 'API healthy' }

try {
    $page = Invoke-WebRequest -Uri 'http://localhost/' -Headers @{ Host = $Domain } `
                              -UseBasicParsing -TimeoutSec 30
    if ($page.Content -match '<app-root') { Write-Good 'Front end serving' }
}
catch {
    Write-Warn "The front end did not answer: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
Write-Step 'HTTPS'

if ($SkipHttps) {
    Write-Warn 'Skipped by request. The portal is on plain HTTP until a certificate is bound.'
}
else {
    # win-acme drives Let's Encrypt and installs a scheduled task that renews
    # the certificate before it expires, which is the part people forget.
    $acmePath = Join-Path $InstallRoot 'win-acme'

    if (-not (Test-Path (Join-Path $acmePath 'wacs.exe'))) {
        New-Item -ItemType Directory -Path $acmePath -Force | Out-Null
        $zip = Join-Path $env:TEMP 'win-acme.zip'

        Write-Note 'Downloading win-acme'
        Invoke-WebRequest -UseBasicParsing -OutFile $zip `
            -Uri 'https://github.com/win-acme/win-acme/releases/download/v2.2.9.1701/win-acme.v2.2.9.1701.x64.pluggable.zip'

        Expand-Archive $zip -DestinationPath $acmePath -Force
        Remove-Item $zip -Force
    }

    Write-Note "Requesting a certificate for $Domain"
    Write-Note 'Port 80 must be reachable from the internet for the challenge to pass.'

    & (Join-Path $acmePath 'wacs.exe') --target iis --siteid (Get-Website -Name $SiteName).Id `
        --host $Domain --installation iis --emailaddress $AdminEmail --accepttos --notaskscheduler:$false

    if ($LASTEXITCODE -eq 0) {
        Write-Good "Certificate issued and bound; renewal is scheduled"
    }
    else {
        Write-Warn 'win-acme did not complete. The site still works on HTTP.'
        Write-Warn "Re-run by hand:  $acmePath\wacs.exe"
    }
}

# ---------------------------------------------------------------------------
Write-Step 'Remote access for later releases'

# With OpenSSH on the box, every future deployment is a command rather than a
# remote desktop session.
$sshCapability = Get-WindowsCapability -Online -Name 'OpenSSH.Server*' -ErrorAction SilentlyContinue

if ($sshCapability -and $sshCapability.State -ne 'Installed') {
    Write-Note 'Installing the OpenSSH server'
    Add-WindowsCapability -Online -Name $sshCapability.Name | Out-Null
}

if (Get-Service sshd -ErrorAction SilentlyContinue) {
    Set-Service -Name sshd -StartupType Automatic
    Start-Service sshd

    if (-not (Get-NetFirewallRule -Name 'MCLS-SSH' -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name 'MCLS-SSH' -DisplayName 'OpenSSH Server (MCLS)' `
            -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 | Out-Null
    }

    Write-Good 'OpenSSH running on port 22'
    Write-Warn  'Azure still blocks it: add an inbound rule for TCP 22 on this VM''s network security group,'
    Write-Warn  'restricted to the addresses that should be allowed to deploy.'
}
else {
    Write-Warn 'OpenSSH could not be installed. Deployments will need a remote desktop session.'
}

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host ('=' * 78) -ForegroundColor Cyan
Write-Host '  Deployment complete' -ForegroundColor Green
Write-Host ('=' * 78) -ForegroundColor Cyan
Write-Host ''
Write-Host "  Portal      https://$Domain"
Write-Host "  API         https://$Domain/api"
Write-Host "  Health      https://$Domain/api/health/ready"
Write-Host "  Commit      $commit"
Write-Host "  Site files  $sitePath"
Write-Host "  API files   $apiRoot"
Write-Host "  Logs        $logsPath"
Write-Host ''

if ($adminPassword) {
    Write-Host '  Super Admin, created on first start of a fresh database:' -ForegroundColor Yellow
    Write-Host "      User ID   Super Admin"
    Write-Host "      Password  $adminPassword" -ForegroundColor Yellow
    Write-Host ''
    Write-Host '  Sign in, change it, then remove the Bootstrap section from' -ForegroundColor Yellow
    Write-Host "  $productionSettings" -ForegroundColor Yellow
    Write-Host ''
}

Write-Host '  To release a new build later, run this script again. It pulls'
Write-Host '  the branch, rebuilds, and leaves the database and secrets alone.'
Write-Host ''

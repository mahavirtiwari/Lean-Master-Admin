<#
.SYNOPSIS
    Deploys the MCLS database to a SQL Server instance, in order.

.DESCRIPTION
    Runs the numbered folders in sequence: 01-database, 02-schema,
    03-programmability, 04-seed, 05-security, 06-maintenance.

    Every script is written to be idempotent, so a re-run upgrades an existing
    database rather than failing. The one exception is 01-database, which
    skips creation when the database already exists.

.PARAMETER ServerInstance
    SQL Server instance, e.g. "localhost", "SQLPROD01\MCLS".

.PARAMETER DatabaseName
    Target database. Defaults to MCLS.

.PARAMETER DataPath / LogPath
    Where the .mdf and .ldf go. Only used on first creation.

.PARAMETER SkipSeed
    Deploy schema and programmability but no seed data.

.PARAMETER SkipSecurity
    Skip 05-security. Use when logins are managed separately.

.PARAMETER SkipMaintenance
    Skip 06-maintenance. Use when SQL Agent is unavailable (e.g. Express) or
    jobs are managed centrally.

.PARAMETER Credential
    SQL authentication credential. Omit to use Windows authentication.

.PARAMETER WhatIf
    List the scripts that would run, without running them.

.EXAMPLE
    .\deploy-database.ps1 -ServerInstance localhost -Verbose

.EXAMPLE
    .\deploy-database.ps1 -ServerInstance SQLPROD01 -DataPath 'E:\SQLData\' `
        -LogPath 'F:\SQLLogs\' -Credential (Get-Credential sa)
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)]
    [string] $ServerInstance,

    [string] $DatabaseName = 'MCLS',

    # No trailing backslash — see the note in 01-create-database.sql. A trailing
    # one is trimmed below rather than rejected, so either form works.
    [string] $DataPath     = 'D:\SQLData',
    [string] $LogPath      = 'L:\SQLLogs',

    [switch] $SkipSeed,
    [switch] $SkipSecurity,
    [switch] $SkipMaintenance,

    [System.Management.Automation.PSCredential] $Credential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path

# Accept a trailing separator from the caller but never pass one on: a value
# ending in '\' escapes the closing quote in Windows native argument parsing,
# and sqlcmd then receives a path with the drive letter missing.
$DataPath = $DataPath.TrimEnd('\', '/')
$LogPath = $LogPath.TrimEnd('\', '/')

#--------------------------------------------------------------------- helpers

# How SQL is executed: 'module' (Invoke-Sqlcmd) or 'sqlcmd' (sqlcmd.exe).
$script:SqlRunner = $null
$script:SqlCmdPath = $null

function Initialize-SqlRunner {
    <#
        Prefers Invoke-Sqlcmd from the SqlServer module, because it raises
        terminating PowerShell errors rather than an exit code to interpret.

        Falls back to sqlcmd.exe, which ships with SQL Server itself. That
        matters on a hardened server where the PowerShell Gallery is blocked
        and Install-Module is not an option — the fallback needs no network
        access and no extra install.
    #>
    foreach ($name in 'SqlServer', 'SQLPS') {
        if (Get-Module -ListAvailable -Name $name) {
            Import-Module $name -DisableNameChecking -ErrorAction SilentlyContinue
            if (Get-Command Invoke-Sqlcmd -ErrorAction SilentlyContinue) {
                $script:SqlRunner = 'module'
                Write-Verbose "Using Invoke-Sqlcmd from the $name module."
                return $true
            }
        }
    }

    # Guarded rather than dotting straight into Get-Command: under StrictMode a
    # null result makes '.Source' a terminating error.
    $onPath = Get-Command sqlcmd.exe -ErrorAction SilentlyContinue

    $candidates = @(
        $(if ($onPath) { $onPath.Source }),
        "$env:ProgramFiles\Microsoft SQL Server\Client SDK\ODBC\*\Tools\Binn\SQLCMD.EXE",
        "${env:ProgramFiles(x86)}\Microsoft SQL Server\Client SDK\ODBC\*\Tools\Binn\SQLCMD.EXE",
        "$env:ProgramFiles\Microsoft SQL Server\*\Tools\Binn\SQLCMD.EXE"
    ) | Where-Object { $_ }

    foreach ($candidate in $candidates) {
        $resolved = Get-Item $candidate -ErrorAction SilentlyContinue |
            Sort-Object FullName -Descending | Select-Object -First 1
        if ($resolved) {
            $script:SqlCmdPath = $resolved.FullName
            $script:SqlRunner = 'sqlcmd'
            Write-Verbose "Using $($resolved.FullName)."
            return $true
        }
    }

    return $false
}

function ConvertFrom-SqlcmdTable {
    <#
        Turns sqlcmd's `-W -s|` output into an object.

        The raw form is a header row, a row of dashes, the data rows, then a
        "(n rows affected)" trailer. Only the first data row is needed here.
    #>
    param([Parameter(Mandatory)][AllowNull()] $Lines)

    $clean = @($Lines |
        ForEach-Object { "$_" } |
        Where-Object {
            $_ -match '\S' -and
            $_ -notmatch '^\s*\(' -and          # (1 rows affected)
            $_ -notmatch '^\s*[-|\s]+$'         # the dashes separator row
        })

    if ($clean.Count -lt 2) { return $null }

    $headers = @(($clean[0] -split '\|') | ForEach-Object { $_.Trim() })
    $values = @(($clean[1] -split '\|') | ForEach-Object { $_.Trim() })

    $result = [ordered]@{}
    for ($i = 0; $i -lt $headers.Count; $i++) {
        $result[$headers[$i]] = if ($i -lt $values.Count) { $values[$i] } else { $null }
    }
    return [pscustomobject]$result
}

function Invoke-SqlText {
    <# Runs a query and returns a single row as an object, for the probe and the
       verification step. Script execution goes through Invoke-SqlFile. #>
    param(
        [Parameter(Mandatory)] [string] $Query,
        [string] $Database = 'master'
    )

    if ($script:SqlRunner -eq 'module') {
        $splat = @{
            ServerInstance = $ServerInstance
            Database       = $Database
            Query          = $Query
            ErrorAction    = 'Stop'
        }
        if ($Credential) { $splat.Credential = $Credential }
        # Self-signed certs are the norm on an internal SQL box.
        if ((Get-Command Invoke-Sqlcmd).Parameters.ContainsKey('TrustServerCertificate')) {
            $splat.TrustServerCertificate = $true
        }
        return Invoke-Sqlcmd @splat
    }

    $args = @('-S', $ServerInstance, '-d', $Database, '-b', '-C', '-I', '-Q', $Query, '-W', '-s', '|')
    if ($Credential) {
        $args += @('-U', $Credential.UserName,
                   '-P', $Credential.GetNetworkCredential().Password)
    }
    else { $args += '-E' }

    $output = & $script:SqlCmdPath @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw ($output -join [Environment]::NewLine)
    }
    return ConvertFrom-SqlcmdTable -Lines $output
}

function Invoke-SqlFile {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [string] $Database = 'master',
        [hashtable] $Variables
    )

    $name = Split-Path -Leaf $Path

    if (-not $PSCmdlet.ShouldProcess($name, 'Execute SQL script')) {
        Write-Host "  [would run] $name" -ForegroundColor DarkGray
        return
    }

    Write-Host "  -> $name" -ForegroundColor Gray

    $sw = [System.Diagnostics.Stopwatch]::StartNew()

    if ($script:SqlRunner -eq 'module') {
        $splat = @{
            ServerInstance  = $ServerInstance
            Database        = $Database
            InputFile       = $Path
            QueryTimeout    = 0            # schema and seed scripts can be slow
            ErrorAction     = 'Stop'
            OutputSqlErrors = $true
        }

        # -Variable feeds :setvar in 01-create-database.sql
        if ($Variables) {
            $splat.Variable = $Variables.GetEnumerator() |
                ForEach-Object { "$($_.Key)=$($_.Value)" }
        }
        if ($Credential) { $splat.Credential = $Credential }
        if ((Get-Command Invoke-Sqlcmd).Parameters.ContainsKey('TrustServerCertificate')) {
            $splat.TrustServerCertificate = $true
        }

        Invoke-Sqlcmd @splat -Verbose:$false | Out-Null
    }
    else {
        # -I sets QUOTED_IDENTIFIER ON, which sqlcmd otherwise defaults OFF while
        # SSMS defaults it ON. Filtered indexes and computed columns require it,
        # so without -I a script that works in SSMS fails here.
        # -b makes a SQL error exit non-zero; see below.
        $args = @('-S', $ServerInstance, '-d', $Database, '-i', $Path, '-b', '-C', '-I')
        if ($Credential) {
            $args += @('-U', $Credential.UserName,
                       '-P', $Credential.GetNetworkCredential().Password)
        }
        else { $args += '-E' }

        if ($Variables) {
            foreach ($entry in $Variables.GetEnumerator()) {
                # The value must carry literal double quotes inside the argument.
                # Without them sqlcmd treats the colon in a path like C:\... as
                # an argument break and reports ':\...': Invalid argument.
                $args += @('-v', ('{0}="{1}"' -f $entry.Key, $entry.Value))
            }
        }

        $output = & $script:SqlCmdPath @args 2>&1
        if ($LASTEXITCODE -ne 0) {
            $sw.Stop()
            Write-Host "     FAILED" -ForegroundColor Red
            throw "$name failed:`n$($output -join [Environment]::NewLine)"
        }
    }

    $sw.Stop()
    Write-Host ("     ok ({0:N1}s)" -f $sw.Elapsed.TotalSeconds) -ForegroundColor DarkGreen
}

function Invoke-Folder {
    param(
        [Parameter(Mandatory)] [string] $Folder,
        [string] $Database = $DatabaseName
    )

    $dir = Join-Path $root $Folder
    if (-not (Test-Path $dir)) {
        Write-Warning "Folder not found, skipping: $Folder"
        return
    }

    $files = Get-ChildItem -Path $dir -Filter '*.sql' -File | Sort-Object Name
    if (-not $files) {
        Write-Warning "No .sql files in $Folder"
        return
    }

    Write-Host "`n$Folder" -ForegroundColor Cyan
    foreach ($f in $files) {
        Invoke-SqlFile -Path $f.FullName -Database $Database
    }
}

#----------------------------------------------------------------------- start

Write-Host "MCLS database deployment" -ForegroundColor White
Write-Host "  server   : $ServerInstance"
Write-Host "  database : $DatabaseName"
Write-Host "  auth     : $(if ($Credential) { "SQL ($($Credential.UserName))" } else { 'Windows' })"

if (-not (Initialize-SqlRunner)) {
    throw "No way to run SQL was found. Either install the SqlServer module:`n" +
          "    Install-Module -Name SqlServer -Scope CurrentUser -Force`n" +
          "or install the SQL Server command line tools so sqlcmd.exe is available."
}
Write-Host "  runner   : $script:SqlRunner" -ForegroundColor DarkGray

# Connectivity check before doing anything destructive.
try {
    $info = Invoke-SqlText -Query "SELECT CONVERT(varchar(200), SERVERPROPERTY('Edition')) AS e;"
    Write-Host "  edition  : $($info.e)" -ForegroundColor DarkGray
}
catch {
    throw "Cannot reach $ServerInstance : $($_.Exception.Message)"
}

# 01 — create the database. Runs against master and needs the path variables.
Write-Host "`n01-database" -ForegroundColor Cyan
Invoke-SqlFile -Path (Join-Path $root '01-database\01-create-database.sql') `
               -Database 'master' `
               -Variables @{ DbName = $DatabaseName; DataPath = $DataPath; LogPath = $LogPath }

Invoke-Folder -Folder '02-schema'
Invoke-Folder -Folder '03-programmability'

if ($SkipSeed)  { Write-Host "`n04-seed skipped" -ForegroundColor DarkYellow }
else            { Invoke-Folder -Folder '04-seed' }

if ($SkipSecurity) { Write-Host "`n05-security skipped" -ForegroundColor DarkYellow }
else               { Invoke-Folder -Folder '05-security' -Database 'master' }

if ($SkipMaintenance) { Write-Host "`n06-maintenance skipped" -ForegroundColor DarkYellow }
else                  { Invoke-Folder -Folder '06-maintenance' }

# Migrations run last so they can amend anything the base scripts created.
# Each is idempotent and self-verifying, so re-running is safe.
Invoke-Folder -Folder '07-migrations'

#------------------------------------------------------------------ verification

if ($PSCmdlet.ShouldProcess($DatabaseName, 'Verify deployment')) {
    Write-Host "`nVerification" -ForegroundColor Cyan

    $checkSql = @'
SELECT
    (SELECT COUNT(*) FROM sys.tables     WHERE schema_id <> SCHEMA_ID('dbo'))  AS TableCount,
    (SELECT COUNT(*) FROM sys.views      WHERE schema_id <> SCHEMA_ID('dbo'))  AS ViewCount,
    (SELECT COUNT(*) FROM sys.procedures WHERE schema_id <> SCHEMA_ID('dbo'))  AS ProcCount,
    (SELECT COUNT(*) FROM auth.Module)                                     AS Modules,
    (SELECT COUNT(*) FROM auth.Permission)                                 AS Permissions,
    (SELECT COUNT(*) FROM auth.Role)                                       AS Roles,
    (SELECT COUNT(*) FROM auth.RolePermission)                             AS RoleGrants,
    (SELECT COUNT(*) FROM master.State)                                        AS States,
    (SELECT COUNT(*) FROM master.Sector)                                       AS Sectors,
    (SELECT COUNT(*) FROM auth.MenuItem WHERE ParentMenuItemId IS NULL)    AS MenuParents,
    (SELECT COUNT(*) FROM auth.MenuItem WHERE ParentMenuItemId IS NOT NULL) AS MenuChildren;
'@

    # Both runners now return an object with the same property names.
    $counts = Invoke-SqlText -Query $checkSql -Database $DatabaseName

    Write-Host ("  tables {0}   views {1}   procedures {2}" -f $counts.TableCount, $counts.ViewCount, $counts.ProcCount)
    Write-Host ("  modules {0}   permissions {1}   roles {2}   grants {3}" -f $counts.Modules, $counts.Permissions, $counts.Roles, $counts.RoleGrants)
    Write-Host ("  states {0}   sectors {1}" -f $counts.States, $counts.Sectors)
    Write-Host ("  menu: {0} parents, {1} children" -f $counts.MenuParents, $counts.MenuChildren)

    # 15 modules x 5 rights is the invariant the whole authorization model rests on.
    if (-not $SkipSeed -and $counts.Permissions -ne 75) {
        Write-Warning "Expected 75 permissions (15 modules x 5 rights) but found $($counts.Permissions)."
    }

    # The sidebar the design specifies: 15 parents, 30 children.
    if ($counts.MenuParents -ne 15 -or $counts.MenuChildren -ne 30) {
        Write-Warning ("Expected a 15-parent / 30-child menu but found {0} / {1}. Sub-menus will be wrong." -f $counts.MenuParents, $counts.MenuChildren)
    }
}

Write-Host "`nDone." -ForegroundColor Green
Write-Host "Next: set real passwords for mcls_app / mcls_reports / mcls_deploy," -ForegroundColor DarkYellow
Write-Host "or map the IIS app-pool identity instead (see 05-security)." -ForegroundColor DarkYellow

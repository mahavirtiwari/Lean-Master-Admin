/*===========================================================================
  MCLS Portal — database creation
  Target : Microsoft SQL Server 2022 Standard Edition (2019 Standard also OK)
  Run as : sysadmin, in the master database
  Notes  : Uses only Standard Edition features. No partitioning, no in-memory
           OLTP, no Enterprise-only online index operations.
===========================================================================*/
SET NOCOUNT ON;
GO

USE master;
GO

/*---------------------------------------------------------------------------
  SQLCMD variables.

  deploy-database.ps1 supplies these with sqlcmd's -v. They are commented out
  here deliberately: a :setvar in the script REASSIGNS the variable and would
  silently override whatever the deployment passed in, which is how a database
  ends up on the wrong volume.

  Uncomment them only to run this file standalone in SSMS with SQLCMD Mode on
  (Query > SQLCMD Mode), and adjust the paths to the target server first.

  No trailing backslash — the separator is added below. A value ending in '\'
  escapes the closing quote in Windows native argument parsing and the drive
  letter is lost.
---------------------------------------------------------------------------*/
-- :setvar DbName        "MCLS"
-- :setvar DataPath      "D:\SQLData"
-- :setvar LogPath       "L:\SQLLogs"

IF DB_ID(N'$(DbName)') IS NOT NULL
BEGIN
    RAISERROR (N'Database $(DbName) already exists — creation skipped.', 10, 1) WITH NOWAIT;
END
ELSE
BEGIN
    CREATE DATABASE [$(DbName)]
    ON PRIMARY
    (
        NAME     = N'$(DbName)_data',
        FILENAME = N'$(DataPath)\$(DbName)_data.mdf',
        SIZE     = 512MB,
        FILEGROWTH = 256MB
    )
    LOG ON
    (
        NAME     = N'$(DbName)_log',
        FILENAME = N'$(LogPath)\$(DbName)_log.ldf',
        SIZE     = 256MB,
        FILEGROWTH = 128MB
    );
END
GO

ALTER DATABASE [$(DbName)] SET RECOVERY FULL;
ALTER DATABASE [$(DbName)] SET AUTO_CREATE_STATISTICS ON;
ALTER DATABASE [$(DbName)] SET AUTO_UPDATE_STATISTICS ON;
ALTER DATABASE [$(DbName)] SET AUTO_SHRINK OFF;
ALTER DATABASE [$(DbName)] SET PAGE_VERIFY CHECKSUM;

/* Read Committed Snapshot removes reader/writer blocking on the heavily
   queried application-list screens. Requires exclusive access, so it is set
   here at creation time rather than during an upgrade. */
ALTER DATABASE [$(DbName)] SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;

/* Case-insensitive, accent-sensitive collation: Indian names and department
   titles compare naturally, searches are case-insensitive. */
ALTER DATABASE [$(DbName)] COLLATE SQL_Latin1_General_CP1_CI_AS;

/* Query Store powers the Settings > Error Logs / performance views and gives
   DBAs plan regression history. Available in Standard Edition. */
ALTER DATABASE [$(DbName)] SET QUERY_STORE = ON
(
    OPERATION_MODE          = READ_WRITE,
    MAX_STORAGE_SIZE_MB     = 1024,
    QUERY_CAPTURE_MODE      = AUTO,
    CLEANUP_POLICY          = (STALE_QUERY_THRESHOLD_DAYS = 60)
);
GO

USE [$(DbName)];
GO

/*---------------------------------------------------------------------------
  Schemas — one per bounded context, mirroring the portal's module structure.
---------------------------------------------------------------------------*/
DECLARE @schemas TABLE (name sysname);
INSERT INTO @schemas (name) VALUES
    (N'auth'),   -- accounts, roles, the permission matrix
    (N'master'),     -- reference data: states, sectors, parameters, technology
    (N'msme'),       -- enterprises and their scheme applications
    (N'assess'),     -- questionnaire, assessments, non-conformances
    (N'fee'),        -- fee structure, subsidy, TDS, payments
    (N'incentive'),  -- incentive schemes by provider
    (N'comm'),       -- emailer, templates, delivery log
    (N'audit');      -- audit trail, error log, API registry, settings

DECLARE @name sysname, @sql nvarchar(400);
DECLARE c CURSOR LOCAL FAST_FORWARD FOR SELECT name FROM @schemas;
OPEN c;
FETCH NEXT FROM c INTO @name;
WHILE @@FETCH_STATUS = 0
BEGIN
    IF SCHEMA_ID(@name) IS NULL
    BEGIN
        SET @sql = N'CREATE SCHEMA ' + QUOTENAME(@name) + N' AUTHORIZATION dbo;';
        EXEC sys.sp_executesql @sql;
    END
    FETCH NEXT FROM c INTO @name;
END
CLOSE c; DEALLOCATE c;
GO

PRINT N'Database and schemas ready.';
GO

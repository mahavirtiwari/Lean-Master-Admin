/*===========================================================================
  Maintenance — retention purges, index upkeep and the SQL Agent jobs that
  run them.

  SQL Server Standard Edition has no online index rebuild, so the weekly job
  reorganises rather than rebuilds where fragmentation is moderate, and only
  rebuilds (offline, in the maintenance window) when it is severe.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*------------------------------------------------- audit.usp_PurgeOldRecords
  Deletes past the retention windows configured in Settings > System.

  Deletes in batches with a short pause between them: one large DELETE would
  hold locks long enough to block the portal and could escalate to a table
  lock. TOP (@BatchSize) with a loop keeps each transaction small.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE audit.usp_PurgeOldRecords
    @BatchSize  int = 5000,
    @MaxBatches int = 200,
    @Debug      bit = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @auditDays int, @errorDays int, @emailDays int, @rows int, @batches int, @total bigint;

    SELECT @auditDays = TRY_CAST(Value AS int) FROM audit.SystemSetting WHERE [Key] = 'Retention.AuditLogDays';
    SELECT @errorDays = TRY_CAST(Value AS int) FROM audit.SystemSetting WHERE [Key] = 'Retention.ErrorLogDays';
    SELECT @emailDays = TRY_CAST(Value AS int) FROM audit.SystemSetting WHERE [Key] = 'Retention.EmailLogDays';

    /* Fall back to conservative defaults if a setting is missing or unparsable
       — never purge more aggressively than configured. */
    SET @auditDays = ISNULL(@auditDays, 2555);   -- 7 years
    SET @errorDays = ISNULL(@errorDays, 365);
    SET @emailDays = ISNULL(@emailDays, 180);

    ---------------------------------------------------------------- audit log
    SET @batches = 0; SET @total = 0; SET @rows = 1;
    WHILE @rows > 0 AND @batches < @MaxBatches
    BEGIN
        DELETE TOP (@BatchSize) FROM audit.AuditLog
        WHERE OccurredOnUtc < DATEADD(DAY, -@auditDays, SYSUTCDATETIME());
        SET @rows = @@ROWCOUNT;
        SET @total += @rows; SET @batches += 1;
        IF @rows > 0 WAITFOR DELAY '00:00:00.100';
    END
    IF @Debug = 1 PRINT CONCAT(N'AuditLog purged: ', @total);

    ---------------------------------------------------------------- error log
    SET @batches = 0; SET @total = 0; SET @rows = 1;
    WHILE @rows > 0 AND @batches < @MaxBatches
    BEGIN
        /* Unresolved errors are kept regardless of age — they are still work
           in progress, not history. */
        DELETE TOP (@BatchSize) FROM audit.ErrorLog
        WHERE OccurredOnUtc < DATEADD(DAY, -@errorDays, SYSUTCDATETIME())
          AND IsResolved = 1;
        SET @rows = @@ROWCOUNT;
        SET @total += @rows; SET @batches += 1;
        IF @rows > 0 WAITFOR DELAY '00:00:00.100';
    END
    IF @Debug = 1 PRINT CONCAT(N'ErrorLog purged: ', @total);

    ------------------------------------------------------------- e-mail outbox
    SET @batches = 0; SET @total = 0; SET @rows = 1;
    WHILE @rows > 0 AND @batches < @MaxBatches
    BEGIN
        /* Only settled messages. Anything still queued or retrying stays. */
        DELETE TOP (@BatchSize) FROM comm.EmailMessage
        WHERE QueuedOnUtc < DATEADD(DAY, -@emailDays, SYSUTCDATETIME())
          AND Status IN ('Sent','Cancelled');
        SET @rows = @@ROWCOUNT;
        SET @total += @rows; SET @batches += 1;
        IF @rows > 0 WAITFOR DELAY '00:00:00.100';
    END
    IF @Debug = 1 PRINT CONCAT(N'EmailMessage purged: ', @total);

    ------------------------------------------------------- expired refresh tokens
    DELETE FROM auth.RefreshToken
    WHERE ExpiresOnUtc < DATEADD(DAY, -30, SYSUTCDATETIME());
END
GO

/*------------------------------------------------- audit.usp_IndexMaintenance
  Reorganise between 10% and 30% fragmentation, rebuild above 30%.
  Rebuilds are offline on Standard Edition, so this belongs in a window.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE audit.usp_IndexMaintenance
    @ReorganiseThreshold decimal(5,2) = 10.0,
    @RebuildThreshold    decimal(5,2) = 30.0,
    @MinPageCount        int          = 1000,
    @Debug               bit          = 0
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @sql nvarchar(max), @schema sysname, @table sysname, @index sysname, @frag decimal(5,2);

    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT s.name, t.name, i.name, ps.avg_fragmentation_in_percent
        FROM sys.dm_db_index_physical_stats(DB_ID(), NULL, NULL, NULL, 'LIMITED') ps
        JOIN sys.indexes i ON i.object_id = ps.object_id AND i.index_id = ps.index_id
        JOIN sys.tables  t ON t.object_id = i.object_id
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        WHERE ps.avg_fragmentation_in_percent >= @ReorganiseThreshold
          AND ps.page_count >= @MinPageCount
          AND i.name IS NOT NULL            -- skip heaps
          AND i.is_disabled = 0
        ORDER BY ps.avg_fragmentation_in_percent DESC;

    OPEN cur;
    FETCH NEXT FROM cur INTO @schema, @table, @index, @frag;

    WHILE @@FETCH_STATUS = 0
    BEGIN
        SET @sql = N'ALTER INDEX ' + QUOTENAME(@index) + N' ON '
                 + QUOTENAME(@schema) + N'.' + QUOTENAME(@table)
                 + CASE WHEN @frag >= @RebuildThreshold
                        THEN N' REBUILD WITH (SORT_IN_TEMPDB = ON, MAXDOP = 2);'
                        ELSE N' REORGANIZE;' END;

        IF @Debug = 1 PRINT CONCAT(@sql, N'   -- ', CAST(@frag AS varchar(10)), N'%');

        BEGIN TRY
            EXEC sys.sp_executesql @sql;
        END TRY
        BEGIN CATCH
            /* One bad index must not abort the whole run. */
            INSERT INTO audit.ErrorLog (Severity, Source, ExceptionType, Message)
            VALUES ('Warning', N'usp_IndexMaintenance', N'IndexMaintenanceFailure',
                    CONCAT(N'Failed on ', @schema, N'.', @table, N'.', @index, N': ', ERROR_MESSAGE()));
        END CATCH

        FETCH NEXT FROM cur INTO @schema, @table, @index, @frag;
    END

    CLOSE cur; DEALLOCATE cur;

    /* Statistics matter more than fragmentation for the list screens' plans. */
    EXEC sys.sp_updatestats;
END
GO

/*===========================================================================
  SQL Agent jobs. Run this section on the server hosting the database; it
  requires SQLAgentOperatorRole or sysadmin.
===========================================================================*/
USE msdb;
GO

/*------------------------------------------------------------ nightly purge */
IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'MCLS - Nightly Retention Purge')
    EXEC msdb.dbo.sp_delete_job @job_name = N'MCLS - Nightly Retention Purge', @delete_unused_schedule = 1;
GO

EXEC msdb.dbo.sp_add_job
    @job_name    = N'MCLS - Nightly Retention Purge',
    @description = N'Deletes audit, error and e-mail rows past their configured retention window.',
    @enabled     = 1;

EXEC msdb.dbo.sp_add_jobstep
    @job_name   = N'MCLS - Nightly Retention Purge',
    @step_name  = N'Purge',
    @subsystem  = N'TSQL',
    @database_name = N'MCLS',
    @command    = N'EXEC audit.usp_PurgeOldRecords;',
    @retry_attempts = 1,
    @retry_interval = 5;

EXEC msdb.dbo.sp_add_jobschedule
    @job_name   = N'MCLS - Nightly Retention Purge',
    @name       = N'Daily 01:30',
    @freq_type  = 4,            -- daily
    @freq_interval = 1,
    @active_start_time = 013000;

EXEC msdb.dbo.sp_add_jobserver @job_name = N'MCLS - Nightly Retention Purge';
GO

/*------------------------------------------------------- weekly index upkeep */
IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'MCLS - Weekly Index Maintenance')
    EXEC msdb.dbo.sp_delete_job @job_name = N'MCLS - Weekly Index Maintenance', @delete_unused_schedule = 1;
GO

EXEC msdb.dbo.sp_add_job
    @job_name    = N'MCLS - Weekly Index Maintenance',
    @description = N'Reorganises or rebuilds fragmented indexes and refreshes statistics.',
    @enabled     = 1;

EXEC msdb.dbo.sp_add_jobstep
    @job_name   = N'MCLS - Weekly Index Maintenance',
    @step_name  = N'Maintain indexes',
    @subsystem  = N'TSQL',
    @database_name = N'MCLS',
    @command    = N'EXEC audit.usp_IndexMaintenance;';

EXEC msdb.dbo.sp_add_jobschedule
    @job_name   = N'MCLS - Weekly Index Maintenance',
    @name       = N'Sunday 02:30',
    @freq_type  = 8,            -- weekly
    @freq_interval = 1,         -- Sunday
    @freq_recurrence_factor = 1,
    @active_start_time = 023000;

EXEC msdb.dbo.sp_add_jobserver @job_name = N'MCLS - Weekly Index Maintenance';
GO

/*---------------------------------------------------------------- backups ---
  Full nightly, differential every 6 hours, log every 15 minutes. The database
  is in FULL recovery, so without log backups the log file grows without
  bound — the log job is not optional.
---------------------------------------------------------------------------*/
IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'MCLS - Backup Full')
    EXEC msdb.dbo.sp_delete_job @job_name = N'MCLS - Backup Full', @delete_unused_schedule = 1;
GO

EXEC msdb.dbo.sp_add_job @job_name = N'MCLS - Backup Full', @enabled = 1,
    @description = N'Nightly full backup with checksum and verification.';

EXEC msdb.dbo.sp_add_jobstep
    @job_name = N'MCLS - Backup Full',
    @step_name = N'Full backup',
    @subsystem = N'TSQL',
    @database_name = N'master',
    @command = N'
DECLARE @file nvarchar(500) =
    N''B:\SQLBackup\MCLS_FULL_'' + CONVERT(varchar(8), GETDATE(), 112)
    + ''_'' + REPLACE(CONVERT(varchar(8), GETDATE(), 108), '':'', '''') + ''.bak'';
BACKUP DATABASE [MCLS] TO DISK = @file
WITH INIT, CHECKSUM, COMPRESSION, STATS = 10;
RESTORE VERIFYONLY FROM DISK = @file WITH CHECKSUM;';

EXEC msdb.dbo.sp_add_jobschedule
    @job_name = N'MCLS - Backup Full', @name = N'Daily 00:30',
    @freq_type = 4, @freq_interval = 1, @active_start_time = 003000;

EXEC msdb.dbo.sp_add_jobserver @job_name = N'MCLS - Backup Full';
GO

IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = N'MCLS - Backup Log')
    EXEC msdb.dbo.sp_delete_job @job_name = N'MCLS - Backup Log', @delete_unused_schedule = 1;
GO

EXEC msdb.dbo.sp_add_job @job_name = N'MCLS - Backup Log', @enabled = 1,
    @description = N'Transaction log backup every 15 minutes. Required: the database is in FULL recovery.';

EXEC msdb.dbo.sp_add_jobstep
    @job_name = N'MCLS - Backup Log',
    @step_name = N'Log backup',
    @subsystem = N'TSQL',
    @database_name = N'master',
    @command = N'
DECLARE @file nvarchar(500) =
    N''B:\SQLBackup\MCLS_LOG_'' + CONVERT(varchar(8), GETDATE(), 112)
    + ''_'' + REPLACE(CONVERT(varchar(8), GETDATE(), 108), '':'', '''') + ''.trn'';
BACKUP LOG [MCLS] TO DISK = @file WITH INIT, CHECKSUM, COMPRESSION;';

EXEC msdb.dbo.sp_add_jobschedule
    @job_name = N'MCLS - Backup Log', @name = N'Every 15 minutes',
    @freq_type = 4, @freq_interval = 1,
    @freq_subday_type = 4,      -- minutes
    @freq_subday_interval = 15,
    @active_start_time = 000000;

EXEC msdb.dbo.sp_add_jobserver @job_name = N'MCLS - Backup Log';
GO

PRINT N'Maintenance procedures and SQL Agent jobs created.';
PRINT N'Adjust the B:\SQLBackup paths before relying on the backup jobs.';
GO

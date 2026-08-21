/* ---------------------------------------------------------------------------
   What a request came from, in columns a report can group by.

   Both audit trails already carried the IP address and the raw User-Agent, and
   still do — the full string is the evidence, and it stays. But a string is not
   a dimension: nobody can answer "how many registrations came from phones this
   month" by reading four hundred characters of Mozilla/5.0 per row. These three
   columns hold the answer the string implies, worked out once when the row is
   written.

   One thing deliberately absent: a laptop is not distinguished from a desktop.
   No browser reports chassis type and nothing else in a request implies it, so
   both are Desktop. Splitting them would mean inventing the difference.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('auth.LoginAudit', 'DeviceType') IS NULL
    ALTER TABLE auth.LoginAudit ADD DeviceType varchar(12) NULL;
GO
IF COL_LENGTH('auth.LoginAudit', 'OperatingSystem') IS NULL
    ALTER TABLE auth.LoginAudit ADD OperatingSystem varchar(16) NULL;
GO
IF COL_LENGTH('auth.LoginAudit', 'Browser') IS NULL
    ALTER TABLE auth.LoginAudit ADD Browser varchar(24) NULL;
GO

IF COL_LENGTH('audit.AuditLog', 'DeviceType') IS NULL
    ALTER TABLE audit.AuditLog ADD DeviceType varchar(12) NULL;
GO
IF COL_LENGTH('audit.AuditLog', 'OperatingSystem') IS NULL
    ALTER TABLE audit.AuditLog ADD OperatingSystem varchar(16) NULL;
GO
IF COL_LENGTH('audit.AuditLog', 'Browser') IS NULL
    ALTER TABLE audit.AuditLog ADD Browser varchar(24) NULL;
GO

/* Reporting reads these by day and by device, so the index leads with the date
   the row was written. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_LoginAudit_Occurred_Device'
                                           AND object_id = OBJECT_ID('auth.LoginAudit'))
    CREATE INDEX IX_LoginAudit_Occurred_Device
        ON auth.LoginAudit (OccurredOnUtc)
        INCLUDE (DeviceType, OperatingSystem, IsSuccess);
GO

/* Rows already written keep their agent string, so what they came from can be
   worked out now rather than lost. The classification is deliberately the same
   coarse one the code applies, and anything it cannot place stays null — the
   raw string is still there to read. */
UPDATE auth.LoginAudit
SET OperatingSystem =
        CASE WHEN UserAgent LIKE '%Android%' THEN 'Android'
             WHEN UserAgent LIKE '%iPhone%' OR UserAgent LIKE '%iPad%' THEN 'iOS'
             WHEN UserAgent LIKE '%Windows%' THEN 'Windows'
             WHEN UserAgent LIKE '%Mac OS X%' OR UserAgent LIKE '%Macintosh%' THEN 'macOS'
             WHEN UserAgent LIKE '%Linux%' THEN 'Linux' END,
    DeviceType =
        CASE WHEN UserAgent LIKE '%iPad%' OR UserAgent LIKE '%Tablet%' THEN 'Tablet'
             WHEN UserAgent LIKE '%Mobi%' OR UserAgent LIKE '%Android%' THEN 'Mobile'
             WHEN UserAgent LIKE '%Windows%' OR UserAgent LIKE '%Macintosh%'
               OR UserAgent LIKE '%Linux%' THEN 'Desktop' END,
    Browser =
        CASE WHEN UserAgent LIKE '%Edg%' THEN 'Edge'
             WHEN UserAgent LIKE '%Firefox%' THEN 'Firefox'
             WHEN UserAgent LIKE '%Chrome%' THEN 'Chrome'
             WHEN UserAgent LIKE '%Safari%' THEN 'Safari' END
WHERE UserAgent IS NOT NULL AND DeviceType IS NULL;
GO

UPDATE audit.AuditLog
SET OperatingSystem =
        CASE WHEN UserAgent LIKE '%Android%' THEN 'Android'
             WHEN UserAgent LIKE '%iPhone%' OR UserAgent LIKE '%iPad%' THEN 'iOS'
             WHEN UserAgent LIKE '%Windows%' THEN 'Windows'
             WHEN UserAgent LIKE '%Mac OS X%' OR UserAgent LIKE '%Macintosh%' THEN 'macOS'
             WHEN UserAgent LIKE '%Linux%' THEN 'Linux' END,
    DeviceType =
        CASE WHEN UserAgent LIKE '%iPad%' OR UserAgent LIKE '%Tablet%' THEN 'Tablet'
             WHEN UserAgent LIKE '%Mobi%' OR UserAgent LIKE '%Android%' THEN 'Mobile'
             WHEN UserAgent LIKE '%Windows%' OR UserAgent LIKE '%Macintosh%'
               OR UserAgent LIKE '%Linux%' THEN 'Desktop' END,
    Browser =
        CASE WHEN UserAgent LIKE '%Edg%' THEN 'Edge'
             WHEN UserAgent LIKE '%Firefox%' THEN 'Firefox'
             WHEN UserAgent LIKE '%Chrome%' THEN 'Chrome'
             WHEN UserAgent LIKE '%Safari%' THEN 'Safari' END
WHERE UserAgent IS NOT NULL AND DeviceType IS NULL;
GO

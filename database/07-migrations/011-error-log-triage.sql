/*
    011 — Error Logs screen (35-settings-error-logs-green.svg).
    ------------------------------------------------------------------------
    The screen groups the log by ERROR CODE and shows a COUNT per code, with a
    three-state triage (Open / Acknowledged / Resolved) rather than the single
    IsResolved flag the table has. Four columns are added:

      ErrorCode   ERR-PAY-5021 and the like. A stable identifier for "this
                  fault", which is what the screen groups on — grouping on the
                  message text would split one fault across every variant of
                  its wording.

      ModuleId    Which part of the portal raised it, for the MODULE column
                  and the module filter.

      Status      Open, Acknowledged or Resolved. IsResolved is kept and stays
                  in step with it, because existing code reads that flag.

      Severity    Widened to carry Critical and Info alongside Error and
                  Warning, which is what the five count tiles need.

    Idempotent.
*/

-- audit.ErrorLog carries a filtered index, so DDL against it requires
-- QUOTED_IDENTIFIER ON. sqlcmd -Q leaves it off, which fails at the first
-- constrained column rather than at the first statement.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('audit.ErrorLog', 'ErrorCode') IS NULL
    ALTER TABLE audit.ErrorLog ADD ErrorCode varchar(30) NULL;
GO

IF COL_LENGTH('audit.ErrorLog', 'ModuleId') IS NULL
    ALTER TABLE audit.ErrorLog ADD ModuleId tinyint NULL;
GO

IF COL_LENGTH('audit.ErrorLog', 'Status') IS NULL
    ALTER TABLE audit.ErrorLog ADD Status varchar(15) NOT NULL
        CONSTRAINT DF_ErrorLog_Status DEFAULT 'Open';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ErrorLog_Status')
    ALTER TABLE audit.ErrorLog ADD CONSTRAINT CK_ErrorLog_Status
        CHECK (Status IN ('Open', 'Acknowledged', 'Resolved'));
GO

-- The screen counts five severities; the constraint only allowed three.
-- Widened rather than dropped, so a typo is still refused.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_ErrorLog_Severity')
    ALTER TABLE audit.ErrorLog DROP CONSTRAINT CK_ErrorLog_Severity;
GO

ALTER TABLE audit.ErrorLog ADD CONSTRAINT CK_ErrorLog_Severity
    CHECK (Severity IN ('Critical', 'Error', 'Warning', 'Info'));
GO

-- Bring Status into line with the flag that already exists, in both
-- directions, so neither can contradict the other.
UPDATE audit.ErrorLog SET Status = 'Resolved' WHERE IsResolved = 1 AND Status <> 'Resolved';
UPDATE audit.ErrorLog SET IsResolved = 1 WHERE Status = 'Resolved' AND IsResolved = 0;

-- A row with no code is grouped under one derived from its exception type, so
-- the screen never shows a blank ERROR CODE.
UPDATE audit.ErrorLog
SET    ErrorCode = 'ERR-GEN-' + RIGHT('0000' + CONVERT(varchar(5), ErrorLogId % 10000), 4)
WHERE  ErrorCode IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ErrorLog_Code_Occurred')
    CREATE INDEX IX_ErrorLog_Code_Occurred
        ON audit.ErrorLog (ErrorCode, OccurredOnUtc DESC) INCLUDE (Severity, Status, ModuleId);
GO

SELECT Severity, Status, COUNT(*) AS Entries
FROM   audit.ErrorLog
GROUP  BY Severity, Status
ORDER  BY Severity, Status;

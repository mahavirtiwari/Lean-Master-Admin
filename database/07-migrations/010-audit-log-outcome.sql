/*
    010 — Audit Logs screen (34-settings-audit-logs-green.svg).
    ------------------------------------------------------------------------
    The screen shows two things the table cannot currently answer:

      STATUS  Success or Failed. A trail that only records what succeeded is
              the wrong half — a refused delete is exactly what an auditor
              wants to see.

      ROLE    The role the actor held. Stored on the row rather than joined
              from auth.User, because the role a user holds today is not
              necessarily the one they acted under; joining would silently
              rewrite history the next time somebody is promoted.

    ModuleId is also backfilled from EntityName so the MODULE column and the
    "modules tracked" tile have something to count.

    Idempotent.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('audit.AuditLog', 'Outcome') IS NULL
    ALTER TABLE audit.AuditLog ADD Outcome varchar(10) NOT NULL
        CONSTRAINT DF_AuditLog_Outcome DEFAULT 'Success';
GO

IF COL_LENGTH('audit.AuditLog', 'RoleName') IS NULL
    ALTER TABLE audit.AuditLog ADD RoleName nvarchar(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AuditLog_Outcome')
    ALTER TABLE audit.AuditLog ADD CONSTRAINT CK_AuditLog_Outcome
        CHECK (Outcome IN ('Success', 'Failed'));
GO

-- The interceptor writes EF's verbs; the screen names the acts.
UPDATE audit.AuditLog SET Action = 'Create' WHERE Action = 'Insert';
UPDATE audit.AuditLog SET Action = 'Delete' WHERE Action = 'Remove';

-- Role as at the time of the action is unknowable for rows written before this
-- column existed, so they take the actor's current role and nothing is
-- invented for rows with no actor at all.
UPDATE a
SET    a.RoleName = r.Name
FROM   audit.AuditLog AS a
INNER JOIN auth.[User] AS u ON u.Id = a.UserId
INNER JOIN auth.Role   AS r ON r.RoleId = u.RoleId
WHERE  a.RoleName IS NULL;

-- Map the entity that was touched onto the module that owns it, so MODULE is
-- populated for history written before ModuleId was being set.
UPDATE a
SET    a.ModuleId = m.ModuleId
FROM   audit.AuditLog AS a
INNER JOIN auth.Module AS m
        ON m.Code = CASE
             WHEN a.EntityName LIKE '%User%'          THEN 'USER_MGMT'
             WHEN a.EntityName LIKE '%Sector%'        THEN 'SECTORS'
             WHEN a.EntityName LIKE '%Parameter%'     THEN 'PARAMETERS'
             WHEN a.EntityName LIKE '%Question%'      THEN 'QUEST_SILVER'
             WHEN a.EntityName LIKE '%Document%'      THEN 'DOCUMENTS'
             WHEN a.EntityName LIKE '%Fee%'           THEN 'FEE'
             WHEN a.EntityName LIKE '%Incentive%'     THEN 'INCENTIVES'
             WHEN a.EntityName LIKE '%Technolog%'     THEN 'TECHNOLOGY'
             WHEN a.EntityName LIKE '%Email%'         THEN 'EMAILER'
             WHEN a.EntityName LIKE '%Setting%'       THEN 'SETTINGS'
             WHEN a.EntityName LIKE '%Application%'   THEN 'HANDHOLDING'
             WHEN a.EntityName LIKE '%Assessment%'    THEN 'ASSESSMENTS'
             ELSE NULL
           END
WHERE  a.ModuleId IS NULL;
GO

-- An audit screen filters on time and actor before anything else.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_AuditLog_Occurred_Outcome')
    CREATE INDEX IX_AuditLog_Occurred_Outcome
        ON audit.AuditLog (OccurredOnUtc DESC) INCLUDE (Outcome, UserId, ModuleId, Action);
GO

SELECT Outcome, COUNT(*) AS Entries FROM audit.AuditLog GROUP BY Outcome;
SELECT Action, COUNT(*) AS Entries FROM audit.AuditLog GROUP BY Action ORDER BY 2 DESC;
SELECT ModulesTracked = COUNT(DISTINCT ModuleId), WithRole = SUM(CASE WHEN RoleName IS NULL THEN 0 ELSE 1 END)
FROM   audit.AuditLog;

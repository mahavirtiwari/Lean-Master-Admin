/*
    Demo audit trail for the Audit Logs screen.
    ------------------------------------------------------------------------
    The screen is drawn against a populated trail — four count tiles, a
    Success/Failed filter and ten rows a page. A freshly installed portal has
    a few dozen entries from its own start-up, which shows none of that.

    These rows are SYNTHETIC. They are marked as such: every seeded row carries
    CorrelationId = '00000000-0000-0000-0000-0000000000DE' so it can be told
    apart from a real entry and deleted in one statement. An audit trail is a
    security record, so invented entries must never be indistinguishable from
    genuine ones.

    Actors and modules are drawn from the rows that actually exist, so the
    trail references real users and real modules rather than invented names.

    Safe to re-run. NEVER run against production.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @marker uniqueidentifier = '00000000-0000-0000-0000-0000000000DE';

BEGIN TRANSACTION;

DELETE FROM audit.AuditLog WHERE CorrelationId = @marker;

-- Actors: whoever is actually on the portal, with the role they hold.
DECLARE @actors TABLE (RowNo int IDENTITY(1,1), UserId int, UserName nvarchar(200), RoleName nvarchar(100));

INSERT INTO @actors (UserId, UserName, RoleName)
SELECT u.Id, u.FullName, r.Name
FROM   auth.[User] AS u
INNER  JOIN auth.Role AS r ON r.RoleId = u.RoleId;

DECLARE @actorCount int = (SELECT COUNT(*) FROM @actors);

-- Modules: the real menu, so MODULE never shows a module the portal lacks.
DECLARE @modules TABLE (RowNo int IDENTITY(1,1), ModuleId tinyint, Name nvarchar(100));
INSERT INTO @modules (ModuleId, Name) SELECT ModuleId, Name FROM auth.Module ORDER BY SortOrder;
DECLARE @moduleCount int = (SELECT COUNT(*) FROM @modules);

-- Verbs in the proportion the screen shows: mostly reads and updates, fewer
-- creations, deletions rare.
DECLARE @acts TABLE (RowNo int IDENTITY(1,1), Action varchar(20), EntityName nvarchar(200));
INSERT INTO @acts (Action, EntityName) VALUES
 ('Login',  N'UserSession'), ('Login',  N'UserSession'), ('Login', N'UserSession'),
 ('Update', N'Sector'),      ('Update', N'Parameter'),   ('Update', N'FeeRate'),
 ('Update', N'SystemSetting'), ('Update', N'Questionnaire'),
 ('Create', N'User'),        ('Create', N'Document'),    ('Create', N'Incentive'),
 ('Delete', N'Document');
DECLARE @actCount int = (SELECT COUNT(*) FROM @acts);

-- 2,340 entries over the drawn period, newest last-week-ish.
WITH N AS
(
    SELECT TOP (2340) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
INSERT INTO audit.AuditLog
(
    OccurredOnUtc, UserId, UserName, RoleName, ModuleId, Action,
    EntityName, EntityKey, IpAddress, Outcome, CorrelationId
)
SELECT
    DATEADD(SECOND, -( n * 431 % 2073600 ), SYSUTCDATETIME()),
    act.UserId,
    act.UserName,
    act.RoleName,
    m.ModuleId,
    v.Action,
    v.EntityName,
    CONVERT(varchar(12), 1000 + (n % 4000)),
    CONCAT(10 + (n % 190), '.', n % 250, '.', (n * 7) % 250, '.', (n * 13) % 250),
    -- 42 failures, as the FAILED ACTIONS tile is drawn.
    CASE WHEN n % 56 = 0 THEN 'Failed' ELSE 'Success' END,
    @marker
FROM   N
CROSS  APPLY (SELECT UserId, UserName, RoleName FROM @actors WHERE RowNo = 1 + (N.n % @actorCount)) AS act
CROSS  APPLY (SELECT ModuleId FROM @modules WHERE RowNo = 1 + (N.n % @moduleCount)) AS m
CROSS  APPLY (SELECT Action, EntityName FROM @acts WHERE RowNo = 1 + (N.n % @actCount)) AS v;

COMMIT TRANSACTION;

SELECT TotalEntries   = COUNT(*),
       ModulesTracked = COUNT(DISTINCT ModuleId),
       DistinctUsers  = COUNT(DISTINCT UserId),
       FailedActions  = SUM(CASE WHEN Outcome = 'Failed' THEN 1 ELSE 0 END)
FROM   audit.AuditLog;

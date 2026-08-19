/*===========================================================================
  Migration 001 — the sidebar menu hierarchy.

  WHY THIS EXISTS
  ---------------
  auth.Module holds the 15 top-level modules and nothing else, so the
  portal rendered a flat sidebar. The design's sidebar (NAV in
  _generator/shell.py) has 15 parents of which six carry children — 30
  sub-items in all:

      Handholding      4    Registered .. Handholding Completed
      Assessments      6    Scheduled .. Rejected
      User Management  9    the nine account types
      Fee Structure    3    Lean Bronze / Silver / Gold
      Incentives       4    Ministry / State / Financial / Others
      Settings         4    System / Audit logs / Error Logs / APIs

  The children are NOT modules. Making them modules would turn 15 x 5 = 75
  permissions into 45 x 5 = 225 and break the ACCESS/MANAGE matrices, which
  are defined against the 15. A child is a *view* of its parent module and is
  gated by that module's permission.

  Two children additionally need row-level gating:
    * User Management children map to an account type, so an IA Admin sees
      only the six types auth.UserManagementScope allows.
    * Everything else is filtered by the parent module's permission alone.

  Idempotent — safe to re-run.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*--------------------------------------------------------------- MenuItem */
IF OBJECT_ID(N'auth.MenuItem', N'U') IS NULL
BEGIN
    CREATE TABLE auth.MenuItem
    (
        MenuItemId      smallint        NOT NULL IDENTITY(1,1),

        /* The module whose 'view' permission gates this entry. Both parents
           and children carry it; a child simply repeats its parent's. */
        ModuleId        tinyint         NOT NULL,

        /* NULL for a top-level entry. */
        ParentMenuItemId smallint       NULL,

        Code            varchar(60)     NOT NULL,
        Label           nvarchar(80)    NOT NULL,
        RoutePath       varchar(160)    NULL,
        IconKey         varchar(30)     NULL,
        SortOrder       smallint        NOT NULL,

        /* Set on User Management children so auth.UserManagementScope can
           filter them. NULL everywhere else. */
        AccountTypeId   tinyint         NULL,

        IsActive        bit             NOT NULL CONSTRAINT DF_MenuItem_Active DEFAULT (1),

        CONSTRAINT PK_MenuItem PRIMARY KEY CLUSTERED (MenuItemId),
        CONSTRAINT UQ_MenuItem_Code UNIQUE (Code),
        CONSTRAINT FK_MenuItem_Module FOREIGN KEY (ModuleId) REFERENCES auth.Module(ModuleId),
        CONSTRAINT FK_MenuItem_Parent FOREIGN KEY (ParentMenuItemId) REFERENCES auth.MenuItem(MenuItemId),
        CONSTRAINT FK_MenuItem_AccountType FOREIGN KEY (AccountTypeId) REFERENCES auth.AccountType(AccountTypeId),
        /* One level of nesting only — the design has no deeper tree, and
           allowing more would mean the UI needs recursion it does not have. */
        CONSTRAINT CK_MenuItem_NotSelfParent CHECK (ParentMenuItemId IS NULL OR ParentMenuItemId <> MenuItemId)
    );

    CREATE INDEX IX_MenuItem_Parent ON auth.MenuItem (ParentMenuItemId, SortOrder) WHERE IsActive = 1;
    CREATE INDEX IX_MenuItem_Module ON auth.MenuItem (ModuleId) WHERE IsActive = 1;
END
GO

/*---------------------------------------------------------------------------
  Parents — one per module, in sidebar order, reusing the module's own route.
---------------------------------------------------------------------------*/
MERGE auth.MenuItem AS tgt
USING (
    SELECT m.ModuleId,
           CAST(NULL AS smallint)   AS ParentMenuItemId,
           CAST(m.Code AS varchar(60)) AS Code,
           v.Label,
           m.RoutePath,
           m.IconKey,
           CAST(m.SortOrder * 100 AS smallint) AS SortOrder,
           CAST(NULL AS tinyint)    AS AccountTypeId
    FROM auth.Module m
    JOIN (VALUES
        ('DASHBOARD',     N'Dashboard'),
        ('HANDHOLDING',   N'Handholding'),
        ('ASSESSMENTS',   N'Assessments'),
        ('USER_MGMT',     N'User Management'),
        ('SECTORS',       N'Sectors'),
        ('PARAMETER',     N'Parameter'),
        ('QUES_SILVER',   N'Questionnaire Silver'),
        ('QUES_GOLD',     N'Questionnaire Gold'),
        ('FEE_STRUCTURE', N'Fee Structure'),
        ('INCENTIVES',    N'Incentives'),
        ('TECH_UPGRAD',   N'Technology Upgradation'),
        ('DOCUMENTS',     N'Upload Documents'),
        ('REPORTS',       N'Reports'),
        ('EMAILER',       N'Emailer'),
        ('SETTINGS',      N'Settings')
    ) AS v (ModuleCode, Label) ON v.ModuleCode = m.Code
) AS src
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    ModuleId = src.ModuleId, Label = src.Label, RoutePath = src.RoutePath,
    IconKey = src.IconKey, SortOrder = src.SortOrder, ParentMenuItemId = NULL
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId)
    VALUES (src.ModuleId, src.ParentMenuItemId, src.Code, src.Label, src.RoutePath,
            src.IconKey, src.SortOrder, src.AccountTypeId);
GO

/*---------------------------------------------------------------------------
  Children. Transcribed from NAV in _generator/shell.py, in its order.

  Routes carry the filter the child represents, so one list component serves
  every child of a parent rather than 30 near-identical screens.
---------------------------------------------------------------------------*/
DECLARE @Children TABLE
(
    ParentCode      varchar(60)  NOT NULL,
    Code            varchar(60)  NOT NULL,
    Label           nvarchar(80) NOT NULL,
    RoutePath       varchar(160) NULL,
    Ordinal         smallint     NOT NULL,
    AccountTypeCode varchar(30)  NULL
);

INSERT INTO @Children (ParentCode, Code, Label, RoutePath, Ordinal, AccountTypeCode) VALUES
    -- Handholding: the four Handholding-stage statuses
    ('HANDHOLDING', 'HH_REGISTERED',   N'Registered',               '/handholding?status=REGISTERED',            1, NULL),
    ('HANDHOLDING', 'HH_PAYMENT',      N'Payment Received',         '/handholding?status=PAYMENT_RECEIVED',      2, NULL),
    ('HANDHOLDING', 'HH_PROGRESS',     N'Handholding in progress',  '/handholding?status=HANDHOLDING_PROGRESS',  3, NULL),
    ('HANDHOLDING', 'HH_COMPLETED',    N'Handholding Completed',    '/handholding?status=HANDHOLDING_DONE',      4, NULL),

    -- Assessments: the six Assessment-stage statuses
    ('ASSESSMENTS', 'ASM_SCHEDULED',   N'Scheduled',                '/assessments?status=ASSESSMENT_SCHEDULED',  1, NULL),
    ('ASSESSMENTS', 'ASM_PROGRESS',    N'Assessment In progress',   '/assessments?status=ASSESSMENT_PROGRESS',   2, NULL),
    ('ASSESSMENTS', 'ASM_NC',          N'NC Raised',                '/assessments?status=NC_RAISED',             3, NULL),
    ('ASSESSMENTS', 'ASM_QC',          N'Quality Check',            '/assessments?status=QUALITY_CHECK',         4, NULL),
    ('ASSESSMENTS', 'ASM_CERTIFIED',   N'Certified',                '/assessments?status=CERTIFIED',             5, NULL),
    ('ASSESSMENTS', 'ASM_REJECTED',    N'Rejected',                 '/assessments?status=REJECTED',              6, NULL),

    -- User Management: the nine account types, filtered per role by scope
    ('USER_MGMT', 'UM_IA',       N'Implementing Agency',     '/user-management/type/1', 1, 'IMPLEMENTING_AGENCY'),
    ('USER_MGMT', 'UM_MIN',      N'Ministry of MSME',        '/user-management/type/2', 2, 'MINISTRY_OF_MSME'),
    ('USER_MGMT', 'UM_STATE',    N'State Specific',          '/user-management/type/3', 3, 'STATE_SPECIFIC'),
    ('USER_MGMT', 'UM_OEM',      N'OEMs/PSUs/IAs',           '/user-management/type/4', 4, 'OEM_PSU_IA'),
    ('USER_MGMT', 'UM_OPS',      N'Operation Admin',         '/user-management/type/5', 5, 'OPERATION_ADMIN'),
    ('USER_MGMT', 'UM_COR',      N'Consultant Organisation', '/user-management/type/6', 6, 'CONSULTANT_ORG'),
    ('USER_MGMT', 'UM_AGY',      N'Assessment Agency',       '/user-management/type/7', 7, 'ASSESSMENT_AGENCY'),
    ('USER_MGMT', 'UM_CON',      N'Consultants',             '/user-management/type/8', 8, 'CONSULTANTS'),
    ('USER_MGMT', 'UM_ASR',      N'Assessors',               '/user-management/type/9', 9, 'ASSESSORS'),

    -- Fee Structure: the three certification levels
    ('FEE_STRUCTURE', 'FEE_BRONZE', N'Lean Bronze', '/fee-structure/bronze', 1, NULL),
    ('FEE_STRUCTURE', 'FEE_SILVER', N'Lean Silver', '/fee-structure/silver', 2, NULL),
    ('FEE_STRUCTURE', 'FEE_GOLD',   N'Lean Gold',   '/fee-structure/gold',   3, NULL),

    -- Incentives: the four providers
    ('INCENTIVES', 'INC_MINISTRY',  N'Ministry of MSME',       '/incentives/ministry',  1, NULL),
    ('INCENTIVES', 'INC_STATE',     N'State Govt.',            '/incentives/state',     2, NULL),
    ('INCENTIVES', 'INC_FINANCIAL', N'Financial Institutions', '/incentives/financial', 3, NULL),
    ('INCENTIVES', 'INC_OTHERS',    N'Others',                 '/incentives/others',    4, NULL),

    -- Settings: the four tabs
    ('SETTINGS', 'SET_SYSTEM', N'System Settings', '/settings/system',     1, NULL),
    ('SETTINGS', 'SET_AUDIT',  N'Audit logs',      '/settings/audit-logs', 2, NULL),
    ('SETTINGS', 'SET_ERROR',  N'Error Logs',      '/settings/error-logs', 3, NULL),
    ('SETTINGS', 'SET_APIS',   N'APIs',            '/settings/apis',       4, NULL);

MERGE auth.MenuItem AS tgt
USING (
    SELECT p.ModuleId,
           p.MenuItemId AS ParentMenuItemId,
           c.Code,
           c.Label,
           c.RoutePath,
           CAST(p.SortOrder + c.Ordinal AS smallint) AS SortOrder,
           at.AccountTypeId
    FROM @Children c
    JOIN auth.MenuItem p ON p.Code = c.ParentCode AND p.ParentMenuItemId IS NULL
    LEFT JOIN auth.AccountType at ON at.Code = c.AccountTypeCode
) AS src
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    ModuleId = src.ModuleId, ParentMenuItemId = src.ParentMenuItemId,
    Label = src.Label, RoutePath = src.RoutePath, SortOrder = src.SortOrder,
    AccountTypeId = src.AccountTypeId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, ParentMenuItemId, Code, Label, RoutePath, SortOrder, AccountTypeId)
    VALUES (src.ModuleId, src.ParentMenuItemId, src.Code, src.Label, src.RoutePath,
            src.SortOrder, src.AccountTypeId);
GO

/*---------------------------------------------------------------------------
  auth.vw_MenuForUser — the sidebar for one user, parents and children.

  A parent appears when the user holds its module's 'view' right. A child
  appears on the same basis, plus — for User Management children — only when
  the user's role administers that account type.
---------------------------------------------------------------------------*/
CREATE OR ALTER VIEW auth.vw_MenuForUser
AS
SELECT
    ep.UserId,
    mi.MenuItemId,
    mi.ParentMenuItemId,
    mi.Code,
    mi.Label,
    mi.RoutePath,
    mi.IconKey,
    mi.SortOrder,
    mi.ModuleId,
    m.Code          AS ModuleCode,
    mi.AccountTypeId
FROM auth.MenuItem mi
JOIN auth.Module m ON m.ModuleId = mi.ModuleId
JOIN auth.vw_EffectivePermission ep
     ON ep.ModuleId = mi.ModuleId AND ep.RightCode = 'view'
WHERE mi.IsActive = 1
  AND m.IsActive = 1
  /* User Management children are additionally scoped to the account types the
     user's role may administer. A role with no scope rows (Super Admin) is
     unrestricted, which is why the NOT EXISTS guard is there. */
  AND (
        mi.AccountTypeId IS NULL
        OR EXISTS (
            SELECT 1
            FROM auth.[User] u
            JOIN auth.UserManagementScope s ON s.RoleId = u.RoleId
            WHERE u.Id = ep.UserId AND s.ManagedAccountTypeId = mi.AccountTypeId)
        OR NOT EXISTS (
            SELECT 1
            FROM auth.[User] u
            JOIN auth.UserManagementScope s ON s.RoleId = u.RoleId
            WHERE u.Id = ep.UserId)
      );
GO

/*---------------------------------------------------------------------------
  Verification. 15 parents and 30 children, or the transcription is wrong.
---------------------------------------------------------------------------*/
DECLARE @parents int, @children int;

SELECT @parents  = COUNT(*) FROM auth.MenuItem WHERE ParentMenuItemId IS NULL;
SELECT @children = COUNT(*) FROM auth.MenuItem WHERE ParentMenuItemId IS NOT NULL;

IF @parents <> 15 OR @children <> 30
BEGIN
    DECLARE @msg nvarchar(300) = FORMATMESSAGE(
        N'Menu seed is wrong: expected 15 parents and 30 children, found %d and %d.',
        @parents, @children);
    THROW 51010, @msg, 1;
END

PRINT N'Migration 001 — menu hierarchy applied (15 parents, 30 children).';
GO

/*===========================================================================
  Seed 1 — reference data that the application's behaviour depends on.
  Idempotent: every statement is a MERGE or an EXISTS-guarded insert, so this
  script is safe to re-run on an existing database during an upgrade.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*--------------------------------------------------------------- AccountType
  The nine managed account types. Super Admin is deliberately NOT one of these:
  it is a role inside Ministry of MSME, which is how the portal actually
  issues it (MCLS-MIN-000101, "Joint Secretary / Super Admin").
---------------------------------------------------------------------------*/
MERGE auth.AccountType AS tgt
USING (VALUES
    (1, 'IMPLEMENTING_AGENCY', N'Implementing Agency',     N'Implementing Agency',     'building', 'IA',  N'QCI, NPC and partner agency admins coordinating scheme delivery',   1, 1, 1),
    (2, 'MINISTRY_OF_MSME',    N'Ministry of MSME',        N'Ministry of MSME',        'bank',     'MIN', N'Ministry officials, policy planners and super administrators',       1, 1, 2),
    (3, 'STATE_SPECIFIC',      N'State Specific',          N'State Specific',          'pin',      'STA', N'State nodal officers and coordinators for each State or UT',         1, 1, 3),
    (4, 'OEM_PSU_IA',          N'OEMs / PSUs / IAs',       N'OEMs/PSUs/IAs',           'factory',  'OEM', N'Sector-mapped industry partners and anchor enterprises',             0, 1, 4),
    (5, 'OPERATION_ADMIN',     N'Operation Admin',         N'Operation Admin',         'sliders',  'OPS', N'Portal operations, helpdesk and support staff',                      0, 0, 5),
    (6, 'CONSULTANT_ORG',      N'Consultant Organisation', N'Consultant Organisation', 'layers',   'COR', N'Empanelled consulting firms deploying LEAN consultants',             0, 1, 6),
    (7, 'ASSESSMENT_AGENCY',   N'Assessment Agency',       N'Assessment Agency',       'shield',   'AGY', N'Accredited agencies conducting Silver and Gold assessments',         0, 1, 7),
    (8, 'CONSULTANTS',         N'Consultants',             N'Consultants',             'user2',    'CON', N'Certified individuals delivering LEAN interventions',                0, 0, 8),
    (9, 'ASSESSORS',           N'Assessors',               N'Assessors',               'medal',    'ASR', N'Qualified assessors performing on-site and desk assessments',        0, 0, 9)
) AS src (AccountTypeId, Code, Name, ShortName, IconKey, UserCodePrefix, Description, CanCreateDirectly, RequiresOrganisation, SortOrder)
   ON tgt.AccountTypeId = src.AccountTypeId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, ShortName = src.ShortName, IconKey = src.IconKey,
    UserCodePrefix = src.UserCodePrefix, Description = src.Description,
    CanCreateDirectly = src.CanCreateDirectly, RequiresOrganisation = src.RequiresOrganisation,
    SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (AccountTypeId, Code, Name, ShortName, IconKey, UserCodePrefix, Description,
            CanCreateDirectly, RequiresOrganisation, SortOrder)
    VALUES (src.AccountTypeId, src.Code, src.Name, src.ShortName, src.IconKey, src.UserCodePrefix,
            src.Description, src.CanCreateDirectly, src.RequiresOrganisation, src.SortOrder);
GO

/*-------------------------------------------------------------------- Module
  The fifteen sidebar modules, in sidebar order. Codes are what appear inside
  JWT permission claims, so they must not be renamed casually.
---------------------------------------------------------------------------*/
MERGE auth.Module AS tgt
USING (VALUES
    ( 1, 'DASHBOARD',    N'Dashboard',        '/dashboard',              'grid',      1),
    ( 2, 'HANDHOLDING',  N'Handholding',      '/handholding',            'hands',     2),
    ( 3, 'ASSESSMENTS',  N'Assessments',      '/assessments',            'clipboard', 3),
    ( 4, 'USER_MGMT',    N'User Mgmt',        '/user-management',        'users',     4),
    ( 5, 'SECTORS',      N'Sectors',          '/sectors',                'factory',   5),
    ( 6, 'PARAMETER',    N'Parameter',        '/parameters',             'sliders',   6),
    ( 7, 'QUES_SILVER',  N'Ques. Silver',     '/questionnaire/silver',   'list',      7),
    ( 8, 'QUES_GOLD',    N'Ques. Gold',       '/questionnaire/gold',     'list',      8),
    ( 9, 'FEE_STRUCTURE',N'Fee Structure',    '/fee-structure',          'rupee',     9),
    (10, 'INCENTIVES',   N'Incentives',       '/incentives',             'gift',     10),
    (11, 'TECH_UPGRAD',  N'Tech. Upgrad.',    '/technology-upgradation', 'cpu',      11),
    (12, 'DOCUMENTS',    N'Documents',        '/documents',              'doc',      12),
    (13, 'REPORTS',      N'Reports',          '/reports',                'chart',    13),
    (14, 'EMAILER',      N'Emailer',          '/emailer',                'mail',     14),
    (15, 'SETTINGS',     N'Settings',         '/settings',               'cog',      15)
) AS src (ModuleId, Code, Name, RoutePath, IconKey, SortOrder)
   ON tgt.ModuleId = src.ModuleId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, RoutePath = src.RoutePath,
    IconKey = src.IconKey, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, Code, Name, RoutePath, IconKey, SortOrder)
    VALUES (src.ModuleId, src.Code, src.Name, src.RoutePath, src.IconKey, src.SortOrder);
GO

/*----------------------------------------------------------------- RightType */
MERGE auth.RightType AS tgt
USING (VALUES
    (1, 'view',   N'View',   1),
    (2, 'create', N'Create', 2),
    (3, 'edit',   N'Edit',   3),
    (4, 'delete', N'Delete', 4),
    (5, 'export', N'Export', 5)
) AS src (RightTypeId, Code, Name, SortOrder)
   ON tgt.RightTypeId = src.RightTypeId
WHEN MATCHED THEN UPDATE SET Code = src.Code, Name = src.Name, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (RightTypeId, Code, Name, SortOrder) VALUES (src.RightTypeId, src.Code, src.Name, src.SortOrder);
GO

/*----------------------------------------------------------------- Permission
  The full module x right cross product, 15 x 5 = 75 rows. Generated rather
  than typed so a new module automatically gains its five rights.
---------------------------------------------------------------------------*/
MERGE auth.Permission AS tgt
USING (
    SELECT m.ModuleId, rt.RightTypeId,
           CAST(m.Code + '.' + rt.Code AS varchar(45)) AS PermissionKey
    FROM auth.Module m
    CROSS JOIN auth.RightType rt
) AS src
   ON tgt.ModuleId = src.ModuleId AND tgt.RightTypeId = src.RightTypeId
WHEN MATCHED AND tgt.PermissionKey <> src.PermissionKey THEN
    UPDATE SET PermissionKey = src.PermissionKey
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, RightTypeId, PermissionKey)
    VALUES (src.ModuleId, src.RightTypeId, src.PermissionKey);
GO

/*----------------------------------------------------------------- UserStatus */
MERGE auth.UserStatus AS tgt
USING (VALUES
    (1, 'ACTIVE',   N'Active',            '#16A34A'),
    (2, 'INACTIVE', N'Inactive',          '#DC2626'),
    (3, 'PENDING',  N'Pending Activation','#CA8A04'),
    (4, 'LOCKED',   N'Locked',            '#EA580C')
) AS src (StatusId, Code, Name, BadgeColour)
   ON tgt.StatusId = src.StatusId
WHEN MATCHED THEN UPDATE SET Code = src.Code, Name = src.Name, BadgeColour = src.BadgeColour
WHEN NOT MATCHED BY TARGET THEN
    INSERT (StatusId, Code, Name, BadgeColour) VALUES (src.StatusId, src.Code, src.Name, src.BadgeColour);
GO

/*--------------------------------------------------------- CertificationLevel
  Bronze is self-declared, so it needs no accredited assessment.
---------------------------------------------------------------------------*/
MERGE msme.CertificationLevel AS tgt
USING (VALUES
    (1, 'BRONZE', N'Lean Bronze', 1, 0),
    (2, 'SILVER', N'Lean Silver', 2, 1),
    (3, 'GOLD',   N'Lean Gold',   3, 1)
) AS src (CertificationLevelId, Code, Name, SortOrder, RequiresAssessment)
   ON tgt.CertificationLevelId = src.CertificationLevelId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, SortOrder = src.SortOrder, RequiresAssessment = src.RequiresAssessment
WHEN NOT MATCHED BY TARGET THEN
    INSERT (CertificationLevelId, Code, Name, SortOrder, RequiresAssessment)
    VALUES (src.CertificationLevelId, src.Code, src.Name, src.SortOrder, src.RequiresAssessment);
GO

/*------------------------------------------------------- ApplicationStatus
  Codes here are consumed verbatim by msme.vw_DashboardTiles and by
  msme.usp_Application_ChangeStatus — changing one means changing all three.
---------------------------------------------------------------------------*/
MERGE msme.ApplicationStatus AS tgt
USING (VALUES
    ( 1, 'REGISTERED',           N'Registered',              'Handholding',  1, '#0EA5E9', 0),
    ( 2, 'PAYMENT_RECEIVED',     N'Payment Received',        'Handholding',  2, '#6366F1', 0),
    ( 3, 'HANDHOLDING_PROGRESS', N'Handholding In Progress', 'Handholding',  3, '#CA8A04', 0),
    ( 4, 'HANDHOLDING_DONE',     N'Handholding Completed',   'Handholding',  4, '#16A34A', 0),
    ( 5, 'ASSESSMENT_SCHEDULED', N'Assessment Scheduled',    'Assessment',   5, '#0EA5E9', 0),
    ( 6, 'ASSESSMENT_PROGRESS',  N'Assessment In Progress',  'Assessment',   6, '#CA8A04', 0),
    ( 7, 'NC_RAISED',            N'NC Raised',               'Assessment',   7, '#EA580C', 0),
    ( 8, 'QUALITY_CHECK',        N'Quality Check',           'Assessment',   8, '#8B5CF6', 0),
    ( 9, 'CERTIFIED',            N'Certified',               'Closed',       9, '#16A34A', 1),
    (10, 'REJECTED',             N'Rejected',                'Closed',      10, '#DC2626', 1)
) AS src (ApplicationStatusId, Code, Name, Stage, SortOrder, BadgeColour, IsTerminal)
   ON tgt.ApplicationStatusId = src.ApplicationStatusId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, Stage = src.Stage, SortOrder = src.SortOrder,
    BadgeColour = src.BadgeColour, IsTerminal = src.IsTerminal
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ApplicationStatusId, Code, Name, Stage, SortOrder, BadgeColour, IsTerminal)
    VALUES (src.ApplicationStatusId, src.Code, src.Name, src.Stage, src.SortOrder,
            src.BadgeColour, src.IsTerminal);
GO

/*----------------------------------------------- ApplicationStatusTransition
  The legal moves. Anything not listed is refused by the change-status
  procedure, so this table is the whole workflow definition.

  Bronze skips assessment entirely: Handholding Completed goes straight to
  Certified. Silver and Gold must pass through the assessment statuses.
---------------------------------------------------------------------------*/
MERGE msme.ApplicationStatusTransition AS tgt
USING (VALUES
    /* Handholding leg */
    ( 1,  2, 0),    -- Registered            -> Payment Received
    ( 1, 10, 1),    -- Registered            -> Rejected            (needs a reason)
    ( 2,  3, 0),    -- Payment Received      -> Handholding Progress
    ( 3,  4, 0),    -- Handholding Progress  -> Handholding Done
    ( 3, 10, 1),    -- Handholding Progress  -> Rejected

    /* Bronze shortcut — self-declared, no accredited assessment */
    ( 4,  9, 0),    -- Handholding Done      -> Certified

    /* Assessment leg */
    ( 4,  5, 0),    -- Handholding Done      -> Assessment Scheduled
    ( 5,  6, 0),    -- Assessment Scheduled  -> Assessment Progress
    ( 5, 10, 1),    -- Assessment Scheduled  -> Rejected
    ( 6,  7, 1),    -- Assessment Progress   -> NC Raised           (state the NC)
    ( 6,  8, 0),    -- Assessment Progress   -> Quality Check
    ( 7,  6, 1),    -- NC Raised             -> Assessment Progress (rework)
    ( 7,  8, 0),    -- NC Raised             -> Quality Check
    ( 7, 10, 1),    -- NC Raised             -> Rejected
    ( 8,  6, 1),    -- Quality Check         -> Assessment Progress (sent back)
    ( 8,  9, 0),    -- Quality Check         -> Certified
    ( 8, 10, 1)     -- Quality Check         -> Rejected
) AS src (FromStatusId, ToStatusId, RequiresRemark)
   ON tgt.FromStatusId = src.FromStatusId AND tgt.ToStatusId = src.ToStatusId
WHEN MATCHED THEN UPDATE SET RequiresRemark = src.RequiresRemark
WHEN NOT MATCHED BY TARGET THEN
    INSERT (FromStatusId, ToStatusId, RequiresRemark)
    VALUES (src.FromStatusId, src.ToStatusId, src.RequiresRemark);
GO

/*------------------------------------------------------------ SubsidyCategory
  90% base for everyone; a further 5% for the five priority categories.
---------------------------------------------------------------------------*/
MERGE fee.SubsidyCategory AS tgt
USING (VALUES
    (1, 'GEN', N'General',                       90.00, 0.00, 1),
    (2, 'WOM', N'Woman-owned MSME',              90.00, 5.00, 2),
    (3, 'SC',  N'SC-owned MSME',                 90.00, 5.00, 3),
    (4, 'ST',  N'ST-owned MSME',                 90.00, 5.00, 4),
    (5, 'NER', N'North Eastern Region MSME',     90.00, 5.00, 5),
    (6, 'OPA', N'OEM / PSU / IA Associate MSME', 90.00, 5.00, 6)
) AS src (SubsidyCategoryId, Code, Name, BaseSubsidyPercent, AdditionalPercent, SortOrder)
   ON tgt.SubsidyCategoryId = src.SubsidyCategoryId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, BaseSubsidyPercent = src.BaseSubsidyPercent,
    AdditionalPercent = src.AdditionalPercent, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (SubsidyCategoryId, Code, Name, BaseSubsidyPercent, AdditionalPercent, SortOrder)
    VALUES (src.SubsidyCategoryId, src.Code, src.Name, src.BaseSubsidyPercent,
            src.AdditionalPercent, src.SortOrder);
GO

/*-------------------------------------------------------------------- FeeRate
  Current rates, inclusive of GST. Only inserted if no current rate exists,
  so re-running the seed never supersedes a rate an administrator has set.
---------------------------------------------------------------------------*/
INSERT INTO fee.FeeRate (CertificationLevelId, AmountInclusiveGst, GstPercent, EffectiveFrom, Notes)
SELECT v.LevelId, v.Amount, 18.00, '2024-01-01', v.Notes
FROM (VALUES
    (1,      0.00, N'Lean Bronze is self-declared and carries no certification fee.'),
    (2, 120000.00, N'Lean Silver certification fee, inclusive of GST.'),
    (3, 240000.00, N'Lean Gold certification fee, inclusive of GST.')
) AS v (LevelId, Amount, Notes)
WHERE NOT EXISTS (
    SELECT 1 FROM fee.FeeRate f
    WHERE f.CertificationLevelId = v.LevelId AND f.EffectiveTo IS NULL);
GO

/*----------------------------------------------------------------- TdsSection */
INSERT INTO fee.TdsSection (SectionCode, Description, RatePercent, ApplicableTo, EffectiveFrom)
SELECT v.SectionCode, v.Description, v.RatePercent, v.ApplicableTo, '2024-01-01'
FROM (VALUES
    ('194C', N'Payments to contractors and sub-contractors',   2.00, N'Implementing Agencies'),
    ('194J', N'Fees for professional or technical services',  10.00, N'Consultants, Assessors, Assessment Agencies')
) AS v (SectionCode, Description, RatePercent, ApplicableTo)
WHERE NOT EXISTS (
    SELECT 1 FROM fee.TdsSection t
    WHERE t.SectionCode = v.SectionCode AND t.EffectiveTo IS NULL);
GO

/* Which account types each section applies to, so a payout picks its rate
   from data rather than matching on the payee type's display name. */
MERGE fee.TdsSectionAccountType AS tgt
USING (
    SELECT t.TdsSectionId, at.AccountTypeId
    FROM fee.TdsSection t
    JOIN auth.AccountType at
      ON (t.SectionCode = '194C' AND at.Code IN ('IMPLEMENTING_AGENCY'))
      OR (t.SectionCode = '194J' AND at.Code IN ('CONSULTANTS','ASSESSORS','ASSESSMENT_AGENCY','CONSULTANT_ORG'))
    WHERE t.EffectiveTo IS NULL
) AS src
   ON tgt.TdsSectionId = src.TdsSectionId AND tgt.AccountTypeId = src.AccountTypeId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (TdsSectionId, AccountTypeId) VALUES (src.TdsSectionId, src.AccountTypeId);
GO

/*------------------------------------------------------------ Incentive Provider */
MERGE incentive.Provider AS tgt
USING (VALUES
    (1, 'MINISTRY',  N'Ministry of MSME',       N'Central schemes administered by the Ministry of MSME and the Office of DC (MSME)', 1),
    (2, 'STATE',     N'State Govt.',            N'Incentives notified by State and UT governments',                                  2),
    (3, 'FINANCIAL', N'Financial Institutions', N'Concessional credit and interest subvention from banks and NBFCs',                 3),
    (4, 'OTHERS',    N'Others',                 N'Industry bodies, OEM anchor programmes and multilateral schemes',                  4)
) AS src (ProviderId, Code, Name, Description, SortOrder)
   ON tgt.ProviderId = src.ProviderId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, Description = src.Description, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ProviderId, Code, Name, Description, SortOrder)
    VALUES (src.ProviderId, src.Code, src.Name, src.Description, src.SortOrder);
GO

/*------------------------------------------------------------ SequenceCounter
  Templates for the human-readable identifiers. PeriodKey '' rows are the
  per-sequence template that usp_NextSequence clones when a new year starts.
---------------------------------------------------------------------------*/
MERGE audit.SequenceCounter AS tgt
USING (VALUES
    ('Application', '', 0, 'MCLS/',    6),
    ('Certificate', '', 0, 'MCLS-CERT/', 6),
    ('Invoice',     '', 0, 'MCLS-INV/',  6),
    ('Assessment',  '', 0, 'MCLS-ASM/',  6),
    ('NonConformance','',0, 'MCLS-NC/',   6)
) AS src (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
   ON tgt.SequenceName = src.SequenceName AND tgt.PeriodKey = src.PeriodKey
WHEN NOT MATCHED BY TARGET THEN
    INSERT (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
    VALUES (src.SequenceName, src.PeriodKey, src.LastValue, src.Prefix, src.PadWidth);
GO

PRINT N'Seed 1 — reference data loaded.';
GO

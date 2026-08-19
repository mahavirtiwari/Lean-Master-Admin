/*===========================================================================
  Seed 2 — roles and the permission matrix.

  Two matrices govern everything, and both are transcribed here rather than
  re-invented:

    ACCESS  — which of the 15 modules a role may open at all.
    MANAGE  — which of those modules the role may *act* on. A module a role
              can open but not manage is view + export only.

  Both are written as 15-character bit strings, one character per ModuleId in
  sidebar order (1 Dashboard .. 15 Settings). That keeps the matrix readable
  as a block and makes the permission expansion a single set-based INSERT
  instead of ~450 hand-written rows.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*---------------------------------------------------------------------------
  Module bit positions, for reading the strings below:

    1 Dashboard      6 Parameter      11 Tech. Upgrad.
    2 Handholding    7 Ques. Silver   12 Documents
    3 Assessments    8 Ques. Gold     13 Reports
    4 User Mgmt      9 Fee Structure  14 Emailer
    5 Sectors       10 Incentives     15 Settings
---------------------------------------------------------------------------*/
DECLARE @Matrix TABLE
(
    RoleCode        varchar(50)     NOT NULL PRIMARY KEY,
    RoleName        nvarchar(120)   NOT NULL,
    AccountTypeCode varchar(30)     NOT NULL,
    Description     nvarchar(400)   NULL,
    AccessBits      char(15)        NOT NULL,
    ManageBits      char(15)        NOT NULL,
    SortOrder       smallint        NOT NULL
);

INSERT INTO @Matrix (RoleCode, RoleName, AccountTypeCode, Description, AccessBits, ManageBits, SortOrder)
VALUES
    /*                                                                        123456789012345   123456789012345 */
    ('SUPER_ADMIN',            N'Super Admin',              'MINISTRY_OF_MSME',
     N'Full administrative control of the portal, including Settings.',       '111111111111111','111111111111111',  1),

    ('MINISTRY_REVIEWER',      N'Ministry Reviewer',        'MINISTRY_OF_MSME',
     N'Ministry official reviewing scheme delivery across every module bar Settings.',
                                                                              '111111111111110','011111111111010',  2),

    ('IA_ADMIN',               N'IA Admin',                 'IMPLEMENTING_AGENCY',
     N'Implementing agency administrator coordinating delivery and its own user base.',
                                                                              '111110110111110','011100000001010',  3),

    ('ASSESSOR_COORDINATOR',   N'Assessor Coordinator',     'IMPLEMENTING_AGENCY',
     N'Implementing agency staff coordinating assessor deployment.',          '111110110111110','011100000001010',  4),

    ('STATE_NODAL_OFFICER',    N'State Nodal Officer',      'STATE_SPECIFIC',
     N'State nodal officer; manages the state''s own incentives, reads the rest.',
                                                                              '111010000111100','000000000100000',  5),

    ('STATE_COORDINATOR',      N'State Coordinator',        'STATE_SPECIFIC',
     N'State-level coordinator supporting the nodal officer.',                '111010000111100','000000000100000',  6),

    ('INDUSTRY_PARTNER',       N'Industry Partner',         'OEM_PSU_IA',
     N'OEM, PSU or anchor-enterprise partner. Read-only throughout.',         '100010000111000','000000000000000',  7),

    ('TECHNICAL_EXPERT',       N'Technical Expert',         'OEM_PSU_IA',
     N'Sector technical expert nominated by an OEM or PSU. Read-only.',       '100010000111000','000000000000000',  8),

    ('OPERATIONS_ADMIN',       N'Operations Admin',         'OPERATION_ADMIN',
     N'Portal operations and helpdesk; runs the scheme content but not accounts.',
                                                                              '111011110011110','011011110011010',  9),

    ('CONSULTANT_ORG_ADMIN',   N'Consultant Org Admin',     'CONSULTANT_ORG',
     N'Empanelled consulting firm administrator.',                            '110010000011000','010000000000000', 10),

    ('ASSESSMENT_AGENCY_ADMIN',N'Assessment Agency Admin',  'ASSESSMENT_AGENCY',
     N'Accredited assessment agency administrator.',                          '111010110001100','001000000000000', 11),

    ('LEAN_CONSULTANT',        N'LEAN Consultant',          'CONSULTANTS',
     N'Certified consultant delivering handholding at unit level.',           '110010000011000','010000000000000', 12),

    ('SENIOR_LEAN_CONSULTANT', N'Senior LEAN Consultant',   'CONSULTANTS',
     N'Senior consultant; same reach as a LEAN Consultant.',                  '110010000011000','010000000000000', 13),

    ('ASSESSOR',               N'Assessor',                 'ASSESSORS',
     N'Qualified assessor performing on-site and desk assessments.',          '111010110001000','001000000000000', 14);

/*--------------------------------------------------------------------- Role */
MERGE auth.Role AS tgt
USING (
    SELECT m.RoleCode, m.RoleName, at.AccountTypeId, m.Description
    FROM @Matrix m
    JOIN auth.AccountType at ON at.Code = m.AccountTypeCode
) AS src
   ON tgt.Code = src.RoleCode
WHEN MATCHED THEN UPDATE SET
    Name          = src.RoleName,
    AccountTypeId = src.AccountTypeId,
    Description   = src.Description,
    IsSystemRole  = 1,
    ModifiedOnUtc = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, AccountTypeId, Description, IsSystemRole, IsActive)
    VALUES (src.RoleCode, src.RoleName, src.AccountTypeId, src.Description, 1, 1);
GO

/*----------------------------------------------------------- RolePermission
  Expand the two bit strings into concrete (role, permission) rows.

    accessible + manageable -> view, create, edit, delete, export
    accessible only         -> view, export

  The matrix is re-declared here because the previous batch ended at its GO.
---------------------------------------------------------------------------*/
DECLARE @Matrix TABLE
(
    RoleCode   varchar(50) NOT NULL PRIMARY KEY,
    AccessBits char(15)    NOT NULL,
    ManageBits char(15)    NOT NULL
);

INSERT INTO @Matrix (RoleCode, AccessBits, ManageBits)
VALUES
    ('SUPER_ADMIN',             '111111111111111','111111111111111'),
    ('MINISTRY_REVIEWER',       '111111111111110','011111111111010'),
    ('IA_ADMIN',                '111110110111110','011100000001010'),
    ('ASSESSOR_COORDINATOR',    '111110110111110','011100000001010'),
    ('STATE_NODAL_OFFICER',     '111010000111100','000000000100000'),
    ('STATE_COORDINATOR',       '111010000111100','000000000100000'),
    ('INDUSTRY_PARTNER',        '100010000111000','000000000000000'),
    ('TECHNICAL_EXPERT',        '100010000111000','000000000000000'),
    ('OPERATIONS_ADMIN',        '111011110011110','011011110011010'),
    ('CONSULTANT_ORG_ADMIN',    '110010000011000','010000000000000'),
    ('ASSESSMENT_AGENCY_ADMIN', '111010110001100','001000000000000'),
    ('LEAN_CONSULTANT',         '110010000011000','010000000000000'),
    ('SENIOR_LEAN_CONSULTANT',  '110010000011000','010000000000000'),
    ('ASSESSOR',                '111010110001000','001000000000000');

;WITH Desired AS
(
    SELECT r.RoleId, p.PermissionId
    FROM @Matrix mx
    JOIN auth.Role       r  ON r.Code = mx.RoleCode
    JOIN auth.Module     m  ON SUBSTRING(mx.AccessBits, m.ModuleId, 1) = '1'
    JOIN auth.Permission p  ON p.ModuleId = m.ModuleId
    JOIN auth.RightType  rt ON rt.RightTypeId = p.RightTypeId
    WHERE rt.Code IN ('view','export')                      -- always granted when accessible
       OR SUBSTRING(mx.ManageBits, m.ModuleId, 1) = '1'     -- create/edit/delete when manageable
)
MERGE auth.RolePermission AS tgt
USING Desired AS src
   ON tgt.RoleId = src.RoleId AND tgt.PermissionId = src.PermissionId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (RoleId, PermissionId) VALUES (src.RoleId, src.PermissionId)
/* Remove rights a seeded role should no longer have — keeps an upgraded
   database in step with the matrix instead of accumulating stale grants.
   Scoped to seeded roles only, so hand-built roles are untouched. */
WHEN NOT MATCHED BY SOURCE
     AND tgt.RoleId IN (SELECT RoleId FROM auth.Role WHERE Code IN (SELECT RoleCode FROM @Matrix))
     THEN DELETE;
GO

/*------------------------------------------------------ UserManagementScope
  Only three roles reach User Management at all. Super Admin and the Ministry
  Reviewer administer every account type; an IA Admin administers the
  delivery-side types only and never a government one.
---------------------------------------------------------------------------*/
DECLARE @Scope TABLE (RoleCode varchar(50), AccountTypeCode varchar(30));

INSERT INTO @Scope (RoleCode, AccountTypeCode)
/* Super Admin and Ministry Reviewer -> all nine types */
SELECT r.Code, at.Code
FROM (VALUES ('SUPER_ADMIN'), ('MINISTRY_REVIEWER')) AS r(Code)
CROSS JOIN auth.AccountType at
UNION ALL
/* IA Admin and Assessor Coordinator -> delivery-side types only */
SELECT r.Code, at.Code
FROM (VALUES ('IA_ADMIN'), ('ASSESSOR_COORDINATOR')) AS r(Code)
CROSS JOIN auth.AccountType at
WHERE at.Code IN ('IMPLEMENTING_AGENCY','OEM_PSU_IA','CONSULTANT_ORG',
                  'ASSESSMENT_AGENCY','CONSULTANTS','ASSESSORS');

MERGE auth.UserManagementScope AS tgt
USING (
    SELECT r.RoleId, at.AccountTypeId
    FROM @Scope s
    JOIN auth.Role        r  ON r.Code  = s.RoleCode
    JOIN auth.AccountType at ON at.Code = s.AccountTypeCode
) AS src
   ON tgt.RoleId = src.RoleId AND tgt.ManagedAccountTypeId = src.AccountTypeId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (RoleId, ManagedAccountTypeId) VALUES (src.RoleId, src.AccountTypeId)
WHEN NOT MATCHED BY SOURCE
     AND tgt.RoleId IN (SELECT RoleId FROM auth.Role WHERE IsSystemRole = 1)
     THEN DELETE;
GO

/*---------------------------------------------------------------------------
  Sanity check. If the matrix and the expansion disagree the seed should fail
  loudly here rather than leave a half-configured portal.
---------------------------------------------------------------------------*/
DECLARE @superPerms int, @totalPerms int;

SELECT @totalPerms = COUNT(*) FROM auth.Permission;
SELECT @superPerms = COUNT(*)
FROM auth.RolePermission rp
JOIN auth.Role r ON r.RoleId = rp.RoleId
WHERE r.Code = 'SUPER_ADMIN';

IF @superPerms <> @totalPerms
BEGIN
    DECLARE @msg nvarchar(300) = FORMATMESSAGE(
        N'Super Admin holds %d of %d permissions — the matrix expansion is wrong.',
        @superPerms, @totalPerms);
    THROW 51000, @msg, 1;
END

/* Read-only roles must hold no create/edit/delete anywhere. */
IF EXISTS (
    SELECT 1
    FROM auth.RolePermission rp
    JOIN auth.Role       r  ON r.RoleId       = rp.RoleId
    JOIN auth.Permission p  ON p.PermissionId = rp.PermissionId
    JOIN auth.RightType  rt ON rt.RightTypeId = p.RightTypeId
    WHERE r.Code IN ('INDUSTRY_PARTNER','TECHNICAL_EXPERT')
      AND rt.Code IN ('create','edit','delete'))
BEGIN
    THROW 51001, N'A read-only role was granted a write right — check the MANAGE bits.', 1;
END

PRINT N'Seed 2 — roles and permissions loaded and verified.';
GO

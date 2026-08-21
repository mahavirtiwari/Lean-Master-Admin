/* ---------------------------------------------------------------------------
   User codes, as the supplied format table specifies them.

   Four changes.

   1. OEMs, PSUs and IAs were one account type ("OEMs / PSUs / IAs") and the
      table lists them as three, each with its own code and its own numbering.
      The existing type becomes OEMs and keeps its users; PSUs and IAs are new,
      and each gets its own entry under User Management.

   2. The code segment per type is set from the table's Example column — the
      identifier as it will actually read. For five types that differs from the
      table's own Prefix column (Operation Admin: prefix OPS, example
      MCLS-OA-0001, and likewise COR/CO, AGY/AM, CON/CC, ASR/AS); the examples
      are what was asked for, and the prefix column is amended to match them so
      the two cannot drift apart again.

   3. Serial widths follow the examples too: three digits for Implementing
      Agency, Ministry and State Specific, four for the rest.

   4. State Specific has no fixed segment at all. Its example is
      MCLS-<STATE>-001, so the segment is the state the user belongs to, which
      is resolved when the account is created.

   The Super Admin signs in as "Super Admin" rather than a generated code.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- --------------------------------------------------- one type becomes three ---
UPDATE auth.AccountType
SET Name = N'OEMs', ShortName = N'OEMs', UserCodePrefix = 'OEM'
WHERE AccountTypeId = 4;
GO

IF NOT EXISTS (SELECT 1 FROM auth.AccountType WHERE AccountTypeId = 11)
    INSERT INTO auth.AccountType
        (AccountTypeId, Code, Name, ShortName, IconKey, UserCodePrefix, Description,
         CanCreateDirectly, RequiresOrganisation, SortOrder, IsActive, IsUserManaged)
    SELECT 11, 'PSU', N'PSUs', N'PSUs', IconKey, 'PSU',
           N'Public sector undertakings participating in the scheme.',
           CanCreateDirectly, RequiresOrganisation, 41, 1, 1
    FROM auth.AccountType WHERE AccountTypeId = 4;
GO

IF NOT EXISTS (SELECT 1 FROM auth.AccountType WHERE AccountTypeId = 12)
    INSERT INTO auth.AccountType
        (AccountTypeId, Code, Name, ShortName, IconKey, UserCodePrefix, Description,
         CanCreateDirectly, RequiresOrganisation, SortOrder, IsActive, IsUserManaged)
    SELECT 12, 'INA', N'IAs', N'IAs', IconKey, 'INA',
           N'Industry associations participating in the scheme.',
           CanCreateDirectly, RequiresOrganisation, 42, 1, 1
    FROM auth.AccountType WHERE AccountTypeId = 4;
GO

-- ------------------------------------------- the segment each code carries ---
UPDATE a SET UserCodePrefix = m.Segment
FROM auth.AccountType a
JOIN (VALUES
        (1,  'IA'),   -- MCLS-IA-001
        (2,  'MIN'),  -- MCLS-MIN-001
        (3,  'STA'),  -- replaced at issue time by the user's state, e.g. MCLS-UP-001
        (4,  'OEM'),  -- MCLS-OEM-0001
        (5,  'OA'),   -- MCLS-OA-0001
        (6,  'CO'),   -- MCLS-CO-0001
        (7,  'AM'),   -- MCLS-AM-0001
        (8,  'CC'),   -- MCLS-CC-0001
        (9,  'AS'),   -- MCLS-AS-0001
        (11, 'PSU'),  -- MCLS-PSU-0001
        (12, 'INA')   -- MCLS-INA-0001
     ) AS m(Id, Segment) ON m.Id = a.AccountTypeId
WHERE a.UserCodePrefix <> m.Segment;
GO

-- --------------------------------------------------- roles for the new types ---
/* A role belongs to one account type, so a new type with no roles is a type no
   user can be created for. PSUs and IAs get their own copies of the roles the
   type they were split from carries, with the same permissions — they were the
   same type until now, and their people do the same work. */
INSERT INTO auth.Role (Code, Name, NormalizedName, ConcurrencyStamp, AccountTypeId,
                       Description, IsSystemRole, IsActive, CreatedOnUtc)
SELECT r.Code + '_' + a.Code,
       r.Name,
       UPPER(r.Code + '_' + a.Code),
       NEWID(),
       a.AccountTypeId,
       r.Description,
       r.IsSystemRole,
       r.IsActive,
       SYSUTCDATETIME()
FROM auth.Role r
CROSS JOIN (SELECT AccountTypeId, Code FROM auth.AccountType WHERE AccountTypeId IN (11, 12)) a
WHERE r.AccountTypeId = 4
  AND NOT EXISTS (SELECT 1 FROM auth.Role x
                   WHERE x.AccountTypeId = a.AccountTypeId AND x.Code = r.Code + '_' + a.Code);
GO

INSERT INTO auth.RolePermission (RoleId, PermissionId, GrantedOnUtc)
SELECT copy.RoleId, rp.PermissionId, SYSUTCDATETIME()
FROM auth.Role copy
JOIN auth.Role original
  ON original.AccountTypeId = 4
 AND copy.Code = original.Code + '_' + (SELECT Code FROM auth.AccountType WHERE AccountTypeId = copy.AccountTypeId)
JOIN auth.RolePermission rp ON rp.RoleId = original.RoleId
WHERE copy.AccountTypeId IN (11, 12)
  AND NOT EXISTS (SELECT 1 FROM auth.RolePermission x
                   WHERE x.RoleId = copy.RoleId AND x.PermissionId = rp.PermissionId);
GO

/* Who may administer them. A role's scope is a list of account types, and a
   type in nobody's scope is a type nobody can create a user for — which is what
   splitting OEMs into three produced. Every role that administers OEMs now
   administers PSUs and IAs too; they were one type until this migration. */
INSERT INTO auth.UserManagementScope (RoleId, ManagedAccountTypeId)
SELECT s.RoleId, t.AccountTypeId
FROM auth.UserManagementScope s
CROSS JOIN (VALUES (11), (12)) AS t(AccountTypeId)
WHERE s.ManagedAccountTypeId = 4
  AND NOT EXISTS (SELECT 1 FROM auth.UserManagementScope x
                   WHERE x.RoleId = s.RoleId AND x.ManagedAccountTypeId = t.AccountTypeId);
GO

-- ------------------------------------------------------------ menu entries ---
IF NOT EXISTS (SELECT 1 FROM auth.MenuItem WHERE Code = 'UM_PSU')
    INSERT INTO auth.MenuItem (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId, IsActive)
    SELECT ModuleId, ParentMenuItemId, 'UM_PSU', N'PSUs', '/user-management/type/11', IconKey, 405, NULL, 1
    FROM auth.MenuItem WHERE Code = 'UM_OEM';
GO

IF NOT EXISTS (SELECT 1 FROM auth.MenuItem WHERE Code = 'UM_INA')
    INSERT INTO auth.MenuItem (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId, IsActive)
    SELECT ModuleId, ParentMenuItemId, 'UM_INA', N'IAs', '/user-management/type/12', IconKey, 406, NULL, 1
    FROM auth.MenuItem WHERE Code = 'UM_OEM';
GO

UPDATE auth.MenuItem SET Label = N'OEMs' WHERE Code = 'UM_OEM';
GO

/* The five entries below OEMs shift down to make room for PSUs and IAs. */
UPDATE auth.MenuItem SET SortOrder = 407 WHERE Code = 'UM_OPS';
UPDATE auth.MenuItem SET SortOrder = 408 WHERE Code = 'UM_COR';
UPDATE auth.MenuItem SET SortOrder = 409 WHERE Code = 'UM_AGY';
UPDATE auth.MenuItem SET SortOrder = 410 WHERE Code = 'UM_CON';
UPDATE auth.MenuItem SET SortOrder = 411 WHERE Code = 'UM_ASR';
GO

-- --------------------------------------------------------- serial widths ---
/* Three digits for the first three types, four for the rest. Counters that do
   not exist yet inherit the width when they are created by the procedure, so
   the rows are seeded here rather than left to chance. */
MERGE audit.SequenceCounter AS target
USING (VALUES
        ('User-IA', 3), ('User-MIN', 3), ('User-STA', 3),
        ('User-OEM', 4), ('User-PSU', 4), ('User-INA', 4), ('User-OA', 4),
        ('User-CO', 4), ('User-AM', 4), ('User-CC', 4), ('User-AS', 4)
      ) AS source(SequenceName, PadWidth)
ON target.SequenceName = source.SequenceName AND target.PeriodKey = ''
WHEN MATCHED THEN UPDATE SET PadWidth = source.PadWidth
WHEN NOT MATCHED THEN
    INSERT (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
    VALUES (source.SequenceName, '', 0, NULL, source.PadWidth);
GO

/* State Specific numbers per state — MCLS-UP-001 and MCLS-MH-001 are both the
   first of their kind. A counter created on demand would inherit the procedure's
   default width of six and print MCLS-UP-000001, so one is seeded per state at
   the three digits the format specifies. */
INSERT INTO audit.SequenceCounter (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
SELECT 'User-' + s.AlphaCode, '', 0, NULL, 3
FROM master.State s
WHERE s.AlphaCode IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM audit.SequenceCounter c
                   WHERE c.SequenceName = 'User-' + s.AlphaCode AND c.PeriodKey = '');
GO

UPDATE audit.SequenceCounter SET PadWidth = 3
WHERE SequenceName = 'User-STA'
   OR SequenceName IN (SELECT 'User-' + AlphaCode FROM master.State WHERE AlphaCode IS NOT NULL);
GO

-- ------------------------------------------------------------ super admin ---
UPDATE auth.[User] SET UserCode = N'Super Admin'
WHERE UserCode = 'MCLS-MIN-000001';
GO

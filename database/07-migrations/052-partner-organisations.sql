/* ---------------------------------------------------------------------------
   Industry Associations, OEMs and PSUs — who creates them, and who approves.

   Two different governance paths, and the difference is the point of this
   migration:

     Implementing Agency   created by the Super Admin. Live immediately; there
                           is nobody above the Super Admin to approve it.
     Industry Association  created by an Implementing Agency, then approved by
     OEM                   the State Office before an applicant can name it.
     PSU                   Until approved it is invisible to applicants.

   All three of the second group already have account types (12 INA, 4 OEMs,
   11 PSUs) and live in auth.Organisation like every other body in the scheme,
   so this adds the approval trail to that table rather than building a parallel
   one — an OEM is not a different kind of thing to an assessment agency, it
   just needs a decision before it counts.

   Existing rows are stamped Approved: they were seeded or created by the Super
   Admin, and retro-fitting a pending state would hide bodies already in use.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ---------------------------------------------------------- the decision ---
   Draft is not used yet; it is there so an Implementing Agency can later save
   a half-filled record without putting it in front of a State Office. */
IF COL_LENGTH('auth.Organisation', 'ApprovalStatus') IS NULL
BEGIN
    ALTER TABLE auth.Organisation ADD ApprovalStatus varchar(20) NOT NULL
        CONSTRAINT DF_Organisation_ApprovalStatus DEFAULT ('Approved');
END
GO

/* Which Implementing Agency raised it. Null for anything the Super Admin
   created directly, which is every row that existed before this. */
IF COL_LENGTH('auth.Organisation', 'RaisedByOrganisationId') IS NULL
BEGIN
    ALTER TABLE auth.Organisation ADD RaisedByOrganisationId int NULL;
END
GO

IF COL_LENGTH('auth.Organisation', 'DecidedByUserId') IS NULL
BEGIN
    ALTER TABLE auth.Organisation ADD DecidedByUserId int NULL;
END
GO

IF COL_LENGTH('auth.Organisation', 'DecidedOnUtc') IS NULL
BEGIN
    ALTER TABLE auth.Organisation ADD DecidedOnUtc datetime2(3) NULL;
END
GO

/* Why it was rejected, so the Implementing Agency can fix and resubmit. */
IF COL_LENGTH('auth.Organisation', 'DecisionRemark') IS NULL
BEGIN
    ALTER TABLE auth.Organisation ADD DecisionRemark nvarchar(500) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Organisation_RaisedBy')
BEGIN
    ALTER TABLE auth.Organisation ADD CONSTRAINT FK_Organisation_RaisedBy
        FOREIGN KEY (RaisedByOrganisationId) REFERENCES auth.Organisation (OrganisationId);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Organisation_ApprovalStatus')
BEGIN
    ALTER TABLE auth.Organisation ADD CONSTRAINT CK_Organisation_ApprovalStatus
        CHECK (ApprovalStatus IN ('Draft', 'Pending', 'Approved', 'Rejected'));
END
GO

/* The applicant's picker reads approved bodies of one type at a time, and the
   State Office queue reads pending ones. Both are this index. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Organisation_Type_Approval'
               AND object_id = OBJECT_ID('auth.Organisation'))
BEGIN
    CREATE INDEX IX_Organisation_Type_Approval
        ON auth.Organisation (AccountTypeId, ApprovalStatus)
        INCLUDE (Name, OrganisationCode, StateId, JurisdictionScope, IsActive);
END
GO

/* ------------------------------------------------------ the module ---------
   One screen serves both halves of the workflow: an Implementing Agency sees
   what it has raised and adds more, a State Office sees what is waiting on it.
   The rights split the two — create is the agency, edit is the decision. */
MERGE auth.Module AS tgt
USING (VALUES
    (19, 'PARTNER_ORGS', N'Associations, OEMs & PSUs', '/partner-organisations', 'partners', 19)
) AS src (ModuleId, Code, Name, RoutePath, IconKey, SortOrder)
   ON tgt.ModuleId = src.ModuleId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, RoutePath = src.RoutePath,
    IconKey = src.IconKey, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, Code, Name, RoutePath, IconKey, SortOrder)
    VALUES (src.ModuleId, src.Code, src.Name, src.RoutePath, src.IconKey, src.SortOrder);
GO

MERGE auth.Permission AS tgt
USING (
    SELECT m.ModuleId, rt.RightTypeId,
           CAST(m.Code + '.' + rt.Code AS varchar(45)) AS PermissionKey
    FROM auth.Module m CROSS JOIN auth.RightType rt
    WHERE m.ModuleId = 19
) AS src
   ON tgt.ModuleId = src.ModuleId AND tgt.RightTypeId = src.RightTypeId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, RightTypeId, PermissionKey) VALUES (src.ModuleId, src.RightTypeId, src.PermissionKey);
GO

/* Who holds what. The Implementing Agency raises records (view + create); the
   State Office decides on them (view + edit) — the State Nodal Officer and the
   State Coordinator, which is what "State office" is in auth.Role. Super Admin
   and Operations Admin see and do everything, as on every other module. */
MERGE auth.RolePermission AS tgt
USING (
    SELECT r.RoleId, p.PermissionId
    FROM auth.Permission p
    JOIN auth.RightType rt ON rt.RightTypeId = p.RightTypeId
    JOIN auth.Role r ON
         (r.Code IN ('SUPER_ADMIN', 'OPERATIONS_ADMIN'))
      OR (r.Code = 'IA_ADMIN' AND rt.Code IN ('view', 'create', 'export'))
      OR (r.Code IN ('STATE_NODAL_OFFICER', 'STATE_COORDINATOR') AND rt.Code IN ('view', 'edit', 'export'))
    WHERE p.ModuleId = 19
) AS src
   ON tgt.RoleId = src.RoleId AND tgt.PermissionId = src.PermissionId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (RoleId, PermissionId) VALUES (src.RoleId, src.PermissionId);
GO

MERGE auth.MenuItem AS tgt
USING (VALUES
    ('PARTNER_ORGS', 19, N'Associations, OEMs & PSUs', '/partner-organisations', 'partners', 1180)
) AS src (Code, ModuleId, Label, RoutePath, IconKey, SortOrder)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    ModuleId = src.ModuleId, Label = src.Label, RoutePath = src.RoutePath,
    IconKey = src.IconKey, SortOrder = src.SortOrder, IsActive = 1
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId, IsActive)
    VALUES (src.ModuleId, NULL, src.Code, src.Label, src.RoutePath, src.IconKey, src.SortOrder, NULL, 1);
GO

/* ------------------------------------------- the applicant's three answers ---
   The enterprise already carries the free-text answers (050). These point at
   the actual bodies, so an application can be routed to them and so a renamed
   association does not orphan the enterprises that named it. The text columns
   stay: they are what an enterprise that applied before this recorded. */
IF COL_LENGTH('msme.Enterprise', 'ImplementingAgencyOrgId') IS NULL
BEGIN
    ALTER TABLE msme.Enterprise ADD ImplementingAgencyOrgId int NULL;
END
GO

IF COL_LENGTH('msme.Enterprise', 'IndustryAssociationOrgId') IS NULL
BEGIN
    ALTER TABLE msme.Enterprise ADD IndustryAssociationOrgId int NULL;
END
GO

IF COL_LENGTH('msme.Enterprise', 'OemPsuOrgId') IS NULL
BEGIN
    ALTER TABLE msme.Enterprise ADD OemPsuOrgId int NULL;
END
GO

/* ---------------------------------------------------------------- seed ------
   ASCII only: sqlcmd reads a script as ANSI unless it is given -f 65001, so a
   UTF-8 separator here lands in the database as mojibake. The deck writes these
   with a hyphen anyway.

   The associations and OEMs the design names, so the picker is not empty on a
   fresh database. Approved, because they are reference bodies the scheme
   already recognises rather than anything an agency raised. */
MERGE auth.Organisation AS tgt
USING (VALUES
    ('ORG-INA-001', N'Confederation of Indian Industry',            12, N'CII - Pan-India',        NULL),
    ('ORG-INA-002', N'Laghu Udyog Bharati',                         12, N'LUB - Pan-India',        NULL),
    ('ORG-INA-003', N'CODISSIA',                                    12, N'Coimbatore, Tamil Nadu', NULL),
    ('ORG-INA-004', N'Rajkot Engineering Association',              12, N'REA - Rajkot, Gujarat',  NULL),
    ('ORG-INA-005', N'FICCI',                                       12, N'Pan-India',              NULL),
    ('ORG-INA-006', N'ASSOCHAM',                                    12, N'Pan-India',              NULL),
    ('ORG-OEM-001', N'Tata Motors Ltd',                              4, N'Pan-India',              NULL),
    ('ORG-OEM-002', N'Mahindra & Mahindra Ltd',                      4, N'Pan-India',              NULL),
    ('ORG-OEM-003', N'Bajaj Auto Ltd',                               4, N'Pune, Maharashtra',      NULL),
    ('ORG-PSU-001', N'Bharat Heavy Electricals Ltd (BHEL)',         11, N'Pan-India',              NULL),
    ('ORG-PSU-002', N'Indian Oil Corporation Ltd',                  11, N'Pan-India',              NULL),
    ('ORG-PSU-003', N'Hindustan Aeronautics Ltd (HAL)',             11, N'Bengaluru, Karnataka',   NULL)
) AS src (OrganisationCode, Name, AccountTypeId, JurisdictionScope, StateId)
   ON tgt.OrganisationCode = src.OrganisationCode
WHEN NOT MATCHED BY TARGET THEN
    INSERT (OrganisationCode, Name, AccountTypeId, JurisdictionScope, StateId,
            IsActive, ApprovalStatus, CreatedOnUtc)
    VALUES (src.OrganisationCode, src.Name, src.AccountTypeId, src.JurisdictionScope, src.StateId,
            1, 'Approved', SYSUTCDATETIME());
GO

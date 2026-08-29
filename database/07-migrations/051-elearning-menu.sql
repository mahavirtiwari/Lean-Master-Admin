/* ---------------------------------------------------------------------------
   E-Learning — the LEAN Bronze course list, as a super-admin menu.

   The courses were seeded once by 043 and had no screen behind them, so the
   only way to change what an enterprise's participants study was a SQL edit.
   This gives them the same treatment as Sectors and the ESG checklist: a
   module, its five rights, a sidebar entry, and a description alongside the
   title, which is all the course record carries.

   Module 18 extends the seventeen that 039 left. The seed files carry the same
   module for a fresh install; this brings an existing database in line.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ------------------------------------------------------------------ module ---
   Adding the row makes the Permission cross-join below generate its five
   rights, exactly as the seed does. */
MERGE auth.Module AS tgt
USING (VALUES
    (18, 'E_LEARNING', N'E-Learning', '/e-learning', 'book', 18)
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
    FROM auth.Module m
    CROSS JOIN auth.RightType rt
    WHERE m.ModuleId = 18
) AS src
   ON tgt.ModuleId = src.ModuleId AND tgt.RightTypeId = src.RightTypeId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, RightTypeId, PermissionKey)
    VALUES (src.ModuleId, src.RightTypeId, src.PermissionKey);
GO

/* Scheme content, so the three roles that already run Sectors and the ESG
   checklist. Everyone else gets nothing, which is the default. */
MERGE auth.RolePermission AS tgt
USING (
    SELECT r.RoleId, p.PermissionId
    FROM auth.Permission p
    JOIN auth.Role r ON r.Code IN ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'MINISTRY_REVIEWER')
    WHERE p.ModuleId = 18
) AS src
   ON tgt.RoleId = src.RoleId AND tgt.PermissionId = src.PermissionId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (RoleId, PermissionId) VALUES (src.RoleId, src.PermissionId);
GO

/* Sits with the other scheme-content menus, after Basic Info & Documents. */
MERGE auth.MenuItem AS tgt
USING (VALUES
    ('E_LEARNING', 18, N'E-Learning', '/e-learning', 'book', 1170)
) AS src (Code, ModuleId, Label, RoutePath, IconKey, SortOrder)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    ModuleId = src.ModuleId, Label = src.Label, RoutePath = src.RoutePath,
    IconKey = src.IconKey, SortOrder = src.SortOrder, IsActive = 1
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId, IsActive)
    VALUES (src.ModuleId, NULL, src.Code, src.Label, src.RoutePath, src.IconKey, src.SortOrder, NULL, 1);
GO

/* ------------------------------------------------------------ the course ---
   A description alongside the title: what the course covers, shown to the
   enterprise in the Courses & Exam dialog. Nullable, because the eleven seeded
   courses have none until an administrator writes them. */
IF COL_LENGTH('msme.BronzeCourse', 'Description') IS NULL
BEGIN
    ALTER TABLE msme.BronzeCourse ADD Description nvarchar(1000) NULL;
END
GO

/* Who last touched it, on the same pattern as the other masters. */
IF COL_LENGTH('msme.BronzeCourse', 'ModifiedOnUtc') IS NULL
BEGIN
    ALTER TABLE msme.BronzeCourse ADD ModifiedOnUtc datetime2(3) NULL;
END
GO

IF COL_LENGTH('msme.BronzeCourse', 'ModifiedByUserId') IS NULL
BEGIN
    ALTER TABLE msme.BronzeCourse ADD ModifiedByUserId int NULL;
END
GO

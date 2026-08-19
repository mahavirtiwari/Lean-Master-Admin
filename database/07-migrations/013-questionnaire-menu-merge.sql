/*
    013 — One "Questionnaire" menu with "Lean Silver" and "Lean Gold" under it.
    ------------------------------------------------------------------------
    The sidebar carried two top-level entries, "Questionnaire Silver" and
    "Questionnaire Gold". They become one parent with two children, matching
    how Fee Structure already reads.

    The two MODULES are deliberately left alone. auth.Module drives the
    permission matrix — 15 modules x 5 rights — and collapsing Silver and Gold
    into one would silently take five permissions off every role that holds
    them. A menu is a navigation concern; a module is an authorisation one, and
    this migration only changes the first.

    That does expose a latent flaw in auth.vw_MenuForUser: a parent is shown
    only when the user holds ITS module's view right. Fee Structure and
    Incentives never hit it because their parents and children share a module.
    Here the parent is Silver and one child is Gold, so a Gold-only user would
    lose the whole branch. The view is corrected to show a parent when the user
    can see the parent's module OR any of its children's.

    Idempotent.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- The Silver entry becomes the parent; it already sorts where the group should
-- sit, and reusing it keeps any row that references the id valid.
DECLARE @parent int = (SELECT MenuItemId FROM auth.MenuItem WHERE Code = 'QUES_SILVER');
DECLARE @oldGold int = (SELECT MenuItemId FROM auth.MenuItem WHERE Code = 'QUES_GOLD' AND ParentMenuItemId IS NULL);

IF @parent IS NOT NULL
BEGIN
    UPDATE auth.MenuItem
    SET    Code             = 'QUESTIONNAIRE',
           Label            = N'Questionnaire',
           RoutePath        = '/questionnaire',
           ParentMenuItemId = NULL,
           SortOrder        = 700
    WHERE  MenuItemId = @parent;
END;

-- The old top-level Gold entry is retired rather than deleted, so its id
-- survives for anything already pointing at it.
IF @oldGold IS NOT NULL
BEGIN
    UPDATE auth.MenuItem SET IsActive = 0 WHERE MenuItemId = @oldGold;
END;

-- Children. Silver keeps module 7, Gold module 8, so each child is gated by
-- the right the role actually holds.
MERGE auth.MenuItem AS t
USING (VALUES
    ('QUES_LEAN_SILVER', N'Lean Silver', '/questionnaire/silver', 7, 701),
    ('QUES_LEAN_GOLD',   N'Lean Gold',   '/questionnaire/gold',   8, 702)
) AS s (Code, Label, RoutePath, ModuleId, SortOrder)
ON t.Code = s.Code
WHEN MATCHED THEN UPDATE SET
    t.Label            = s.Label,
    t.RoutePath        = s.RoutePath,
    t.ModuleId         = s.ModuleId,
    t.ParentMenuItemId = @parent,
    t.SortOrder        = s.SortOrder,
    t.IsActive         = 1
WHEN NOT MATCHED THEN
    INSERT (ParentMenuItemId, Code, Label, RoutePath, ModuleId, SortOrder, IsActive)
    VALUES (@parent, s.Code, s.Label, s.RoutePath, s.ModuleId, s.SortOrder, 1);

COMMIT TRANSACTION;
GO

/*---------------------------------------------------------------------------
  auth.vw_MenuForUser — the sidebar for one user, parents and children.

  A child appears when the user holds its module's 'view' right (and, for User
  Management children, when the role administers that account type).

  A parent appears when the user holds its own module's 'view' right OR can see
  at least one of its children. Without the second clause a group whose
  children span modules — Questionnaire spans Silver and Gold — disappears for
  a user who holds only one of them.
---------------------------------------------------------------------------*/
CREATE OR ALTER VIEW auth.vw_MenuForUser
AS
WITH Visible AS
(
    -- Every item the user can see on its own module right.
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
        m.Code AS ModuleCode,
        mi.AccountTypeId
    FROM auth.MenuItem mi
    JOIN auth.Module m ON m.ModuleId = mi.ModuleId
    JOIN auth.vw_EffectivePermission ep
         ON ep.ModuleId = mi.ModuleId AND ep.RightCode = 'view'
    WHERE mi.IsActive = 1
      AND m.IsActive = 1
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
          )
)
SELECT UserId, MenuItemId, ParentMenuItemId, Code, Label, RoutePath, IconKey,
       SortOrder, ModuleId, ModuleCode, AccountTypeId
FROM   Visible

UNION

-- Parents reachable only through a visible child.
SELECT v.UserId, p.MenuItemId, p.ParentMenuItemId, p.Code, p.Label, p.RoutePath,
       p.IconKey, p.SortOrder, p.ModuleId, m.Code, p.AccountTypeId
FROM   Visible AS v
JOIN   auth.MenuItem AS p ON p.MenuItemId = v.ParentMenuItemId
JOIN   auth.Module   AS m ON m.ModuleId = p.ModuleId
WHERE  p.IsActive = 1;
GO

SELECT MenuItemId, ParentMenuItemId, Code, Label, RoutePath, ModuleId, SortOrder, IsActive
FROM   auth.MenuItem
WHERE  Code LIKE 'QUES%'
ORDER  BY SortOrder;

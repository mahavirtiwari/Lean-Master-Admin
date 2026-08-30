/* ---------------------------------------------------------------------------
   PSUs and IAs name the account type they administer.

   Every other child of User Management carries the account type its screen
   manages; these two were seeded without one, so nothing tied the menu entry to
   auth.AccountType 11 and 12.

   It shows on Edit Role & Permissions, where a User Management child is the one
   kind of sub-menu that carries a grant of its own - which account types this
   role may administer, in auth.UserManagementScope. Without the link those two
   rows had no grant to toggle and fell back to inheriting, so a role could be
   given the PSUs screen and no way to say so.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE auth.MenuItem
   SET AccountTypeId = 11
 WHERE Label = N'PSUs' AND ParentMenuItemId IS NOT NULL AND AccountTypeId IS NULL;
GO

UPDATE auth.MenuItem
   SET AccountTypeId = 12
 WHERE Label = N'IAs' AND ParentMenuItemId IS NOT NULL AND AccountTypeId IS NULL;
GO

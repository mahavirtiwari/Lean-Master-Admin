/* ---------------------------------------------------------------------------
   Associations, OEMs and PSUs move under User Management.

   052 gave them a menu of their own. They do not need one: User Management
   already has OEMs, PSUs and IAs as sub-menus, and those screens are about
   exactly these bodies - so the raise-and-approve panel belongs on them rather
   than in a second place that says the same thing.

   Module 19 is retired: its rights, its role grants and its menu entry all go,
   and the controller is gated on USER_MGMT instead, which is the module the
   screens now live under. The auth.Organisation columns 052 added stay - the
   approval trail is the feature, the menu was only where it was reached.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DELETE FROM auth.MenuItem WHERE Code = 'PARTNER_ORGS';
GO

DELETE rp
  FROM auth.RolePermission rp
  JOIN auth.Permission p ON p.PermissionId = rp.PermissionId
 WHERE p.ModuleId = 19;
GO

DELETE FROM auth.Permission WHERE ModuleId = 19;
GO

DELETE FROM auth.Module WHERE ModuleId = 19;
GO

/* The three sub-menus keep their own routes; the panel is rendered on them by
   account type, so nothing here has to change for them. This confirms they are
   present and pointed at the right account types. */
IF NOT EXISTS (
    SELECT 1 FROM auth.MenuItem c
    JOIN auth.MenuItem p ON p.MenuItemId = c.ParentMenuItemId
    WHERE p.Label = N'User Management' AND c.Label = N'OEMs' AND c.AccountTypeId = 4)
BEGIN
    RAISERROR('User Management > OEMs is missing or not linked to account type 4.', 16, 1);
END
GO

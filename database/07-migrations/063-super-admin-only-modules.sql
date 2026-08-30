/* ---------------------------------------------------------------------------
   Thirteen modules belong to the Super Admin alone.

   Sectors, Parameter, both Questionnaires, Fee Structure, Incentives,
   Technology Upgradation, ESG Checklist, Basic Info & Documents, E-Learning,
   Upload Documents, Emailer and Settings are the scheme's own configuration:
   what the scheme asks, what it charges, what it offers and how it is wired.
   Nobody else views or amends them.

   Two halves, because clearing the grants once is not the rule - it is the
   rule applied once. The flag is the rule: Edit Role & Permissions reads it and
   refuses to grant these to anyone, so an administrator cannot put back next
   week what this migration takes away today.

   Dashboard, Handholding, Assessments, User Management and Reports are not on
   the list and are untouched: those are the work of the scheme rather than its
   configuration, and other roles need them.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('auth.Module', 'IsSuperAdminOnly') IS NULL
BEGIN
    ALTER TABLE auth.Module ADD IsSuperAdminOnly bit NOT NULL
        CONSTRAINT DF_Module_IsSuperAdminOnly DEFAULT (0);
END
GO

UPDATE auth.Module SET IsSuperAdminOnly = 0;
GO

UPDATE auth.Module
   SET IsSuperAdminOnly = 1
 WHERE Code IN ('SECTORS', 'PARAMETER', 'QUES_SILVER', 'QUES_GOLD', 'FEE_STRUCTURE',
                'INCENTIVES', 'TECH_UPGRAD', 'DOCUMENTS', 'EMAILER', 'SETTINGS',
                'ESG_CHECKLIST', 'BASIC_INFO_DOCS', 'E_LEARNING');
GO

/* Every grant on them, from every role but Super Admin. The sidebar is built
   from auth.vw_MenuForUser, which reads the view right, so the menus disappear
   for those roles at their next sign-in without anything else being changed. */
DELETE rp
  FROM auth.RolePermission rp
  JOIN auth.Permission p ON p.PermissionId = rp.PermissionId
  JOIN auth.Module m     ON m.ModuleId = p.ModuleId
  JOIN auth.Role r       ON r.RoleId = rp.RoleId
 WHERE m.IsSuperAdminOnly = 1 AND r.Code <> 'SUPER_ADMIN';
GO

/* A per-user override could put one back just as effectively as a role grant,
   so those go too. */
IF OBJECT_ID('auth.UserPermissionOverride') IS NOT NULL
BEGIN
    DELETE o
      FROM auth.UserPermissionOverride o
      JOIN auth.Permission p ON p.PermissionId = o.PermissionId
      JOIN auth.Module m     ON m.ModuleId = p.ModuleId
      JOIN auth.[User] u     ON u.Id = o.UserId
      JOIN auth.Role r       ON r.RoleId = u.RoleId
     WHERE m.IsSuperAdminOnly = 1 AND r.Code <> 'SUPER_ADMIN';
END
GO

SELECT CONCAT('reserved to Super Admin: ', COUNT(*), ' modules')
  FROM auth.Module WHERE IsSuperAdminOnly = 1;

SELECT CONCAT('grants left on them outside Super Admin: ', COUNT(*))
  FROM auth.RolePermission rp
  JOIN auth.Permission p ON p.PermissionId = rp.PermissionId
  JOIN auth.Module m     ON m.ModuleId = p.ModuleId
  JOIN auth.Role r       ON r.RoleId = rp.RoleId
 WHERE m.IsSuperAdminOnly = 1 AND r.Code <> 'SUPER_ADMIN';
GO

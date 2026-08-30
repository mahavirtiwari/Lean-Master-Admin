/* ---------------------------------------------------------------------------
   The role an account gets when nobody picks one.

   The create form no longer asks for a portal role, so the API has to know
   which one an account type means by default. Seven of the twelve types have
   exactly one role and there is nothing to decide; the other five have two, and
   one of those pairs is dangerous: Ministry of MSME carries both Ministry
   Reviewer and Super Admin, and a form that quietly picked the wrong one would
   mint a Super Admin every time somebody created a Ministry account.

   So the default is stored rather than inferred, and it is always the ordinary
   working role of the type - never Super Admin, never the coordinator variant.
   A role can still be changed afterwards on the edit screen; this only decides
   where an account starts.

   ASCII only: sqlcmd reads a script as ANSI unless given -f 65001.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('auth.Role', 'IsDefaultForType') IS NULL
BEGIN
    ALTER TABLE auth.Role ADD IsDefaultForType bit NOT NULL
        CONSTRAINT DF_Role_IsDefaultForType DEFAULT (0);
END
GO

UPDATE auth.Role SET IsDefaultForType = 0;
GO

UPDATE auth.Role
   SET IsDefaultForType = 1
 WHERE Code IN (
    'IA_ADMIN',                 /* Implementing Agency  - not ASSESSOR_COORDINATOR */
    'MINISTRY_REVIEWER',        /* Ministry of MSME     - never SUPER_ADMIN        */
    'STATE_NODAL_OFFICER',      /* State Specific       - not STATE_COORDINATOR    */
    'INDUSTRY_PARTNER',         /* OEMs                                            */
    'OPERATIONS_ADMIN',         /* Operation Admin                                 */
    'CONSULTANT_ORG_ADMIN',     /* Consultant Organisation                         */
    'ASSESSMENT_AGENCY_ADMIN',  /* Assessment Agency                               */
    'LEAN_CONSULTANT',          /* Consultants          - not SENIOR_LEAN_CONSULTANT */
    'ASSESSOR',                 /* Assessors                                       */
    'ENTERPRISE_USER',          /* MSME Enterprise                                 */
    'INDUSTRY_PARTNER_PSU',     /* PSUs                                            */
    'INDUSTRY_PARTNER_INA'      /* IAs                                             */
 );
GO

/* Exactly one default per account type, or the API has a choice again and the
   whole point of storing it is lost. */
IF EXISTS (
    SELECT AccountTypeId FROM auth.Role
     WHERE IsDefaultForType = 1 AND IsActive = 1
     GROUP BY AccountTypeId HAVING COUNT(*) > 1)
BEGIN
    RAISERROR('More than one default role on an account type.', 16, 1);
END
GO

IF EXISTS (SELECT 1 FROM auth.Role WHERE IsDefaultForType = 1 AND Code = 'SUPER_ADMIN')
BEGIN
    RAISERROR('Super Admin must never be the default role for an account type.', 16, 1);
END
GO

SELECT CONCAT(at.Name, '  ->  ', r.Code)
  FROM auth.Role r
  JOIN auth.AccountType at ON at.AccountTypeId = r.AccountTypeId
 WHERE r.IsDefaultForType = 1
 ORDER BY at.AccountTypeId;
GO

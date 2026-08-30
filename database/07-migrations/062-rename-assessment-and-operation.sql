/* ---------------------------------------------------------------------------
   Assessment Agency becomes Assessment Manager, Operation Admin becomes
   Operation Manager.

   Names only. The codes - ASSESSMENT_AGENCY and OPERATION_ADMIN - stay as they
   are: they are referenced by name in the API and the client, in permission
   keys, and in every token already issued. Renaming a label is a change of
   wording; renaming a code is a migration of behaviour, and nothing here asks
   for the second.

   Three places carry the wording: the account type, the User Management
   sub-menu that lists it, and the role a person on it holds.

   The user-code prefixes are left alone too. Assessment Manager is already AM;
   Operation Manager stays OA so that codes issued before today and after it
   still sort and read as one series.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE auth.AccountType SET Name = N'Operation Manager'   WHERE Code = 'OPERATION_ADMIN';
UPDATE auth.AccountType SET Name = N'Assessment Manager'  WHERE Code = 'ASSESSMENT_AGENCY';
GO

/* The description called them agencies, which the new name contradicts. */
UPDATE auth.AccountType
   SET Description = N'Accredited bodies conducting Silver and Gold assessments'
 WHERE Code = 'ASSESSMENT_AGENCY';
GO

UPDATE auth.MenuItem SET Label = N'Operation Manager'  WHERE Code = 'UM_OPS';
UPDATE auth.MenuItem SET Label = N'Assessment Manager' WHERE Code = 'UM_AGY';
GO

UPDATE auth.Role SET Name = N'Operation Manager'  WHERE Code = 'OPERATIONS_ADMIN';
UPDATE auth.Role SET Name = N'Assessment Manager' WHERE Code = 'ASSESSMENT_AGENCY_ADMIN';
GO

SELECT CONCAT('account type ', AccountTypeId, ': ', Name) FROM auth.AccountType WHERE AccountTypeId IN (5, 7);
SELECT CONCAT('menu: ', Label) FROM auth.MenuItem WHERE Code IN ('UM_OPS', 'UM_AGY');
SELECT CONCAT('role: ', Name) FROM auth.Role WHERE Code IN ('OPERATIONS_ADMIN', 'ASSESSMENT_AGENCY_ADMIN');
GO

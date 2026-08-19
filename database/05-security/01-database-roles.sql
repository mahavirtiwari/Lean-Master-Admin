/*===========================================================================
  Database security.

  The API connects as a single least-privilege SQL login. It is NOT db_owner
  and cannot alter schema: migrations run under a separate deployment login
  that only the release process uses.

  Two application principals:
    mcls_app     — the API. DML on the application schemas, EXEC on procedures.
    mcls_reports — read-only, for the reporting/BI connection.
===========================================================================*/
USE master;
GO

/*---------------------------------------------------------------------------
  Logins. Passwords are placeholders: set real ones at deployment time, or
  switch to Windows authentication (see the note at the bottom).
---------------------------------------------------------------------------*/
IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'mcls_app')
    CREATE LOGIN [mcls_app]
        WITH PASSWORD = N'ChangeMe_At_Deploy_1!',
             CHECK_POLICY = ON,
             DEFAULT_DATABASE = [MCLS];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'mcls_reports')
    CREATE LOGIN [mcls_reports]
        WITH PASSWORD = N'ChangeMe_At_Deploy_2!',
             CHECK_POLICY = ON,
             DEFAULT_DATABASE = [MCLS];
GO

IF NOT EXISTS (SELECT 1 FROM sys.server_principals WHERE name = 'mcls_deploy')
    CREATE LOGIN [mcls_deploy]
        WITH PASSWORD = N'ChangeMe_At_Deploy_3!',
             CHECK_POLICY = ON,
             DEFAULT_DATABASE = [MCLS];
GO

USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*------------------------------------------------------------------ Users ---*/
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mcls_app')
    CREATE USER [mcls_app] FOR LOGIN [mcls_app];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mcls_reports')
    CREATE USER [mcls_reports] FOR LOGIN [mcls_reports];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mcls_deploy')
    CREATE USER [mcls_deploy] FOR LOGIN [mcls_deploy];
GO

/*------------------------------------------------------------ Custom roles ---*/
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mcls_application' AND type = 'R')
    CREATE ROLE [mcls_application];
IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = 'mcls_readonly' AND type = 'R')
    CREATE ROLE [mcls_readonly];
GO

/*---------------------------------------------------------------------------
  Grants for the application role, schema by schema.

  SELECT/INSERT/UPDATE everywhere it needs them; DELETE only where the portal
  genuinely deletes rows. Users, applications, documents and sectors are
  disabled or soft-deleted, never removed, so the app login cannot DELETE
  from those schemas at all — a bug cannot destroy the audit trail.
---------------------------------------------------------------------------*/
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[auth]  TO [mcls_application];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[master]    TO [mcls_application];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[msme]      TO [mcls_application];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[assess]    TO [mcls_application];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[fee]       TO [mcls_application];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[incentive] TO [mcls_application];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[comm]      TO [mcls_application];
GRANT SELECT, INSERT, UPDATE ON SCHEMA::[audit]     TO [mcls_application];

/* Join tables the UI genuinely replaces wholesale. */
GRANT DELETE ON auth.RolePermission          TO [mcls_application];
GRANT DELETE ON auth.UserPermissionOverride  TO [mcls_application];
GRANT DELETE ON auth.UserManagementScope     TO [mcls_application];
GRANT DELETE ON auth.RefreshToken            TO [mcls_application];
GRANT DELETE ON master.DocumentAudience          TO [mcls_application];
GRANT DELETE ON master.SectorParameter           TO [mcls_application];
GRANT DELETE ON comm.EmailCampaignAudience       TO [mcls_application];
GRANT DELETE ON comm.EmailTemplateAudience       TO [mcls_application];
GRANT DELETE ON assess.AssessmentTeam            TO [mcls_application];
GRANT DELETE ON assess.ResponseEvidence          TO [mcls_application];
GRANT DELETE ON fee.TdsSectionAccountType        TO [mcls_application];

/* Questionnaire content is edited before publication, so its rows are real
   deletes rather than soft ones. */
GRANT DELETE ON assess.Requirement               TO [mcls_application];
GRANT DELETE ON assess.[Checkpoint]                TO [mcls_application];

/* Procedures. */
GRANT EXECUTE ON SCHEMA::[auth]  TO [mcls_application];
GRANT EXECUTE ON SCHEMA::[msme]      TO [mcls_application];
GRANT EXECUTE ON SCHEMA::[assess]    TO [mcls_application];
GRANT EXECUTE ON SCHEMA::[fee]       TO [mcls_application];
GRANT EXECUTE ON SCHEMA::[comm]      TO [mcls_application];
GRANT EXECUTE ON SCHEMA::[audit]     TO [mcls_application];

/* Table-valued parameter used by usp_User_ReplacePermissions. */
GRANT EXECUTE ON TYPE::auth.PermissionGrantList TO [mcls_application];

/* EF Core reads sys.tables etc. when applying migrations only; the runtime
   login needs VIEW DEFINITION so it can map the model without ALTER rights. */
GRANT VIEW DEFINITION ON SCHEMA::[auth]  TO [mcls_application];
GRANT VIEW DEFINITION ON SCHEMA::[master]    TO [mcls_application];
GRANT VIEW DEFINITION ON SCHEMA::[msme]      TO [mcls_application];
GRANT VIEW DEFINITION ON SCHEMA::[assess]    TO [mcls_application];
GRANT VIEW DEFINITION ON SCHEMA::[fee]       TO [mcls_application];
GRANT VIEW DEFINITION ON SCHEMA::[incentive] TO [mcls_application];
GRANT VIEW DEFINITION ON SCHEMA::[comm]      TO [mcls_application];
GRANT VIEW DEFINITION ON SCHEMA::[audit]     TO [mcls_application];
GO

/*--------------------------------------------------------- Read-only role ---*/
GRANT SELECT ON SCHEMA::[auth]  TO [mcls_readonly];
GRANT SELECT ON SCHEMA::[master]    TO [mcls_readonly];
GRANT SELECT ON SCHEMA::[msme]      TO [mcls_readonly];
GRANT SELECT ON SCHEMA::[assess]    TO [mcls_readonly];
GRANT SELECT ON SCHEMA::[fee]       TO [mcls_readonly];
GRANT SELECT ON SCHEMA::[incentive] TO [mcls_readonly];
GRANT SELECT ON SCHEMA::[comm]      TO [mcls_readonly];
GRANT SELECT ON SCHEMA::[audit]     TO [mcls_readonly];

/* Password hashes, security stamps and refresh tokens are never needed by a
   report and are denied outright. */
DENY SELECT ON auth.[User] (PasswordHash, SecurityStamp, ConcurrencyStamp) TO [mcls_readonly];
DENY SELECT ON auth.RefreshToken TO [mcls_readonly];
DENY SELECT ON auth.UserToken    TO [mcls_readonly];
GO

/*------------------------------------------------------- Role membership ---*/
ALTER ROLE [mcls_application] ADD MEMBER [mcls_app];
ALTER ROLE [mcls_readonly]    ADD MEMBER [mcls_reports];

/* The deployment login owns schema change; it is the only one that may run
   migrations. Keep its credentials out of the application's configuration. */
ALTER ROLE [db_ddladmin]     ADD MEMBER [mcls_deploy];
ALTER ROLE [db_datareader]   ADD MEMBER [mcls_deploy];
ALTER ROLE [db_datawriter]   ADD MEMBER [mcls_deploy];
GO

/*---------------------------------------------------------------------------
  Preferred alternative on a domain-joined Windows Server: drop the SQL logins
  above and map the IIS application-pool identity instead, so no password
  exists anywhere.

      CREATE LOGIN [DOMAIN\svc_mcls_api] FROM WINDOWS;
      CREATE USER  [DOMAIN\svc_mcls_api] FOR LOGIN [DOMAIN\svc_mcls_api];
      ALTER ROLE   [mcls_application] ADD MEMBER [DOMAIN\svc_mcls_api];

  The connection string then carries Integrated Security=true and holds no
  secret. deploy/ documents this path.
---------------------------------------------------------------------------*/

PRINT N'Database roles and grants applied.';
GO

/* ---------------------------------------------------------------------------
   An e-mail address no longer identifies an account.

   The system-generated UserCode is the identity — MCLS-MIN-000001 for a portal
   user, LEAN-UP-2026-00011 for an applicant — and it is what sign-in and the
   password reset key on. The unique index on NormalizedEmail is replaced by a
   plain one, which is what the lookups actually need.

   Why: a SPOC may register up to three plants from one mailbox, and a shared
   office address behind several staff accounts is ordinary. Holding the
   address unique made both impossible.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_User_NormalizedEmail')
BEGIN
    DROP INDEX UX_User_NormalizedEmail ON auth.[User];
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_User_NormalizedEmail')
BEGIN
    CREATE INDEX IX_User_NormalizedEmail ON auth.[User] (NormalizedEmail);
END
GO

/* UserCode was already unique in practice; this states it, since it is now the
   only thing that identifies an account. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_User_UserCode')
BEGIN
    CREATE UNIQUE INDEX UX_User_UserCode ON auth.[User] (UserCode) WHERE UserCode IS NOT NULL;
END
GO

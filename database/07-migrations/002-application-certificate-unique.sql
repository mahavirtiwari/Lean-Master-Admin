/*
    002 — Make the certificate-number uniqueness constraint ignore NULLs.
    ------------------------------------------------------------------------
    UQ_Application_Certificate was created as a plain UNIQUE constraint on
    msme.Application.CertificateNo.

    In SQL Server a UNIQUE constraint treats NULLs as equal to each other, so it
    permits exactly one. CertificateNo is NULL for every application that has
    not been certified yet — which is most of them — so the table could hold a
    single uncertified application and the second registration would fail with

        Violation of UNIQUE KEY constraint 'UQ_Application_Certificate'.
        The duplicate key value is (<NULL>).

    The intent was clearly "no two certificates share a number", not "only one
    application may be uncertified". A filtered unique index expresses that, and
    is the pattern already used by UX_Application_OpenPerLevel on this table.

    Idempotent: safe to run against a database that has already been migrated.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF EXISTS
(
    SELECT 1
    FROM sys.key_constraints
    WHERE name = 'UQ_Application_Certificate'
      AND parent_object_id = OBJECT_ID('msme.Application')
)
BEGIN
    PRINT 'Dropping UNIQUE constraint UQ_Application_Certificate...';
    ALTER TABLE msme.Application DROP CONSTRAINT UQ_Application_Certificate;
END;

IF NOT EXISTS
(
    SELECT 1
    FROM sys.indexes
    WHERE name = 'UX_Application_CertificateNo'
      AND object_id = OBJECT_ID('msme.Application')
)
BEGIN
    PRINT 'Creating filtered unique index UX_Application_CertificateNo...';
    CREATE UNIQUE NONCLUSTERED INDEX UX_Application_CertificateNo
        ON msme.Application (CertificateNo)
        WHERE CertificateNo IS NOT NULL;
END;

PRINT 'Migration 002 complete.';

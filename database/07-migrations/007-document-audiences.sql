/*
    007 — MSME Enterprise as a document audience.
    ------------------------------------------------------------------------
    The Upload Documents screens assign each document to ten audiences, the
    first of which is "MSME Enterprise". User Management shows nine account
    types, and its permission matrix nine rows plus Super Admin. Both are right:
    an MSME is somebody a document is published *to*, not an administrative
    account the Ministry issues and manages.

    So a flag is added rather than a tenth card. IsUserManaged marks the nine
    that User Management administers; MSME Enterprise is stored as an account
    type — the document audience table already keys on AccountTypeId — but is
    excluded from every user-management surface.

    Without the flag the tenth type would appear as a card on screen 2, a row on
    the permission matrix and a sub-menu item, none of which the design shows.

    Idempotent.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

IF COL_LENGTH('auth.AccountType', 'IsUserManaged') IS NULL
    ALTER TABLE auth.AccountType ADD IsUserManaged bit NOT NULL
        CONSTRAINT DF_AccountType_IsUserManaged DEFAULT (1);
GO

BEGIN TRANSACTION;

-- The nine the Ministry issues stay user-managed.
UPDATE auth.AccountType SET IsUserManaged = 1 WHERE AccountTypeId BETWEEN 1 AND 9;

IF NOT EXISTS (SELECT 1 FROM auth.AccountType WHERE Code = 'MSME_ENTERPRISE')
BEGIN
    INSERT INTO auth.AccountType
    (
        AccountTypeId, Code, Name, ShortName, IconKey, UserCodePrefix,
        Description, CanCreateDirectly, RequiresOrganisation, SortOrder,
        IsActive, IsUserManaged
    )
    VALUES
    (
        10, 'MSME_ENTERPRISE', N'MSME Enterprise', N'MSME Enterprise', 'factory', 'ENT',   -- UserCodePrefix is varchar(3)
        N'Registered MSMEs receiving scheme documents and guidance',
        0,      -- not issued from the portal's Create New User flow
        0,
        0,      -- first column of the document role matrix
        1,
        0       -- and therefore not a User Management account type
    );
END;

COMMIT TRANSACTION;
GO

SELECT AccountTypeId, Code, Name, SortOrder, IsUserManaged
FROM   auth.AccountType
ORDER  BY IsUserManaged DESC, SortOrder;

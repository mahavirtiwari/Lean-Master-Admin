/* ---------------------------------------------------------------------------
   The states and districts a State Specific officer covers.

   auth.[User] already carries StateId and DistrictId, but those are where the
   officer sits - one state, one district. The scheme also needs where they
   work, and that is a list: a nodal officer may cover three states outright
   and four named districts of a fourth.

   One row per grant, and a null district means the whole state rather than a
   row per district in it. That matters beyond tidiness: a state gains
   districts over time, and "all of Maharashtra" written as its 36 districts
   silently stops meaning all of Maharashtra the day a 37th is created.

   SQL Server treats nulls as equal in a unique index, so the index below
   allows exactly one whole-state row per state per user, alongside any number
   of named districts - and stops the same district being granted twice.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('auth.UserJurisdiction') IS NULL
BEGIN
    CREATE TABLE auth.UserJurisdiction (
        UserJurisdictionId int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_UserJurisdiction PRIMARY KEY,
        UserId       int      NOT NULL,
        StateId      smallint NOT NULL,
        /* Null means the whole state, present and future districts alike. */
        DistrictId   int      NULL,
        CreatedOnUtc datetime2(3) NOT NULL
            CONSTRAINT DF_UserJurisdiction_Created DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT FK_UserJurisdiction_User FOREIGN KEY (UserId)
            REFERENCES auth.[User] (Id) ON DELETE CASCADE,
        CONSTRAINT FK_UserJurisdiction_State FOREIGN KEY (StateId)
            REFERENCES master.State (StateId),
        CONSTRAINT FK_UserJurisdiction_District FOREIGN KEY (DistrictId)
            REFERENCES master.District (DistrictId)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_UserJurisdiction_Grant'
               AND object_id = OBJECT_ID('auth.UserJurisdiction'))
BEGIN
    CREATE UNIQUE INDEX UQ_UserJurisdiction_Grant
        ON auth.UserJurisdiction (UserId, StateId, DistrictId);
END
GO

/* Read whenever an officer's coverage is shown or checked. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_UserJurisdiction_User'
               AND object_id = OBJECT_ID('auth.UserJurisdiction'))
BEGIN
    CREATE INDEX IX_UserJurisdiction_User
        ON auth.UserJurisdiction (UserId)
        INCLUDE (StateId, DistrictId);
END
GO

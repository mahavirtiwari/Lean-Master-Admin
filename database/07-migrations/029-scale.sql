/* ---------------------------------------------------------------------------
   Two indexes the registration path needs at scale, and one it needs for the
   cleanup that keeps the table small.

   The scheme expects on the order of 50 lakh registrations, arriving at two to
   three thousand a day. At that size the difference between a seek and a scan
   is the difference between a registration completing and a registration timing
   out, so the queries that run on EVERY registration were checked one by one:

     - the plant check reads msme.Enterprise.RegisteredPlantIdNo — already
       covered by UX_Enterprise_RegisteredPlantIdNo (migration 025);
     - the SPOC three-use cap counts msme.Enterprise.ContactEmail — NOT covered,
       and therefore a full scan of the whole table per registration. That is
       what IX_Enterprise_ContactEmail below fixes;
     - the portal-account guard reads auth.[User].Email, which is not indexed
       either. Identity keeps NormalizedEmail beside it and indexes that, so the
       code now compares the normalised column rather than the raw one and no
       new index is needed.

   The third index is for housekeeping: abandoned drafts are found by status and
   age, and without it that sweep scans every registration ever made.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* Counted on every completed registration, to enforce the three-use cap on a
   SPOC address. Filtered: rows without an address can never match an equality
   test, so they are dead weight in the index.                                */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Enterprise_ContactEmail'
                                           AND object_id = OBJECT_ID('msme.Enterprise'))
BEGIN
    CREATE INDEX IX_Enterprise_ContactEmail
        ON msme.Enterprise (ContactEmail)
        WHERE ContactEmail IS NOT NULL;
END
GO

/* Drafts are swept by status and age. Without this, finding last month's
   abandoned registrations means reading every registration ever made.        */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Registration_Status_Started'
                                           AND object_id = OBJECT_ID('msme.Registration'))
BEGIN
    CREATE INDEX IX_Registration_Status_Started
        ON msme.Registration (Status, StartedOnUtc)
        INCLUDE (EnterpriseId);
END
GO

/* The applicant dashboard and the pledge download both find an enterprise by
   the account that owns it. IX_Enterprise_PrimaryUserId exists; this adds the
   columns those two screens read, so the lookup never leaves the index.      */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Enterprise_PrimaryUser_Cover'
                                           AND object_id = OBJECT_ID('msme.Enterprise'))
BEGIN
    CREATE INDEX IX_Enterprise_PrimaryUser_Cover
        ON msme.Enterprise (PrimaryUserId)
        INCLUDE (LeanId, Name, UdyamRegistrationNo, SelectedPlantId, RegisteredOnUtc, IsActive)
        WHERE PrimaryUserId IS NOT NULL;
END
GO

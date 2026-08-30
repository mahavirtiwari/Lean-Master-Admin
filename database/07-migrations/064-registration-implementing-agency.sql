/* ---------------------------------------------------------------------------
   The applicant names their Implementing Agency while registering.

   Until now an agency was attached to a case later, by an administrator
   registering the application. The applicant knows who they are working with
   from the start, so they say so on the registration form and the case belongs
   to that agency from the moment the enterprise exists.

   msme.Enterprise.ImplementingAgencyOrgId already exists (052). This adds the
   same to the draft, because the choice is made several steps before the
   enterprise is created and has to survive the applicant closing the tab.

   Visibility needs nothing new: ApplyVisibilityScope already narrows an
   agency's list to applications carrying its id, so an application that
   inherits the enterprise's agency is seen by that agency and no other.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('msme.Registration', 'ImplementingAgencyOrgId') IS NULL
BEGIN
    ALTER TABLE msme.Registration ADD ImplementingAgencyOrgId int NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Registration_ImplementingAgency')
BEGIN
    ALTER TABLE msme.Registration ADD CONSTRAINT FK_Registration_ImplementingAgency
        FOREIGN KEY (ImplementingAgencyOrgId) REFERENCES auth.Organisation (OrganisationId);
END
GO

/* An agency's own caseload is read by this, on every list it opens. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Enterprise_ImplementingAgency'
               AND object_id = OBJECT_ID('msme.Enterprise'))
BEGIN
    CREATE INDEX IX_Enterprise_ImplementingAgency
        ON msme.Enterprise (ImplementingAgencyOrgId)
        INCLUDE (Name, LeanId, UdyamRegistrationNo);
END
GO

/* ---------------------------------------------------------------------------
   Who owns an organisation, and therefore who may change it.

   052 added auth.Organisation.RaisedByOrganisationId for the bodies an
   Implementing Agency raises. The same column now carries the whole ownership
   chain, because the rule is the same shape everywhere:

     OEM / PSU / Association   raised by an Implementing Agency. Every agency
                               sees them all; only the one that raised a body
                               may edit, enable or disable it.
     Consultant Organisation   created by an Implementing Agency, and seen only
     Assessment Agency         by that agency.
     Consultants               created by their Consultant Organisation, seen by
                               it and by the agency that created it.
     Assessors                 the same, through their Assessment Agency.

   So a consultant's Implementing Agency is not stored on the consultant: it is
   the agency that raised the firm the consultant belongs to. One link, read
   twice, rather than a second one to keep in step.

   Existing Consultant Organisations and Assessment Agencies have no raising
   agency - they were seeded, not created by one - so they stay visible to the
   Super Admin and to nobody else until an agency is named against them.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* The visibility filters read this on every user list, in both directions:
   "organisations I raised" and "the agency that raised mine". */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Organisation_RaisedBy'
               AND object_id = OBJECT_ID('auth.Organisation'))
BEGIN
    CREATE INDEX IX_Organisation_RaisedBy
        ON auth.Organisation (RaisedByOrganisationId)
        INCLUDE (AccountTypeId, Name, ApprovalStatus, IsActive);
END
GO

/* A user's owning organisation is the other half of every one of those
   filters, and the list is filtered by account type at the same time. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_User_Organisation_AccountType'
               AND object_id = OBJECT_ID('auth.[User]'))
BEGIN
    CREATE INDEX IX_User_Organisation_AccountType
        ON auth.[User] (OrganisationId, AccountTypeId)
        WHERE IsDeleted = 0;
END
GO

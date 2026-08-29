/* ---------------------------------------------------------------------------
   Editable profile, and a record of what was changed.

   View Profile showed the enterprise and its SPOC and nothing else, and none of
   it could be edited. The deck (P01) also carries the awareness programme, the
   scheme associations, the selected plant and its activity, with Edit on the
   parts the applicant owns.

   Two things are added here:

     EnterpriseChangeLog  every edit an applicant makes to their own profile —
                          what changed, from what, to what, by whom and when.
                          Sector and NIC are owned by Udyam, so a change there
                          is a re-selection and worth being able to explain
                          later; the same is true of the SPOC, who receives the
                          scheme's mail.

     Association columns  implementing agency, industry association and the OEM
                          or PSU an enterprise supplies, which the artboard
                          shows and nothing yet stored.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('msme.Enterprise', 'ImplementingAgency') IS NULL
BEGIN
    ALTER TABLE msme.Enterprise ADD
        ImplementingAgency   nvarchar(150) NULL,
        IndustryAssociation  nvarchar(150) NULL,
        AssociationMemberId  nvarchar(60)  NULL,
        OemPsuName           nvarchar(150) NULL,
        VendorId             nvarchar(60)  NULL;
END
GO

IF OBJECT_ID('msme.EnterpriseChangeLog') IS NULL
BEGIN
    CREATE TABLE msme.EnterpriseChangeLog (
        EnterpriseChangeLogId int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_EnterpriseChangeLog PRIMARY KEY,
        EnterpriseId    int           NOT NULL,
        /* Spoc | Associations | Activity — the part of the profile that moved. */
        Section         varchar(40)   NOT NULL,
        /* The field within it, e.g. "NIC 5-digit" or "Email". */
        FieldName       nvarchar(80)  NOT NULL,
        OldValue        nvarchar(400) NULL,
        NewValue        nvarchar(400) NULL,
        ChangedByUserId int           NULL,
        ChangedOnUtc    datetime2(3)  NOT NULL
            CONSTRAINT DF_EnterpriseChangeLog_On DEFAULT (SYSUTCDATETIME()),
        CONSTRAINT FK_EnterpriseChangeLog_Enterprise FOREIGN KEY (EnterpriseId)
            REFERENCES msme.Enterprise (EnterpriseId)
    );

    /* Read newest-first for one enterprise, which is the only way it is read. */
    CREATE INDEX IX_EnterpriseChangeLog_Enterprise
        ON msme.EnterpriseChangeLog (EnterpriseId, ChangedOnUtc DESC);
END
GO

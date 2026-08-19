/*===========================================================================
  Schema: msme
  The enterprises applying to the scheme and the lifecycle of an application
  from registration through handholding to certification.

  Lifecycle, as the sidebar presents it:
      Handholding : Registered -> Payment Received -> In Progress -> Completed
      Assessments : Scheduled -> In Progress -> NC Raised -> Quality Check
                    -> Certified | Rejected
  Both live on one Application row; ApplicationStatus is the state machine and
  ApplicationStatusHistory is the ledger of every transition.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*----------------------------------------------------------- Enterprise
  A registered MSME unit. UdyamRegistrationNo is the government identifier and
  is the natural key, but a surrogate is used for foreign keys.               */
CREATE TABLE msme.Enterprise
(
    EnterpriseId        int             NOT NULL IDENTITY(1,1),
    UdyamRegistrationNo varchar(25)     NOT NULL,   -- UDYAM-MH-18-0001234
    Name                nvarchar(250)   NOT NULL,
    SectorId            smallint        NOT NULL,
    /* Drives the subsidy slab: GEN / WOM / SC / ST / NER / OPA. */
    SubsidyCategoryId   tinyint         NOT NULL,
    EnterpriseSize      varchar(10)     NOT NULL,   -- Micro / Small / Medium

    AddressLine         nvarchar(500)   NULL,
    StateId             smallint        NOT NULL,
    DistrictId          int             NULL,
    Pincode             char(6)         NULL,

    ContactPersonName   nvarchar(200)   NULL,
    ContactEmail        nvarchar(256)   NULL,
    ContactMobile       varchar(20)     NULL,
    Gstin               varchar(15)     NULL,
    Pan                 varchar(10)     NULL,

    /* The enterprise's own portal login, if one was issued. */
    PrimaryUserId       int             NULL,

    IsActive            bit             NOT NULL CONSTRAINT DF_Enterprise_Active DEFAULT (1),
    RegisteredOnUtc     datetime2(3)    NOT NULL CONSTRAINT DF_Enterprise_Reg DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId     int             NULL,
    ModifiedOnUtc       datetime2(3)    NULL,
    ModifiedByUserId    int             NULL,
    RowVersion          rowversion      NOT NULL,

    CONSTRAINT PK_Enterprise PRIMARY KEY CLUSTERED (EnterpriseId),
    CONSTRAINT UQ_Enterprise_Udyam UNIQUE (UdyamRegistrationNo),
    CONSTRAINT FK_Enterprise_Sector   FOREIGN KEY (SectorId)   REFERENCES master.Sector(SectorId),
    CONSTRAINT FK_Enterprise_State    FOREIGN KEY (StateId)    REFERENCES master.State(StateId),
    CONSTRAINT FK_Enterprise_District FOREIGN KEY (DistrictId) REFERENCES master.District(DistrictId),
    CONSTRAINT FK_Enterprise_User     FOREIGN KEY (PrimaryUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_Enterprise_Size CHECK (EnterpriseSize IN ('Micro','Small','Medium')),
    CONSTRAINT CK_Enterprise_Pan  CHECK (Pan IS NULL OR Pan LIKE '[A-Z][A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9][A-Z]')
);
CREATE INDEX IX_Enterprise_Sector ON msme.Enterprise (SectorId)  INCLUDE (Name, StateId) WHERE IsActive = 1;
CREATE INDEX IX_Enterprise_State  ON msme.Enterprise (StateId, DistrictId) WHERE IsActive = 1;
CREATE INDEX IX_Enterprise_Name   ON msme.Enterprise (Name);
GO

/*----------------------------------------------------- CertificationLevel
  Bronze / Silver / Gold. Fee amounts are versioned separately in fee.FeeRate
  because they change by notification; this table is the stable auth.     */
CREATE TABLE msme.CertificationLevel
(
    CertificationLevelId tinyint    NOT NULL,
    Code            varchar(10)     NOT NULL,   -- BRONZE / SILVER / GOLD
    Name            nvarchar(40)    NOT NULL,
    SortOrder       tinyint         NOT NULL,
    /* Bronze is self-declared; Silver and Gold need an accredited assessment. */
    RequiresAssessment bit          NOT NULL CONSTRAINT DF_CertLevel_Assess DEFAULT (1),
    IsActive        bit             NOT NULL CONSTRAINT DF_CertLevel_Active DEFAULT (1),
    CONSTRAINT PK_CertificationLevel PRIMARY KEY CLUSTERED (CertificationLevelId),
    CONSTRAINT UQ_CertificationLevel_Code UNIQUE (Code)
);
GO

/*------------------------------------------------------ ApplicationStatus
  The state machine. Stage groups the statuses under the two sidebar sections
  so a list screen filters on Stage rather than enumerating status ids.       */
CREATE TABLE msme.ApplicationStatus
(
    ApplicationStatusId tinyint     NOT NULL,
    Code            varchar(30)     NOT NULL,
    Name            nvarchar(60)    NOT NULL,
    Stage           varchar(20)     NOT NULL,   -- Handholding / Assessment / Closed
    SortOrder       tinyint         NOT NULL,
    BadgeColour     varchar(9)      NULL,
    IsTerminal      bit             NOT NULL CONSTRAINT DF_AppStatus_Terminal DEFAULT (0),
    CONSTRAINT PK_ApplicationStatus PRIMARY KEY CLUSTERED (ApplicationStatusId),
    CONSTRAINT UQ_ApplicationStatus_Code UNIQUE (Code),
    CONSTRAINT CK_AppStatus_Stage CHECK (Stage IN ('Handholding','Assessment','Closed'))
);
GO

/*----------------------------------------------- ApplicationStatusTransition
  The legal moves, as data. The API refuses any transition not listed here,
  so the workflow can be corrected without redeploying.                       */
CREATE TABLE msme.ApplicationStatusTransition
(
    FromStatusId    tinyint     NOT NULL,
    ToStatusId      tinyint     NOT NULL,
    /* Which module right the actor needs to perform this move. */
    RequiredPermissionId smallint NULL,
    RequiresRemark  bit         NOT NULL CONSTRAINT DF_AppTrans_Remark DEFAULT (0),
    CONSTRAINT PK_ApplicationStatusTransition PRIMARY KEY CLUSTERED (FromStatusId, ToStatusId),
    CONSTRAINT FK_AppTrans_From FOREIGN KEY (FromStatusId) REFERENCES msme.ApplicationStatus(ApplicationStatusId),
    CONSTRAINT FK_AppTrans_To   FOREIGN KEY (ToStatusId)   REFERENCES msme.ApplicationStatus(ApplicationStatusId),
    CONSTRAINT FK_AppTrans_Perm FOREIGN KEY (RequiredPermissionId) REFERENCES auth.Permission(PermissionId),
    CONSTRAINT CK_AppTrans_NotSelf CHECK (FromStatusId <> ToStatusId)
);
GO

/*----------------------------------------------------------------- Application
  One enterprise's pursuit of one certification level.                        */
CREATE TABLE msme.Application
(
    ApplicationId       int             NOT NULL IDENTITY(1,1),
    ApplicationNo       varchar(25)     NOT NULL,   -- MCLS/2026/000148
    EnterpriseId        int             NOT NULL,
    CertificationLevelId tinyint        NOT NULL,
    ApplicationStatusId tinyint         NOT NULL,

    /* Delivery assignment. All nullable: they are filled in as the
       application moves through the pipeline, not at registration. */
    ImplementingAgencyId int            NULL,   -- auth.Organisation
    ConsultantOrgId     int             NULL,   -- auth.Organisation
    ConsultantUserId    int             NULL,   -- auth.User
    AssessmentAgencyId  int             NULL,   -- auth.Organisation

    RegisteredOnUtc     datetime2(3)    NOT NULL CONSTRAINT DF_App_Registered DEFAULT (SYSUTCDATETIME()),
    PaymentReceivedOnUtc datetime2(3)   NULL,
    HandholdingStartedOnUtc datetime2(3) NULL,
    HandholdingCompletedOnUtc datetime2(3) NULL,
    CertifiedOnUtc      datetime2(3)    NULL,
    CertificateNo       varchar(40)     NULL,
    CertificateValidTillUtc datetime2(3) NULL,
    RejectedOnUtc       datetime2(3)    NULL,
    RejectionReason     nvarchar(1000)  NULL,

    /* Denormalised for the dashboard tiles and list screens, which otherwise
       aggregate assess.AssessmentResponse on every page load. Maintained by
       assess.usp_Assessment_Finalise, not by the application layer. */
    LatestScore         decimal(5,2)    NULL,

    Remarks             nvarchar(2000)  NULL,
    CreatedByUserId     int             NULL,
    ModifiedOnUtc       datetime2(3)    NULL,
    ModifiedByUserId    int             NULL,
    RowVersion          rowversion      NOT NULL,

    CONSTRAINT PK_Application PRIMARY KEY CLUSTERED (ApplicationId),
    CONSTRAINT UQ_Application_No UNIQUE (ApplicationNo),
    CONSTRAINT UQ_Application_Certificate UNIQUE (CertificateNo),
    CONSTRAINT FK_App_Enterprise FOREIGN KEY (EnterpriseId)         REFERENCES msme.Enterprise(EnterpriseId),
    CONSTRAINT FK_App_Level      FOREIGN KEY (CertificationLevelId) REFERENCES msme.CertificationLevel(CertificationLevelId),
    CONSTRAINT FK_App_Status     FOREIGN KEY (ApplicationStatusId)  REFERENCES msme.ApplicationStatus(ApplicationStatusId),
    CONSTRAINT FK_App_IA         FOREIGN KEY (ImplementingAgencyId) REFERENCES auth.Organisation(OrganisationId),
    CONSTRAINT FK_App_ConsultOrg FOREIGN KEY (ConsultantOrgId)      REFERENCES auth.Organisation(OrganisationId),
    CONSTRAINT FK_App_Consultant FOREIGN KEY (ConsultantUserId)     REFERENCES auth.[User](Id),
    CONSTRAINT FK_App_Agency     FOREIGN KEY (AssessmentAgencyId)   REFERENCES auth.Organisation(OrganisationId),
    CONSTRAINT CK_App_Score CHECK (LatestScore IS NULL OR LatestScore BETWEEN 0 AND 100),
    /* A rejection must say why. */
    CONSTRAINT CK_App_Rejection CHECK (RejectedOnUtc IS NULL OR RejectionReason IS NOT NULL)
);

/* An enterprise may hold only one open application per level; historic
   closed ones are unconstrained so a unit can re-apply after rejection. */
CREATE UNIQUE INDEX UX_Application_OpenPerLevel
    ON msme.Application (EnterpriseId, CertificationLevelId)
    WHERE RejectedOnUtc IS NULL AND CertifiedOnUtc IS NULL;

/* The list screens all filter on status and page by registration date. */
CREATE INDEX IX_Application_Status ON msme.Application (ApplicationStatusId, RegisteredOnUtc DESC)
    INCLUDE (ApplicationNo, EnterpriseId, CertificationLevelId, ImplementingAgencyId);
CREATE INDEX IX_Application_Enterprise ON msme.Application (EnterpriseId);
CREATE INDEX IX_Application_IA         ON msme.Application (ImplementingAgencyId, ApplicationStatusId) WHERE ImplementingAgencyId IS NOT NULL;
CREATE INDEX IX_Application_Consultant ON msme.Application (ConsultantUserId, ApplicationStatusId)     WHERE ConsultantUserId IS NOT NULL;
CREATE INDEX IX_Application_Agency     ON msme.Application (AssessmentAgencyId, ApplicationStatusId)   WHERE AssessmentAgencyId IS NOT NULL;
GO

/*------------------------------------------------- ApplicationStatusHistory */
CREATE TABLE msme.ApplicationStatusHistory
(
    ApplicationStatusHistoryId bigint   NOT NULL IDENTITY(1,1),
    ApplicationId   int             NOT NULL,
    FromStatusId    tinyint         NULL,
    ToStatusId      tinyint         NOT NULL,
    Remark          nvarchar(1000)  NULL,
    ChangedByUserId int             NOT NULL,
    ChangedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_ASH_On DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_ApplicationStatusHistory PRIMARY KEY CLUSTERED (ApplicationStatusHistoryId),
    CONSTRAINT FK_ASH_Application FOREIGN KEY (ApplicationId) REFERENCES msme.Application(ApplicationId) ON DELETE CASCADE,
    CONSTRAINT FK_ASH_From FOREIGN KEY (FromStatusId) REFERENCES msme.ApplicationStatus(ApplicationStatusId),
    CONSTRAINT FK_ASH_To   FOREIGN KEY (ToStatusId)   REFERENCES msme.ApplicationStatus(ApplicationStatusId),
    CONSTRAINT FK_ASH_User FOREIGN KEY (ChangedByUserId) REFERENCES auth.[User](Id)
);
CREATE INDEX IX_ASH_Application ON msme.ApplicationStatusHistory (ApplicationId, ChangedOnUtc DESC);
GO

/*--------------------------------------------------------- HandholdingActivity
  Consultant visits and interventions recorded against an application while it
  sits in the Handholding stage.                                              */
CREATE TABLE msme.HandholdingActivity
(
    HandholdingActivityId bigint    NOT NULL IDENTITY(1,1),
    ApplicationId   int             NOT NULL,
    ParameterId     smallint        NULL,       -- which LEAN parameter was worked on
    TechnologyId    smallint        NULL,       -- technology recommended, if any
    ActivityDate    date            NOT NULL,
    ActivityType    varchar(30)     NOT NULL,   -- Visit / Training / Review / Submission
    Title           nvarchar(250)   NOT NULL,
    Notes           nvarchar(2000)  NULL,
    ConsultantUserId int            NOT NULL,
    DurationHours   decimal(5,2)    NULL,
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_HHA_Created DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_HandholdingActivity PRIMARY KEY CLUSTERED (HandholdingActivityId),
    CONSTRAINT FK_HHA_Application FOREIGN KEY (ApplicationId)    REFERENCES msme.Application(ApplicationId) ON DELETE CASCADE,
    CONSTRAINT FK_HHA_Parameter   FOREIGN KEY (ParameterId)      REFERENCES master.Parameter(ParameterId),
    CONSTRAINT FK_HHA_Technology  FOREIGN KEY (TechnologyId)     REFERENCES master.Technology(TechnologyId),
    CONSTRAINT FK_HHA_Consultant  FOREIGN KEY (ConsultantUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_HHA_Type CHECK (ActivityType IN ('Visit','Training','Review','Submission','Other'))
);
CREATE INDEX IX_HHA_Application ON msme.HandholdingActivity (ApplicationId, ActivityDate DESC);
GO

PRINT N'Schema [msme] created.';
GO

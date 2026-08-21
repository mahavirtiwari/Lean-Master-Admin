/* ---------------------------------------------------------------------------
   Incentives, as the artboards draw them.

   Three things the existing tables do not carry:

   1. A category. The overview screen leads with five boxes — Technology
      Upgradation, Testing & Product Certification, State Specific Benefits,
      Financial Institution Benefits, Others — and the same five boxes are what
      an MSME sees on its dashboard, visible from the start and locked until a
      Silver or Gold certificate unlocks them. The provider (who funds it) and
      the category (what it is for) are different questions, so they are
      different columns: a state government funds technology upgradation as
      readily as the Ministry does.

   2. The fields each provider's form asks for beyond the shared ones — a
      budget head for a central scheme, a gazette number for a state one, a
      rate concession for a bank product, an external id for anyone else. They
      are nullable columns on the one table rather than four side tables: an
      incentive is one row whichever form created it, and the alternative is
      four joins to read a list that shows the same six columns for all of them.

   3. The material attached to an incentive — a guidelines PDF, a portal link,
      a video walkthrough. That is a list per incentive, so it is its own table.

   Activation deserves a note. CertificationLevelId already said which level
   unlocks an incentive, but the forms offer Silver, Gold, or both, and a
   nullable level column cannot tell "both" from "not set". ActivationLevel
   carries the answer; the level id stays in step for the single-level cases and
   is null for Both, which is now unambiguous.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- ------------------------------------------------------------- category ---
IF OBJECT_ID('incentive.Category', 'U') IS NULL
BEGIN
    CREATE TABLE incentive.Category
    (
        CategoryId      tinyint        NOT NULL IDENTITY(1,1),
        Code            varchar(30)    NOT NULL,
        Name            nvarchar(200)  NOT NULL,
        Description     nvarchar(500)  NULL,

        /* The typical funders shown under the card's title on the overview,
           e.g. "SIDBI, NABARD, State Govts". Free text: it is a caption, not a
           relationship — the actual funder of each incentive is its provider. */
        TypicalPartners nvarchar(300)  NULL,

        /* The accent the artboards run down the left edge of each card, kept
           with the row so the five cards stay in the same colours everywhere
           they are drawn — admin overview and MSME dashboard alike. */
        AccentHex       char(7)        NOT NULL CONSTRAINT DF_IncCategory_Accent DEFAULT '#5D6B62',

        SortOrder       tinyint        NOT NULL CONSTRAINT DF_IncCategory_Sort DEFAULT 0,
        IsActive        bit            NOT NULL CONSTRAINT DF_IncCategory_Active DEFAULT 1,

        CONSTRAINT PK_IncentiveCategory PRIMARY KEY (CategoryId),
        CONSTRAINT UQ_IncentiveCategory_Code UNIQUE (Code)
    );
END
GO

IF NOT EXISTS (SELECT 1 FROM incentive.Category)
BEGIN
    INSERT INTO incentive.Category (Code, Name, Description, TypicalPartners, AccentHex, SortOrder)
    VALUES
        ('TECH_UPGRAD', N'Financial Support for Technology Upgradation',
         N'Capital subsidy, credit-linked support and plant modernisation assistance.',
         N'SIDBI, NABARD, State Govts', '#1B4F8A', 1),
        ('TESTING_CERT', N'Financial Support for Testing & Product Certification',
         N'Reimbursement of testing, calibration and product certification charges.',
         N'BIS, QCI, NABL', '#0F7B45', 2),
        ('STATE_BENEFIT', N'State Specific Benefits',
         N'Benefits notified by a State or UT for units certified under the scheme.',
         N'State MSME Departments', '#1B4F8A', 3),
        ('FI_BENEFIT', N'Financial Institution Benefits',
         N'Concessional rates, processing fee waivers and priority credit lines.',
         N'SBI, PNB, Bank of Baroda', '#A16207', 4),
        ('OTHERS', N'Others',
         N'Support offered by agencies outside the categories above.',
         N'Various Stakeholders', '#5D6B62', 5);
END
GO

-- ------------------------------------------------- incentive: new columns ---
IF COL_LENGTH('incentive.Incentive', 'CategoryId') IS NULL
    ALTER TABLE incentive.Incentive ADD CategoryId tinyint NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Incentive_Category')
    ALTER TABLE incentive.Incentive
        ADD CONSTRAINT FK_Incentive_Category FOREIGN KEY (CategoryId)
            REFERENCES incentive.Category (CategoryId);
GO

IF COL_LENGTH('incentive.Incentive', 'SchemeCode') IS NULL
    ALTER TABLE incentive.Incentive ADD SchemeCode varchar(40) NULL;
GO

IF COL_LENGTH('incentive.Incentive', 'ActivationLevel') IS NULL
    ALTER TABLE incentive.Incentive ADD ActivationLevel varchar(10) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Incentive_ActivationLevel')
    ALTER TABLE incentive.Incentive
        ADD CONSTRAINT CK_Incentive_ActivationLevel
            CHECK (ActivationLevel IS NULL OR ActivationLevel IN ('Silver', 'Gold', 'Both'));
GO

IF COL_LENGTH('incentive.Incentive', 'VideoUrl') IS NULL
    ALTER TABLE incentive.Incentive ADD VideoUrl nvarchar(1000) NULL;
GO

/* Ministry */
IF COL_LENGTH('incentive.Incentive', 'BudgetHead') IS NULL
    ALTER TABLE incentive.Incentive ADD BudgetHead nvarchar(200) NULL;
GO

/* State government */
IF COL_LENGTH('incentive.Incentive', 'GazetteNo') IS NULL
    ALTER TABLE incentive.Incentive ADD GazetteNo varchar(80) NULL;
GO

/* Financial institutions */
IF COL_LENGTH('incentive.Incentive', 'ProductType') IS NULL
    ALTER TABLE incentive.Incentive ADD ProductType nvarchar(120) NULL;
GO

IF COL_LENGTH('incentive.Incentive', 'RateConcessionBps') IS NULL
    ALTER TABLE incentive.Incentive ADD RateConcessionBps int NULL;
GO

/* Others */
IF COL_LENGTH('incentive.Incentive', 'AgencyType') IS NULL
    ALTER TABLE incentive.Incentive ADD AgencyType nvarchar(80) NULL;
GO

IF COL_LENGTH('incentive.Incentive', 'ExternalSchemeId') IS NULL
    ALTER TABLE incentive.Incentive ADD ExternalSchemeId varchar(80) NULL;
GO

/* Nodal contact — every form asks for one, and it is who an MSME rings. */
IF COL_LENGTH('incentive.Incentive', 'ContactName') IS NULL
    ALTER TABLE incentive.Incentive ADD ContactName nvarchar(160) NULL;
GO

IF COL_LENGTH('incentive.Incentive', 'ContactDesignation') IS NULL
    ALTER TABLE incentive.Incentive ADD ContactDesignation nvarchar(160) NULL;
GO

IF COL_LENGTH('incentive.Incentive', 'ContactMobile') IS NULL
    ALTER TABLE incentive.Incentive ADD ContactMobile varchar(15) NULL;
GO

IF COL_LENGTH('incentive.Incentive', 'ContactEmail') IS NULL
    ALTER TABLE incentive.Incentive ADD ContactEmail nvarchar(256) NULL;
GO

/* Publication switches from the form's right-hand column. Visible-before-unlock
   defaults on because that is the rule the banner states: the boxes are seen
   from the start and only the benefit is locked. */
IF COL_LENGTH('incentive.Incentive', 'VisibleBeforeUnlock') IS NULL
    ALTER TABLE incentive.Incentive
        ADD VisibleBeforeUnlock bit NOT NULL CONSTRAINT DF_Incentive_VisibleBefore DEFAULT 1;
GO

IF COL_LENGTH('incentive.Incentive', 'NotifyOnPublish') IS NULL
    ALTER TABLE incentive.Incentive
        ADD NotifyOnPublish bit NOT NULL CONSTRAINT DF_Incentive_Notify DEFAULT 0;
GO

IF COL_LENGTH('incentive.Incentive', 'RequireClaimDocument') IS NULL
    ALTER TABLE incentive.Incentive
        ADD RequireClaimDocument bit NOT NULL CONSTRAINT DF_Incentive_ClaimDoc DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Incentive_Category'
                                           AND object_id = OBJECT_ID('incentive.Incentive'))
    CREATE INDEX IX_Incentive_Category ON incentive.Incentive (CategoryId, Status);
GO

-- ------------------------------------------------------------ resources ---
IF OBJECT_ID('incentive.IncentiveResource', 'U') IS NULL
BEGIN
    CREATE TABLE incentive.IncentiveResource
    (
        ResourceId    int            NOT NULL IDENTITY(1,1),
        IncentiveId   int            NOT NULL,

        /* Video, Link or Document — what the reader is being handed. */
        Kind          varchar(12)    NOT NULL,
        Title         nvarchar(300)  NOT NULL,

        /* Set for Video and Link. */
        Url           nvarchar(1000) NULL,

        /* Set for Document: the stored file, its original name and size, so a
           listing can be drawn without touching storage. */
        StoragePath   nvarchar(400)  NULL,
        FileName      nvarchar(260)  NULL,
        SizeBytes     bigint         NULL,

        SortOrder     tinyint        NOT NULL CONSTRAINT DF_IncResource_Sort DEFAULT 0,
        CreatedOnUtc  datetime2(7)   NOT NULL CONSTRAINT DF_IncResource_Created DEFAULT SYSUTCDATETIME(),
        CreatedByUserId int          NULL,

        CONSTRAINT PK_IncentiveResource PRIMARY KEY (ResourceId),
        CONSTRAINT FK_IncResource_Incentive FOREIGN KEY (IncentiveId)
            REFERENCES incentive.Incentive (IncentiveId) ON DELETE CASCADE,
        CONSTRAINT CK_IncResource_Kind CHECK (Kind IN ('Video', 'Link', 'Document')),

        /* A video or link needs an address; a document needs a file. Neither
           can be half-entered. */
        CONSTRAINT CK_IncResource_Target CHECK
        (
            (Kind IN ('Video', 'Link') AND Url IS NOT NULL)
            OR (Kind = 'Document' AND StoragePath IS NOT NULL)
        )
    );

    CREATE INDEX IX_IncResource_Incentive ON incentive.IncentiveResource (IncentiveId, SortOrder);
END
GO

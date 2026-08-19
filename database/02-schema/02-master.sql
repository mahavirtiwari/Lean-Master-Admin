/*===========================================================================
  Schema: master
  Reference data the rest of the portal reads: geography, NIC sectors, LEAN
  parameters, the technology master and the shared document library.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*------------------------------------------------------- Lookup (generic)
  Small, admin-editable dropdown lists that do not deserve a table each:
  agency category, designation suggestions, evidence types, KPI units.       */
CREATE TABLE master.LookupType
(
    LookupTypeId    smallint        NOT NULL IDENTITY(1,1),
    Code            varchar(50)     NOT NULL,
    Name            nvarchar(120)   NOT NULL,
    IsSystem        bit             NOT NULL CONSTRAINT DF_LookupType_Sys DEFAULT (0),
    CONSTRAINT PK_LookupType PRIMARY KEY CLUSTERED (LookupTypeId),
    CONSTRAINT UQ_LookupType_Code UNIQUE (Code)
);

CREATE TABLE master.LookupValue
(
    LookupValueId   int             NOT NULL IDENTITY(1,1),
    LookupTypeId    smallint        NOT NULL,
    Code            varchar(50)     NOT NULL,
    Name            nvarchar(200)   NOT NULL,
    SortOrder       smallint        NOT NULL CONSTRAINT DF_LookupValue_Sort DEFAULT (0),
    IsActive        bit             NOT NULL CONSTRAINT DF_LookupValue_Active DEFAULT (1),
    CONSTRAINT PK_LookupValue PRIMARY KEY CLUSTERED (LookupValueId),
    CONSTRAINT UQ_LookupValue UNIQUE (LookupTypeId, Code),
    CONSTRAINT FK_LookupValue_Type FOREIGN KEY (LookupTypeId) REFERENCES master.LookupType(LookupTypeId)
);
CREATE INDEX IX_LookupValue_Type ON master.LookupValue (LookupTypeId, SortOrder) WHERE IsActive = 1;
GO

ALTER TABLE auth.Organisation
    ADD CONSTRAINT FK_Org_Category FOREIGN KEY (CategoryLookupId) REFERENCES master.LookupValue(LookupValueId);
GO

/*----------------------------------------------------------- State / District */
CREATE TABLE master.State
(
    StateId     smallint        NOT NULL IDENTITY(1,1),
    Code        varchar(5)      NOT NULL,   -- MH, GJ, TN ...
    Name        nvarchar(100)   NOT NULL,
    IsUnionTerritory bit        NOT NULL CONSTRAINT DF_State_UT DEFAULT (0),
    /* North Eastern Region states attract the extra 5% subsidy slab, so the
       flag lives here rather than in a hard-coded list in the fee code. */
    IsNorthEastern   bit        NOT NULL CONSTRAINT DF_State_NER DEFAULT (0),
    IsActive    bit             NOT NULL CONSTRAINT DF_State_Active DEFAULT (1),
    CONSTRAINT PK_State PRIMARY KEY CLUSTERED (StateId),
    CONSTRAINT UQ_State_Code UNIQUE (Code),
    CONSTRAINT UQ_State_Name UNIQUE (Name)
);

CREATE TABLE master.District
(
    DistrictId  int             NOT NULL IDENTITY(1,1),
    StateId     smallint        NOT NULL,
    Code        varchar(10)     NULL,
    Name        nvarchar(120)   NOT NULL,
    IsActive    bit             NOT NULL CONSTRAINT DF_District_Active DEFAULT (1),
    CONSTRAINT PK_District PRIMARY KEY CLUSTERED (DistrictId),
    CONSTRAINT UQ_District UNIQUE (StateId, Name),
    CONSTRAINT FK_District_State FOREIGN KEY (StateId) REFERENCES master.State(StateId)
);
CREATE INDEX IX_District_State ON master.District (StateId) WHERE IsActive = 1;
GO

ALTER TABLE auth.Organisation
    ADD CONSTRAINT FK_Org_State    FOREIGN KEY (StateId)    REFERENCES master.State(StateId),
        CONSTRAINT FK_Org_District FOREIGN KEY (DistrictId) REFERENCES master.District(DistrictId);
ALTER TABLE auth.[User]
    ADD CONSTRAINT FK_User_State    FOREIGN KEY (StateId)    REFERENCES master.State(StateId),
        CONSTRAINT FK_User_District FOREIGN KEY (DistrictId) REFERENCES master.District(DistrictId);
GO

/*--------------------------------------------------------------------- Sector
  NIC two-digit divisions. The enterprise count shown on the Sectors screen is
  derived from msme.Enterprise, never stored, so it cannot drift.             */
CREATE TABLE master.Sector
(
    SectorId        smallint        NOT NULL IDENTITY(1,1),
    NicCode         varchar(5)      NOT NULL,   -- '10', '13', '20'
    Name            nvarchar(250)   NOT NULL,
    Description     nvarchar(1000)  NULL,
    IsActive        bit             NOT NULL CONSTRAINT DF_Sector_Active DEFAULT (1),
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_Sector_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NULL,
    ModifiedOnUtc   datetime2(3)    NULL,
    ModifiedByUserId int            NULL,
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_Sector PRIMARY KEY CLUSTERED (SectorId),
    CONSTRAINT UQ_Sector_NicCode UNIQUE (NicCode)
);
CREATE INDEX IX_Sector_Active ON master.Sector (IsActive, NicCode) INCLUDE (Name);
GO

/*------------------------------------------------------------------ Parameter
  The LEAN parameters (LP-01 5S, LP-02 Visual Management ...). Questionnaire
  requirements hang off these.                                                */
CREATE TABLE master.Parameter
(
    ParameterId     smallint        NOT NULL IDENTITY(1,1),
    Code            varchar(10)     NOT NULL,   -- LP-01
    Name            nvarchar(250)   NOT NULL,
    Description     nvarchar(1000)  NULL,
    SortOrder       smallint        NOT NULL CONSTRAINT DF_Parameter_Sort DEFAULT (0),
    IsActive        bit             NOT NULL CONSTRAINT DF_Parameter_Active DEFAULT (1),
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_Parameter_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NULL,
    ModifiedOnUtc   datetime2(3)    NULL,
    ModifiedByUserId int            NULL,
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_Parameter PRIMARY KEY CLUSTERED (ParameterId),
    CONSTRAINT UQ_Parameter_Code UNIQUE (Code)
);
GO

/*----------------------------------------------------------- SectorParameter
  Which parameters apply to a sector. A parameter with no rows here is treated
  as applying to every sector.                                                */
CREATE TABLE master.SectorParameter
(
    SectorId    smallint    NOT NULL,
    ParameterId smallint    NOT NULL,
    IsMandatory bit         NOT NULL CONSTRAINT DF_SectorParam_Mand DEFAULT (1),
    CONSTRAINT PK_SectorParameter PRIMARY KEY CLUSTERED (SectorId, ParameterId),
    CONSTRAINT FK_SectorParam_Sector FOREIGN KEY (SectorId)    REFERENCES master.Sector(SectorId)    ON DELETE CASCADE,
    CONSTRAINT FK_SectorParam_Param  FOREIGN KEY (ParameterId) REFERENCES master.Parameter(ParameterId) ON DELETE CASCADE
);
GO

/*--------------------------------------------------- Technology Upgradation
  Master read by Handholding, Assessments, Incentives and Reports.            */
CREATE TABLE master.TechnologyCategory
(
    TechnologyCategoryId smallint   NOT NULL IDENTITY(1,1),
    Name        nvarchar(120)   NOT NULL,
    SortOrder   smallint        NOT NULL CONSTRAINT DF_TechCat_Sort DEFAULT (0),
    IsActive    bit             NOT NULL CONSTRAINT DF_TechCat_Active DEFAULT (1),
    CONSTRAINT PK_TechnologyCategory PRIMARY KEY CLUSTERED (TechnologyCategoryId),
    CONSTRAINT UQ_TechnologyCategory_Name UNIQUE (Name)
);

CREATE TABLE master.Technology
(
    TechnologyId    smallint        NOT NULL IDENTITY(1,1),
    Code            varchar(10)     NOT NULL,   -- TU-01
    Name            nvarchar(250)   NOT NULL,
    Description     nvarchar(1000)  NULL,
    TechnologyCategoryId smallint   NOT NULL,
    /* NULL SectorId means the technology applies to every sector — the
       "All Sectors" row on the Technology Upgradation screen. */
    SectorId        smallint        NULL,
    IsActive        bit             NOT NULL CONSTRAINT DF_Tech_Active DEFAULT (1),
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_Tech_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NULL,
    ModifiedOnUtc   datetime2(3)    NULL,
    ModifiedByUserId int            NULL,
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_Technology PRIMARY KEY CLUSTERED (TechnologyId),
    CONSTRAINT UQ_Technology_Code UNIQUE (Code),
    CONSTRAINT FK_Tech_Category FOREIGN KEY (TechnologyCategoryId) REFERENCES master.TechnologyCategory(TechnologyCategoryId),
    CONSTRAINT FK_Tech_Sector   FOREIGN KEY (SectorId)             REFERENCES master.Sector(SectorId)
);
CREATE INDEX IX_Technology_Category ON master.Technology (TechnologyCategoryId, IsActive);
GO

/*------------------------------------------------------------ Document library
  Upload Documents: a document has versions, and each document is assignable
  to any set of the ten portal roles.                                         */
CREATE TABLE master.Document
(
    DocumentId      int             NOT NULL IDENTITY(1,1),
    Title           nvarchar(250)   NOT NULL,
    Description     nvarchar(1000)  NULL,
    CategoryLookupId int            NULL,
    CurrentVersionId int            NULL,       -- set after the first version lands
    IsActive        bit             NOT NULL CONSTRAINT DF_Document_Active DEFAULT (1),
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_Document_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NOT NULL,
    ModifiedOnUtc   datetime2(3)    NULL,
    ModifiedByUserId int            NULL,
    IsDeleted       bit             NOT NULL CONSTRAINT DF_Document_Deleted DEFAULT (0),
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_Document PRIMARY KEY CLUSTERED (DocumentId),
    CONSTRAINT FK_Document_Category FOREIGN KEY (CategoryLookupId) REFERENCES master.LookupValue(LookupValueId),
    CONSTRAINT FK_Document_CreatedBy FOREIGN KEY (CreatedByUserId) REFERENCES auth.[User](Id)
);
CREATE INDEX IX_Document_Active ON master.Document (IsActive, Title) WHERE IsDeleted = 0;
GO

/*  Files are stored on disk (or a UNC share) and referenced here, not held as
    BLOBs: it keeps the database small enough for fast restores and lets IIS
    stream the download. StoredFileName is a GUID so an uploaded name can never
    escape the upload folder.                                                  */
CREATE TABLE master.DocumentVersion
(
    DocumentVersionId int           NOT NULL IDENTITY(1,1),
    DocumentId      int             NOT NULL,
    VersionLabel    varchar(20)     NOT NULL,   -- 'v3.2'
    OriginalFileName nvarchar(260)  NOT NULL,
    StoredFileName  varchar(80)     NOT NULL,   -- '9f2c…-a11e.pdf'
    RelativePath    varchar(300)    NOT NULL,
    ContentType     varchar(150)    NOT NULL,
    FileSizeBytes   bigint          NOT NULL,
    Sha256Hash      binary(32)      NULL,
    IsLive          bit             NOT NULL CONSTRAINT DF_DocVersion_Live DEFAULT (0),
    UploadedByUserId int            NOT NULL,
    UploadedOnUtc   datetime2(3)    NOT NULL CONSTRAINT DF_DocVersion_On DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_DocumentVersion PRIMARY KEY CLUSTERED (DocumentVersionId),
    CONSTRAINT UQ_DocumentVersion UNIQUE (DocumentId, VersionLabel),
    CONSTRAINT UQ_DocumentVersion_Stored UNIQUE (StoredFileName),
    CONSTRAINT FK_DocVersion_Document FOREIGN KEY (DocumentId) REFERENCES master.Document(DocumentId) ON DELETE CASCADE,
    CONSTRAINT FK_DocVersion_User FOREIGN KEY (UploadedByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_DocVersion_Size CHECK (FileSizeBytes > 0)
);
/* Exactly one live version per document. */
CREATE UNIQUE INDEX UX_DocumentVersion_Live ON master.DocumentVersion (DocumentId) WHERE IsLive = 1;
GO

ALTER TABLE master.Document
    ADD CONSTRAINT FK_Document_CurrentVersion
        FOREIGN KEY (CurrentVersionId) REFERENCES master.DocumentVersion(DocumentVersionId);
GO

/*  The assignment matrix on the Upload Documents screen: one row per
    (document, account type) the document is visible to.                       */
CREATE TABLE master.DocumentAudience
(
    DocumentId      int         NOT NULL,
    AccountTypeId   tinyint     NOT NULL,
    CONSTRAINT PK_DocumentAudience PRIMARY KEY CLUSTERED (DocumentId, AccountTypeId),
    CONSTRAINT FK_DocAudience_Document FOREIGN KEY (DocumentId)    REFERENCES master.Document(DocumentId) ON DELETE CASCADE,
    CONSTRAINT FK_DocAudience_Type     FOREIGN KEY (AccountTypeId) REFERENCES auth.AccountType(AccountTypeId)
);
CREATE INDEX IX_DocumentAudience_Type ON master.DocumentAudience (AccountTypeId) INCLUDE (DocumentId);
GO

PRINT N'Schema [master] created.';
GO

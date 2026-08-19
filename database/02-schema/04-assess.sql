/*===========================================================================
  Schema: assess
  The questionnaire hierarchy and the assessments run against it.

  Hierarchy, exactly as the "Create New Question" screen builds it:
      Questionnaire (level + sector + version)
        -> Requirement   (belongs to a LEAN parameter)
             -> Checkpoint (text, evidence, KPI, unit, frequency, response)
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*--------------------------------------------------------------- Questionnaire
  Versioned. A published questionnaire is frozen: edits create a new version so
  that assessments already scored against v1 stay reproducible.               */
CREATE TABLE assess.Questionnaire
(
    QuestionnaireId     int             NOT NULL IDENTITY(1,1),
    Code                varchar(30)     NOT NULL,   -- QS-TEXTILE-V2
    Name                nvarchar(250)   NOT NULL,
    CertificationLevelId tinyint        NOT NULL,
    /* NULL = applies to every sector (the generic questionnaire). */
    SectorId            smallint        NULL,
    VersionNo           smallint        NOT NULL CONSTRAINT DF_Quest_Version DEFAULT (1),
    Status              varchar(15)     NOT NULL CONSTRAINT DF_Quest_Status  DEFAULT ('Draft'),
    EffectiveFrom       date            NULL,
    EffectiveTo         date            NULL,
    PublishedOnUtc      datetime2(3)    NULL,
    PublishedByUserId   int             NULL,
    CreatedOnUtc        datetime2(3)    NOT NULL CONSTRAINT DF_Quest_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId     int             NULL,
    ModifiedOnUtc       datetime2(3)    NULL,
    ModifiedByUserId    int             NULL,
    RowVersion          rowversion      NOT NULL,
    CONSTRAINT PK_Questionnaire PRIMARY KEY CLUSTERED (QuestionnaireId),
    CONSTRAINT UQ_Questionnaire UNIQUE (Code, VersionNo),
    CONSTRAINT FK_Quest_Level  FOREIGN KEY (CertificationLevelId) REFERENCES msme.CertificationLevel(CertificationLevelId),
    CONSTRAINT FK_Quest_Sector FOREIGN KEY (SectorId)             REFERENCES master.Sector(SectorId),
    CONSTRAINT CK_Quest_Status CHECK (Status IN ('Draft','Published','Retired')),
    CONSTRAINT CK_Quest_Dates  CHECK (EffectiveTo IS NULL OR EffectiveFrom IS NULL OR EffectiveTo >= EffectiveFrom)
);
/* One published questionnaire per (level, sector) at a time. */
CREATE UNIQUE INDEX UX_Questionnaire_Published
    ON assess.Questionnaire (CertificationLevelId, SectorId)
    WHERE Status = 'Published';
GO

/*------------------------------------------------------------------ Requirement
  The card on the question builder: title, narrative, bullets, purpose,
  benefits and the corrective action, all captured verbatim.                  */
CREATE TABLE assess.Requirement
(
    RequirementId   int             NOT NULL IDENTITY(1,1),
    QuestionnaireId int             NOT NULL,
    ParameterId     smallint        NOT NULL,
    SequenceNo      smallint        NOT NULL,
    Title           nvarchar(300)   NOT NULL,
    Narrative       nvarchar(2000)  NULL,
    /* The bullet list is presentation-only free text, one bullet per line. */
    Bullets         nvarchar(2000)  NULL,
    Purpose         nvarchar(1000)  NULL,
    Benefits        nvarchar(1000)  NULL,
    SuggestedAction nvarchar(1000)  NULL,
    MaxScore        decimal(6,2)    NOT NULL CONSTRAINT DF_Requirement_Max DEFAULT (0),
    IsActive        bit             NOT NULL CONSTRAINT DF_Requirement_Active DEFAULT (1),
    CONSTRAINT PK_Requirement PRIMARY KEY CLUSTERED (RequirementId),
    CONSTRAINT UQ_Requirement_Seq UNIQUE (QuestionnaireId, SequenceNo),
    CONSTRAINT FK_Requirement_Quest FOREIGN KEY (QuestionnaireId) REFERENCES assess.Questionnaire(QuestionnaireId) ON DELETE CASCADE,
    CONSTRAINT FK_Requirement_Param FOREIGN KEY (ParameterId)     REFERENCES master.Parameter(ParameterId)
);
CREATE INDEX IX_Requirement_Quest ON assess.Requirement (QuestionnaireId, SequenceNo);
GO

/*------------------------------------------------------------------- Checkpoint
  One row of the checkpoint grid.                                             */
CREATE TABLE assess.[Checkpoint]
(
    CheckpointId    int             NOT NULL IDENTITY(1,1),
    RequirementId   int             NOT NULL,
    SequenceNo      smallint        NOT NULL,
    CheckpointText  nvarchar(600)   NOT NULL,
    Evidence        nvarchar(600)   NULL,       -- 'Photograph, red-tag register'
    Kpi             nvarchar(300)   NULL,
    Unit            varchar(20)     NULL,       -- %, Nos., Hrs
    Frequency       varchar(20)     NULL,       -- Monthly / Quarterly / Annual
    /* Yes | Partial | No — the response the scheme expects when compliant. */
    ExpectedResponse varchar(10)    NULL,
    Weight          decimal(6,2)    NOT NULL CONSTRAINT DF_Checkpoint_Weight DEFAULT (1),
    IsMandatory     bit             NOT NULL CONSTRAINT DF_Checkpoint_Mand DEFAULT (1),
    IsActive        bit             NOT NULL CONSTRAINT DF_Checkpoint_Active DEFAULT (1),
    CONSTRAINT PK_Checkpoint PRIMARY KEY CLUSTERED (CheckpointId),
    CONSTRAINT UQ_Checkpoint_Seq UNIQUE (RequirementId, SequenceNo),
    CONSTRAINT FK_Checkpoint_Requirement FOREIGN KEY (RequirementId) REFERENCES assess.Requirement(RequirementId) ON DELETE CASCADE,
    CONSTRAINT CK_Checkpoint_Response CHECK (ExpectedResponse IS NULL OR ExpectedResponse IN ('Yes','Partial','No')),
    CONSTRAINT CK_Checkpoint_Frequency CHECK (Frequency IS NULL OR Frequency IN ('Daily','Weekly','Monthly','Quarterly','Half-Yearly','Annual')),
    CONSTRAINT CK_Checkpoint_Weight CHECK (Weight > 0)
);
CREATE INDEX IX_Checkpoint_Requirement ON assess.[Checkpoint] (RequirementId, SequenceNo);
GO

/*------------------------------------------------------------------ Assessment
  A scheduled visit by an assessment agency against one application.          */
CREATE TABLE assess.Assessment
(
    AssessmentId        int             NOT NULL IDENTITY(1,1),
    AssessmentNo        varchar(25)     NOT NULL,
    ApplicationId       int             NOT NULL,
    QuestionnaireId     int             NOT NULL,
    AssessmentAgencyId  int             NOT NULL,   -- auth.Organisation
    LeadAssessorUserId  int             NULL,
    AssessmentType      varchar(20)     NOT NULL CONSTRAINT DF_Assessment_Type DEFAULT ('OnSite'),
    Status              varchar(20)     NOT NULL CONSTRAINT DF_Assessment_Status DEFAULT ('Scheduled'),
    ScheduledOn         date            NULL,
    StartedOnUtc        datetime2(3)    NULL,
    CompletedOnUtc      datetime2(3)    NULL,
    /* Populated by usp_Assessment_Finalise; null until the assessment closes. */
    TotalScore          decimal(6,2)    NULL,
    MaxPossibleScore    decimal(6,2)    NULL,
    ScorePercent        decimal(5,2)    NULL,
    Outcome             varchar(20)     NULL,       -- Recommended / NotRecommended
    AssessorRemarks     nvarchar(2000)  NULL,
    QualityCheckByUserId int            NULL,
    QualityCheckedOnUtc datetime2(3)    NULL,
    CreatedOnUtc        datetime2(3)    NOT NULL CONSTRAINT DF_Assessment_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId     int             NULL,
    RowVersion          rowversion      NOT NULL,
    CONSTRAINT PK_Assessment PRIMARY KEY CLUSTERED (AssessmentId),
    CONSTRAINT UQ_Assessment_No UNIQUE (AssessmentNo),
    CONSTRAINT FK_Assessment_Application FOREIGN KEY (ApplicationId)      REFERENCES msme.Application(ApplicationId),
    CONSTRAINT FK_Assessment_Quest       FOREIGN KEY (QuestionnaireId)    REFERENCES assess.Questionnaire(QuestionnaireId),
    CONSTRAINT FK_Assessment_Agency      FOREIGN KEY (AssessmentAgencyId) REFERENCES auth.Organisation(OrganisationId),
    CONSTRAINT FK_Assessment_Assessor    FOREIGN KEY (LeadAssessorUserId) REFERENCES auth.[User](Id),
    CONSTRAINT FK_Assessment_QC          FOREIGN KEY (QualityCheckByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_Assessment_Type   CHECK (AssessmentType IN ('OnSite','Desk','Surveillance')),
    CONSTRAINT CK_Assessment_Status CHECK (Status IN ('Scheduled','InProgress','NcRaised','QualityCheck','Completed','Cancelled')),
    CONSTRAINT CK_Assessment_Outcome CHECK (Outcome IS NULL OR Outcome IN ('Recommended','NotRecommended'))
);
CREATE INDEX IX_Assessment_Application ON assess.Assessment (ApplicationId, ScheduledOn DESC);
CREATE INDEX IX_Assessment_Status      ON assess.Assessment (Status, ScheduledOn) INCLUDE (ApplicationId, AssessmentAgencyId);
CREATE INDEX IX_Assessment_Assessor    ON assess.Assessment (LeadAssessorUserId, Status) WHERE LeadAssessorUserId IS NOT NULL;
GO

/*-------------------------------------------------------------- AssessmentTeam */
CREATE TABLE assess.AssessmentTeam
(
    AssessmentId    int         NOT NULL,
    AssessorUserId  int         NOT NULL,
    TeamRole        varchar(20) NOT NULL CONSTRAINT DF_AssessTeam_Role DEFAULT ('Member'),
    CONSTRAINT PK_AssessmentTeam PRIMARY KEY CLUSTERED (AssessmentId, AssessorUserId),
    CONSTRAINT FK_AssessTeam_Assessment FOREIGN KEY (AssessmentId)   REFERENCES assess.Assessment(AssessmentId) ON DELETE CASCADE,
    CONSTRAINT FK_AssessTeam_User       FOREIGN KEY (AssessorUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_AssessTeam_Role CHECK (TeamRole IN ('Lead','Member','Observer'))
);
GO

/*------------------------------------------------------------ AssessmentResponse
  One answer per checkpoint. ScoreAwarded is derived from Response and the
  checkpoint weight but stored so historical scores survive a weight change.  */
CREATE TABLE assess.AssessmentResponse
(
    AssessmentResponseId bigint     NOT NULL IDENTITY(1,1),
    AssessmentId    int             NOT NULL,
    CheckpointId    int             NOT NULL,
    Response        varchar(10)     NOT NULL,   -- Yes / Partial / No / NA
    ScoreAwarded    decimal(6,2)    NOT NULL CONSTRAINT DF_AR_Score DEFAULT (0),
    ObservedValue   nvarchar(200)   NULL,       -- the KPI reading
    AssessorNote    nvarchar(1000)  NULL,
    RecordedByUserId int            NOT NULL,
    RecordedOnUtc   datetime2(3)    NOT NULL CONSTRAINT DF_AR_On DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_AssessmentResponse PRIMARY KEY CLUSTERED (AssessmentResponseId),
    CONSTRAINT UQ_AssessmentResponse UNIQUE (AssessmentId, CheckpointId),
    CONSTRAINT FK_AR_Assessment FOREIGN KEY (AssessmentId) REFERENCES assess.Assessment(AssessmentId) ON DELETE CASCADE,
    CONSTRAINT FK_AR_Checkpoint FOREIGN KEY (CheckpointId) REFERENCES assess.[Checkpoint](CheckpointId),
    CONSTRAINT FK_AR_User       FOREIGN KEY (RecordedByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_AR_Response CHECK (Response IN ('Yes','Partial','No','NA')),
    CONSTRAINT CK_AR_Score CHECK (ScoreAwarded >= 0)
);
GO

/*----------------------------------------------------------- ResponseEvidence
  Photographs and registers attached to a response, stored the same way as the
  document library: on disk, referenced here.                                 */
CREATE TABLE assess.ResponseEvidence
(
    ResponseEvidenceId bigint       NOT NULL IDENTITY(1,1),
    AssessmentResponseId bigint     NOT NULL,
    OriginalFileName nvarchar(260)  NOT NULL,
    StoredFileName  varchar(80)     NOT NULL,
    RelativePath    varchar(300)    NOT NULL,
    ContentType     varchar(150)    NOT NULL,
    FileSizeBytes   bigint          NOT NULL,
    UploadedByUserId int            NOT NULL,
    UploadedOnUtc   datetime2(3)    NOT NULL CONSTRAINT DF_RE_On DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_ResponseEvidence PRIMARY KEY CLUSTERED (ResponseEvidenceId),
    CONSTRAINT UQ_ResponseEvidence_Stored UNIQUE (StoredFileName),
    CONSTRAINT FK_RE_Response FOREIGN KEY (AssessmentResponseId) REFERENCES assess.AssessmentResponse(AssessmentResponseId) ON DELETE CASCADE,
    CONSTRAINT FK_RE_User     FOREIGN KEY (UploadedByUserId)     REFERENCES auth.[User](Id)
);
CREATE INDEX IX_ResponseEvidence_Response ON assess.ResponseEvidence (AssessmentResponseId);
GO

/*--------------------------------------------------------------- NonConformance
  Raised against a checkpoint, closed after the unit submits corrective action.
  Major NCs block certification; minor ones do not.                           */
CREATE TABLE assess.NonConformance
(
    NonConformanceId    int             NOT NULL IDENTITY(1,1),
    NcNo                varchar(25)     NOT NULL,
    AssessmentId        int             NOT NULL,
    CheckpointId        int             NULL,
    Severity            varchar(10)     NOT NULL,   -- Major / Minor / Observation
    Description         nvarchar(2000)  NOT NULL,
    RootCause           nvarchar(2000)  NULL,
    CorrectiveAction    nvarchar(2000)  NULL,
    Status              varchar(15)     NOT NULL CONSTRAINT DF_NC_Status DEFAULT ('Open'),
    RaisedByUserId      int             NOT NULL,
    RaisedOnUtc         datetime2(3)    NOT NULL CONSTRAINT DF_NC_Raised DEFAULT (SYSUTCDATETIME()),
    DueOn               date            NULL,
    ClosedByUserId      int             NULL,
    ClosedOnUtc         datetime2(3)    NULL,
    ClosureRemark       nvarchar(1000)  NULL,
    RowVersion          rowversion      NOT NULL,
    CONSTRAINT PK_NonConformance PRIMARY KEY CLUSTERED (NonConformanceId),
    CONSTRAINT UQ_NonConformance_No UNIQUE (NcNo),
    CONSTRAINT FK_NC_Assessment FOREIGN KEY (AssessmentId)   REFERENCES assess.Assessment(AssessmentId) ON DELETE CASCADE,
    CONSTRAINT FK_NC_Checkpoint FOREIGN KEY (CheckpointId)   REFERENCES assess.[Checkpoint](CheckpointId),
    CONSTRAINT FK_NC_RaisedBy   FOREIGN KEY (RaisedByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT FK_NC_ClosedBy   FOREIGN KEY (ClosedByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_NC_Severity CHECK (Severity IN ('Major','Minor','Observation')),
    CONSTRAINT CK_NC_Status   CHECK (Status IN ('Open','InProgress','Submitted','Closed','Waived')),
    /* A closed NC must record who closed it and when. */
    CONSTRAINT CK_NC_Closure CHECK (Status <> 'Closed' OR (ClosedByUserId IS NOT NULL AND ClosedOnUtc IS NOT NULL))
);
CREATE INDEX IX_NC_Assessment ON assess.NonConformance (AssessmentId, Status);
CREATE INDEX IX_NC_Open       ON assess.NonConformance (Status, DueOn) WHERE Status IN ('Open','InProgress','Submitted');
GO

PRINT N'Schema [assess] created.';
GO

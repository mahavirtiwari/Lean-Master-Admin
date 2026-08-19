/*===========================================================================
  Schemas: comm, audit
  The emailer (campaigns, transactional templates, delivery log) and the
  cross-cutting operational tables behind Settings: audit trail, error log,
  API registry and system settings.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*--------------------------------------------------------------- EmailTemplate
  Transactional templates. Merge tags are {{user_name}}, {{unit_name}},
  {{tier}}, {{assessment_date}} and the like; AvailableTags is the whitelist
  the editor offers and the renderer accepts.                                 */
CREATE TABLE comm.EmailTemplate
(
    EmailTemplateId int             NOT NULL IDENTITY(1,1),
    Code            varchar(60)     NOT NULL,   -- ASSESSMENT_SCHEDULED
    Name            nvarchar(200)   NOT NULL,
    Subject         nvarchar(400)   NOT NULL,
    BodyHtml        nvarchar(max)   NOT NULL,
    BodyText        nvarchar(max)   NULL,
    /* Comma-separated whitelist: '{{user_name}},{{unit_name}}'. Kept as a
       string rather than a child table because it is edited as one field and
       never queried across templates. */
    AvailableTags   nvarchar(1000)  NULL,
    /* Transactional templates fire from an event; non-transactional ones are
       only usable as a campaign starting point. */
    IsTransactional bit             NOT NULL CONSTRAINT DF_EmailTpl_Trans DEFAULT (1),
    IsActive        bit             NOT NULL CONSTRAINT DF_EmailTpl_Active DEFAULT (1),
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_EmailTpl_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NULL,
    ModifiedOnUtc   datetime2(3)    NULL,
    ModifiedByUserId int            NULL,
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_EmailTemplate PRIMARY KEY CLUSTERED (EmailTemplateId),
    CONSTRAINT UQ_EmailTemplate_Code UNIQUE (Code)
);
GO

/* Which account types a transactional template is addressed to. */
CREATE TABLE comm.EmailTemplateAudience
(
    EmailTemplateId int         NOT NULL,
    AccountTypeId   tinyint     NOT NULL,
    CONSTRAINT PK_EmailTemplateAudience PRIMARY KEY CLUSTERED (EmailTemplateId, AccountTypeId),
    CONSTRAINT FK_EmailTplAud_Template FOREIGN KEY (EmailTemplateId) REFERENCES comm.EmailTemplate(EmailTemplateId) ON DELETE CASCADE,
    CONSTRAINT FK_EmailTplAud_Type     FOREIGN KEY (AccountTypeId)   REFERENCES auth.AccountType(AccountTypeId)
);
GO

/*--------------------------------------------------------------- EmailCampaign
  A one-off broadcast composed on the Emailer screen and sent to a chosen set
  of account types.                                                           */
CREATE TABLE comm.EmailCampaign
(
    EmailCampaignId int             NOT NULL IDENTITY(1,1),
    Name            nvarchar(250)   NOT NULL,
    Subject         nvarchar(400)   NOT NULL,
    BodyHtml        nvarchar(max)   NOT NULL,
    EmailTemplateId int             NULL,       -- started from a template
    Status          varchar(15)     NOT NULL CONSTRAINT DF_Campaign_Status DEFAULT ('Draft'),
    ScheduledForUtc datetime2(3)    NULL,
    SentOnUtc       datetime2(3)    NULL,
    /* Rollup of comm.EmailMessage, refreshed by the dispatch job so the list
       screen does not aggregate a large table on every load. */
    RecipientCount  int             NOT NULL CONSTRAINT DF_Campaign_Recip DEFAULT (0),
    SentCount       int             NOT NULL CONSTRAINT DF_Campaign_Sent  DEFAULT (0),
    FailedCount     int             NOT NULL CONSTRAINT DF_Campaign_Fail  DEFAULT (0),
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_Campaign_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NOT NULL,
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_EmailCampaign PRIMARY KEY CLUSTERED (EmailCampaignId),
    CONSTRAINT FK_Campaign_Template FOREIGN KEY (EmailTemplateId) REFERENCES comm.EmailTemplate(EmailTemplateId),
    CONSTRAINT FK_Campaign_User     FOREIGN KEY (CreatedByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_Campaign_Status CHECK (Status IN ('Draft','Scheduled','Sending','Sent','Cancelled','Failed'))
);
CREATE INDEX IX_Campaign_Status ON comm.EmailCampaign (Status, CreatedOnUtc DESC);
GO

CREATE TABLE comm.EmailCampaignAudience
(
    EmailCampaignId int         NOT NULL,
    AccountTypeId   tinyint     NOT NULL,
    CONSTRAINT PK_EmailCampaignAudience PRIMARY KEY CLUSTERED (EmailCampaignId, AccountTypeId),
    CONSTRAINT FK_CampaignAud_Campaign FOREIGN KEY (EmailCampaignId) REFERENCES comm.EmailCampaign(EmailCampaignId) ON DELETE CASCADE,
    CONSTRAINT FK_CampaignAud_Type     FOREIGN KEY (AccountTypeId)   REFERENCES auth.AccountType(AccountTypeId)
);
GO

/*---------------------------------------------------------------- EmailMessage
  The outbox. A background service picks up Queued rows, sends them and
  records the result; nothing is sent inline on a request thread.

  This table grows fastest of anything in the database. The maintenance job in
  06-maintenance archives rows older than the retention window.               */
CREATE TABLE comm.EmailMessage
(
    EmailMessageId  bigint          NOT NULL IDENTITY(1,1),
    EmailCampaignId int             NULL,
    EmailTemplateId int             NULL,
    ToAddress       nvarchar(256)   NOT NULL,
    ToUserId        int             NULL,
    Subject         nvarchar(400)   NOT NULL,
    BodyHtml        nvarchar(max)   NOT NULL,
    Status          varchar(12)     NOT NULL CONSTRAINT DF_EmailMsg_Status DEFAULT ('Queued'),
    AttemptCount    tinyint         NOT NULL CONSTRAINT DF_EmailMsg_Attempts DEFAULT (0),
    LastAttemptOnUtc datetime2(3)   NULL,
    SentOnUtc       datetime2(3)    NULL,
    ErrorMessage    nvarchar(1000)  NULL,
    ProviderMessageId varchar(200)  NULL,
    QueuedOnUtc     datetime2(3)    NOT NULL CONSTRAINT DF_EmailMsg_Queued DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_EmailMessage PRIMARY KEY CLUSTERED (EmailMessageId),
    CONSTRAINT FK_EmailMsg_Campaign FOREIGN KEY (EmailCampaignId) REFERENCES comm.EmailCampaign(EmailCampaignId),
    CONSTRAINT FK_EmailMsg_Template FOREIGN KEY (EmailTemplateId) REFERENCES comm.EmailTemplate(EmailTemplateId),
    CONSTRAINT FK_EmailMsg_User     FOREIGN KEY (ToUserId)        REFERENCES auth.[User](Id),
    CONSTRAINT CK_EmailMsg_Status CHECK (Status IN ('Queued','Sending','Sent','Failed','Cancelled'))
);
/* The dispatcher's claim query: oldest queued first. Filtered so the index
   stays small no matter how much history accumulates. */
CREATE INDEX IX_EmailMessage_Pending ON comm.EmailMessage (QueuedOnUtc)
    INCLUDE (AttemptCount) WHERE Status IN ('Queued','Sending');
CREATE INDEX IX_EmailMessage_Campaign ON comm.EmailMessage (EmailCampaignId, Status);
CREATE INDEX IX_EmailMessage_Queued   ON comm.EmailMessage (QueuedOnUtc DESC);
GO

/*===========================================================================
  audit
===========================================================================*/

/*-------------------------------------------------------------------- AuditLog
  Written by a SaveChanges interceptor in the API, so every tracked entity
  change lands here without controllers remembering to log.

  OldValues/NewValues are JSON. SQL Server 2016+ can index into them with
  JSON_VALUE; a computed column is added below for the two fields the Audit
  Logs screen filters on.                                                     */
CREATE TABLE audit.AuditLog
(
    AuditLogId      bigint          NOT NULL IDENTITY(1,1),
    OccurredOnUtc   datetime2(3)    NOT NULL CONSTRAINT DF_AuditLog_On DEFAULT (SYSUTCDATETIME()),
    UserId          int             NULL,
    UserName        nvarchar(200)   NULL,       -- denormalised: survives user deletion
    ModuleId        tinyint         NULL,
    /* Insert / Update / Delete / Login / Export / StatusChange */
    Action          varchar(20)     NOT NULL,
    EntityName      nvarchar(150)   NOT NULL,   -- 'auth.User'
    EntityKey       nvarchar(100)   NULL,
    OldValues       nvarchar(max)   NULL,
    NewValues       nvarchar(max)   NULL,
    AffectedColumns nvarchar(1000)  NULL,
    IpAddress       varchar(45)     NULL,
    UserAgent       nvarchar(400)   NULL,
    CorrelationId   uniqueidentifier NULL,
    CONSTRAINT PK_AuditLog PRIMARY KEY CLUSTERED (AuditLogId),
    CONSTRAINT FK_AuditLog_User   FOREIGN KEY (UserId)   REFERENCES auth.[User](Id),
    CONSTRAINT FK_AuditLog_Module FOREIGN KEY (ModuleId) REFERENCES auth.Module(ModuleId),
    CONSTRAINT CK_AuditLog_Json CHECK (
        (OldValues IS NULL OR ISJSON(OldValues) = 1) AND
        (NewValues IS NULL OR ISJSON(NewValues) = 1))
);
CREATE INDEX IX_AuditLog_Occurred ON audit.AuditLog (OccurredOnUtc DESC) INCLUDE (UserId, Action, EntityName);
CREATE INDEX IX_AuditLog_Entity   ON audit.AuditLog (EntityName, EntityKey, OccurredOnUtc DESC);
CREATE INDEX IX_AuditLog_User     ON audit.AuditLog (UserId, OccurredOnUtc DESC);
GO

/*-------------------------------------------------------------------- ErrorLog
  Unhandled exceptions caught by the API's exception middleware. CorrelationId
  ties an entry to the trace id the user was shown on the error page.         */
CREATE TABLE audit.ErrorLog
(
    ErrorLogId      bigint          NOT NULL IDENTITY(1,1),
    OccurredOnUtc   datetime2(3)    NOT NULL CONSTRAINT DF_ErrorLog_On DEFAULT (SYSUTCDATETIME()),
    Severity        varchar(12)     NOT NULL CONSTRAINT DF_ErrorLog_Sev DEFAULT ('Error'),
    Source          nvarchar(200)   NULL,       -- 'MCLS.Api'
    ExceptionType   nvarchar(250)   NULL,
    Message         nvarchar(2000)  NOT NULL,
    StackTrace      nvarchar(max)   NULL,
    RequestMethod   varchar(10)     NULL,
    RequestPath     nvarchar(500)   NULL,
    QueryString     nvarchar(1000)  NULL,
    StatusCode      int             NULL,
    UserId          int             NULL,
    IpAddress       varchar(45)     NULL,
    CorrelationId   uniqueidentifier NULL,
    MachineName     nvarchar(100)   NULL,
    IsResolved      bit             NOT NULL CONSTRAINT DF_ErrorLog_Resolved DEFAULT (0),
    ResolvedByUserId int            NULL,
    ResolvedOnUtc   datetime2(3)    NULL,
    ResolutionNote  nvarchar(1000)  NULL,
    CONSTRAINT PK_ErrorLog PRIMARY KEY CLUSTERED (ErrorLogId),
    CONSTRAINT FK_ErrorLog_User     FOREIGN KEY (UserId)           REFERENCES auth.[User](Id),
    CONSTRAINT FK_ErrorLog_Resolver FOREIGN KEY (ResolvedByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_ErrorLog_Severity CHECK (Severity IN ('Warning','Error','Critical'))
);
CREATE INDEX IX_ErrorLog_Occurred ON audit.ErrorLog (OccurredOnUtc DESC) INCLUDE (Severity, ExceptionType);
CREATE INDEX IX_ErrorLog_Open     ON audit.ErrorLog (OccurredOnUtc DESC) WHERE IsResolved = 0;
CREATE INDEX IX_ErrorLog_Correlation ON audit.ErrorLog (CorrelationId) WHERE CorrelationId IS NOT NULL;
GO

/*---------------------------------------------------------------- ApiRegistry
  Settings > APIs. Outbound integrations (Udyam verification, payment gateway,
  SMS) and their health, so operations can see what is failing without a log
  dive. Secrets are never stored here — only the name of the secret.          */
CREATE TABLE audit.ApiRegistry
(
    ApiRegistryId   int             NOT NULL IDENTITY(1,1),
    Code            varchar(50)     NOT NULL,
    Name            nvarchar(200)   NOT NULL,
    Description     nvarchar(500)   NULL,
    Direction       varchar(10)     NOT NULL CONSTRAINT DF_Api_Direction DEFAULT ('Outbound'),
    BaseUrl         nvarchar(500)   NULL,
    AuthType        varchar(30)     NULL,       -- ApiKey / OAuth2 / Basic / mTLS
    /* The configuration key or Windows credential name holding the secret. */
    SecretRef       varchar(200)    NULL,
    TimeoutSeconds  int             NOT NULL CONSTRAINT DF_Api_Timeout DEFAULT (30),
    IsEnabled       bit             NOT NULL CONSTRAINT DF_Api_Enabled DEFAULT (1),
    LastCheckedOnUtc datetime2(3)   NULL,
    LastStatusCode  int             NULL,
    LastLatencyMs   int             NULL,
    ModifiedOnUtc   datetime2(3)    NULL,
    ModifiedByUserId int            NULL,
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_ApiRegistry PRIMARY KEY CLUSTERED (ApiRegistryId),
    CONSTRAINT UQ_ApiRegistry_Code UNIQUE (Code),
    CONSTRAINT CK_Api_Direction CHECK (Direction IN ('Inbound','Outbound')),
    CONSTRAINT CK_Api_Timeout   CHECK (TimeoutSeconds BETWEEN 1 AND 600)
);
GO

/*-------------------------------------------------------------- SystemSetting
  Settings > System. Typed by DataType so the UI renders the right control and
  the API can validate before saving.                                         */
CREATE TABLE audit.SystemSetting
(
    SystemSettingId int             NOT NULL IDENTITY(1,1),
    [Key]           varchar(100)    NOT NULL,
    Value           nvarchar(2000)  NULL,
    DataType        varchar(15)     NOT NULL CONSTRAINT DF_Setting_Type DEFAULT ('String'),
    Category        nvarchar(80)    NOT NULL,
    DisplayName     nvarchar(200)   NOT NULL,
    Description     nvarchar(500)   NULL,
    /* Settings the UI must mask and the audit log must not capture. */
    IsSensitive     bit             NOT NULL CONSTRAINT DF_Setting_Sensitive DEFAULT (0),
    IsEditable      bit             NOT NULL CONSTRAINT DF_Setting_Editable  DEFAULT (1),
    SortOrder       smallint        NOT NULL CONSTRAINT DF_Setting_Sort DEFAULT (0),
    ModifiedOnUtc   datetime2(3)    NULL,
    ModifiedByUserId int            NULL,
    RowVersion      rowversion      NOT NULL,
    CONSTRAINT PK_SystemSetting PRIMARY KEY CLUSTERED (SystemSettingId),
    CONSTRAINT UQ_SystemSetting_Key UNIQUE ([Key]),
    CONSTRAINT CK_Setting_DataType CHECK (DataType IN ('String','Int','Decimal','Bool','Date','Json'))
);
CREATE INDEX IX_SystemSetting_Category ON audit.SystemSetting (Category, SortOrder);
GO

/*----------------------------------------------------------------- SequenceNo
  Human-readable identifiers (MCLS/2026/000148, MCLS-IA-000142) come from here
  rather than from IDENTITY, because they reset per year and per prefix.
  audit.usp_NextSequence hands them out under a single UPDATE, which is
  atomic and avoids the gap-and-race problems of MAX()+1.                     */
CREATE TABLE audit.SequenceCounter
(
    SequenceName    varchar(50)     NOT NULL,
    PeriodKey       varchar(10)     NOT NULL CONSTRAINT DF_Seq_Period DEFAULT (''),  -- '2026' or ''
    LastValue       int             NOT NULL CONSTRAINT DF_Seq_Last DEFAULT (0),
    Prefix          varchar(20)     NULL,
    PadWidth        tinyint         NOT NULL CONSTRAINT DF_Seq_Pad DEFAULT (6),
    CONSTRAINT PK_SequenceCounter PRIMARY KEY CLUSTERED (SequenceName, PeriodKey)
);
GO

PRINT N'Schemas [comm] and [audit] created.';
GO

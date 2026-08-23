/* ---------------------------------------------------------------------------
   The applicant's LEAN Silver application, as filled on the mobile app.

   The admin menus (migration 039) define WHAT the application asks — the basic-
   information items, the ESG checklist and the document list. This is where an
   enterprise's ANSWERS to them are kept: one submission per enterprise per
   level, its basic-info values, its ESG Yes/No/NA answers, and the documents it
   uploaded against the checklist.

   Kept apart from msme.Application, which is the case file the scheme's staff
   work: a submission is the applicant's self-declaration that opens one. One
   submission per (enterprise, level) — the draft the applicant is filling, or
   the one they submitted.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('msme.ApplicationSubmission', 'U') IS NULL
BEGIN
    CREATE TABLE msme.ApplicationSubmission
    (
        SubmissionId         int          NOT NULL IDENTITY(1,1),
        EnterpriseId         int          NOT NULL,
        CertificationLevelId tinyint      NOT NULL,

        /* Draft while it is being filled; Submitted once the applicant confirms.
           A submission does not itself certify anything — it opens the case. */
        Status               varchar(20)  NOT NULL CONSTRAINT DF_AppSub_Status DEFAULT 'Draft',
        SubmittedOnUtc       datetime2(0) NULL,

        CreatedOnUtc         datetime2(0) NOT NULL CONSTRAINT DF_AppSub_Created DEFAULT SYSUTCDATETIME(),
        ModifiedOnUtc        datetime2(0) NULL,
        RowVersion           rowversion   NOT NULL,

        CONSTRAINT PK_ApplicationSubmission PRIMARY KEY (SubmissionId),
        CONSTRAINT UQ_ApplicationSubmission_Ent_Level UNIQUE (EnterpriseId, CertificationLevelId),
        CONSTRAINT FK_ApplicationSubmission_Enterprise FOREIGN KEY (EnterpriseId)
            REFERENCES msme.Enterprise (EnterpriseId),
        CONSTRAINT FK_ApplicationSubmission_Level FOREIGN KEY (CertificationLevelId)
            REFERENCES msme.CertificationLevel (CertificationLevelId),
        CONSTRAINT CK_ApplicationSubmission_Status CHECK (Status IN ('Draft', 'Submitted'))
    );
END
GO

/* Basic-information answers — one row per item the applicant filled. The value
   is text whatever the item's input type: a Yes/No, a number, a note, or the
   stored name of a captured photograph. */
IF OBJECT_ID('msme.SubmissionBasicInfo', 'U') IS NULL
BEGIN
    CREATE TABLE msme.SubmissionBasicInfo
    (
        SubmissionId    int            NOT NULL,
        BasicInfoItemId smallint       NOT NULL,
        ValueText       nvarchar(1000) NULL,

        CONSTRAINT PK_SubmissionBasicInfo PRIMARY KEY (SubmissionId, BasicInfoItemId),
        CONSTRAINT FK_SubBasic_Submission FOREIGN KEY (SubmissionId)
            REFERENCES msme.ApplicationSubmission (SubmissionId) ON DELETE CASCADE,
        CONSTRAINT FK_SubBasic_Item FOREIGN KEY (BasicInfoItemId)
            REFERENCES master.BasicInfoItem (BasicInfoItemId)
    );
END
GO

/* ESG answers — Yes / No / NA against a question. A conditional question that
   was never shown (its parent was answered the other way) simply has no row. */
IF OBJECT_ID('msme.SubmissionEsgAnswer', 'U') IS NULL
BEGIN
    CREATE TABLE msme.SubmissionEsgAnswer
    (
        SubmissionId  int         NOT NULL,
        EsgQuestionId int         NOT NULL,
        Answer        varchar(3)  NOT NULL,

        CONSTRAINT PK_SubmissionEsgAnswer PRIMARY KEY (SubmissionId, EsgQuestionId),
        CONSTRAINT FK_SubEsg_Submission FOREIGN KEY (SubmissionId)
            REFERENCES msme.ApplicationSubmission (SubmissionId) ON DELETE CASCADE,
        CONSTRAINT FK_SubEsg_Question FOREIGN KEY (EsgQuestionId)
            REFERENCES master.EsgQuestion (EsgQuestionId),
        CONSTRAINT CK_SubEsg_Answer CHECK (Answer IN ('Yes', 'No', 'NA'))
    );
END
GO

/* Documents uploaded against the checklist. The file itself is stored the same
   way every other upload is (FileStorage:RootPath, streamed by an authorised
   action); this row records which requirement it satisfied. */
IF OBJECT_ID('msme.SubmissionDocument', 'U') IS NULL
BEGIN
    CREATE TABLE msme.SubmissionDocument
    (
        SubmissionId          int           NOT NULL,
        DocumentRequirementId smallint      NOT NULL,
        OriginalFileName      nvarchar(300) NULL,
        StoredFileName        nvarchar(300) NULL,
        ContentType           varchar(100)  NULL,
        UploadedOnUtc         datetime2(0)  NULL,

        CONSTRAINT PK_SubmissionDocument PRIMARY KEY (SubmissionId, DocumentRequirementId),
        CONSTRAINT FK_SubDoc_Submission FOREIGN KEY (SubmissionId)
            REFERENCES msme.ApplicationSubmission (SubmissionId) ON DELETE CASCADE,
        CONSTRAINT FK_SubDoc_Requirement FOREIGN KEY (DocumentRequirementId)
            REFERENCES master.DocumentRequirement (DocumentRequirementId)
    );
END
GO

PRINT N'Migration 040 — LEAN Silver application submission tables applied.';
GO

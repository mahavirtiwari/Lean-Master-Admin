/* ---------------------------------------------------------------------------
   LEAN Bronze e-learning (C01a - C01d).

   Bronze is not an assessment: it is a course set an enterprise nominates up to
   five people for, each of whom takes every course and one final exam on the
   LMS. A certificate is issued per participant, which is why My Certificates
   can hold several Bronze certificates for one enterprise.

   Two tables:
     BronzeCourse       the shared course list, seeded here and maintained by an
                        administrator afterwards - not per enterprise.
     BronzeParticipant  a nominated person and their progress, unique on
                        (enterprise, email) so one person is not seated twice.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('msme.BronzeCourse') IS NULL
BEGIN
    CREATE TABLE msme.BronzeCourse (
        BronzeCourseId  int IDENTITY(1,1) NOT NULL CONSTRAINT PK_BronzeCourse PRIMARY KEY,
        SortOrder       tinyint      NOT NULL,
        Title           nvarchar(200) NOT NULL,
        IsActive        bit          NOT NULL CONSTRAINT DF_BronzeCourse_IsActive DEFAULT (1),
        CreatedOnUtc    datetime2(3) NOT NULL CONSTRAINT DF_BronzeCourse_Created DEFAULT (SYSUTCDATETIME())
    );
END
GO

IF OBJECT_ID('msme.BronzeParticipant') IS NULL
BEGIN
    CREATE TABLE msme.BronzeParticipant (
        BronzeParticipantId int IDENTITY(1,1) NOT NULL CONSTRAINT PK_BronzeParticipant PRIMARY KEY,
        EnterpriseId        int           NOT NULL,
        FullName            nvarchar(150) NOT NULL,
        Email               nvarchar(256) NOT NULL,
        Mobile              varchar(15)   NULL,
        /* The language the LMS serves the course content in. */
        PreferredLanguage   nvarchar(40)  NULL,
        /* Progress reported by the LMS. CoursesDone counts completed courses. */
        CoursesDone         tinyint       NOT NULL CONSTRAINT DF_BronzeParticipant_Done DEFAULT (0),
        /* NotStarted | Learning | ExamDue | Certified */
        Status              varchar(20)   NOT NULL CONSTRAINT DF_BronzeParticipant_Status DEFAULT ('NotStarted'),
        CertifiedOnUtc      datetime2(3)  NULL,
        CertificateNo       varchar(40)   NULL,
        IsActive            bit           NOT NULL CONSTRAINT DF_BronzeParticipant_IsActive DEFAULT (1),
        CreatedOnUtc        datetime2(3)  NOT NULL CONSTRAINT DF_BronzeParticipant_Created DEFAULT (SYSUTCDATETIME()),
        CreatedByUserId     int           NULL,
        CONSTRAINT FK_BronzeParticipant_Enterprise FOREIGN KEY (EnterpriseId)
            REFERENCES msme.Enterprise (EnterpriseId)
    );

    /* One seat per person: the same address cannot be nominated twice by the
       same enterprise. Filtered so a withdrawn seat can be re-used. */
    CREATE UNIQUE INDEX UX_BronzeParticipant_Enterprise_Email
        ON msme.BronzeParticipant (EnterpriseId, Email) WHERE IsActive = 1;
END
GO

/* The eleven courses, in the order the deck lists them. */
MERGE msme.BronzeCourse AS tgt
USING (VALUES
    (1,  N'Introduction to the LEAN Scheme'),
    (2,  N'LEAN Fundamentals and the Eight Wastes'),
    (3,  N'5S - Sort, Set, Shine, Standardise, Sustain'),
    (4,  N'Workplace Organisation and Layout'),
    (5,  N'Visual Management on the Shop Floor'),
    (6,  N'Standard Work and Work Instructions'),
    (7,  N'Kaizen and Continuous Improvement'),
    (8,  N'Quality at Source and Poka-Yoke'),
    (9,  N'Preventive Maintenance Basics'),
    (10, N'Safety, Health and the LEAN Workplace'),
    (11, N'Sustaining LEAN - Audits and Review')
) AS src (SortOrder, Title)
   ON tgt.SortOrder = src.SortOrder
WHEN MATCHED THEN UPDATE SET Title = src.Title, IsActive = 1
WHEN NOT MATCHED BY TARGET THEN INSERT (SortOrder, Title) VALUES (src.SortOrder, src.Title);
GO

/* Where the courses actually run. Editable under Settings so the address can
   change without a release. */
IF NOT EXISTS (SELECT 1 FROM audit.SystemSetting WHERE [Key] = 'Bronze.LmsUrl')
BEGIN
    INSERT audit.SystemSetting ([Key], Value, DataType, Category, DisplayName, Description,
                                IsSensitive, IsEditable, SortOrder)
    VALUES ('Bronze.LmsUrl', 'https://msme-leanlms.in', 'string', N'Bronze',
            N'LEAN Bronze LMS address',
            N'The learning platform LEAN Bronze participants sign in to.', 0, 1, 10);
END
GO

/*
    018 — MSME applicant registration (R1-R9, D1).
    ------------------------------------------------------------------------
    msme.Enterprise, EnterprisePlant and EnterpriseActivity already hold
    everything the Udyam API returns, so R3 and R4 read from what is there.
    Six things the registration wizard needs had no home:

      1. msme.Registration     the in-progress application.
      2. LeanId on Enterprise  the scheme number issued at the end (R9).
      3. Selected plant/activity — R4 asks the applicant to choose ONE of each,
                                 and that choice decides the questionnaire set.
      4. master.AwarenessProgram — the list behind R5's "Select program".
      5. Pledge acceptance     who accepted, when, from where (R8).
      6. Registration OTP      the 6-digit code sent to the SPOC email (R6).

    Why a separate Registration table rather than writing progressively into
    Enterprise: an abandoned wizard must not leave a half-built enterprise in
    the master data. Every admin screen counts msme.Enterprise — registered
    MSMEs, dashboard totals, sector mapping — and a row that only got to step 3
    would be counted as a registered enterprise that never existed. The
    Enterprise (and its user account) is created once, at the end, from a
    Registration that reached the pledge.

    Idempotent.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- --------------------------------------------------- 1. awareness programs ---
IF OBJECT_ID('master.AwarenessProgram') IS NULL
BEGIN
    CREATE TABLE master.AwarenessProgram
    (
        AwarenessProgramId int IDENTITY(1,1) NOT NULL,
        Name               nvarchar(250) NOT NULL,
        HeldOn             date          NULL,
        Venue              nvarchar(250) NULL,
        StateId            smallint      NULL,
        IsActive           bit           NOT NULL CONSTRAINT DF_AwarenessProgram_Active DEFAULT 1,
        CONSTRAINT PK_AwarenessProgram PRIMARY KEY (AwarenessProgramId),
        CONSTRAINT FK_AwarenessProgram_State FOREIGN KEY (StateId)
            REFERENCES master.State (StateId)
    );
END;
GO

-- ------------------------------------------------------- 2. LEAN ID column ---
IF COL_LENGTH('msme.Enterprise', 'LeanId') IS NULL
    ALTER TABLE msme.Enterprise ADD LeanId varchar(30) NULL;
GO

-- Filtered so the many enterprises without one yet do not collide on NULL.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Enterprise_LeanId')
    CREATE UNIQUE INDEX UX_Enterprise_LeanId ON msme.Enterprise (LeanId)
        WHERE LeanId IS NOT NULL;
GO

-- The plant and activity the applicant chose at registration. Nullable because
-- enterprises created before this migration never made that choice.
IF COL_LENGTH('msme.Enterprise', 'SelectedPlantId') IS NULL
    ALTER TABLE msme.Enterprise ADD SelectedPlantId int NULL;
GO

IF COL_LENGTH('msme.Enterprise', 'SelectedActivityId') IS NULL
    ALTER TABLE msme.Enterprise ADD SelectedActivityId int NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Enterprise_SelectedPlant')
    ALTER TABLE msme.Enterprise ADD CONSTRAINT FK_Enterprise_SelectedPlant
        FOREIGN KEY (SelectedPlantId) REFERENCES msme.EnterprisePlant (EnterprisePlantId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Enterprise_SelectedActivity')
    ALTER TABLE msme.Enterprise ADD CONSTRAINT FK_Enterprise_SelectedActivity
        FOREIGN KEY (SelectedActivityId) REFERENCES msme.EnterpriseActivity (EnterpriseActivityId);
GO

-- ------------------------------------------------------- 3. the wizard row ---
IF OBJECT_ID('msme.Registration') IS NULL
BEGIN
    CREATE TABLE msme.Registration
    (
        RegistrationId      int IDENTITY(1,1) NOT NULL,

        -- Opaque handle the browser carries between steps. Not guessable, and
        -- not the row id: the wizard is unauthenticated, so a sequential id
        -- would let anyone walk other applicants' drafts.
        SessionToken        uniqueidentifier NOT NULL
                            CONSTRAINT DF_Registration_Token DEFAULT NEWID(),

        UdyamRegistrationNo varchar(30)   NOT NULL,
        UdyamMobile         varchar(15)   NOT NULL,

        -- The Udyam response verbatim, so the wizard survives the registry
        -- being unreachable on a later step.
        UdyamPayload        nvarchar(max) NULL,

        -- Step 4 choices, held as the raw Udyam identifiers until the
        -- Enterprise rows exist.
        SelectedUnitIdNo    nvarchar(60)  NULL,
        SelectedNicFiveDigit varchar(10)  NULL,

        -- Step 5: SPOC.
        SpocName            nvarchar(200) NULL,
        SpocDesignation     nvarchar(150) NULL,
        SpocMobile          varchar(15)   NULL,
        SpocEmail           nvarchar(256) NULL,

        AttendedAwareness   bit           NULL,
        AwarenessProgramId  int           NULL,

        -- Step 6: e-mail verification.
        OtpHash             varbinary(64) NULL,
        OtpSentOnUtc        datetime2(3)  NULL,
        OtpAttempts         tinyint       NOT NULL CONSTRAINT DF_Registration_Attempts DEFAULT 0,
        EmailVerifiedOnUtc  datetime2(3)  NULL,

        -- Step 8: pledge.
        PledgeAcceptedOnUtc datetime2(3)  NULL,
        PledgeAcceptedBy    nvarchar(200) NULL,
        PledgeAcceptedIp    varchar(45)   NULL,

        CurrentStep         tinyint       NOT NULL CONSTRAINT DF_Registration_Step DEFAULT 2,
        Status              varchar(15)   NOT NULL CONSTRAINT DF_Registration_Status DEFAULT 'Draft',

        EnterpriseId        int           NULL,
        StartedOnUtc        datetime2(3)  NOT NULL CONSTRAINT DF_Registration_Started DEFAULT SYSUTCDATETIME(),
        CompletedOnUtc      datetime2(3)  NULL,

        CONSTRAINT PK_Registration PRIMARY KEY (RegistrationId),
        CONSTRAINT UQ_Registration_Token UNIQUE (SessionToken),
        CONSTRAINT FK_Registration_Awareness FOREIGN KEY (AwarenessProgramId)
            REFERENCES master.AwarenessProgram (AwarenessProgramId),
        CONSTRAINT FK_Registration_Enterprise FOREIGN KEY (EnterpriseId)
            REFERENCES msme.Enterprise (EnterpriseId),
        CONSTRAINT CK_Registration_Status
            CHECK (Status IN ('Draft', 'Completed', 'Abandoned')),
        -- An awareness programme must be named when one is claimed.
        CONSTRAINT CK_Registration_Awareness
            CHECK (AttendedAwareness IS NULL OR AttendedAwareness = 0 OR AwarenessProgramId IS NOT NULL)
    );

    -- One live draft per Udyam number: a second attempt resumes rather than
    -- forking, and a completed one no longer blocks anything.
    CREATE UNIQUE INDEX UX_Registration_LiveDraft
        ON msme.Registration (UdyamRegistrationNo)
        WHERE Status = 'Draft';
END;
GO

-- --------------------------------------------------------- 4. LEAN ID seed ---
-- LEAN-<state>-<year>-<00000>, so the counter is per state and year.
IF NOT EXISTS (SELECT 1 FROM audit.SequenceCounter WHERE SequenceName = 'LeanId')
    INSERT INTO audit.SequenceCounter (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
    -- No Prefix: the controller composes LEAN-<state>-<year>-<serial>, and a
    -- prefix here would put a second "LEAN" inside the serial.
    VALUES ('LeanId', '', 0, NULL, 5);
GO

-- ------------------------------------------------------------- 5. seed data ---
MERGE master.AwarenessProgram AS t
USING (VALUES
    (N'LEAN Awareness Program - Pune Cluster',      '2025-08-14', N'MCCIA, Pune',            20),
    (N'LEAN Awareness Program - Ludhiana Cluster',  '2025-09-11', N'CII Ludhiana',           28),
    (N'LEAN Awareness Program - Coimbatore Cluster','2025-10-09', N'CODISSIA, Coimbatore',   30),
    (N'LEAN Awareness Program - Rajkot Cluster',    '2025-11-06', N'Rajkot Engineering Assn', 11),
    (N'LEAN Awareness Program - NCR Cluster',       '2026-01-15', N'India Habitat Centre',    9)
) AS s (Name, HeldOn, Venue, StateId)
ON t.Name = s.Name
WHEN NOT MATCHED THEN
    INSERT (Name, HeldOn, Venue, StateId, IsActive)
    VALUES (s.Name, s.HeldOn, s.Venue, s.StateId, 1);
GO

SELECT AwarenessPrograms = (SELECT COUNT(*) FROM master.AwarenessProgram),
       RegistrationTable = CASE WHEN OBJECT_ID('msme.Registration') IS NULL THEN 'missing' ELSE 'ok' END,
       LeanIdColumn      = CASE WHEN COL_LENGTH('msme.Enterprise','LeanId') IS NULL THEN 'missing' ELSE 'ok' END,
       LeanIdSequence    = (SELECT COUNT(*) FROM audit.SequenceCounter WHERE SequenceName = 'LeanId');

/* ---------------------------------------------------------------------------
   Who brought an MSME to the scheme.

   The dashboard's headline card splits registrations three ways — QCI, NPC and
   Self — and the split is decided by the awareness programme the applicant
   selected during registration: a programme run by QCI counts as a QCI
   registration, one run by NPC as NPC, and an applicant who answered "No" to
   having attended counts as Self.

   That needed two columns.

   A programme now records which agency ran it. The scheme's programme service
   publishes this, and an administrator can set it by hand for programmes
   entered locally.

   An enterprise now records the answer that programme gave, decided once when
   the registration completes. It could be derived on every read by joining back
   through the registration to the programme, but the dashboard reads it on
   every load and the answer never changes after completion — at fifty lakh
   registrations that join is a scan nobody needs to repeat.

   Note this is NOT the implementing agency. That is who delivers the
   handholding and assessment afterwards, which is a different question with a
   different answer, and the dashboard was reading it in this card's place.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('master.AwarenessProgram', 'Agency') IS NULL
    ALTER TABLE master.AwarenessProgram ADD Agency varchar(4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AwarenessProgram_Agency')
    ALTER TABLE master.AwarenessProgram
        ADD CONSTRAINT CK_AwarenessProgram_Agency CHECK (Agency IS NULL OR Agency IN ('QCI', 'NPC'));
GO

IF COL_LENGTH('msme.Enterprise', 'AwarenessAgency') IS NULL
    ALTER TABLE msme.Enterprise ADD AwarenessAgency varchar(4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_Enterprise_AwarenessAgency')
    ALTER TABLE msme.Enterprise
        ADD CONSTRAINT CK_Enterprise_AwarenessAgency
            CHECK (AwarenessAgency IS NULL OR AwarenessAgency IN ('QCI', 'NPC', 'Self'));
GO

/* The card counts by this on every dashboard load, filtered by state and date. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Enterprise_AwarenessAgency'
                                           AND object_id = OBJECT_ID('msme.Enterprise'))
    CREATE INDEX IX_Enterprise_AwarenessAgency
        ON msme.Enterprise (AwarenessAgency)
        INCLUDE (StateId, RegisteredOnUtc);
GO

/* Existing enterprises: answered from the registration that created them where
   one survives, and Self where the applicant said they had attended nothing.
   A registration whose programme has no agency recorded stays null rather than
   being guessed at — the dashboard shows it as unattributed. */
UPDATE e
SET AwarenessAgency =
        CASE
            WHEN r.AttendedAwareness = 0 THEN 'Self'
            WHEN p.Agency IS NOT NULL THEN p.Agency
        END
FROM msme.Enterprise e
JOIN msme.Registration r ON r.EnterpriseId = e.EnterpriseId
LEFT JOIN master.AwarenessProgram p ON p.AwarenessProgramId = r.AwarenessProgramId
WHERE e.AwarenessAgency IS NULL;
GO

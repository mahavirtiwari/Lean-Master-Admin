/*
    014 — Weightages & Pass Marks (5-green.svg).
    ------------------------------------------------------------------------
    The Questionnaire Manager draws a per-level exam configuration: pass mark,
    negative marking, time limit and maximum attempts. None of that had a home
    — msme.CertificationLevel describes what a level IS, not how its exam is
    marked — so it gets its own table keyed to the level.

    NegativeMarkPerWrong is a decimal rather than a flag because the screen
    shows "Yes (-0.25)" and "Yes (-0.33)": the rate is the setting, and "No" is
    simply a rate of zero. Storing a bool alongside a rate would allow the two
    to disagree.

    Idempotent.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF OBJECT_ID('assess.ExamConfig') IS NULL
BEGIN
    CREATE TABLE assess.ExamConfig
    (
        ExamConfigId         int IDENTITY(1,1) NOT NULL,
        CertificationLevelId tinyint       NOT NULL,
        TotalQuestions       int           NOT NULL,
        PassMarkPercent      decimal(5,2)  NOT NULL,
        -- 0 means no negative marking; the screen renders that as "No".
        NegativeMarkPerWrong decimal(4,2)  NOT NULL CONSTRAINT DF_ExamConfig_Neg DEFAULT 0,
        TimeLimitMinutes     int           NOT NULL,
        MaxAttempts          tinyint       NOT NULL,
        ModifiedOnUtc        datetime2(3)  NULL,
        ModifiedByUserId     int           NULL,
        CONSTRAINT PK_ExamConfig PRIMARY KEY (ExamConfigId),
        CONSTRAINT UQ_ExamConfig_Level UNIQUE (CertificationLevelId),
        CONSTRAINT FK_ExamConfig_Level FOREIGN KEY (CertificationLevelId)
            REFERENCES msme.CertificationLevel (CertificationLevelId),
        CONSTRAINT CK_ExamConfig_Pass CHECK (PassMarkPercent > 0 AND PassMarkPercent <= 100),
        CONSTRAINT CK_ExamConfig_Neg  CHECK (NegativeMarkPerWrong >= 0 AND NegativeMarkPerWrong < 1)
    );
END;
GO

MERGE assess.ExamConfig AS t
USING (VALUES
    (1, 450, 60.00, 0.00,  90, 3),
    (2, 280, 70.00, 0.25, 120, 2),
    (3, 180, 80.00, 0.33, 150, 2)
) AS s (CertificationLevelId, TotalQuestions, PassMarkPercent, NegativeMarkPerWrong,
        TimeLimitMinutes, MaxAttempts)
ON t.CertificationLevelId = s.CertificationLevelId
WHEN NOT MATCHED THEN
    INSERT (CertificationLevelId, TotalQuestions, PassMarkPercent, NegativeMarkPerWrong,
            TimeLimitMinutes, MaxAttempts)
    VALUES (s.CertificationLevelId, s.TotalQuestions, s.PassMarkPercent,
            s.NegativeMarkPerWrong, s.TimeLimitMinutes, s.MaxAttempts);
GO

SELECT l.Name, e.TotalQuestions, e.PassMarkPercent, e.NegativeMarkPerWrong,
       e.TimeLimitMinutes, e.MaxAttempts
FROM   assess.ExamConfig AS e
JOIN   msme.CertificationLevel AS l ON l.CertificationLevelId = e.CertificationLevelId
ORDER  BY l.SortOrder;

/* ---------------------------------------------------------------------------
   R5's "Select program" shows a programme ID and the venue address.

   AwarenessProgramId is a surrogate key and not something an applicant would
   recognise from their attendance record, so a readable code is stored
   alongside it. Existing rows are backfilled deterministically from the state
   and the year the programme was held.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('master.AwarenessProgram', 'ProgramCode') IS NULL
BEGIN
    ALTER TABLE master.AwarenessProgram ADD ProgramCode nvarchar(40) NULL;
END
GO

UPDATE p
   SET p.ProgramCode = CONCAT(
           'LAP-',
           ISNULL(s.Code, 'IN'), '-',
           FORMAT(ISNULL(p.HeldOn, '2026-01-01'), 'yyyyMM'), '-',
           RIGHT('000' + CAST(p.AwarenessProgramId AS varchar(10)), 3))
  FROM master.AwarenessProgram AS p
  LEFT JOIN master.State AS s ON s.StateId = p.StateId
 WHERE p.ProgramCode IS NULL;
GO

-- A code identifies one programme, so it may not be reused.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_AwarenessProgram_ProgramCode')
BEGIN
    CREATE UNIQUE INDEX UX_AwarenessProgram_ProgramCode
        ON master.AwarenessProgram (ProgramCode)
        WHERE ProgramCode IS NOT NULL;
END
GO

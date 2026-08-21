/* ---------------------------------------------------------------------------
   Where an awareness programme came from.

   The programmes are moving to the scheme's own service, and the portal keeps a
   local copy so a registration can point at the programme it claims attendance
   at. That raises a question the first run answered badly: when the service's
   list no longer contains a programme, should the local row be retired?

   For a row the service itself put there, yes — it has been withdrawn upstream.
   For a row an administrator typed in, no. Without this column the refresh
   could not tell the two apart and deactivated the administrator's own five
   programmes the moment the service was switched on, which is silent data loss
   dressed up as a sync.

   Existing rows are Local: they were all entered by hand, because until now
   there was nowhere else for them to come from.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('master.AwarenessProgram', 'Source') IS NULL
    ALTER TABLE master.AwarenessProgram
        ADD Source varchar(10) NOT NULL CONSTRAINT DF_AwarenessProgram_Source DEFAULT 'Local';
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AwarenessProgram_Source')
    ALTER TABLE master.AwarenessProgram
        ADD CONSTRAINT CK_AwarenessProgram_Source CHECK (Source IN ('Local', 'Service'));
GO

/* Undo the first run's over-reach: everything here predates the service, so
   nothing here was withdrawn by it. */
UPDATE master.AwarenessProgram
SET IsActive = 1
WHERE Source = 'Local' AND IsActive = 0
  AND ProgramCode NOT LIKE 'LAP-09-2026%'
  AND ProgramCode NOT LIKE 'LAP-27-202608%'
  AND ProgramCode NOT LIKE 'LAP-24-202607%';
GO

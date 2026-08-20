/* ---------------------------------------------------------------------------
   A Udyam number may hold more than one registration — one per plant.

   msme.Enterprise carried UQ_Enterprise_Udyam, from when one Udyam number meant
   one registration. Registering a second plant creates a second enterprise row
   with the same Udyam number, so completing it failed on that constraint:

     Violation of UNIQUE KEY constraint 'UQ_Enterprise_Udyam'.
     The duplicate key value is (UDYAM-UP-16-0001476).

   What must stay unique is the plant, and that is already enforced by
   UX_Enterprise_RegisteredPlantIdNo (migration 025). The Udyam number keeps a
   plain index, which is what the lookups actually need.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_Enterprise_Udyam'
                                       AND object_id = OBJECT_ID('msme.Enterprise'))
BEGIN
    -- It may exist as a constraint rather than a bare index.
    IF EXISTS (SELECT 1 FROM sys.key_constraints WHERE name = 'UQ_Enterprise_Udyam')
        ALTER TABLE msme.Enterprise DROP CONSTRAINT UQ_Enterprise_Udyam;
    ELSE
        DROP INDEX UQ_Enterprise_Udyam ON msme.Enterprise;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Enterprise_Udyam'
                                           AND object_id = OBJECT_ID('msme.Enterprise'))
BEGIN
    CREATE INDEX IX_Enterprise_Udyam ON msme.Enterprise (UdyamRegistrationNo);
END
GO

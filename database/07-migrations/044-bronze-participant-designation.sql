/* ---------------------------------------------------------------------------
   The participant's designation.

   A Bronze seat is nominated by the enterprise, and who the person is inside
   the unit matters when the certificate is read later - "Plant Head" says more
   than a name alone. The preferred-language field is dropped from the form at
   the same time; the column stays for the rows already carrying one, and is
   simply left null from here.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('msme.BronzeParticipant', 'Designation') IS NULL
BEGIN
    ALTER TABLE msme.BronzeParticipant ADD Designation nvarchar(100) NULL;
END
GO

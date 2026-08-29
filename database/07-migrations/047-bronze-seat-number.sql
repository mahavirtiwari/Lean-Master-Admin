/* ---------------------------------------------------------------------------
   Hold the Bronze seat cap in the database, not just in the code.

   Adding a participant counted the seats and then inserted, which is a
   check-then-act: several requests arriving together each counted the same free
   seats and all of them were let in. Six concurrent adds against three free
   seats seated six people — eight of five.

   Numbering the seats fixes it where it can actually be enforced. Each seat is
   1..5 for its enterprise and the pair is unique, so concurrent inserts racing
   for the same number collide and only one survives; the loser is told the
   seats are taken instead of quietly overfilling.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('msme.BronzeParticipant', 'SeatNo') IS NULL
BEGIN
    ALTER TABLE msme.BronzeParticipant ADD SeatNo tinyint NULL;
END
GO

/* Number the seats already taken, oldest first, per enterprise. */
UPDATE p
   SET SeatNo = x.rn
  FROM msme.BronzeParticipant p
  JOIN (
        SELECT BronzeParticipantId,
               ROW_NUMBER() OVER (PARTITION BY EnterpriseId ORDER BY BronzeParticipantId) AS rn
          FROM msme.BronzeParticipant
         WHERE IsActive = 1
       ) x ON x.BronzeParticipantId = p.BronzeParticipantId
 WHERE p.IsActive = 1 AND p.SeatNo IS NULL;
GO

/* One participant per seat, per enterprise. Filtered so a withdrawn seat frees
   its number for the next person. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_BronzeParticipant_Seat')
BEGIN
    CREATE UNIQUE INDEX UX_BronzeParticipant_Seat
        ON msme.BronzeParticipant (EnterpriseId, SeatNo)
     WHERE IsActive = 1 AND SeatNo IS NOT NULL;
END
GO

/* ---------------------------------------------------------------------------
   The applicant identifier: LEAN-<PLANT STATE>-<YEAR>-000000.

   Two things had to change to produce it.

   1. The state must be the PLANT's, not the enterprise's. They are often
      different — a Udyam registered in Uttar Pradesh may be registering a plant
      in Delhi — and until now the letters came from the Udyam number, which
      carries the enterprise's state. The plant's state arrives from the registry
      as a name only, so master.State gains the two-letter code and the plant row
      gains the state it was already carrying as raw text.

      The codes are seeded against the numeric LGD/GST code rather than the name,
      because the numeric code is unambiguous where a name is not ("Odisha" and
      "Orissa" are the same state; 21 is only ever one thing).

      Four of them follow a convention rather than a single official spelling —
      Uttarakhand (UK/UT), Odisha (OD/OR), Telangana (TS/TG) and Dadra & Nagar
      Haveli and Daman & Diu (DD/DN). The ones below are the forms the Ministry's
      own registrations use. They are worth confirming before go-live: a wrong
      letter here is baked into an applicant's permanent identifier.

   2. The serial is six digits, and it runs per state and year rather than
      globally. A single national counter would pass 999,999 at the volumes this
      scheme expects and start printing seven digits, which the format has no
      room for. Per state and year, six digits is a million registrations in one
      state in one year.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('master.State', 'AlphaCode') IS NULL
    ALTER TABLE master.State ADD AlphaCode varchar(3) NULL;
GO

UPDATE s SET AlphaCode = m.Alpha
FROM master.State s
JOIN (VALUES
        ('1','JK'), ('2','HP'), ('3','PB'), ('4','CH'), ('5','UK'), ('6','HR'),
        ('7','DL'), ('8','RJ'), ('9','UP'), ('10','BR'), ('11','SK'), ('12','AR'),
        ('13','NL'), ('14','MN'), ('15','MZ'), ('16','TR'), ('17','ML'), ('18','AS'),
        ('19','WB'), ('20','JH'), ('21','OD'), ('22','CG'), ('23','MP'), ('24','GJ'),
        ('27','MH'), ('28','AP'), ('29','KA'), ('30','GA'), ('31','LD'), ('32','KL'),
        ('33','TN'), ('34','PY'), ('35','AN'), ('36','TS'), ('37','LA'), ('38','DD')
     ) AS m(Code, Alpha) ON m.Code = s.Code
WHERE s.AlphaCode IS NULL OR s.AlphaCode <> m.Alpha;
GO

/* Matched by name when a plant's state is resolved, so it has to be quick and
   it has to ignore case — the registry sends "DELHI", the master holds
   "Delhi". */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_State_Name'
                                           AND object_id = OBJECT_ID('master.State'))
    CREATE INDEX IX_State_Name ON master.State (Name) INCLUDE (AlphaCode);
GO

/* Each state-year gets its own counter, named LeanId-<STATE>-<YEAR>, in the
   same way the user-code sequences are named (User-IA, User-MIN). Scoping by
   the procedure's PeriodKey instead would print the key in front of the number
   — LEAN-DL-2026-DL-2026/000001 — which the format has no room for. New names
   start at PadWidth 6 by the procedure's own default, so nothing needs seeding.

   The old national counter is widened for consistency; ids it already issued
   keep their five digits and cannot collide with the six-digit ones. */
UPDATE audit.SequenceCounter SET PadWidth = 6 WHERE SequenceName = 'LeanId';
GO

/* Plants carry their state as raw text and never resolved it to the master.
   Backfilling costs nothing here and makes the column usable for reporting as
   well as for the identifier. */
UPDATE p SET StateId = s.StateId
FROM msme.EnterprisePlant p
JOIN master.State s ON s.Name = p.StateNameRaw
WHERE p.StateId IS NULL AND p.StateNameRaw IS NOT NULL;
GO

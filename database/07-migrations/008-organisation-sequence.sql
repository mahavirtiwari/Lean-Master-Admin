/*
    008 — Sequence for organisation codes.
    ------------------------------------------------------------------------
    The Create New User screens register the organisation at the same moment as
    its first nodal contact, so the API now issues an OrganisationCode itself
    rather than expecting one to exist.

    audit.usp_NextSequence reads audit.SequenceCounter by name, so the row has
    to be seeded or the first user created against a new organisation fails.

    Padded to 5 like the user sequences; the controller prefixes "ORG-".

    Idempotent.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF NOT EXISTS (SELECT 1 FROM audit.SequenceCounter WHERE SequenceName = 'Organisation')
BEGIN
    INSERT INTO audit.SequenceCounter (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
    VALUES ('Organisation', '', 0, NULL, 5);
END;

-- Start above whatever the seed already created, so a generated code can never
-- collide with an organisation that is already there.
DECLARE @seeded int = (SELECT COUNT(*) FROM auth.Organisation);

UPDATE audit.SequenceCounter
SET    LastValue = @seeded
WHERE  SequenceName = 'Organisation'
  AND  LastValue < @seeded;

SELECT SequenceName, PeriodKey, LastValue, Prefix, PadWidth
FROM   audit.SequenceCounter
WHERE  SequenceName = 'Organisation';

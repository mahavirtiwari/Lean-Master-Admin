/* ---------------------------------------------------------------------------
   "One registration per plant" means the plant that was REGISTERED, not every
   plant on the Udyam record.

   Completing a registration copies the whole plant list from the registry —
   an enterprise has several units and they all belong to it — and marks one of
   them as the plant being registered (Enterprise.SelectedPlantId). The
   duplicate check read msme.EnterprisePlant directly, so after one
   registration every unit on that record showed as "Already registered".

   The rule is a property of the enterprise, so it is stored there: the plant
   id that this registration is for, with a unique index that states the rule.

   The index added by 023 is dropped. It made PlantIdNo unique across the whole
   plant table, which would have stopped a second enterprise from the same
   Udyam record ever being created — it copies the same five plant rows.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_EnterprisePlant_PlantIdNo')
BEGIN
    DROP INDEX UX_EnterprisePlant_PlantIdNo ON msme.EnterprisePlant;
END
GO

IF COL_LENGTH('msme.Enterprise', 'RegisteredPlantIdNo') IS NULL
BEGIN
    ALTER TABLE msme.Enterprise ADD RegisteredPlantIdNo varchar(40) NULL;
END
GO

/* Backfill from the plant each enterprise actually selected. */
UPDATE e
   SET e.RegisteredPlantIdNo = p.PlantIdNo
  FROM msme.Enterprise AS e
  JOIN msme.EnterprisePlant AS p ON p.EnterprisePlantId = e.SelectedPlantId
 WHERE e.RegisteredPlantIdNo IS NULL
   AND p.PlantIdNo IS NOT NULL;
GO

/* The rule itself. Filtered, because an enterprise registered before the plant
   rule existed may have no selected plant, and older Udyam records carry no
   plant id at all. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_Enterprise_RegisteredPlantIdNo')
BEGIN
    CREATE UNIQUE INDEX UX_Enterprise_RegisteredPlantIdNo
        ON msme.Enterprise (RegisteredPlantIdNo)
        WHERE RegisteredPlantIdNo IS NOT NULL;
END
GO

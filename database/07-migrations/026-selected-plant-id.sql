/* ---------------------------------------------------------------------------
   The draft records WHICH plant was chosen, by the registry's plant id.

   UnitIdNo does not identify a plant: the registry repeats it across the units
   of one enterprise. UDYAM-UP-16-0001476 has three plants all carrying
   UnitIdNo 3206195 and distinct PlantIdNo values (3303509/10/11).

   Keying on UnitIdNo therefore always resolved to the first of them, so
   choosing the second plant was reported as "already registered" — the first
   one is — and, had that passed, the wrong plant would have been recorded as
   the registered one at completion.

   PlantIdNo is the registry's own identifier for a plant and is what the
   selection is keyed on now. UnitIdNo stays for older records that carry no
   plant id.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('msme.Registration', 'SelectedPlantIdNo') IS NULL
BEGIN
    ALTER TABLE msme.Registration ADD SelectedPlantIdNo varchar(40) NULL;
END
GO

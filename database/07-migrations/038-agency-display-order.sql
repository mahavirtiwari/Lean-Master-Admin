/* ---------------------------------------------------------------------------
   Implementing agencies get an order of their own.

   The dashboard printed them alphabetically, which put NPC ahead of QCI on
   every card. Which agency leads is a scheme decision, not an accident of
   spelling, so it is held against the organisation and administered there
   rather than fixed in the dashboard's code.

   Everything else keeps the default, and still falls back to the name.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('auth.Organisation', 'DisplayOrder') IS NULL
    ALTER TABLE auth.Organisation ADD DisplayOrder smallint NOT NULL
        CONSTRAINT DF_Organisation_DisplayOrder DEFAULT 100;
GO

UPDATE auth.Organisation SET DisplayOrder = 1
WHERE AccountTypeId = 1 AND Name LIKE '%(QCI)%' AND DisplayOrder = 100;

UPDATE auth.Organisation SET DisplayOrder = 2
WHERE AccountTypeId = 1 AND Name LIKE '%(NPC)%' AND DisplayOrder = 100;
GO

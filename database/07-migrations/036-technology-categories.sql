/* ---------------------------------------------------------------------------
   Technology categories get a code of their own, and a screen to maintain them.

   The category was a name and a sort order — enough to fill a dropdown, not
   enough to be master data somebody administers. It is now addressed the same
   way sectors and parameters are: a short code beside the name, unique, shown
   in the dropdown so the person choosing sees both.

   Existing categories are given a code derived from their name, which is what
   an administrator would have typed anyway, and can be edited afterwards.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('master.TechnologyCategory', 'Code') IS NULL
    ALTER TABLE master.TechnologyCategory ADD Code varchar(20) NULL;
GO

/* TC-01, TC-02 … in the order they are already sorted, so the codes read in the
   same sequence the dropdown does. */
WITH numbered AS
(
    SELECT TechnologyCategoryId,
           ROW_NUMBER() OVER (ORDER BY SortOrder, TechnologyCategoryId) AS Position
    FROM master.TechnologyCategory
    WHERE Code IS NULL
)
UPDATE c
SET Code = 'TC-' + RIGHT('0' + CAST(n.Position AS varchar(3)), 2)
FROM master.TechnologyCategory c
JOIN numbered n ON n.TechnologyCategoryId = c.TechnologyCategoryId;
GO

IF EXISTS (SELECT 1 FROM master.TechnologyCategory WHERE Code IS NULL)
    THROW 50036, 'Some technology categories still have no code; check the backfill.', 1;
GO

ALTER TABLE master.TechnologyCategory ALTER COLUMN Code varchar(20) NOT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TechnologyCategory_Code'
                                           AND object_id = OBJECT_ID('master.TechnologyCategory'))
    CREATE UNIQUE INDEX UX_TechnologyCategory_Code ON master.TechnologyCategory (Code);
GO

-- ------------------------------------------------------------ the sub-menu ---
/* Technology Upgradation becomes a parent with two children, the way
   Questionnaire and Fee Structure already are. */
IF NOT EXISTS (SELECT 1 FROM auth.MenuItem WHERE Code = 'TECH_CATEGORY')
    INSERT INTO auth.MenuItem (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId, IsActive)
    SELECT ModuleId, MenuItemId, 'TECH_CATEGORY', N'Category', '/technology-upgradation/categories', IconKey, 1101, NULL, 1
    FROM auth.MenuItem WHERE Code = 'TECH_UPGRAD';
GO

IF NOT EXISTS (SELECT 1 FROM auth.MenuItem WHERE Code = 'TECH_LIST')
    INSERT INTO auth.MenuItem (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId, IsActive)
    SELECT ModuleId, MenuItemId, 'TECH_LIST', N'Technologies', '/technology-upgradation', IconKey, 1102, NULL, 1
    FROM auth.MenuItem WHERE Code = 'TECH_UPGRAD';
GO

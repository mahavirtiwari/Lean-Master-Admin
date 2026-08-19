/*
    016 — "Campaign" and "Transactional" under Emailer.
    ------------------------------------------------------------------------
    Emailer was a single top-level entry. It becomes a parent with two
    children, matching how the artboards split the module:

      Campaign        79-emailer-green.svg — compose a bulk send to chosen
                      account types, plus the campaign history.
      Transactional   80/81 — the templates the portal fires automatically
                      when a scheme event occurs, and their editor.

    Both children stay on the EMAILER module, so nothing changes in the
    permission matrix: a role that could reach Emailer can reach both halves,
    exactly as before.

    Idempotent.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

DECLARE @parent int = (SELECT MenuItemId FROM auth.MenuItem WHERE Code = 'EMAILER');
DECLARE @module tinyint = (SELECT ModuleId FROM auth.Module WHERE Code = 'EMAILER');

IF @parent IS NULL OR @module IS NULL
    THROW 50016, 'The EMAILER menu item or module is missing; run the base scripts first.', 1;

-- The parent keeps its own landing route: clicking "Emailer" should still go
-- somewhere rather than only toggling the group open.
UPDATE auth.MenuItem
SET    RoutePath = '/emailer', IsActive = 1
WHERE  MenuItemId = @parent;

MERGE auth.MenuItem AS t
USING (VALUES
    ('EMAILER_CAMPAIGN',      N'Campaign',      '/emailer/campaign',      1401),
    ('EMAILER_TRANSACTIONAL', N'Transactional', '/emailer/transactional', 1402)
) AS s (Code, Label, RoutePath, SortOrder)
ON t.Code = s.Code
WHEN MATCHED THEN UPDATE SET
    t.Label            = s.Label,
    t.RoutePath        = s.RoutePath,
    t.ParentMenuItemId = @parent,
    t.ModuleId         = @module,
    t.SortOrder        = s.SortOrder,
    t.IsActive         = 1
WHEN NOT MATCHED THEN
    INSERT (ParentMenuItemId, Code, Label, RoutePath, ModuleId, SortOrder, IsActive)
    VALUES (@parent, s.Code, s.Label, s.RoutePath, @module, s.SortOrder, 1);

COMMIT TRANSACTION;
GO

SELECT MenuItemId, ParentMenuItemId, Code, Label, RoutePath, SortOrder, IsActive
FROM   auth.MenuItem
WHERE  Code LIKE 'EMAILER%'
ORDER  BY SortOrder;

/*
    015 — An index behind every foreign key.
    ------------------------------------------------------------------------
    An audit found ~40 foreign keys whose column is not the leading key of any
    index. That costs twice:

      * Deleting or updating a parent row makes SQL Server scan the whole child
        table to enforce the constraint. On audit.AuditLog (already thousands of
        rows and growing with every action) that is a scan per delete.

      * Every join along that relationship — which is most of what the portal's
        list screens do — has no index to seek on.

    The fix is mechanical, so it is generated from the catalogue rather than
    hand-listed: anything the audit would flag gets an index, and re-running
    after adding a new table covers that one too. Each statement is printed
    before it runs, so the migration log says exactly what it created.

    Indexes are named IX_<Table>_<Columns> and are created only where missing,
    which makes this safe to re-run.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @sql nvarchar(max);
DECLARE @created int = 0;

-- The index NAME is built from bare column names and the column LIST from
-- quoted ones. Quoting the name a second time would bake the brackets into it
-- (IX_Table_[Col]]), which is legal but unreadable in every catalogue view.
DECLARE fks CURSOR LOCAL FAST_FORWARD FOR
    SELECT DISTINCT
           'CREATE NONCLUSTERED INDEX ' +
           QUOTENAME('IX_' + t.name + '_' + cols.NameParts) +
           ' ON ' + QUOTENAME(s.name) + '.' + QUOTENAME(t.name) +
           ' (' + cols.ColumnList + ');'
    FROM sys.foreign_keys fk
    JOIN sys.tables  t ON t.object_id = fk.parent_object_id
    JOIN sys.schemas s ON s.schema_id = t.schema_id
    CROSS APPLY
    (
        SELECT STRING_AGG(QUOTENAME(c.name), ', ')
                   WITHIN GROUP (ORDER BY fkc.constraint_column_id),
               STRING_AGG(c.name, '_')
                   WITHIN GROUP (ORDER BY fkc.constraint_column_id)
        FROM sys.foreign_key_columns fkc
        JOIN sys.columns c
          ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
        WHERE fkc.constraint_object_id = fk.object_id
    ) AS cols (ColumnList, NameParts)
    WHERE
        -- No index already leads with this FK's first column.
        NOT EXISTS (
            SELECT 1
            FROM sys.foreign_key_columns fkc
            JOIN sys.index_columns ic
              ON ic.object_id = fkc.parent_object_id
             AND ic.column_id = fkc.parent_column_id
             AND ic.key_ordinal = 1
             AND ic.is_included_column = 0
            WHERE fkc.constraint_object_id = fk.object_id
              AND fkc.constraint_column_id = 1)
        -- And the index this would create does not exist under that name.
        AND NOT EXISTS (
            SELECT 1 FROM sys.indexes i
            WHERE i.object_id = t.object_id
              AND i.name = 'IX_' + t.name + '_' + cols.NameParts);

OPEN fks;
FETCH NEXT FROM fks INTO @sql;

WHILE @@FETCH_STATUS = 0
BEGIN
    PRINT @sql;
    EXEC sys.sp_executesql @sql;
    SET @created += 1;
    FETCH NEXT FROM fks INTO @sql;
END;

CLOSE fks;
DEALLOCATE fks;

PRINT '--- indexes created: ' + CONVERT(varchar(10), @created);
GO

-- Nothing should remain unindexed after this runs.
SELECT RemainingUnindexedForeignKeys = COUNT(*)
FROM   sys.foreign_keys fk
WHERE  NOT EXISTS (
    SELECT 1
    FROM sys.foreign_key_columns fkc
    JOIN sys.index_columns ic
      ON ic.object_id = fkc.parent_object_id
     AND ic.column_id = fkc.parent_column_id
     AND ic.key_ordinal = 1
     AND ic.is_included_column = 0
    WHERE fkc.constraint_object_id = fk.object_id
      AND fkc.constraint_column_id = 1);

/* ---------------------------------------------------------------------------
   Why a master record was disabled, and by whom.

   Sectors, parameters and technologies can all be switched off, and switching
   one off changes what applicants can register against. Until now the portal
   recorded that the flag changed — the audit trail carries the old and new
   values — but not the reason, and the reason is the part a later reader needs:
   "IsActive: true -> false" does not say whether a sector was withdrawn from
   the scheme, merged into another, or disabled by mistake.

   One table for all three rather than a Reason column on each, because the
   question is the same question everywhere and a shared log can be read as one
   history. Users already have their own equivalent in auth.UserStatusHistory,
   which predates this and is left where it is.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF OBJECT_ID('master.StatusChangeLog', 'U') IS NULL
BEGIN
    CREATE TABLE master.StatusChangeLog
    (
        StatusChangeLogId bigint        NOT NULL IDENTITY(1,1),

        /* Sector, Parameter, Technology — the master being switched. */
        EntityName        varchar(40)   NOT NULL,
        EntityId          int           NOT NULL,

        /* Kept as text beside the id: a name read from the row today may have
           been edited by the time somebody reads this log. */
        EntityLabel       nvarchar(300) NULL,

        FromActive        bit           NOT NULL,
        ToActive          bit           NOT NULL,
        Reason            nvarchar(500) NOT NULL,

        ChangedByUserId   int           NULL,
        ChangedOnUtc      datetime2(7)  NOT NULL
            CONSTRAINT DF_StatusChangeLog_On DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_StatusChangeLog PRIMARY KEY (StatusChangeLogId)
    );

    CREATE INDEX IX_StatusChangeLog_Entity
        ON master.StatusChangeLog (EntityName, EntityId, ChangedOnUtc DESC);
END
GO

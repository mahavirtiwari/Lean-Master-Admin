/*
    006 — Store the complete Udyam payload.
    ------------------------------------------------------------------------
    Migration 004 took the fields the dashboard needed. This one takes the rest,
    so nothing the registry returns is discarded.

    The payload is not flat. UamDetail is

        BasicDetail      one block   -> columns on msme.Enterprise
        ActivityDetail   0..n        -> msme.EnterpriseActivity
        PlantDetail      0..n        -> msme.EnterprisePlant

    Activities and plants are repeating, so they become child tables. Flattening
    them onto the enterprise would keep only the first, and a unit with three
    plants across two districts is ordinary — the sample record already carries
    a plant whose address differs from the registered office.

    The registry's own spellings are kept alongside the resolved foreign keys
    (StateNameRaw, DistrictNameRaw, LgStateCode, LgDistrictCode). When a code
    fails to resolve against master.State / master.District, the raw values are
    what tells an administrator why.

    Idempotent.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

-- ================================================ BasicDetail remainder ===
IF COL_LENGTH('msme.Enterprise', 'LgStateCode') IS NULL
    ALTER TABLE msme.Enterprise ADD LgStateCode varchar(4) NULL;

IF COL_LENGTH('msme.Enterprise', 'LgDistrictCode') IS NULL
    ALTER TABLE msme.Enterprise ADD LgDistrictCode varchar(6) NULL;

-- The registry's spelling, kept verbatim for reconciliation.
IF COL_LENGTH('msme.Enterprise', 'StateNameRaw') IS NULL
    ALTER TABLE msme.Enterprise ADD StateNameRaw nvarchar(120) NULL;

IF COL_LENGTH('msme.Enterprise', 'DistrictNameRaw') IS NULL
    ALTER TABLE msme.Enterprise ADD DistrictNameRaw nvarchar(240) NULL;

IF COL_LENGTH('msme.Enterprise', 'WhetherProductionCommenced') IS NULL
    ALTER TABLE msme.Enterprise ADD WhetherProductionCommenced bit NULL;

-- District Industries Centre the unit reports to.
IF COL_LENGTH('msme.Enterprise', 'DicName') IS NULL
    ALTER TABLE msme.Enterprise ADD DicName nvarchar(160) NULL;

IF COL_LENGTH('msme.Enterprise', 'UdyamAppliedDate') IS NULL
    ALTER TABLE msme.Enterprise ADD UdyamAppliedDate date NULL;

-- The applicant's own contact block, captured on the form beside the pull.
IF COL_LENGTH('msme.Enterprise', 'OwnerEmail') IS NULL
    ALTER TABLE msme.Enterprise ADD OwnerEmail nvarchar(256) NULL;

IF COL_LENGTH('msme.Enterprise', 'OwnerMobile') IS NULL
    ALTER TABLE msme.Enterprise ADD OwnerMobile varchar(15) NULL;

-- The whole response as received. Cheap insurance: when the registry adds a
-- field, the record is already here and can be backfilled without re-fetching.
IF COL_LENGTH('msme.Enterprise', 'UdyamRawResponse') IS NULL
    ALTER TABLE msme.Enterprise ADD UdyamRawResponse nvarchar(max) NULL;
GO

-- ===================================================== ActivityDetail ===
IF OBJECT_ID('msme.EnterpriseActivity', 'U') IS NULL
BEGIN
    CREATE TABLE msme.EnterpriseActivity
    (
        EnterpriseActivityId int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_EnterpriseActivity PRIMARY KEY,
        EnterpriseId         int           NOT NULL,
        UdyamApplicationId   varchar(20)   NULL,

        /* "Manufacturing" or "Services" */
        Activity             nvarchar(40)  NULL,

        /* NIC 2008 at each depth: code and description held apart so the code
           can be joined on and the description shown. */
        NicTwoDigit          varchar(4)    NULL,
        NicTwoDigitName      nvarchar(250) NULL,
        NicFourDigit         varchar(8)    NULL,
        NicFourDigitName     nvarchar(250) NULL,
        NicFiveDigit         varchar(10)   NULL,
        NicFiveDigitName     nvarchar(250) NULL,

        IsPrimary            bit           NOT NULL
            CONSTRAINT DF_EnterpriseActivity_Primary DEFAULT (0),
        CreatedOnUtc         datetime2(3)  NOT NULL
            CONSTRAINT DF_EnterpriseActivity_Created DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT FK_EnterpriseActivity_Enterprise
            FOREIGN KEY (EnterpriseId) REFERENCES msme.Enterprise (EnterpriseId)
            ON DELETE CASCADE
    );

    CREATE INDEX IX_EnterpriseActivity_Enterprise
        ON msme.EnterpriseActivity (EnterpriseId);

    CREATE INDEX IX_EnterpriseActivity_Nic
        ON msme.EnterpriseActivity (NicTwoDigit) INCLUDE (EnterpriseId);
END;
GO

-- ======================================================== PlantDetail ===
IF OBJECT_ID('msme.EnterprisePlant', 'U') IS NULL
BEGIN
    CREATE TABLE msme.EnterprisePlant
    (
        EnterprisePlantId  int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_EnterprisePlant PRIMARY KEY,
        EnterpriseId       int           NOT NULL,
        UdyamApplicationId varchar(20)   NULL,

        UnitIdNo           varchar(20)   NULL,
        UnitName           nvarchar(250) NULL,
        /* The pre-Udyam Udyog Aadhaar number, still quoted on older records. */
        UamNo              varchar(30)   NULL,
        PlantIdNo          varchar(20)   NULL,

        AddressLine        nvarchar(500) NULL,
        Pincode            varchar(10)   NULL,

        /* A plant may sit in a different district from the registered office,
           so it carries its own resolved keys as well as the raw names. */
        StateId            smallint      NULL,
        DistrictId         int           NULL,
        LgDistrictCode     varchar(6)    NULL,
        StateNameRaw       nvarchar(120) NULL,
        DistrictNameRaw    nvarchar(240) NULL,

        CreatedOnUtc       datetime2(3)  NOT NULL
            CONSTRAINT DF_EnterprisePlant_Created DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT FK_EnterprisePlant_Enterprise
            FOREIGN KEY (EnterpriseId) REFERENCES msme.Enterprise (EnterpriseId)
            ON DELETE CASCADE,
        CONSTRAINT FK_EnterprisePlant_State
            FOREIGN KEY (StateId) REFERENCES master.State (StateId),
        CONSTRAINT FK_EnterprisePlant_District
            FOREIGN KEY (DistrictId) REFERENCES master.District (DistrictId)
    );

    CREATE INDEX IX_EnterprisePlant_Enterprise
        ON msme.EnterprisePlant (EnterpriseId);
END;
GO

PRINT 'Migration 006 complete.';
GO

SELECT 'Enterprise columns' AS Entity, COUNT(*) AS Cols
FROM   sys.columns WHERE object_id = OBJECT_ID('msme.Enterprise')
UNION ALL
SELECT 'EnterpriseActivity', COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('msme.EnterpriseActivity')
UNION ALL
SELECT 'EnterprisePlant',    COUNT(*) FROM sys.columns WHERE object_id = OBJECT_ID('msme.EnterprisePlant');

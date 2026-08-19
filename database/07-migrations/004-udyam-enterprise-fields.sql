/*
    004 — Enterprise fields sourced from the Udyam registry.
    ------------------------------------------------------------------------
    The portal fetches an applicant's particulars from

        https://udyogaadhaar.gov.in/sv/UAMRestServiceAssist.svc/GetUdyam/
            {udyamNumber},{mobile},{token}

    which returns UamDetail/BasicDetail with the promoter's gender and social
    category, the organisation type, the enterprise size band, the NIC activity
    and the LGD state/district codes.

    Those last two are why migration 003 had to land first: Udyam addresses are
    keyed by LG_ST_Code / LG_DT_Code, so the portal can resolve a state and
    district by code rather than by matching spelling.

    Gender, SocialCategory and EnterpriseType also back three of the dashboard
    panels, which is why they are stored on the enterprise rather than being
    re-fetched per report.

    Idempotent.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- ------------------------------------------------------------- columns ---
IF COL_LENGTH('msme.Enterprise', 'UdyamApplicationId') IS NULL
    ALTER TABLE msme.Enterprise ADD UdyamApplicationId varchar(20) NULL;

IF COL_LENGTH('msme.Enterprise', 'OwnerName') IS NULL
    ALTER TABLE msme.Enterprise ADD OwnerName nvarchar(200) NULL;

IF COL_LENGTH('msme.Enterprise', 'OrganisationType') IS NULL
    ALTER TABLE msme.Enterprise ADD OrganisationType nvarchar(60) NULL;

-- Free text rather than a lookup: Udyam is the system of record and adds
-- values without notice. A constrained column would reject a live registration.
IF COL_LENGTH('msme.Enterprise', 'Gender') IS NULL
    ALTER TABLE msme.Enterprise ADD Gender nvarchar(20) NULL;

IF COL_LENGTH('msme.Enterprise', 'SocialCategory') IS NULL
    ALTER TABLE msme.Enterprise ADD SocialCategory nvarchar(30) NULL;

IF COL_LENGTH('msme.Enterprise', 'IsPhysicallyHandicapped') IS NULL
    ALTER TABLE msme.Enterprise ADD IsPhysicallyHandicapped bit NULL;

IF COL_LENGTH('msme.Enterprise', 'MajorActivity') IS NULL
    ALTER TABLE msme.Enterprise ADD MajorActivity nvarchar(40) NULL;

-- The NIC 2008 activity, at the three depths Udyam reports.
IF COL_LENGTH('msme.Enterprise', 'NicTwoDigit') IS NULL
    ALTER TABLE msme.Enterprise ADD NicTwoDigit varchar(4) NULL;

IF COL_LENGTH('msme.Enterprise', 'NicFourDigit') IS NULL
    ALTER TABLE msme.Enterprise ADD NicFourDigit varchar(8) NULL;

IF COL_LENGTH('msme.Enterprise', 'NicFiveDigit') IS NULL
    ALTER TABLE msme.Enterprise ADD NicFiveDigit varchar(10) NULL;

IF COL_LENGTH('msme.Enterprise', 'NicDescription') IS NULL
    ALTER TABLE msme.Enterprise ADD NicDescription nvarchar(250) NULL;

IF COL_LENGTH('msme.Enterprise', 'TotalEmployees') IS NULL
    ALTER TABLE msme.Enterprise ADD TotalEmployees int NULL;

IF COL_LENGTH('msme.Enterprise', 'IncorporationDate') IS NULL
    ALTER TABLE msme.Enterprise ADD IncorporationDate date NULL;

IF COL_LENGTH('msme.Enterprise', 'CommencementDate') IS NULL
    ALTER TABLE msme.Enterprise ADD CommencementDate date NULL;

IF COL_LENGTH('msme.Enterprise', 'UdyamFetchedOnUtc') IS NULL
    ALTER TABLE msme.Enterprise ADD UdyamFetchedOnUtc datetime2(3) NULL;

-- The contact block the applicant supplies alongside the Udyam pull.
IF COL_LENGTH('msme.Enterprise', 'ContactDesignation') IS NULL
    ALTER TABLE msme.Enterprise ADD ContactDesignation nvarchar(120) NULL;

COMMIT TRANSACTION;
GO

-- -------------------------------------------------------------- indexes ---
-- The registration flow looks an enterprise up by Udyam number before creating
-- one, and the dashboard groups by the three demographic columns.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Enterprise_Udyam' AND object_id = OBJECT_ID('msme.Enterprise'))
    CREATE INDEX IX_Enterprise_Udyam ON msme.Enterprise (UdyamRegistrationNo) INCLUDE (UdyamApplicationId);
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Enterprise_Demographics' AND object_id = OBJECT_ID('msme.Enterprise'))
    CREATE INDEX IX_Enterprise_Demographics ON msme.Enterprise (Gender, SocialCategory, EnterpriseSize) INCLUDE (SectorId, StateId);
GO

PRINT 'Migration 004 complete.';

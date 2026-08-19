/*
    Demo data for the local presentation build.
    ------------------------------------------------------------------------
    Generates a spread of enterprises and applications across every pipeline
    stage so the Dashboard, Handholding and Assessments screens have something
    to show. Numbers are illustrative, not real scheme figures.

    Safe to re-run: it removes only the rows it created, which are all tagged
    with a DEMO- prefix on their business key. Nothing else is touched.

    NOT part of the production deployment. deploy-database.ps1 runs folders
    01-07; this one is invoked explicitly.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- ------------------------------------------------------------- clean up ---
-- Children first: Application has a required FK to Enterprise.
DELETE a
FROM msme.Application AS a
INNER JOIN msme.Enterprise AS e ON e.EnterpriseId = a.EnterpriseId
WHERE e.UdyamRegistrationNo LIKE 'DEMO-%';

DELETE FROM msme.Enterprise WHERE UdyamRegistrationNo LIKE 'DEMO-%';

-- --------------------------------------------------------- enterprises ---
-- 420 enterprises spread over the active states and sectors. The modulo
-- arithmetic is only there to scatter them; nothing depends on the pattern.
DECLARE @sectors TABLE (RowNo int IDENTITY(1,1), SectorId smallint);
INSERT INTO @sectors (SectorId)
SELECT SectorId FROM master.Sector WHERE IsActive = 1;

-- States are weighted, not spread evenly. MSME manufacturing concentrates in a
-- handful of industrial states, and an even spread makes the dashboard's map
-- and Top States leaderboard meaningless — every state ties.
--
-- A state's weight is how many slots it takes in the draw table.
DECLARE @states TABLE (RowNo int IDENTITY(1,1), StateId smallint);

INSERT INTO @states (StateId)
SELECT s.StateId
FROM master.State AS s
CROSS APPLY
(
    SELECT TOP (
        CASE s.Name
            WHEN N'Maharashtra'    THEN 12
            WHEN N'Gujarat'        THEN 10
            WHEN N'Tamil Nadu'     THEN  9
            WHEN N'Uttar Pradesh'  THEN  8
            WHEN N'Karnataka'      THEN  7
            WHEN N'Rajasthan'      THEN  5
            WHEN N'Punjab'         THEN  4
            WHEN N'Haryana'        THEN  4
            WHEN N'Telangana'      THEN  4
            WHEN N'West Bengal'    THEN  3
            WHEN N'Madhya Pradesh' THEN  3
            WHEN N'Andhra Pradesh' THEN  3
            WHEN N'Kerala'         THEN  2
            WHEN N'Odisha'         THEN  2
            WHEN N'Bihar'          THEN  2
            ELSE 1
        END) 1 AS Slot
    FROM sys.all_objects
) AS weight
WHERE s.IsActive = 1;

DECLARE @sectorCount int = (SELECT COUNT(*) FROM @sectors);
DECLARE @stateCount  int = (SELECT COUNT(*) FROM @states);

;WITH Numbers AS
(
    SELECT TOP (420) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
INSERT INTO msme.Enterprise
(
    UdyamRegistrationNo, Name, SectorId, SubsidyCategoryId, EnterpriseSize,
    AddressLine, StateId, DistrictId, Pincode, ContactPersonName, ContactEmail, ContactMobile,
    IsActive, RegisteredOnUtc
)
SELECT
    'DEMO-UDYAM-' + RIGHT('00000' + CAST(n AS varchar(5)), 5),
    CASE n % 6
        WHEN 0 THEN 'Precision Components Pvt Ltd '
        WHEN 1 THEN 'Bharat Engineering Works '
        WHEN 2 THEN 'Shakti Auto Parts '
        WHEN 3 THEN 'Ganga Textiles Mills '
        WHEN 4 THEN 'Sunrise Food Processing '
        ELSE 'Anand Fabrication Industries '
    END + CAST(n AS varchar(5)),
    (SELECT SectorId FROM @sectors WHERE RowNo = (n % @sectorCount) + 1),
    CASE WHEN n % 5 = 0 THEN 2 ELSE 1 END,
    CASE n % 3 WHEN 0 THEN 'Micro' WHEN 1 THEN 'Small' ELSE 'Medium' END,
    CAST(n AS varchar(5)) + ', Industrial Estate, Phase II',
    (SELECT StateId FROM @states WHERE RowNo = (n % @stateCount) + 1),
    -- A district inside the state just chosen, so the pair is coherent and the
    -- dashboard's Top Districts panel has something to rank.
    (SELECT TOP 1 d.DistrictId
     FROM master.District AS d
     WHERE d.StateId = (SELECT StateId FROM @states WHERE RowNo = (n % @stateCount) + 1)
       AND d.IsActive = 1
     ORDER BY (d.DistrictId + n) % 17, d.DistrictId),
    RIGHT('000000' + CAST(110000 + (n * 7) % 700000 AS varchar(6)), 6),
    'Contact Person ' + CAST(n AS varchar(5)),
    'unit' + CAST(n AS varchar(5)) + '@demo.mcls.local',
    '9' + RIGHT('000000000' + CAST(100000000 + n AS varchar(9)), 9),
    1,
    DATEADD(DAY, -(n % 400), SYSUTCDATETIME())
FROM Numbers;

-- --------------------------------------------------------- applications ---
-- One application per enterprise, distributed across the ten pipeline stages
-- so every status filter on Handholding and Assessments returns rows.
;WITH Seeded AS
(
    SELECT
        e.EnterpriseId,
        e.RegisteredOnUtc,
        ROW_NUMBER() OVER (ORDER BY e.EnterpriseId) AS n
    FROM msme.Enterprise AS e
    WHERE e.UdyamRegistrationNo LIKE 'DEMO-%'
),
Shaped AS
(
    SELECT
        EnterpriseId,
        RegisteredOnUtc,
        n,
        -- Weighted so the funnel narrows towards certification, which is what
        -- the dashboard's level cards are meant to illustrate.
        CASE
            WHEN n % 20 IN (0, 1, 2, 3)    THEN 1   -- Registered
            WHEN n % 20 IN (4, 5, 6)       THEN 2   -- Payment received
            WHEN n % 20 IN (7, 8, 9)       THEN 3   -- Handholding in progress
            WHEN n % 20 IN (10, 11)        THEN 4   -- Handholding done
            WHEN n % 20 = 12               THEN 5   -- Assessment scheduled
            WHEN n % 20 = 13               THEN 6   -- Assessment in progress
            WHEN n % 20 = 14               THEN 7   -- NC raised
            WHEN n % 20 = 15               THEN 8   -- Quality check
            WHEN n % 20 IN (16, 17, 18)    THEN 9   -- Certified
            ELSE 10                                 -- Rejected
        END AS StatusId,
        -- Divided rather than modulo'd by 20, so the level does not correlate
        -- with the status above — otherwise every certified row lands on the
        -- same level and the dashboard's Bronze and Gold cards read zero.
        CASE (n / 20) % 3
            WHEN 0 THEN 1  -- Bronze
            WHEN 1 THEN 2  -- Silver
            ELSE 3         -- Gold
        END AS LevelId
    FROM Seeded
)
INSERT INTO msme.Application
(
    ApplicationNo, EnterpriseId, CertificationLevelId, ApplicationStatusId,
    RegisteredOnUtc, PaymentReceivedOnUtc, HandholdingStartedOnUtc,
    HandholdingCompletedOnUtc, CertifiedOnUtc, CertificateNo,
    CertificateValidTillUtc, RejectedOnUtc, RejectionReason, LatestScore
)
SELECT
    'MCLS-APP-' + RIGHT('000000' + CAST(n AS varchar(6)), 6),
    EnterpriseId,
    LevelId,
    StatusId,
    RegisteredOnUtc,
    CASE WHEN StatusId >= 2 THEN DATEADD(DAY, 7, RegisteredOnUtc) END,
    CASE WHEN StatusId >= 3 THEN DATEADD(DAY, 21, RegisteredOnUtc) END,
    CASE WHEN StatusId >= 4 THEN DATEADD(DAY, 75, RegisteredOnUtc) END,
    CASE WHEN StatusId = 9 THEN DATEADD(DAY, 120, RegisteredOnUtc) END,
    CASE WHEN StatusId = 9 THEN 'MCLS-CERT-' + RIGHT('000000' + CAST(n AS varchar(6)), 6) END,
    CASE WHEN StatusId = 9 THEN DATEADD(YEAR, 3, DATEADD(DAY, 120, RegisteredOnUtc)) END,
    CASE WHEN StatusId = 10 THEN DATEADD(DAY, 95, RegisteredOnUtc) END,
    CASE WHEN StatusId = 10 THEN N'Did not meet the minimum LEAN score at assessment.' END,
    CASE WHEN StatusId >= 6 THEN 55 + (n % 40) END
FROM Shaped;

COMMIT TRANSACTION;

-- ------------------------------------------------------------- summary ---
SELECT 'Enterprises' AS Entity, COUNT(*) AS Rows
FROM msme.Enterprise WHERE UdyamRegistrationNo LIKE 'DEMO-%'
UNION ALL
SELECT 'Applications', COUNT(*)
FROM msme.Application WHERE ApplicationNo LIKE 'MCLS-APP-%';

SELECT s.Code AS Stage, COUNT(*) AS Applications
FROM msme.Application AS a
INNER JOIN msme.ApplicationStatus AS s ON s.ApplicationStatusId = a.ApplicationStatusId
GROUP BY s.Code, a.ApplicationStatusId
ORDER BY a.ApplicationStatusId;

-- ------------------------------------------------- Udyam demographics ---
-- The Gender, Enterprise Type and Social Category panels on the dashboard read
-- these columns. On a live portal they arrive from the Udyam pull; for the demo
-- they are distributed to roughly the proportions the design shows
-- (68/31/1 gender, 63/29/8 size, 45/34/14/7 social category).
UPDATE e
SET    e.Gender = CASE
           WHEN e.EnterpriseId % 100 = 0 THEN N'Others'
           WHEN e.EnterpriseId % 100 < 32 THEN N'Female'
           ELSE N'Male'
       END,
       e.SocialCategory = CASE
           WHEN e.EnterpriseId % 100 < 45 THEN N'General'
           WHEN e.EnterpriseId % 100 < 79 THEN N'OBC'
           WHEN e.EnterpriseId % 100 < 93 THEN N'SC'
           ELSE N'ST'
       END,
       e.EnterpriseSize = CASE
           WHEN e.EnterpriseId % 100 < 63 THEN N'Micro'
           WHEN e.EnterpriseId % 100 < 92 THEN N'Small'
           ELSE N'Medium'
       END,
       e.OrganisationType = CASE e.EnterpriseId % 4
           WHEN 0 THEN N'Proprietary' WHEN 1 THEN N'Partnership'
           WHEN 2 THEN N'Private Limited' ELSE N'LLP'
       END,
       e.MajorActivity = CASE WHEN e.EnterpriseId % 5 = 0 THEN N'Services' ELSE N'Manufacturing' END,
       e.NicTwoDigit = s.NicCode,
       e.NicDescription = s.Name,
       e.TotalEmployees = 5 + (e.EnterpriseId % 180),
       e.IsPhysicallyHandicapped = CASE WHEN e.EnterpriseId % 50 = 0 THEN 1 ELSE 0 END
FROM   msme.Enterprise AS e
INNER JOIN master.Sector AS s ON s.SectorId = e.SectorId
WHERE  e.UdyamRegistrationNo LIKE 'DEMO-%';

SELECT Gender, COUNT(*) AS Enterprises FROM msme.Enterprise WHERE UdyamRegistrationNo LIKE 'DEMO-%' GROUP BY Gender;
SELECT SocialCategory, COUNT(*) FROM msme.Enterprise WHERE UdyamRegistrationNo LIKE 'DEMO-%' GROUP BY SocialCategory;

-- ------------------------------------------------- implementing agency ---
-- The dashboard splits every figure by delivery agency (QCI / NPC): the KPI
-- cards carry a "QCI: n | NPC: n" line and each certification-level card has an
-- Agency Breakdown panel. Without this the split is empty.
WITH Agencies AS
(
    SELECT OrganisationId,
           Rank = ROW_NUMBER() OVER (ORDER BY OrganisationId)
    FROM   auth.Organisation
    WHERE  AccountTypeId = 1 AND IsActive = 1      -- Implementing Agency
)
UPDATE a
SET    a.ImplementingAgencyId = ag.OrganisationId
FROM   msme.Application AS a
CROSS APPLY
(
    -- Roughly 57/43 between the two, which is the ratio the design shows.
    SELECT TOP 1 OrganisationId
    FROM   Agencies
    WHERE  Rank = CASE WHEN a.ApplicationId % 100 < 57 THEN 1 ELSE 2 END
) AS ag
WHERE  a.ApplicationNo LIKE 'MCLS-APP-%';

SELECT o.Name AS Agency, COUNT(*) AS Applications
FROM   msme.Application AS a
INNER JOIN auth.Organisation AS o ON o.OrganisationId = a.ImplementingAgencyId
GROUP  BY o.Name;

/*
    Demo documents for the Upload Documents screens.
    ------------------------------------------------------------------------
    Creates the document library the design shows, with a live version each and
    a role assignment across the ten audiences.

    No file is written to disk. DocumentVersion.RelativePath points at a path
    that does not exist, so the metadata screens (library, view, edit, delete)
    all work while Download returns 404 — which is the honest outcome for a
    seeded record with no bytes behind it.

    Safe to re-run. Never run against production.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- ------------------------------------------------------------- clean up ---
DELETE FROM master.DocumentAudience
WHERE  DocumentId IN (SELECT DocumentId FROM master.Document WHERE Title LIKE '%v[0-9].[0-9]');

UPDATE master.Document SET CurrentVersionId = NULL
WHERE  Title LIKE '%v[0-9].[0-9]';

DELETE FROM master.DocumentVersion
WHERE  DocumentId IN (SELECT DocumentId FROM master.Document WHERE Title LIKE '%v[0-9].[0-9]');

DELETE FROM master.Document WHERE Title LIKE '%v[0-9].[0-9]';

-- ------------------------------------------------------------ documents ---
DECLARE @uploader int = (SELECT TOP 1 Id FROM auth.[User] WHERE UserCode = 'MCLS-MIN-000001');

DECLARE @docs TABLE
(
    RowNo    int IDENTITY(1,1),
    Title    nvarchar(250),
    Descr    nvarchar(1000),
    Ver      varchar(20),
    FileName nvarchar(250),
    Bytes    bigint,
    Audience varchar(12)      -- one char per account type 1..10
);

-- The audience mask is ordered by AccountType.SortOrder, i.e.
-- MSME Enterprise, Implementing Agency, Ministry, State, OEM/PSU/IA,
-- Operation Admin, Consultant Org, Assessment Agency, Consultants, Assessors.
INSERT INTO @docs (Title, Descr, Ver, FileName, Bytes, Audience) VALUES
 (N'LEAN Bronze Training Manual v3.2',
  N'Step-by-step guide for MSMEs starting the LEAN Bronze level, covering 5S, waste walks and the baseline shop-floor assessment.',
  'v3.2', N'LEAN-Bronze-Training-Manual-v3.2.pdf', 5033164, '1101000110'),
 (N'Silver Assessment Guidelines v2.1',
  N'How a Silver assessment is planned, conducted and scored, including evidence expectations for each parameter.',
  'v2.1', N'Silver-Assessment-Guidelines-v2.1.pdf', 3251405, '0111000111'),
 (N'Gold Certification SOP v1.8',
  N'Standard operating procedure for Gold certification, quality check and the certificate issue workflow.',
  'v1.8', N'Gold-Certification-SOP-v1.8.pdf', 2726297, '0111000111'),
 (N'5S Implementation Handbook v4.0',
  N'Practical handbook for implementing 5S on the shop floor, with checklists and audit sheets.',
  'v4.0', N'5S-Implementation-Handbook-v4.0.pdf', 7654605, '1101010110'),
 (N'Subsidy Claim Process Guide v2.5',
  N'How the GoI subsidy share is computed, claimed and disbursed, with the TDS treatment on the MSME share.',
  'v2.5', N'Subsidy-Claim-Process-Guide-v2.5.pdf', 1887436, '1111100000'),
 (N'Assessor Evaluation Rubric v3.0',
  N'Scoring rubric assessors apply during on-site and desk assessments.',
  'v3.0', N'Assessor-Evaluation-Rubric-v3.0.pdf', 2202009, '0010000111'),
 (N'Consultant Empanelment Policy v1.4',
  N'Eligibility, empanelment and renewal terms for LEAN consultants and consulting organisations.',
  'v1.4', N'Consultant-Empanelment-Policy-v1.4.pdf', 1572864, '0110011100'),
 (N'Technology Upgradation Catalogue v2.0',
  N'Catalogue of TU-series technologies with indicative costs and expected productivity gains.',
  'v2.0', N'Technology-Upgradation-Catalogue-v2.0.pdf', 9227468, '1101010000');

-- Document rows.
INSERT INTO master.Document (Title, Description, IsActive, CreatedOnUtc, CreatedByUserId, IsDeleted)
SELECT d.Title, d.Descr, 1, DATEADD(DAY, -(d.RowNo * 9), SYSUTCDATETIME()), @uploader, 0
FROM   @docs AS d
ORDER  BY d.RowNo;

-- One live version each.
INSERT INTO master.DocumentVersion
(
    DocumentId, VersionLabel, OriginalFileName, StoredFileName, RelativePath,
    ContentType, FileSizeBytes, IsLive, UploadedByUserId, UploadedOnUtc
)
SELECT doc.DocumentId, d.Ver, d.FileName,
       CONVERT(varchar(36), NEWID()) + '.pdf',
       'documents/' + CONVERT(varchar(8), DATEADD(DAY, -(d.RowNo * 9), SYSUTCDATETIME()), 112),
       'application/pdf', d.Bytes, 1, @uploader,
       DATEADD(DAY, -(d.RowNo * 9), SYSUTCDATETIME())
FROM   @docs AS d
INNER JOIN master.Document AS doc ON doc.Title = d.Title;

UPDATE doc
SET    doc.CurrentVersionId = v.DocumentVersionId
FROM   master.Document AS doc
INNER JOIN master.DocumentVersion AS v ON v.DocumentId = doc.DocumentId
WHERE  doc.Title LIKE '%v[0-9].[0-9]';

-- Role assignment: expand the mask into one row per granted audience.
-- Each account type's position in the mask is its rank in SortOrder, computed
-- once here rather than per row.
WITH Positions AS
(
    SELECT AccountTypeId,
           Pos = ROW_NUMBER() OVER (ORDER BY SortOrder)
    FROM   auth.AccountType
    WHERE  IsActive = 1
)
INSERT INTO master.DocumentAudience (DocumentId, AccountTypeId)
SELECT doc.DocumentId, p.AccountTypeId
FROM   @docs AS d
INNER JOIN master.Document AS doc ON doc.Title = d.Title
INNER JOIN Positions       AS p   ON SUBSTRING(d.Audience, p.Pos, 1) = '1';

COMMIT TRANSACTION;

SELECT d.Title, v.VersionLabel, v.FileSizeBytes / 1048576.0 AS SizeMb,
       (SELECT COUNT(*) FROM master.DocumentAudience a WHERE a.DocumentId = d.DocumentId) AS Roles
FROM   master.Document AS d
LEFT   JOIN master.DocumentVersion AS v ON v.DocumentVersionId = d.CurrentVersionId
WHERE  d.Title LIKE '%v[0-9].[0-9]'
ORDER  BY d.CreatedOnUtc DESC;

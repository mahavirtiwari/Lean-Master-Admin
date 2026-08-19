/*
    Demo questionnaire content for the Questionnaire Manager screens.
    ------------------------------------------------------------------------
    assess.Questionnaire / Requirement / Checkpoint are empty on a fresh
    install, so the manager screen and the question bank have nothing to show.

    The Sort (Seiri) requirement and its checkpoints are the ones drawn on
    6-green.svg; the rest fill out the bank so the level cards, the filters and
    the paging have something to work on.

    Safe to re-run: everything seeded here is scoped to questionnaire codes
    beginning 'DEMO-'. NEVER run against production.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

BEGIN TRANSACTION;

-- ------------------------------------------------------------- clean up ---
DELETE c FROM assess.[Checkpoint] c
JOIN   assess.Requirement r ON r.RequirementId = c.RequirementId
JOIN   assess.Questionnaire q ON q.QuestionnaireId = r.QuestionnaireId
WHERE  q.Code LIKE 'DEMO-%';

DELETE r FROM assess.Requirement r
JOIN   assess.Questionnaire q ON q.QuestionnaireId = r.QuestionnaireId
WHERE  q.Code LIKE 'DEMO-%';

DELETE FROM assess.Questionnaire WHERE Code LIKE 'DEMO-%';

DECLARE @author int = (SELECT TOP 1 Id FROM auth.[User] WHERE UserCode = 'MCLS-MIN-000001');

-- ------------------------------------------------------- questionnaires ---
-- One per level. Bronze and Silver are published; Gold is still a draft,
-- which is what the level cards on 5-green.svg show.
INSERT INTO assess.Questionnaire
    (Code, Name, CertificationLevelId, SectorId, VersionNo, Status,
     PublishedOnUtc, CreatedOnUtc, CreatedByUserId, ModifiedOnUtc)
VALUES
    ('DEMO-BRONZE-V2', N'LEAN Bronze Assessment', 1, NULL, 2, 'Published',
     DATEADD(DAY, -35, SYSUTCDATETIME()), DATEADD(DAY, -120, SYSUTCDATETIME()), @author,
     DATEADD(DAY, -35, SYSUTCDATETIME())),
    ('DEMO-SILVER-V3', N'LEAN Silver Assessment', 2, NULL, 3, 'Published',
     DATEADD(DAY, -40, SYSUTCDATETIME()), DATEADD(DAY, -150, SYSUTCDATETIME()), @author,
     DATEADD(DAY, -40, SYSUTCDATETIME())),
    ('DEMO-GOLD-V1',   N'LEAN Gold Assessment',   3, NULL, 1, 'Draft',
     NULL, DATEADD(DAY, -60, SYSUTCDATETIME()), @author,
     DATEADD(DAY, -28, SYSUTCDATETIME()));

DECLARE @bronze int = (SELECT QuestionnaireId FROM assess.Questionnaire WHERE Code = 'DEMO-BRONZE-V2');
DECLARE @silver int = (SELECT QuestionnaireId FROM assess.Questionnaire WHERE Code = 'DEMO-SILVER-V3');
DECLARE @gold   int = (SELECT QuestionnaireId FROM assess.Questionnaire WHERE Code = 'DEMO-GOLD-V1');

-- ---------------------------------------------------------- requirements ---
DECLARE @reqs TABLE
(
    RowNo int IDENTITY(1,1),
    QuestionnaireId int,
    ParameterId int,
    SequenceNo int,
    Title nvarchar(300),
    Narrative nvarchar(2000),
    Bullets nvarchar(2000),
    Purpose nvarchar(1000),
    Benefits nvarchar(1000)
);

-- ParameterId maps each requirement onto the LEAN parameter it assesses.
INSERT INTO @reqs (QuestionnaireId, ParameterId, SequenceNo, Title, Narrative, Bullets, Purpose, Benefits) VALUES
 (@bronze, 1, 1, N'Sort (Seiri) - remove what is not needed',
  N'All items in the work area are classified as needed or not needed, and unneeded items are removed from the shop floor.',
  N'Red-tag area defined with a named owner' + CHAR(10) +
  N'Disposal register maintained for red-tagged items' + CHAR(10) +
  N'Sorting repeated at a defined frequency',
  N'Free up floor space and remove clutter that hides defects and slows movement.',
  N'Shorter search time, lower inventory carrying cost and safer gangways.'),
 (@bronze, 1, 2, N'Set in Order (Seiton) - a place for everything',
  N'Every item retained after sorting has a marked, labelled location that is returned to after use.',
  N'Shadow boards or floor marking in place' + CHAR(10) +
  N'Locations labelled and legible from the gangway',
  N'Make the correct location obvious so returning an item takes no judgement.',
  N'Less searching, faster changeovers and immediate visibility of missing tools.'),
 (@silver, 4, 1, N'Standardised work instructions',
  N'Each critical operation has a current, accessible work instruction that the operator actually uses.',
  N'Instruction available at the point of use' + CHAR(10) +
  N'Revision controlled and dated' + CHAR(10) +
  N'Operator trained against the current revision',
  N'Remove variation between operators and between shifts.',
  N'Consistent quality, faster onboarding and a basis for improvement.'),
 (@silver, 5, 2, N'PDCA improvement cycle in use',
  N'Improvements are run as Plan-Do-Check-Act cycles with evidence retained at each stage.',
  N'Improvement register maintained' + CHAR(10) +
  N'Results verified against a baseline',
  N'Ensure changes are tested and held rather than assumed.',
  N'Gains that persist, and a record of what did not work.'),
 (@gold, 3, 1, N'Value stream mapping and flow',
  N'Current and future state value stream maps exist for the primary product family, with a costed action plan.',
  N'Current state map dated within 12 months' + CHAR(10) +
  N'Future state map with owners and dates',
  N'See the whole flow rather than local efficiencies.',
  N'Reduced lead time and work in progress across the plant.');

INSERT INTO assess.Requirement
    (QuestionnaireId, ParameterId, SequenceNo, Title, Narrative, Bullets, Purpose, Benefits, MaxScore, IsActive)
SELECT r.QuestionnaireId, r.ParameterId, r.SequenceNo, r.Title, r.Narrative, r.Bullets, r.Purpose, r.Benefits, 10, 1
FROM   @reqs AS r ORDER BY r.RowNo;

-- ----------------------------------------------------------- checkpoints ---
-- The three drawn on 6-green.svg, plus two per remaining requirement.
DECLARE @sortReq int =
    (SELECT RequirementId FROM assess.Requirement
     WHERE QuestionnaireId = @bronze AND SequenceNo = 1);

INSERT INTO assess.[Checkpoint]
    (RequirementId, SequenceNo, CheckpointText, Evidence, Kpi, Unit, Frequency, ExpectedResponse, Weight, IsMandatory, IsActive)
VALUES
 (@sortReq, 1, N'Red-tag area is marked and in use', N'Photograph of the red-tag area', N'Red-tagged items cleared', N'%', N'Monthly', N'Yes', 1.0, 1, 1),
 (@sortReq, 2, N'Disposal register is maintained and current', N'Scanned register extract', N'Entries closed within 30 days', N'%', N'Monthly', N'Yes', 1.0, 1, 1),
 (@sortReq, 3, N'Sorting is repeated at the defined frequency', N'Audit sheet with dates', N'Audits completed on plan', N'%', N'Quarterly', N'Yes', 1.0, 0, 1);

-- Two generic checkpoints for every other requirement, so the bank has depth.
INSERT INTO assess.[Checkpoint]
    (RequirementId, SequenceNo, CheckpointText, Evidence, Kpi, Unit, Frequency, ExpectedResponse, Weight, IsMandatory, IsActive)
SELECT r.RequirementId, 1,
       N'Documented evidence exists for: ' + r.Title,
       N'Document or photograph at the point of use', N'Compliance', N'%', N'Monthly', N'Yes', 1.0, 1, 1
FROM   assess.Requirement AS r
JOIN   assess.Questionnaire AS q ON q.QuestionnaireId = r.QuestionnaireId
WHERE  q.Code LIKE 'DEMO-%' AND r.RequirementId <> @sortReq;

INSERT INTO assess.[Checkpoint]
    (RequirementId, SequenceNo, CheckpointText, Evidence, Kpi, Unit, Frequency, ExpectedResponse, Weight, IsMandatory, IsActive)
SELECT r.RequirementId, 2,
       N'Practice is verified on the shop floor for: ' + r.Title,
       N'Assessor observation note', N'Adherence', N'%', N'Quarterly', N'Yes', 1.0, 0, 1
FROM   assess.Requirement AS r
JOIN   assess.Questionnaire AS q ON q.QuestionnaireId = r.QuestionnaireId
WHERE  q.Code LIKE 'DEMO-%' AND r.RequirementId <> @sortReq;

COMMIT TRANSACTION;

SELECT l.Name AS Level_, q.Code, q.Status, q.VersionNo,
       Requirements = (SELECT COUNT(*) FROM assess.Requirement r WHERE r.QuestionnaireId = q.QuestionnaireId),
       Checkpoints  = (SELECT COUNT(*) FROM assess.[Checkpoint] c
                       JOIN assess.Requirement r2 ON r2.RequirementId = c.RequirementId
                       WHERE r2.QuestionnaireId = q.QuestionnaireId)
FROM   assess.Questionnaire q
JOIN   msme.CertificationLevel l ON l.CertificationLevelId = q.CertificationLevelId
WHERE  q.Code LIKE 'DEMO-%'
ORDER  BY l.SortOrder;

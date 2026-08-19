/*===========================================================================
  Views — the read models behind the list and dashboard screens.
  Each one is shaped to a screen, so the API projects straight onto a DTO
  instead of assembling joins in LINQ.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*------------------------------------------------------- auth.vw_UserList
  User Management, all nine type screens. One row per live account with the
  labels the grid shows already resolved.                                     */
CREATE OR ALTER VIEW auth.vw_UserList
AS
SELECT
    u.Id                    AS UserId,
    u.UserCode,
    u.FullName,
    u.Initials,
    u.Email,
    u.PhoneNumber           AS Mobile,
    u.Designation,
    u.AccountTypeId,
    at.Name                 AS AccountTypeName,
    at.ShortName            AS AccountTypeShortName,
    u.RoleId,
    r.Name                  AS RoleName,
    u.OrganisationId,
    o.Name                  AS OrganisationName,
    u.StateId,
    s.Name                  AS StateName,
    u.Jurisdiction,
    u.StatusId,
    us.Name                 AS StatusName,
    us.BadgeColour          AS StatusColour,
    u.LastLoginOnUtc,
    u.CreatedOnUtc,
    cb.FullName             AS CreatedByName
FROM auth.[User] u
JOIN auth.AccountType at ON at.AccountTypeId = u.AccountTypeId
JOIN auth.Role        r  ON r.RoleId         = u.RoleId
JOIN auth.UserStatus  us ON us.StatusId      = u.StatusId
LEFT JOIN auth.Organisation o  ON o.OrganisationId = u.OrganisationId
LEFT JOIN master.State          s  ON s.StateId        = u.StateId
LEFT JOIN auth.[User]       cb ON cb.Id            = u.CreatedByUserId
WHERE u.IsDeleted = 0;
GO

/*-------------------------------------------------- auth.vw_EffectivePermission
  A user's real rights: everything the role grants, minus explicit revokes,
  plus explicit grants. This is the single definition of "may they?" — the API
  reads it once at sign-in to build the JWT's permission claims.              */
CREATE OR ALTER VIEW auth.vw_EffectivePermission
AS
WITH RolePerms AS
(
    SELECT u.Id AS UserId, rp.PermissionId
    FROM auth.[User] u
    JOIN auth.RolePermission rp ON rp.RoleId = u.RoleId
    WHERE u.IsDeleted = 0
),
Overrides AS
(
    SELECT UserId, PermissionId, IsGranted
    FROM auth.UserPermissionOverride
),
Combined AS
(
    /* role-granted, unless explicitly revoked */
    SELECT rp.UserId, rp.PermissionId
    FROM RolePerms rp
    LEFT JOIN Overrides ov ON ov.UserId = rp.UserId AND ov.PermissionId = rp.PermissionId
    WHERE ov.PermissionId IS NULL OR ov.IsGranted = 1

    UNION       -- UNION, not UNION ALL: an explicit grant may duplicate a role grant

    /* explicitly granted on top of the role */
    SELECT ov.UserId, ov.PermissionId
    FROM Overrides ov
    WHERE ov.IsGranted = 1
)
SELECT
    c.UserId,
    c.PermissionId,
    p.PermissionKey,
    p.ModuleId,
    m.Code      AS ModuleCode,
    m.Name      AS ModuleName,
    m.RoutePath,
    rt.Code     AS RightCode
FROM Combined c
JOIN auth.Permission p  ON p.PermissionId = c.PermissionId
JOIN auth.Module     m  ON m.ModuleId     = p.ModuleId
JOIN auth.RightType  rt ON rt.RightTypeId = p.RightTypeId
WHERE m.IsActive = 1;
GO

/*--------------------------------------------------- auth.vw_AccountTypeSummary
  The nine cards on the User Management landing screen, with live counts.     */
CREATE OR ALTER VIEW auth.vw_AccountTypeSummary
AS
SELECT
    at.AccountTypeId,
    at.Code,
    at.Name,
    at.ShortName,
    at.IconKey,
    at.Description,
    at.CanCreateDirectly,
    at.SortOrder,
    COUNT(u.Id)                                                     AS TotalUsers,
    SUM(CASE WHEN us.Code = 'ACTIVE'   THEN 1 ELSE 0 END)           AS ActiveUsers,
    SUM(CASE WHEN us.Code = 'INACTIVE' THEN 1 ELSE 0 END)           AS InactiveUsers
FROM auth.AccountType at
LEFT JOIN auth.[User]      u  ON u.AccountTypeId = at.AccountTypeId AND u.IsDeleted = 0
LEFT JOIN auth.UserStatus  us ON us.StatusId     = u.StatusId
WHERE at.IsActive = 1
GROUP BY at.AccountTypeId, at.Code, at.Name, at.ShortName, at.IconKey,
         at.Description, at.CanCreateDirectly, at.SortOrder;
GO

/*----------------------------------------------------- msme.vw_ApplicationList
  Every Handholding and Assessments list screen. They differ only by the
  status filter applied on top.                                               */
CREATE OR ALTER VIEW msme.vw_ApplicationList
AS
SELECT
    a.ApplicationId,
    a.ApplicationNo,
    a.EnterpriseId,
    e.Name                  AS EnterpriseName,
    e.UdyamRegistrationNo,
    e.EnterpriseSize,
    e.SectorId,
    sec.NicCode             AS SectorCode,
    sec.Name                AS SectorName,
    e.StateId,
    st.Name                 AS StateName,
    d.Name                  AS DistrictName,
    sc.Code                 AS SubsidyCategoryCode,
    sc.Name                 AS SubsidyCategoryName,
    a.CertificationLevelId,
    cl.Name                 AS CertificationLevel,
    a.ApplicationStatusId,
    ast.Code                AS StatusCode,
    ast.Name                AS StatusName,
    ast.Stage,
    ast.BadgeColour         AS StatusColour,
    a.ImplementingAgencyId,
    ia.Name                 AS ImplementingAgencyName,
    a.ConsultantUserId,
    cu.FullName             AS ConsultantName,
    a.AssessmentAgencyId,
    aa.Name                 AS AssessmentAgencyName,
    a.RegisteredOnUtc,
    a.PaymentReceivedOnUtc,
    a.HandholdingStartedOnUtc,
    a.HandholdingCompletedOnUtc,
    a.CertifiedOnUtc,
    a.CertificateNo,
    a.CertificateValidTillUtc,
    a.LatestScore,
    /* Days the application has spent in its current stage — the ageing column
       on the in-progress screens. */
    DATEDIFF(DAY,
             COALESCE(a.HandholdingStartedOnUtc, a.PaymentReceivedOnUtc, a.RegisteredOnUtc),
             SYSUTCDATETIME())                                      AS DaysInPipeline
FROM msme.Application a
JOIN msme.Enterprise          e   ON e.EnterpriseId         = a.EnterpriseId
JOIN master.Sector            sec ON sec.SectorId           = e.SectorId
JOIN master.State             st  ON st.StateId             = e.StateId
JOIN fee.SubsidyCategory      sc  ON sc.SubsidyCategoryId   = e.SubsidyCategoryId
JOIN msme.CertificationLevel  cl  ON cl.CertificationLevelId = a.CertificationLevelId
JOIN msme.ApplicationStatus   ast ON ast.ApplicationStatusId = a.ApplicationStatusId
LEFT JOIN master.District        d   ON d.DistrictId     = e.DistrictId
LEFT JOIN auth.Organisation  ia  ON ia.OrganisationId = a.ImplementingAgencyId
LEFT JOIN auth.Organisation  aa  ON aa.OrganisationId = a.AssessmentAgencyId
LEFT JOIN auth.[User]        cu  ON cu.Id             = a.ConsultantUserId;
GO

/*-------------------------------------------------------- msme.vw_DashboardTiles
  One row of counters for the dashboard. Written as a single scan of
  Application with conditional aggregates rather than a dozen subqueries.     */
CREATE OR ALTER VIEW msme.vw_DashboardTiles
AS
SELECT
    COUNT(*)                                                                    AS TotalApplications,
    ISNULL(SUM(CASE WHEN ast.Code = 'REGISTERED'          THEN 1 ELSE 0 END), 0)           AS Registered,
    ISNULL(SUM(CASE WHEN ast.Code = 'PAYMENT_RECEIVED'    THEN 1 ELSE 0 END), 0)           AS PaymentReceived,
    ISNULL(SUM(CASE WHEN ast.Code = 'HANDHOLDING_PROGRESS' THEN 1 ELSE 0 END), 0)          AS HandholdingInProgress,
    ISNULL(SUM(CASE WHEN ast.Code = 'HANDHOLDING_DONE'    THEN 1 ELSE 0 END), 0)           AS HandholdingCompleted,
    ISNULL(SUM(CASE WHEN ast.Code = 'ASSESSMENT_SCHEDULED' THEN 1 ELSE 0 END), 0)          AS AssessmentScheduled,
    ISNULL(SUM(CASE WHEN ast.Code = 'ASSESSMENT_PROGRESS' THEN 1 ELSE 0 END), 0)           AS AssessmentInProgress,
    ISNULL(SUM(CASE WHEN ast.Code = 'NC_RAISED'           THEN 1 ELSE 0 END), 0)           AS NcRaised,
    ISNULL(SUM(CASE WHEN ast.Code = 'QUALITY_CHECK'       THEN 1 ELSE 0 END), 0)           AS QualityCheck,
    ISNULL(SUM(CASE WHEN ast.Code = 'CERTIFIED'           THEN 1 ELSE 0 END), 0)           AS Certified,
    ISNULL(SUM(CASE WHEN ast.Code = 'REJECTED'            THEN 1 ELSE 0 END), 0)           AS Rejected,
    ISNULL(SUM(CASE WHEN cl.Code = 'BRONZE' AND ast.Code = 'CERTIFIED' THEN 1 ELSE 0 END), 0) AS CertifiedBronze,
    ISNULL(SUM(CASE WHEN cl.Code = 'SILVER' AND ast.Code = 'CERTIFIED' THEN 1 ELSE 0 END), 0) AS CertifiedSilver,
    ISNULL(SUM(CASE WHEN cl.Code = 'GOLD'   AND ast.Code = 'CERTIFIED' THEN 1 ELSE 0 END), 0) AS CertifiedGold,
    ISNULL(SUM(CASE WHEN a.RegisteredOnUtc >= DATEADD(DAY, -30, SYSUTCDATETIME()) THEN 1 ELSE 0 END), 0) AS RegisteredLast30Days
FROM msme.Application a
JOIN msme.ApplicationStatus  ast ON ast.ApplicationStatusId = a.ApplicationStatusId
JOIN msme.CertificationLevel cl  ON cl.CertificationLevelId  = a.CertificationLevelId;
GO

/*------------------------------------------------------------ master.vw_SectorList
  The Sectors screen. The enterprise count is derived here, which is why the
  Sector table has no counter column to fall out of step.                     */
CREATE OR ALTER VIEW master.vw_SectorList
AS
SELECT
    s.SectorId,
    s.NicCode,
    s.Name,
    s.Description,
    s.IsActive,
    COUNT(e.EnterpriseId)   AS EnterpriseCount,
    s.ModifiedOnUtc,
    s.RowVersion
FROM master.Sector s
LEFT JOIN msme.Enterprise e ON e.SectorId = s.SectorId AND e.IsActive = 1
GROUP BY s.SectorId, s.NicCode, s.Name, s.Description, s.IsActive, s.ModifiedOnUtc, s.RowVersion;
GO

/*--------------------------------------------------------- master.vw_DocumentList
  Upload Documents, with the live version resolved and the audience count the
  grid shows as "5 roles".                                                    */
CREATE OR ALTER VIEW master.vw_DocumentList
AS
SELECT
    d.DocumentId,
    d.Title,
    d.Description,
    d.IsActive,
    dv.DocumentVersionId,
    dv.VersionLabel,
    dv.OriginalFileName,
    dv.FileSizeBytes,
    dv.ContentType,
    dv.UploadedOnUtc,
    up.FullName             AS UploadedByName,
    (SELECT COUNT(*) FROM master.DocumentAudience da WHERE da.DocumentId = d.DocumentId) AS AudienceCount,
    (SELECT COUNT(*) FROM master.DocumentVersion v  WHERE v.DocumentId  = d.DocumentId) AS VersionCount
FROM master.Document d
LEFT JOIN master.DocumentVersion dv ON dv.DocumentId = d.DocumentId AND dv.IsLive = 1
LEFT JOIN auth.[User]        up ON up.Id         = dv.UploadedByUserId
WHERE d.IsDeleted = 0;
GO

/*------------------------------------------------------ incentive.vw_IncentiveList
  The Incentives screens, with beneficiaries and disbursed amount rolled up
  from actual disbursements.                                                  */
CREATE OR ALTER VIEW incentive.vw_IncentiveList
AS
SELECT
    i.IncentiveId,
    i.Code,
    i.Name,
    i.ProviderId,
    p.Name                  AS ProviderName,
    i.AdministeringBody,
    i.CertificationLevelId,
    ISNULL(cl.Name, N'Both') AS ApplicableLevel,
    i.StateId,
    st.Name                 AS StateName,
    i.Status,
    i.OutlayAmount,
    i.ValidFrom,
    i.ValidTo,
    ISNULL(dz.Beneficiaries, 0)   AS Beneficiaries,
    ISNULL(dz.AmountDisbursed, 0) AS AmountDisbursed
FROM incentive.Incentive i
JOIN incentive.Provider p ON p.ProviderId = i.ProviderId
LEFT JOIN msme.CertificationLevel cl ON cl.CertificationLevelId = i.CertificationLevelId
LEFT JOIN master.State            st ON st.StateId              = i.StateId
OUTER APPLY
(
    SELECT COUNT(DISTINCT d.EnterpriseId) AS Beneficiaries,
           SUM(d.Amount)                  AS AmountDisbursed
    FROM incentive.IncentiveDisbursement d
    WHERE d.IncentiveId = i.IncentiveId
      AND d.Status = 'Disbursed'
) dz;
GO

/*----------------------------------------------------------- fee.vw_CurrentFee
  The Fee Structure screen: current fee per level crossed with every subsidy
  category, so the whole grid comes from one query.                           */
CREATE OR ALTER VIEW fee.vw_CurrentFee
AS
SELECT
    cl.CertificationLevelId,
    cl.Code                 AS LevelCode,
    cl.Name                 AS LevelName,
    fr.FeeRateId,
    fr.AmountInclusiveGst,
    fr.GstPercent,
    fr.EffectiveFrom,
    sc.SubsidyCategoryId,
    sc.Code                 AS CategoryCode,
    sc.Name                 AS CategoryName,
    sc.BaseSubsidyPercent,
    sc.AdditionalPercent,
    sc.TotalSubsidyPercent,
    CAST(fr.AmountInclusiveGst * sc.TotalSubsidyPercent / 100.0 AS decimal(18,2)) AS SubsidyAmount,
    CAST(fr.AmountInclusiveGst * (100 - sc.TotalSubsidyPercent) / 100.0 AS decimal(18,2)) AS PayableByUnit
FROM msme.CertificationLevel cl
JOIN fee.FeeRate fr ON fr.CertificationLevelId = cl.CertificationLevelId AND fr.EffectiveTo IS NULL
CROSS JOIN fee.SubsidyCategory sc
WHERE cl.IsActive = 1 AND sc.IsActive = 1;
GO

/*-------------------------------------------------------- assess.vw_AssessmentList */
CREATE OR ALTER VIEW assess.vw_AssessmentList
AS
SELECT
    a.AssessmentId,
    a.AssessmentNo,
    a.ApplicationId,
    app.ApplicationNo,
    e.Name                  AS EnterpriseName,
    e.UdyamRegistrationNo,
    cl.Name                 AS CertificationLevel,
    a.AssessmentAgencyId,
    ag.Name                 AS AssessmentAgencyName,
    a.LeadAssessorUserId,
    la.FullName             AS LeadAssessorName,
    a.AssessmentType,
    a.Status,
    a.ScheduledOn,
    a.StartedOnUtc,
    a.CompletedOnUtc,
    a.ScorePercent,
    a.Outcome,
    (SELECT COUNT(*) FROM assess.NonConformance nc
      WHERE nc.AssessmentId = a.AssessmentId AND nc.Status <> 'Closed')          AS OpenNcCount,
    (SELECT COUNT(*) FROM assess.NonConformance nc
      WHERE nc.AssessmentId = a.AssessmentId AND nc.Severity = 'Major'
        AND nc.Status <> 'Closed')                                              AS OpenMajorNcCount
FROM assess.Assessment a
JOIN msme.Application        app ON app.ApplicationId        = a.ApplicationId
JOIN msme.Enterprise         e   ON e.EnterpriseId           = app.EnterpriseId
JOIN msme.CertificationLevel cl  ON cl.CertificationLevelId  = app.CertificationLevelId
JOIN auth.Organisation   ag  ON ag.OrganisationId        = a.AssessmentAgencyId
LEFT JOIN auth.[User]    la  ON la.Id                    = a.LeadAssessorUserId;
GO

PRINT N'Views created.';
GO

using MCLS.Domain.Common;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Entities.Master;

namespace MCLS.Domain.Entities.Msme;

/// <summary>A registered MSME unit.</summary>
public class Enterprise : IAuditable, IConcurrencyAware
{
    public int EnterpriseId { get; set; }
    public string UdyamRegistrationNo { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    public short SectorId { get; set; }
    public Sector Sector { get; set; } = null!;

    /// <summary>Decides the subsidy slab: GEN, WOM, SC, ST, NER or OPA.</summary>
    public byte SubsidyCategoryId { get; set; }

    /// <summary>Micro, Small or Medium.</summary>
    public string EnterpriseSize { get; set; } = string.Empty;

    public string? AddressLine { get; set; }
    public short StateId { get; set; }
    public State State { get; set; } = null!;
    public int? DistrictId { get; set; }
    public District? District { get; set; }
    public string? Pincode { get; set; }

    public string? ContactPersonName { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactMobile { get; set; }
    public string? Gstin { get; set; }
    public string? Pan { get; set; }

    public int? PrimaryUserId { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime RegisteredOnUtc { get; set; }

    // ------------------------------------------------- from the Udyam registry ---
    // Fetched from UAMRestServiceAssist when the MSME registers. Stored rather
    // than re-fetched: the registry is not always reachable, and the dashboard
    // groups tens of thousands of enterprises by the three demographic columns.
    public string? UdyamApplicationId { get; set; }
    public string? OwnerName { get; set; }
    public string? OrganisationType { get; set; }

    /// <summary>Promoter gender, as the registry reports it. Backs the Gender panel.</summary>
    public string? Gender { get; set; }

    /// <summary>General / OBC / SC / ST. Backs the Social Category panel.</summary>
    public string? SocialCategory { get; set; }

    public bool? IsPhysicallyHandicapped { get; set; }
    public string? MajorActivity { get; set; }

    /// <summary>NIC 2008 division, e.g. "32". Joins to <see cref="Sector"/>.NicCode.</summary>
    public string? NicTwoDigit { get; set; }
    public string? NicFourDigit { get; set; }
    public string? NicFiveDigit { get; set; }
    public string? NicDescription { get; set; }

    public int? TotalEmployees { get; set; }
    public DateOnly? IncorporationDate { get; set; }
    public DateOnly? CommencementDate { get; set; }
    public DateTime? UdyamFetchedOnUtc { get; set; }

    public string? ContactDesignation { get; set; }

    // The registry's own address strings, kept beside the resolved keys. When a
    // code fails to resolve these are what explains why.
    public string? LgStateCode { get; set; }
    public string? LgDistrictCode { get; set; }
    public string? StateNameRaw { get; set; }
    public string? DistrictNameRaw { get; set; }

    public bool? WhetherProductionCommenced { get; set; }
    public string? DicName { get; set; }
    public DateOnly? UdyamAppliedDate { get; set; }

    public string? OwnerEmail { get; set; }
    public string? OwnerMobile { get; set; }

    /// <summary>The response as received, so a new registry field can be backfilled.</summary>
    public string? UdyamRawResponse { get; set; }

    public ICollection<EnterpriseActivity> Activities { get; set; } = [];
    public ICollection<EnterprisePlant> Plants { get; set; } = [];
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<Application> Applications { get; set; } = [];
}

public class CertificationLevel
{
    public byte CertificationLevelId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public byte SortOrder { get; set; }

    /// <summary>Bronze is self-declared and needs no accredited assessment.</summary>
    public bool RequiresAssessment { get; set; } = true;

    public bool IsActive { get; set; } = true;
}

public class ApplicationStatus
{
    public byte ApplicationStatusId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// <summary>Handholding, Assessment or Closed — the two sidebar sections plus terminal.</summary>
    public string Stage { get; set; } = string.Empty;

    public byte SortOrder { get; set; }
    public string? BadgeColour { get; set; }
    public bool IsTerminal { get; set; }
}

/// <summary>
/// A legal move in the workflow. Held as data so the pipeline can be corrected
/// without redeploying the API.
/// </summary>
public class ApplicationStatusTransition
{
    public byte FromStatusId { get; set; }
    public ApplicationStatus FromStatus { get; set; } = null!;
    public byte ToStatusId { get; set; }
    public ApplicationStatus ToStatus { get; set; } = null!;
    public short? RequiredPermissionId { get; set; }
    public bool RequiresRemark { get; set; }
}

/// <summary>One enterprise's pursuit of one certification level.</summary>
public class Application : IAuditable, IConcurrencyAware
{
    public int ApplicationId { get; set; }
    public string ApplicationNo { get; set; } = string.Empty;

    public int EnterpriseId { get; set; }
    public Enterprise Enterprise { get; set; } = null!;

    public byte CertificationLevelId { get; set; }
    public CertificationLevel CertificationLevel { get; set; } = null!;

    public byte ApplicationStatusId { get; set; }
    public ApplicationStatus Status { get; set; } = null!;

    // Delivery assignment — filled in as the application progresses.
    public int? ImplementingAgencyId { get; set; }
    public Organisation? ImplementingAgency { get; set; }
    public int? ConsultantOrgId { get; set; }
    public int? ConsultantUserId { get; set; }
    public ApplicationUser? Consultant { get; set; }
    public int? AssessmentAgencyId { get; set; }
    public Organisation? AssessmentAgency { get; set; }

    public DateTime RegisteredOnUtc { get; set; }
    public DateTime? PaymentReceivedOnUtc { get; set; }
    public DateTime? HandholdingStartedOnUtc { get; set; }
    public DateTime? HandholdingCompletedOnUtc { get; set; }
    public DateTime? CertifiedOnUtc { get; set; }
    public string? CertificateNo { get; set; }
    public DateTime? CertificateValidTillUtc { get; set; }
    public DateTime? RejectedOnUtc { get; set; }
    public string? RejectionReason { get; set; }

    /// <summary>
    /// Latest assessment score. Denormalised for the dashboard and list
    /// screens; maintained by <c>assess.usp_Assessment_Finalise</c>.
    /// </summary>
    public decimal? LatestScore { get; set; }

    public string? Remarks { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<ApplicationStatusHistory> StatusHistory { get; set; } = [];
    public ICollection<HandholdingActivity> HandholdingActivities { get; set; } = [];
}

public class ApplicationStatusHistory
{
    public long ApplicationStatusHistoryId { get; set; }
    public int ApplicationId { get; set; }
    public Application Application { get; set; } = null!;
    public byte? FromStatusId { get; set; }
    public byte ToStatusId { get; set; }
    public string? Remark { get; set; }
    public int ChangedByUserId { get; set; }
    public DateTime ChangedOnUtc { get; set; }
}

/// <summary>A consultant visit or intervention during the handholding stage.</summary>
public class HandholdingActivity
{
    public long HandholdingActivityId { get; set; }
    public int ApplicationId { get; set; }
    public Application Application { get; set; } = null!;
    public short? ParameterId { get; set; }
    public Parameter? Parameter { get; set; }
    public short? TechnologyId { get; set; }
    public Technology? Technology { get; set; }
    public DateOnly ActivityDate { get; set; }

    /// <summary>Visit, Training, Review, Submission or Other.</summary>
    public string ActivityType { get; set; } = string.Empty;

    public string Title { get; set; } = string.Empty;
    public string? Notes { get; set; }
    public int ConsultantUserId { get; set; }
    public decimal? DurationHours { get; set; }
    public DateTime CreatedOnUtc { get; set; }
}

/// <summary>
/// One NIC activity from the Udyam record. Repeating, so it is a child table:
/// flattening it onto the enterprise would keep only the first.
/// </summary>
public class EnterpriseActivity
{
    public int EnterpriseActivityId { get; set; }
    public int EnterpriseId { get; set; }
    public Enterprise Enterprise { get; set; } = null!;

    public string? UdyamApplicationId { get; set; }

    /// <summary>Manufacturing or Services.</summary>
    public string? Activity { get; set; }

    public string? NicTwoDigit { get; set; }
    public string? NicTwoDigitName { get; set; }
    public string? NicFourDigit { get; set; }
    public string? NicFourDigitName { get; set; }
    public string? NicFiveDigit { get; set; }
    public string? NicFiveDigitName { get; set; }

    public bool IsPrimary { get; set; }
    public DateTime CreatedOnUtc { get; set; }
}

/// <summary>
/// A plant or unit under the enterprise. Also repeating, and it carries its own
/// district — a unit is regularly in a different district from the registered
/// office, which matters for the subsidy classification.
/// </summary>
public class EnterprisePlant
{
    public int EnterprisePlantId { get; set; }
    public int EnterpriseId { get; set; }
    public Enterprise Enterprise { get; set; } = null!;

    public string? UdyamApplicationId { get; set; }
    public string? UnitIdNo { get; set; }
    public string? UnitName { get; set; }

    /// <summary>The pre-Udyam Udyog Aadhaar number, still quoted on older records.</summary>
    public string? UamNo { get; set; }

    public string? PlantIdNo { get; set; }
    public string? AddressLine { get; set; }
    public string? Pincode { get; set; }

    public short? StateId { get; set; }
    public State? State { get; set; }
    public int? DistrictId { get; set; }
    public District? District { get; set; }

    public string? LgDistrictCode { get; set; }
    public string? StateNameRaw { get; set; }
    public string? DistrictNameRaw { get; set; }

    public DateTime CreatedOnUtc { get; set; }
}

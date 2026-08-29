using MCLS.Domain.Common;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Entities.Master;

namespace MCLS.Domain.Entities.Msme;

/// <summary>A registered MSME unit.</summary>
public class Enterprise : IAuditable, IConcurrencyAware
{
    public int EnterpriseId { get; set; }

    /// <summary>
    /// The scheme's own number, issued when registration completes — e.g.
    /// LEAN-MH-2025-00456. Distinct from the Udyam number: Udyam identifies the
    /// enterprise to the Ministry, this identifies it to the LEAN scheme, and
    /// it is what the applicant signs in with.
    /// </summary>
    public string? LeanId { get; set; }

    /// <summary>The plant chosen at registration; decides where assessment happens.</summary>
    public int? SelectedPlantId { get; set; }

    /// <summary>
    /// The registry's id for that plant, held here so "one registration per
    /// plant" can be a unique index.
    ///
    /// The enterprise keeps a row for every unit on its Udyam record, so the
    /// plant table cannot answer which one was registered — only this can.
    /// </summary>
    public string? RegisteredPlantIdNo { get; set; }

    /// <summary>
    /// QCI, NPC or Self — who brought this enterprise to the scheme, decided by
    /// the awareness programme it selected at registration. Null for an
    /// enterprise registered before the question was recorded.
    /// </summary>
    public string? AwarenessAgency { get; set; }

    /// <summary>The NIC activity chosen at registration; decides the questionnaire set.</summary>
    public int? SelectedActivityId { get; set; }
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

/// <summary>
/// An applicant's in-progress registration (R1-R9).
///
/// Deliberately separate from <see cref="Enterprise"/>. The wizard is eight
/// steps long and unauthenticated, so most drafts are abandoned; writing them
/// progressively into Enterprise would put half-built records into the master
/// data that every admin screen counts as registered MSMEs. The Enterprise and
/// its user account are created once, from a draft that reached the pledge.
/// </summary>
public class Registration
{
    public int RegistrationId { get; set; }

    /// <summary>
    /// The handle the browser carries between steps. Opaque and random rather
    /// than the row id: the wizard has no signed-in user, so a sequential
    /// identifier would let anyone read another applicant's draft.
    /// </summary>
    public Guid SessionToken { get; set; }

    public string UdyamRegistrationNo { get; set; } = string.Empty;
    public string UdyamMobile { get; set; } = string.Empty;

    /// <summary>The registry response verbatim, so later steps survive it going down.</summary>
    public string? UdyamPayload { get; set; }

    public string? SelectedUnitIdNo { get; set; }

    /// <summary>
    /// The registry's id for the chosen plant.
    ///
    /// UnitIdNo cannot identify one: the registry repeats it across the units
    /// of a single enterprise, so three plants may share it.
    /// </summary>
    public string? SelectedPlantIdNo { get; set; }
    public string? SelectedNicFiveDigit { get; set; }

    public string? SpocName { get; set; }
    public string? SpocDesignation { get; set; }
    public string? SpocMobile { get; set; }
    public string? SpocEmail { get; set; }

    public bool? AttendedAwareness { get; set; }
    public int? AwarenessProgramId { get; set; }

    /// <summary>Hashed, never stored in the clear.</summary>
    public byte[]? OtpHash { get; set; }
    public DateTime? OtpSentOnUtc { get; set; }
    public byte OtpAttempts { get; set; }
    public DateTime? EmailVerifiedOnUtc { get; set; }

    public DateTime? PledgeAcceptedOnUtc { get; set; }
    public string? PledgeAcceptedBy { get; set; }
    public string? PledgeAcceptedIp { get; set; }

    public byte CurrentStep { get; set; } = 2;

    /// <summary>Draft, Completed or Abandoned.</summary>
    public string Status { get; set; } = "Draft";

    public int? EnterpriseId { get; set; }
    public DateTime StartedOnUtc { get; set; }
    public DateTime? CompletedOnUtc { get; set; }

    public AwarenessProgram? AwarenessProgram { get; set; }
    public Enterprise? Enterprise { get; set; }
}

/// <summary>A LEAN awareness programme an applicant may have attended (R5).</summary>
public class AwarenessProgram
{
    public int AwarenessProgramId { get; set; }

    /// <summary>
    /// The readable code an applicant sees on their attendance record, e.g.
    /// LAP-27-202508-001. The surrogate key above means nothing to them.
    /// </summary>
    public string? ProgramCode { get; set; }

    public string Name { get; set; } = string.Empty;
    public DateOnly? HeldOn { get; set; }
    public string? Venue { get; set; }
    public short? StateId { get; set; }

    /// <summary>
    /// Which agency ran it — QCI or NPC.
    ///
    /// This is what decides how a registration is attributed on the dashboard,
    /// and it is a property of the programme, not of whoever delivers the
    /// handholding afterwards.
    /// </summary>
    public string? Agency { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Local or Service.
    ///
    /// A refresh retires programmes the service has withdrawn, and must not
    /// touch the ones an administrator entered by hand — without this it cannot
    /// tell them apart.
    /// </summary>
    public string Source { get; set; } = "Local";
}

/// <summary>
/// An enterprise's LEAN Silver application — its self-declared answers to the
/// basic-information, ESG and document checklists the admin defines. One per
/// enterprise per level; a draft while it is filled, submitted when confirmed.
/// </summary>
public class ApplicationSubmission : IConcurrencyAware
{
    public int SubmissionId { get; set; }
    public int EnterpriseId { get; set; }
    public byte CertificationLevelId { get; set; }

    /// <summary>Draft or Submitted.</summary>
    public string Status { get; set; } = "Draft";
    public DateTime? SubmittedOnUtc { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public byte[]? RowVersion { get; set; }

    /// <summary>Unpaid or Paid. A mock/simulated payment sets it for now.</summary>
    public string PaymentStatus { get; set; } = "Unpaid";
    public decimal? PaidAmount { get; set; }
    public DateTime? PaidOnUtc { get; set; }
    public string? PaymentMethod { get; set; }
    public string? PaymentReference { get; set; }

    public ICollection<SubmissionBasicInfo> BasicInfo { get; set; } = [];
    public ICollection<SubmissionEsgAnswer> EsgAnswers { get; set; } = [];
    public ICollection<SubmissionDocument> Documents { get; set; } = [];
}

/// <summary>One basic-information answer; text whatever the item's input type.</summary>
public class SubmissionBasicInfo
{
    public int SubmissionId { get; set; }
    public short BasicInfoItemId { get; set; }
    public string? ValueText { get; set; }
}

/// <summary>One ESG answer — Yes, No or NA — against a question.</summary>
public class SubmissionEsgAnswer
{
    public int SubmissionId { get; set; }
    public int EsgQuestionId { get; set; }
    public string Answer { get; set; } = string.Empty;
}

/// <summary>A document uploaded against one requirement of the checklist.</summary>
public class SubmissionDocument
{
    public int SubmissionId { get; set; }
    public short DocumentRequirementId { get; set; }
    public string? OriginalFileName { get; set; }
    public string? StoredFileName { get; set; }
    public string? ContentType { get; set; }
    public DateTime? UploadedOnUtc { get; set; }
}

/// <summary>
/// One of the LEAN Bronze e-learning courses. Shared across the scheme rather
/// than per enterprise — every participant takes the same set.
/// </summary>
public class BronzeCourse
{
    public int BronzeCourseId { get; set; }
    public byte SortOrder { get; set; }
    public string Title { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedOnUtc { get; set; }
}

/// <summary>
/// A person an enterprise nominates for LEAN Bronze. Up to five per enterprise;
/// each takes every course and one final exam on the LMS, and each earns their
/// own certificate — which is why an enterprise can hold several Bronze
/// certificates.
/// </summary>
public class BronzeParticipant
{
    public int BronzeParticipantId { get; set; }
    public int EnterpriseId { get; set; }

    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? Mobile { get; set; }

    /// <summary>The language the LMS serves the course content in.</summary>
    public string? PreferredLanguage { get; set; }

    /// <summary>Completed courses, as the LMS reports them.</summary>
    public byte CoursesDone { get; set; }

    /// <summary>NotStarted, Learning, ExamDue or Certified.</summary>
    public string Status { get; set; } = "NotStarted";

    public DateTime? CertifiedOnUtc { get; set; }
    public string? CertificateNo { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
}

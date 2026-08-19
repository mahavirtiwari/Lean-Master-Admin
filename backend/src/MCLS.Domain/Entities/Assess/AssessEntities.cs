using MCLS.Domain.Common;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Entities.Msme;

namespace MCLS.Domain.Entities.Assess;

/// <summary>
/// A versioned questionnaire for one certification level and sector.
/// Publishing freezes it: edits create a new version, so assessments already
/// scored against v1 stay reproducible.
/// </summary>
public class Questionnaire : IAuditable, IConcurrencyAware
{
    public int QuestionnaireId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public byte CertificationLevelId { get; set; }
    public CertificationLevel CertificationLevel { get; set; } = null!;

    /// <summary>Null means the generic questionnaire, applying to every sector.</summary>
    public short? SectorId { get; set; }
    public Sector? Sector { get; set; }

    public short VersionNo { get; set; } = 1;

    /// <summary>Draft, Published or Retired.</summary>
    public string Status { get; set; } = "Draft";

    public DateOnly? EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public DateTime? PublishedOnUtc { get; set; }
    public int? PublishedByUserId { get; set; }

    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<Requirement> Requirements { get; set; } = [];
}

/// <summary>
/// A requirement card on the question builder: the narrative, its purpose,
/// benefits and the corrective action, all belonging to one LEAN parameter.
/// </summary>
public class Requirement
{
    public int RequirementId { get; set; }
    public int QuestionnaireId { get; set; }
    public Questionnaire Questionnaire { get; set; } = null!;
    public short ParameterId { get; set; }
    public Parameter Parameter { get; set; } = null!;
    public short SequenceNo { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Narrative { get; set; }

    /// <summary>Presentation-only bullet list, one bullet per line.</summary>
    public string? Bullets { get; set; }

    public string? Purpose { get; set; }
    public string? Benefits { get; set; }
    public string? SuggestedAction { get; set; }
    public decimal MaxScore { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Checkpoint> Checkpoints { get; set; } = [];
}

/// <summary>One row of the checkpoint grid.</summary>
public class Checkpoint
{
    public int CheckpointId { get; set; }
    public int RequirementId { get; set; }
    public Requirement Requirement { get; set; } = null!;
    public short SequenceNo { get; set; }
    public string CheckpointText { get; set; } = string.Empty;
    public string? Evidence { get; set; }
    public string? Kpi { get; set; }
    public string? Unit { get; set; }
    public string? Frequency { get; set; }

    /// <summary>The response expected when compliant: Yes, Partial or No.</summary>
    public string? ExpectedResponse { get; set; }

    public decimal Weight { get; set; } = 1;
    public bool IsMandatory { get; set; } = true;
    public bool IsActive { get; set; } = true;
}

/// <summary>A scheduled assessment of one application by an accredited agency.</summary>
public class Assessment : IConcurrencyAware
{
    public int AssessmentId { get; set; }
    public string AssessmentNo { get; set; } = string.Empty;
    public int ApplicationId { get; set; }
    public Application Application { get; set; } = null!;
    public int QuestionnaireId { get; set; }
    public Questionnaire Questionnaire { get; set; } = null!;
    public int AssessmentAgencyId { get; set; }
    public Organisation AssessmentAgency { get; set; } = null!;
    public int? LeadAssessorUserId { get; set; }
    public ApplicationUser? LeadAssessor { get; set; }

    /// <summary>OnSite, Desk or Surveillance.</summary>
    public string AssessmentType { get; set; } = "OnSite";

    /// <summary>Scheduled, InProgress, NcRaised, QualityCheck, Completed or Cancelled.</summary>
    public string Status { get; set; } = "Scheduled";

    public DateOnly? ScheduledOn { get; set; }
    public DateTime? StartedOnUtc { get; set; }
    public DateTime? CompletedOnUtc { get; set; }

    public decimal? TotalScore { get; set; }
    public decimal? MaxPossibleScore { get; set; }
    public decimal? ScorePercent { get; set; }

    /// <summary>Recommended or NotRecommended.</summary>
    public string? Outcome { get; set; }

    public string? AssessorRemarks { get; set; }
    public int? QualityCheckByUserId { get; set; }
    public DateTime? QualityCheckedOnUtc { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<AssessmentTeamMember> Team { get; set; } = [];
    public ICollection<AssessmentResponse> Responses { get; set; } = [];
    public ICollection<NonConformance> NonConformances { get; set; } = [];
}

public class AssessmentTeamMember
{
    public int AssessmentId { get; set; }
    public Assessment Assessment { get; set; } = null!;
    public int AssessorUserId { get; set; }
    public ApplicationUser Assessor { get; set; } = null!;

    /// <summary>Lead, Member or Observer.</summary>
    public string TeamRole { get; set; } = "Member";
}

/// <summary>
/// One answer per checkpoint. The score is stored, not recomputed, so a later
/// change to a checkpoint's weight cannot rewrite a historical result.
/// </summary>
public class AssessmentResponse
{
    public long AssessmentResponseId { get; set; }
    public int AssessmentId { get; set; }
    public Assessment Assessment { get; set; } = null!;
    public int CheckpointId { get; set; }
    public Checkpoint Checkpoint { get; set; } = null!;

    /// <summary>Yes, Partial, No or NA.</summary>
    public string Response { get; set; } = string.Empty;

    public decimal ScoreAwarded { get; set; }

    /// <summary>The KPI reading observed on site.</summary>
    public string? ObservedValue { get; set; }

    public string? AssessorNote { get; set; }
    public int RecordedByUserId { get; set; }
    public DateTime RecordedOnUtc { get; set; }

    public ICollection<ResponseEvidence> Evidence { get; set; } = [];
}

public class ResponseEvidence
{
    public long ResponseEvidenceId { get; set; }
    public long AssessmentResponseId { get; set; }
    public AssessmentResponse AssessmentResponse { get; set; } = null!;
    public string OriginalFileName { get; set; } = string.Empty;
    public string StoredFileName { get; set; } = string.Empty;
    public string RelativePath { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public int UploadedByUserId { get; set; }
    public DateTime UploadedOnUtc { get; set; }
}

/// <summary>
/// A non-conformance raised during assessment. An open <c>Major</c> NC blocks
/// certification — enforced in <c>assess.usp_Assessment_Finalise</c>.
/// </summary>
public class NonConformance : IConcurrencyAware
{
    public int NonConformanceId { get; set; }
    public string NcNo { get; set; } = string.Empty;
    public int AssessmentId { get; set; }
    public Assessment Assessment { get; set; } = null!;
    public int? CheckpointId { get; set; }
    public Checkpoint? Checkpoint { get; set; }

    /// <summary>Major, Minor or Observation.</summary>
    public string Severity { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;
    public string? RootCause { get; set; }
    public string? CorrectiveAction { get; set; }

    /// <summary>Open, InProgress, Submitted, Closed or Waived.</summary>
    public string Status { get; set; } = "Open";

    public int RaisedByUserId { get; set; }
    public DateTime RaisedOnUtc { get; set; }
    public DateOnly? DueOn { get; set; }
    public int? ClosedByUserId { get; set; }
    public DateTime? ClosedOnUtc { get; set; }
    public string? ClosureRemark { get; set; }
    public byte[]? RowVersion { get; set; }
}

/// <summary>
/// How one certification level's exam is marked — the "Weightages &amp; Pass
/// Marks Configuration" table on the Questionnaire Manager.
///
/// <see cref="NegativeMarkPerWrong"/> is the rate, not a flag: the screen shows
/// "Yes (-0.25)" and "No", and a rate of zero IS "No". A separate boolean could
/// disagree with the rate.
/// </summary>
public class ExamConfig
{
    public int ExamConfigId { get; set; }
    public byte CertificationLevelId { get; set; }
    public int TotalQuestions { get; set; }
    public decimal PassMarkPercent { get; set; }
    public decimal NegativeMarkPerWrong { get; set; }
    public int TimeLimitMinutes { get; set; }
    public byte MaxAttempts { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }

    public CertificationLevel? CertificationLevel { get; set; }
}

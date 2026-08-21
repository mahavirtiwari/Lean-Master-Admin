using MCLS.Domain.Common;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Entities.Msme;

namespace MCLS.Domain.Entities.Incentive;

/// <summary>
/// One of the four Incentives sub-menus: Ministry of MSME, State Govt.,
/// Financial Institutions or Others.
/// </summary>
public class IncentiveProvider
{
    public byte ProviderId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public byte SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Incentive> Incentives { get; set; } = [];
}

/// <summary>
/// What an incentive is for — the five boxes the overview leads with, and the
/// same five an MSME sees on its dashboard.
///
/// Separate from the provider: who funds a benefit and what it is for are
/// different questions, and a state government funds technology upgradation as
/// readily as the Ministry does.
/// </summary>
public class IncentiveCategory
{
    public byte CategoryId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>The funders named under the card's title on the overview.</summary>
    public string? TypicalPartners { get; set; }

    /// <summary>The accent the card is drawn with, wherever it is drawn.</summary>
    public string AccentHex { get; set; } = "#5D6B62";

    public byte SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Incentive> Incentives { get; set; } = [];
}

/// <summary>
/// Something attached to an incentive for the reader: the guidelines PDF, the
/// portal it is claimed on, a video walking through it.
/// </summary>
public class IncentiveResource
{
    public int ResourceId { get; set; }
    public int IncentiveId { get; set; }
    public Incentive Incentive { get; set; } = null!;

    /// <summary>Video, Link or Document.</summary>
    public string Kind { get; set; } = "Link";
    public string Title { get; set; } = string.Empty;

    /// <summary>Set for Video and Link.</summary>
    public string? Url { get; set; }

    /// <summary>Set for Document.</summary>
    public string? StoragePath { get; set; }
    public string? FileName { get; set; }
    public long? SizeBytes { get; set; }

    public byte SortOrder { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
}

public class Incentive : IAuditable, IConcurrencyAware
{
    public int IncentiveId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public byte ProviderId { get; set; }
    public IncentiveProvider Provider { get; set; } = null!;

    /// <summary>The body actually administering it, e.g. "Ministry of MSME / QCI".</summary>
    public string? AdministeringBody { get; set; }

    /// <summary>What the incentive is for, as the five overview cards group them.</summary>
    public byte? CategoryId { get; set; }
    public IncentiveCategory? Category { get; set; }

    /// <summary>
    /// Which certificate unlocks it: Silver, Gold, or Both.
    ///
    /// The level id below is kept in step for the single-level cases and left
    /// null for Both — on its own a null level could not tell "both" from "not
    /// decided", which is why this column exists alongside it.
    /// </summary>
    public string? ActivationLevel { get; set; }

    public byte? CertificationLevelId { get; set; }
    public CertificationLevel? CertificationLevel { get; set; }

    /// <summary>Null means national; set for a state-specific incentive.</summary>
    public short? StateId { get; set; }
    public State? State { get; set; }

    public string? Description { get; set; }
    public string? EligibilityCriteria { get; set; }
    public string? BenefitDescription { get; set; }
    public decimal? OutlayAmount { get; set; }

    /// <summary>Draft, Active, Suspended or Closed.</summary>
    public string Status { get; set; } = "Draft";

    public DateOnly? ValidFrom { get; set; }
    public DateOnly? ValidTo { get; set; }
    public string? ExternalUrl { get; set; }
    public string? VideoUrl { get; set; }

    /// <summary>The scheme's own code, as the department publishes it.</summary>
    public string? SchemeCode { get; set; }

    // ---- what each provider's form asks for beyond the shared fields ----
    /// <summary>Ministry: the head the outlay is booked against.</summary>
    public string? BudgetHead { get; set; }

    /// <summary>State: the notification the benefit was published under.</summary>
    public string? GazetteNo { get; set; }

    /// <summary>Financial institutions: the product the concession applies to.</summary>
    public string? ProductType { get; set; }

    /// <summary>Financial institutions: the concession, in basis points.</summary>
    public int? RateConcessionBps { get; set; }

    /// <summary>Others: what kind of body issues it.</summary>
    public string? AgencyType { get; set; }

    /// <summary>Others: the id the issuing agency knows it by.</summary>
    public string? ExternalSchemeId { get; set; }

    // ---- nodal contact ----
    public string? ContactName { get; set; }
    public string? ContactDesignation { get; set; }
    public string? ContactMobile { get; set; }
    public string? ContactEmail { get; set; }

    // ---- publication ----
    /// <summary>
    /// Shown to MSMEs before they have earned it. On by default: the scheme's
    /// rule is that every box is visible from the start and only the benefit
    /// behind it is locked.
    /// </summary>
    public bool VisibleBeforeUnlock { get; set; } = true;

    public bool NotifyOnPublish { get; set; }
    public bool RequireClaimDocument { get; set; }

    public ICollection<IncentiveResource> Resources { get; set; } = [];

    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<IncentiveDisbursement> Disbursements { get; set; } = [];
}

/// <summary>
/// What an enterprise actually received. The beneficiary counts and amounts on
/// the Incentives cards are rolled up from these, never keyed in.
/// </summary>
public class IncentiveDisbursement
{
    public long DisbursementId { get; set; }
    public int IncentiveId { get; set; }
    public Incentive Incentive { get; set; } = null!;
    public int EnterpriseId { get; set; }
    public Enterprise Enterprise { get; set; } = null!;
    public int? ApplicationId { get; set; }
    public decimal Amount { get; set; }
    public DateOnly SanctionedOn { get; set; }
    public DateOnly? DisbursedOn { get; set; }

    /// <summary>Sanctioned, Disbursed, Rejected or Withdrawn.</summary>
    public string Status { get; set; } = "Sanctioned";

    public string? ReferenceNo { get; set; }
    public string? Remarks { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
}

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

public class Incentive : IAuditable, IConcurrencyAware
{
    public int IncentiveId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public byte ProviderId { get; set; }
    public IncentiveProvider Provider { get; set; } = null!;

    /// <summary>The body actually administering it, e.g. "Ministry of MSME / QCI".</summary>
    public string? AdministeringBody { get; set; }

    /// <summary>Null means available at every certification level ("Both").</summary>
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

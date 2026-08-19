using MCLS.Domain.Common;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Entities.Msme;

namespace MCLS.Domain.Entities.Fee;

/// <summary>
/// A subsidy slab. 90% base for everyone, plus 5% for the priority categories.
/// </summary>
public class SubsidyCategory
{
    public byte SubsidyCategoryId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public decimal BaseSubsidyPercent { get; set; }
    public decimal AdditionalPercent { get; set; }
    public byte SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Computed and persisted in the database. Read-only here so the
    /// application can never write a value that disagrees with its parts.
    /// </summary>
    public decimal TotalSubsidyPercent { get; private set; }
}

/// <summary>
/// The fee for a certification level, versioned by effective date. The current
/// rate is the row with a null <see cref="EffectiveTo"/>.
/// </summary>
public class FeeRate
{
    public int FeeRateId { get; set; }
    public byte CertificationLevelId { get; set; }
    public CertificationLevel CertificationLevel { get; set; } = null!;

    /// <summary>Inclusive of GST, matching how the Fee Structure screen states it.</summary>
    public decimal AmountInclusiveGst { get; set; }

    public decimal GstPercent { get; set; } = 18.00m;
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public string? Notes { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }

    public bool IsCurrent => EffectiveTo is null;
}

/// <summary>A TDS section: 194C for contractors, 194J for professional services.</summary>
public class TdsSection
{
    public int TdsSectionId { get; set; }
    public string SectionCode { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal RatePercent { get; set; }
    public string ApplicableTo { get; set; } = string.Empty;
    public DateOnly EffectiveFrom { get; set; }
    public DateOnly? EffectiveTo { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
}

/// <summary>
/// An invoice against an application. The subsidy split is frozen at issue:
/// rates change, issued invoices must not.
/// </summary>
public class Invoice : IConcurrencyAware
{
    public int InvoiceId { get; set; }
    public string InvoiceNo { get; set; } = string.Empty;
    public int ApplicationId { get; set; }
    public Application Application { get; set; } = null!;
    public int FeeRateId { get; set; }
    public byte SubsidyCategoryId { get; set; }
    public SubsidyCategory SubsidyCategory { get; set; } = null!;

    public decimal GrossAmount { get; set; }
    public decimal SubsidyPercent { get; set; }
    public decimal SubsidyAmount { get; set; }
    public decimal PayableByUnit { get; set; }

    /// <summary>Issued, PartPaid, Paid or Cancelled.</summary>
    public string Status { get; set; } = "Issued";

    public DateTime IssuedOnUtc { get; set; }
    public DateOnly? DueOn { get; set; }
    public DateTime? CancelledOnUtc { get; set; }
    public string? CancellationReason { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<Payment> Payments { get; set; } = [];
}

public class Payment
{
    public int PaymentId { get; set; }
    public int InvoiceId { get; set; }
    public Invoice Invoice { get; set; } = null!;
    public decimal Amount { get; set; }

    /// <summary>NEFT, RTGS, UPI, Card, NetBanking, DD, Cheque or Other.</summary>
    public string PaymentMode { get; set; } = string.Empty;

    /// <summary>
    /// Gateway or bank reference. Unique when present, so a duplicated gateway
    /// callback cannot post the same receipt twice.
    /// </summary>
    public string? TransactionRef { get; set; }

    public string? GatewayName { get; set; }
    public DateTime PaidOnUtc { get; set; }

    /// <summary>Pending, Success, Failed or Refunded.</summary>
    public string Status { get; set; } = "Success";

    public string? FailureReason { get; set; }
    public int? RecordedByUserId { get; set; }
    public DateTime RecordedOnUtc { get; set; }
}

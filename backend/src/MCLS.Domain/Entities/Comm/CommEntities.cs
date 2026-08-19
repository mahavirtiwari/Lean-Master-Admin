using MCLS.Domain.Common;
using MCLS.Domain.Entities.Identity;

namespace MCLS.Domain.Entities.Comm;

/// <summary>
/// A transactional e-mail template. <see cref="AvailableTags"/> is both the
/// editor's palette and the renderer's whitelist, so an unknown merge tag is a
/// validation error rather than a silent blank.
/// </summary>
public class EmailTemplate : IAuditable, IConcurrencyAware
{
    public int EmailTemplateId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string BodyHtml { get; set; } = string.Empty;
    public string? BodyText { get; set; }

    /// <summary>Comma-separated, e.g. <c>{{user_name}},{{unit_name}}</c>.</summary>
    public string? AvailableTags { get; set; }

    /// <summary>
    /// The scheme event that fires this mail, in the reader's words — "MSME
    /// submits registration". Held separately from <see cref="Code"/> so the
    /// label can be reworded without renaming the key the API sends by, and
    /// fixed once the template exists: changing it would silently repoint a
    /// live template at a different moment in the scheme.
    /// </summary>
    public string? TriggerEvent { get; set; }

    /// <summary>Where replies go. Usually the no-reply mailbox.</summary>
    public string? ReplyToAddress { get; set; }

    /// <summary>Optional internal mailbox copied on every send.</summary>
    public string? CopyToAddress { get; set; }

    public bool IsTransactional { get; set; } = true;
    public bool IsActive { get; set; } = true;

    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<EmailTemplateAudience> Audiences { get; set; } = [];
}

public class EmailTemplateAudience
{
    public int EmailTemplateId { get; set; }
    public EmailTemplate EmailTemplate { get; set; } = null!;
    public byte AccountTypeId { get; set; }
    public AccountType AccountType { get; set; } = null!;
}

/// <summary>A one-off broadcast to a chosen set of account types.</summary>
public class EmailCampaign : IConcurrencyAware
{
    public int EmailCampaignId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string Subject { get; set; } = string.Empty;
    public string BodyHtml { get; set; } = string.Empty;
    public int? EmailTemplateId { get; set; }
    public EmailTemplate? EmailTemplate { get; set; }

    /// <summary>Draft, Scheduled, Sending, Sent, Cancelled or Failed.</summary>
    public string Status { get; set; } = "Draft";

    public DateTime? ScheduledForUtc { get; set; }
    public DateTime? SentOnUtc { get; set; }

    // Rollups maintained by the dispatch job, so the list screen never
    // aggregates the outbox on page load.
    public int RecipientCount { get; set; }
    public int SentCount { get; set; }
    public int FailedCount { get; set; }

    public DateTime CreatedOnUtc { get; set; }
    public int CreatedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<EmailCampaignAudience> Audiences { get; set; } = [];
}

public class EmailCampaignAudience
{
    public int EmailCampaignId { get; set; }
    public EmailCampaign EmailCampaign { get; set; } = null!;
    public byte AccountTypeId { get; set; }
    public AccountType AccountType { get; set; } = null!;
}

/// <summary>
/// The outbox. A hosted service claims queued rows and sends them; nothing is
/// sent inline on a request thread.
/// </summary>
public class EmailMessage
{
    public long EmailMessageId { get; set; }
    public int? EmailCampaignId { get; set; }
    public int? EmailTemplateId { get; set; }
    public string ToAddress { get; set; } = string.Empty;
    public int? ToUserId { get; set; }
    public string Subject { get; set; } = string.Empty;
    public string BodyHtml { get; set; } = string.Empty;

    /// <summary>Queued, Sending, Sent, Failed or Cancelled.</summary>
    public string Status { get; set; } = "Queued";

    public byte AttemptCount { get; set; }
    public DateTime? LastAttemptOnUtc { get; set; }
    public DateTime? SentOnUtc { get; set; }
    public string? ErrorMessage { get; set; }
    public string? ProviderMessageId { get; set; }
    public DateTime QueuedOnUtc { get; set; }
}

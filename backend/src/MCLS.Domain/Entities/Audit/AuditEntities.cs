using MCLS.Domain.Common;

namespace MCLS.Domain.Entities.Audit;

/// <summary>
/// A tracked entity change. Written by the SaveChanges interceptor, so no
/// handler has to remember to log.
/// </summary>
public class AuditLog
{
    public long AuditLogId { get; set; }
    public DateTime OccurredOnUtc { get; set; }
    public int? UserId { get; set; }

    /// <summary>Denormalised so the trail survives the account being removed.</summary>
    public string? UserName { get; set; }

    /// <summary>
    /// The role the actor held at the time. Stored rather than joined: the role
    /// a user holds today is not necessarily the one they acted under, and
    /// joining would silently rewrite history when somebody is promoted.
    /// </summary>
    public string? RoleName { get; set; }

    /// <summary>Success or Failed — a refused action is still auditable.</summary>
    public string Outcome { get; set; } = "Success";

    public byte? ModuleId { get; set; }

    /// <summary>Insert, Update, Delete, Login, Export or StatusChange.</summary>
    public string Action { get; set; } = string.Empty;

    public string EntityName { get; set; } = string.Empty;
    public string? EntityKey { get; set; }

    /// <summary>JSON. Sensitive properties are excluded by the interceptor.</summary>
    public string? OldValues { get; set; }
    public string? NewValues { get; set; }

    public string? AffectedColumns { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }

    /// <summary>
    /// What the request came from, worked out once when the row is written.
    /// The agent string above stays as the evidence; these are what a report
    /// can group by.
    /// </summary>
    public string? DeviceType { get; set; }
    public string? OperatingSystem { get; set; }
    public string? Browser { get; set; }
    public Guid? CorrelationId { get; set; }
}

/// <summary>
/// An unhandled exception. <see cref="CorrelationId"/> matches the trace id
/// shown to the user, so a support call maps to one row.
/// </summary>
public class ErrorLog
{
    public long ErrorLogId { get; set; }
    public DateTime OccurredOnUtc { get; set; }

    /// <summary>Warning, Error or Critical.</summary>
    public string Severity { get; set; } = "Error";

    public string? Source { get; set; }
    public string? ExceptionType { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? StackTrace { get; set; }
    public string? RequestMethod { get; set; }
    public string? RequestPath { get; set; }
    public string? QueryString { get; set; }
    public int? StatusCode { get; set; }
    public int? UserId { get; set; }
    public string? IpAddress { get; set; }
    public Guid? CorrelationId { get; set; }
    public string? MachineName { get; set; }

    /// <summary>
    /// A stable identifier for the fault, e.g. ERR-PAY-5021. The screen groups
    /// on this: grouping on the message would split one fault across every
    /// variant of its wording.
    /// </summary>
    public string? ErrorCode { get; set; }

    /// <summary>Which part of the portal raised it.</summary>
    public byte? ModuleId { get; set; }

    /// <summary>Open, Acknowledged or Resolved. Kept in step with IsResolved.</summary>
    public string Status { get; set; } = "Open";

    public bool IsResolved { get; set; }
    public int? ResolvedByUserId { get; set; }
    public DateTime? ResolvedOnUtc { get; set; }
    public string? ResolutionNote { get; set; }
}

/// <summary>
/// An integration registered in Settings &gt; APIs. Secrets are never stored;
/// <see cref="SecretRef"/> only names the configuration key holding one.
/// </summary>
public class ApiRegistry : IConcurrencyAware
{
    public int ApiRegistryId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>Inbound or Outbound.</summary>
    public string Direction { get; set; } = "Outbound";

    public string? BaseUrl { get; set; }
    public string? AuthType { get; set; }
    public string? SecretRef { get; set; }
    public int TimeoutSeconds { get; set; } = 30;
    public bool IsEnabled { get; set; } = true;
    public DateTime? LastCheckedOnUtc { get; set; }
    public int? LastStatusCode { get; set; }
    public int? LastLatencyMs { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }
}

/// <summary>
/// A Settings &gt; System entry. <see cref="DataType"/> tells the UI which
/// control to render and lets the API validate before saving.
/// </summary>
public class SystemSetting : IConcurrencyAware
{
    public int SystemSettingId { get; set; }
    public string Key { get; set; } = string.Empty;
    public string? Value { get; set; }

    /// <summary>String, Int, Decimal, Bool, Date or Json.</summary>
    public string DataType { get; set; } = "String";

    public string Category { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public string? Description { get; set; }

    /// <summary>Masked in the UI and excluded from the audit trail.</summary>
    public bool IsSensitive { get; set; }

    public bool IsEditable { get; set; } = true;
    public short SortOrder { get; set; }

    /// <summary>
    /// What the setting shipped as. Without it the screen's "Reset to Default"
    /// has nothing to reset to.
    /// </summary>
    public string? DefaultValue { get; set; }

    /// <summary>
    /// Orders the group cards on the screen. The five drawn groups take 1-5;
    /// everything else sorts after them at 90.
    /// </summary>
    public short CategorySortOrder { get; set; } = 90;

    /// <summary>Which glyph the group card's tile shows.</summary>
    public string? IconKey { get; set; }

    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }
}

/// <summary>
/// A key issued to a consumer of the portal's own API.
///
/// Only <see cref="KeyPrefix"/> — a mask such as <c>mcls_live_****4kA2</c> — is
/// ever returned. The secret is shown once at generation and stored hashed, so
/// no read path can leak a usable credential.
/// </summary>
public class ApiKey
{
    public int ApiKeyId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string KeyPrefix { get; set; } = string.Empty;
    public byte[]? KeyHash { get; set; }
    public string Owner { get; set; } = string.Empty;

    /// <summary>Live or Revoked.</summary>
    public string Status { get; set; } = "Live";

    public DateTime? LastUsedOnUtc { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public DateTime? RevokedOnUtc { get; set; }
    public short SortOrder { get; set; }
}

/// <summary>One route the portal publishes, with its 24-hour traffic.</summary>
public class ApiEndpoint
{
    public int ApiEndpointId { get; set; }
    public string Method { get; set; } = "GET";
    public string Route { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int Calls24h { get; set; }
    public decimal ErrorRate { get; set; }

    /// <summary>Live or Deprecated.</summary>
    public string Status { get; set; } = "Live";

    public short SortOrder { get; set; }
}

/// <summary>A rate-limit tier applied to callers.</summary>
public class ApiRateLimit
{
    public int ApiRateLimitId { get; set; }
    public string TierName { get; set; } = string.Empty;
    public int RequestsPerMin { get; set; }
    public int CurrentUsage { get; set; }
    public short SortOrder { get; set; }
}

/// <summary>An outbound subscription the portal posts to.</summary>
public class Webhook
{
    public int WebhookId { get; set; }
    public string Event { get; set; } = string.Empty;
    public string TargetUrl { get; set; } = string.Empty;

    /// <summary>Live, Paused or Failing.</summary>
    public string Status { get; set; } = "Live";

    public DateTime? LastSentUtc { get; set; }
    public short SortOrder { get; set; }
}

/// <summary>
/// A payment gateway offered to MSMEs at checkout, as listed on the System
/// Settings screen.
///
/// <see cref="MerchantKeyMask"/> is a mask such as <c>rzp_live_****7xK2</c>,
/// never a live key: the portal holds gateway credentials in configuration, so
/// there is nothing here worth stealing.
/// </summary>
public class PaymentGateway
{
    public int PaymentGatewayId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;

    /// <summary>Primary, Fallback or Disabled — drawn under the name.</summary>
    public string RoleLabel { get; set; } = "Fallback";

    /// <summary>Live or Test.</summary>
    public string Mode { get; set; } = "Test";

    public string? MerchantKeyMask { get; set; }
    public byte? Priority { get; set; }
    public DateTime? LastTxnOnUtc { get; set; }
    public decimal? SuccessRate { get; set; }
    public bool IsEnabled { get; set; }
    public short SortOrder { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
}

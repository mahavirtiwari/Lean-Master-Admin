using MCLS.Domain.Entities.Master;
using MCLS.Infrastructure.Persistence;

namespace MCLS.Api.Services;

/// <summary>
/// Recording why a master record was switched on or off.
///
/// The reason is required, not optional: a sector or a parameter being
/// disabled changes what applicants can register against, and six months later
/// "IsActive: true -> false" in the audit trail does not say whether it was
/// withdrawn, merged, or switched off by mistake. Asking at the moment somebody
/// knows the answer is the only time it is cheap.
/// </summary>
public static class StatusChanges
{
    /// <summary>The message shown when a reason is missing.</summary>
    public const string ReasonRequired =
        "Give a reason for this change. It is recorded against the record and shown in its history.";

    public static void Record(
        MclsDbContext db,
        string entityName,
        int entityId,
        string? entityLabel,
        bool fromActive,
        bool toActive,
        string reason,
        int? changedByUserId)
    {
        db.StatusChangeLogs.Add(new StatusChangeLog
        {
            EntityName = entityName,
            EntityId = entityId,
            EntityLabel = entityLabel,
            FromActive = fromActive,
            ToActive = toActive,
            Reason = reason.Trim(),
            ChangedByUserId = changedByUserId,
            ChangedOnUtc = DateTime.UtcNow,
        });
    }
}

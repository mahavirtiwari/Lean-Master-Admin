using System.Text.Json;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Common;
using MCLS.Domain.Entities.Audit;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Diagnostics;

namespace MCLS.Infrastructure.Persistence.Interceptors;

/// <summary>
/// Fills in the audit columns and writes the audit trail on every save, so no
/// controller or handler has to remember to do either.
///
/// Two passes are needed. Before saving, entity state is still available and
/// the old/new values can be read. Generated keys, however, are not: an
/// inserted row has no id yet. So audit entries are built before the save and
/// their entity keys resolved after it, then written in a second save.
/// </summary>
public sealed class AuditSaveChangesInterceptor(
    ICurrentUser currentUser,
    IDateTimeProvider clock) : SaveChangesInterceptor
{
    /// <summary>
    /// Property names never written to the trail, whatever entity they are on.
    /// Matching is case-insensitive and by exact name.
    /// </summary>
    private static readonly HashSet<string> RedactedProperties = new(StringComparer.OrdinalIgnoreCase)
    {
        "PasswordHash", "SecurityStamp", "ConcurrencyStamp", "TokenHash",
        "Value",                // audit.SystemSetting — may hold an SMTP password
        "SecretRef",
        "RowVersion",           // noise: changes on every update
    };

    /// <summary>
    /// Entities whose changes are not worth a trail entry. The audit tables
    /// themselves are excluded, or writing an entry would generate another.
    /// </summary>
    private static readonly HashSet<string> ExcludedEntities = new(StringComparer.Ordinal)
    {
        nameof(AuditLog), nameof(ErrorLog), "EmailMessage", "LoginAudit", "RefreshToken",
    };

    private readonly List<PendingAudit> _pending = [];

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData,
        InterceptionResult<int> result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is not null)
        {
            StampAuditColumns(eventData.Context);
            CollectAuditEntries(eventData.Context);
        }

        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }

    public override async ValueTask<int> SavedChangesAsync(
        SaveChangesCompletedEventData eventData,
        int result,
        CancellationToken cancellationToken = default)
    {
        if (eventData.Context is null || _pending.Count == 0)
        {
            return await base.SavedChangesAsync(eventData, result, cancellationToken);
        }

        // Take a local copy and clear immediately: the second SaveChanges below
        // re-enters this interceptor, and a non-empty list would recurse.
        var entries = _pending.ToList();
        _pending.Clear();

        foreach (var pending in entries)
        {
            // Now that the insert has happened, the generated key is readable.
            pending.Log.EntityKey ??= pending.ResolveKey();
            eventData.Context.Set<AuditLog>().Add(pending.Log);
        }

        await eventData.Context.SaveChangesAsync(cancellationToken);
        return await base.SavedChangesAsync(eventData, result, cancellationToken);
    }

    /// <summary>Sets CreatedOn/CreatedBy and ModifiedOn/ModifiedBy.</summary>
    private void StampAuditColumns(DbContext context)
    {
        var now = clock.UtcNow;
        var userId = currentUser.UserId;

        foreach (var entry in context.ChangeTracker.Entries<IAuditable>())
        {
            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Entity.CreatedOnUtc = now;
                    entry.Entity.CreatedByUserId ??= userId;
                    break;

                case EntityState.Modified:
                    entry.Entity.ModifiedOnUtc = now;
                    entry.Entity.ModifiedByUserId = userId;
                    // Guard against a detached-graph update blanking these.
                    entry.Property(e => e.CreatedOnUtc).IsModified = false;
                    entry.Property(e => e.CreatedByUserId).IsModified = false;
                    break;
            }
        }

        // A soft delete is an update, and is recorded as a Delete in the trail
        // by CollectAuditEntries below.
        foreach (var entry in context.ChangeTracker.Entries<ISoftDeletable>()
                     .Where(e => e.State == EntityState.Deleted))
        {
            entry.State = EntityState.Modified;
            entry.Entity.IsDeleted = true;
        }
    }

    private void CollectAuditEntries(DbContext context)
    {
        var now = clock.UtcNow;

        foreach (var entry in context.ChangeTracker.Entries())
        {
            if (entry.Entity is AuditLog or ErrorLog) continue;

            var entityName = entry.Metadata.ClrType.Name;
            if (ExcludedEntities.Contains(entityName)) continue;

            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted))
                continue;

            // An unchanged-in-practice update (only RowVersion touched) is noise.
            var changed = entry.Properties
                .Where(p => p.IsModified && !RedactedProperties.Contains(p.Metadata.Name))
                .ToList();

            if (entry.State == EntityState.Modified && changed.Count == 0) continue;

            var action = entry.State switch
            {
                EntityState.Added => "Insert",
                EntityState.Deleted => "Delete",
                _ => entry.Entity is ISoftDeletable { IsDeleted: true } ? "Delete" : "Update",
            };

            var log = new AuditLog
            {
                OccurredOnUtc = now,
                UserId = currentUser.UserId,
                UserName = currentUser.FullName,
                Action = action,
                EntityName = $"{entry.Metadata.GetSchema() ?? "dbo"}.{entry.Metadata.GetTableName()}",
                IpAddress = currentUser.IpAddress,
                UserAgent = currentUser.UserAgent,
                OldValues = entry.State == EntityState.Added ? null : Serialise(entry, useOriginal: true),
                NewValues = entry.State == EntityState.Deleted ? null : Serialise(entry, useOriginal: false),
                AffectedColumns = entry.State == EntityState.Modified && changed.Count > 0
                    ? string.Join(',', changed.Select(p => p.Metadata.Name))
                    : null,
            };

            // A key that already has a value can be resolved now; a generated
            // one has to wait until after the insert.
            var pending = new PendingAudit(log, entry);
            if (entry.State != EntityState.Added)
            {
                log.EntityKey = pending.ResolveKey();
            }

            _pending.Add(pending);
        }
    }

    private static string? Serialise(EntityEntry entry, bool useOriginal)
    {
        var values = new Dictionary<string, object?>();

        foreach (var property in entry.Properties)
        {
            var name = property.Metadata.Name;
            if (RedactedProperties.Contains(name)) continue;

            // Never serialise a rowversion: it is a byte array that changes on
            // every write and means nothing to a reader.
            if (property.Metadata.ClrType == typeof(byte[])) continue;

            var value = useOriginal ? property.OriginalValue : property.CurrentValue;
            values[name] = value;
        }

        return values.Count == 0 ? null : JsonSerializer.Serialize(values, JsonOptions);
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    /// <summary>An audit row plus the entry it came from, so its key can be read after the save.</summary>
    private sealed record PendingAudit(AuditLog Log, EntityEntry Entry)
    {
        public string? ResolveKey()
        {
            var keyProperties = Entry.Metadata.FindPrimaryKey()?.Properties;
            if (keyProperties is null || keyProperties.Count == 0) return null;

            var parts = keyProperties
                .Select(p => Entry.Property(p.Name).CurrentValue?.ToString() ?? string.Empty);

            return string.Join('|', parts);
        }
    }
}

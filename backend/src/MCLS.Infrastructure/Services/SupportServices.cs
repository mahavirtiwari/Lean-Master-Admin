using System.Collections.Concurrent;
using MCLS.Application.Common.Interfaces;
using MCLS.Infrastructure.Persistence;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Infrastructure.Services;

/// <summary>Wall clock. Swapped for a fake in tests.</summary>
public sealed class SystemDateTimeProvider : IDateTimeProvider
{
    public DateTime UtcNow => DateTime.UtcNow;
    public DateOnly Today => DateOnly.FromDateTime(DateTime.UtcNow);
}

/// <summary>
/// Hands out human-readable identifiers via <c>audit.usp_NextSequence</c>.
///
/// This goes through the procedure rather than a LINQ MAX()+1 because the
/// procedure's single UPDATE is atomic: two concurrent registrations cannot
/// receive the same application number.
/// </summary>
public sealed class SequenceService(MclsDbContext db) : ISequenceService
{
    public async Task<string> NextAsync(
        string sequenceName, string? periodKey = null, CancellationToken ct = default)
    {
        var output = new SqlParameter
        {
            ParameterName = "@FormattedValue",
            SqlDbType = System.Data.SqlDbType.VarChar,
            Size = 40,
            Direction = System.Data.ParameterDirection.Output,
        };

        await db.Database.ExecuteSqlRawAsync(
            "EXEC audit.usp_NextSequence @SequenceName, @PeriodKey, @FormattedValue OUTPUT",
            [
                new SqlParameter("@SequenceName", sequenceName),
                new SqlParameter("@PeriodKey", (object?)periodKey ?? string.Empty),
                output,
            ],
            ct);

        return output.Value as string
            ?? throw new InvalidOperationException($"Sequence '{sequenceName}' returned no value.");
    }
}

/// <summary>
/// Typed access to Settings &gt; System, cached in memory.
///
/// Settings are read on nearly every request (upload limits, retention, feature
/// flags) and change rarely, so they are cached for the process lifetime and
/// invalidated explicitly on write. In a multi-server farm each node keeps its
/// own copy; a change therefore takes effect on other nodes at the next app
/// pool recycle. That is acceptable for these values and is documented in
/// deploy/README.md.
/// </summary>
public sealed class SystemSettingsService(MclsDbContext db, IDateTimeProvider clock) : ISystemSettings
{
    private static readonly ConcurrentDictionary<string, string?> Cache = new(StringComparer.OrdinalIgnoreCase);
    private static volatile bool _loaded;
    private static readonly SemaphoreSlim LoadLock = new(1, 1);

    public async Task<string?> GetStringAsync(string key, CancellationToken ct = default)
    {
        await EnsureLoadedAsync(ct);
        return Cache.GetValueOrDefault(key);
    }

    public async Task<int> GetIntAsync(string key, int fallback, CancellationToken ct = default)
        => int.TryParse(await GetStringAsync(key, ct), out var value) ? value : fallback;

    public async Task<bool> GetBoolAsync(string key, bool fallback, CancellationToken ct = default)
        => bool.TryParse(await GetStringAsync(key, ct), out var value) ? value : fallback;

    public async Task SetAsync(string key, string? value, int modifiedByUserId, CancellationToken ct = default)
    {
        var rows = await db.SystemSettings
            .Where(s => s.Key == key && s.IsEditable)
            .ExecuteUpdateAsync(s => s
                .SetProperty(x => x.Value, value)
                .SetProperty(x => x.ModifiedOnUtc, clock.UtcNow)
                .SetProperty(x => x.ModifiedByUserId, modifiedByUserId), ct);

        if (rows == 0)
        {
            throw new InvalidOperationException(
                $"Setting '{key}' does not exist or is not editable.");
        }

        Cache[key] = value;
    }

    public void InvalidateCache()
    {
        Cache.Clear();
        _loaded = false;
    }

    private async Task EnsureLoadedAsync(CancellationToken ct)
    {
        if (_loaded) return;

        await LoadLock.WaitAsync(ct);
        try
        {
            if (_loaded) return;

            var all = await db.SystemSettings
                .AsNoTracking()
                .Select(s => new { s.Key, s.Value })
                .ToListAsync(ct);

            foreach (var setting in all)
            {
                Cache[setting.Key] = setting.Value;
            }

            _loaded = true;
        }
        finally
        {
            LoadLock.Release();
        }
    }
}

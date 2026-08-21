using System.Net.Http.Json;
using System.Text.Json.Serialization;

using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Msme;
using MCLS.Infrastructure.Persistence;

using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MCLS.Infrastructure.Awareness;

/// <summary>
/// Where the LEAN awareness programmes come from.
///
/// <see cref="BaseUrl"/> and <see cref="Path"/> address the scheme's programme
/// service. <see cref="Token"/> is a credential and must never be committed —
/// user secrets in development, an environment variable or the IIS
/// configuration editor in production, exactly like Udyam:Token.
///
/// Leaving <see cref="Enabled"/> false keeps the portal on the programmes an
/// administrator maintains in Masters, which is how it ran before the service
/// existed and how it must still run when the service is down.
/// </summary>
public sealed class AwarenessProgramOptions
{
    public const string SectionName = "AwarenessPrograms";

    public bool Enabled { get; set; }

    public string BaseUrl { get; set; } = string.Empty;

    /// <summary>Relative to BaseUrl, e.g. "api/programs".</summary>
    public string Path { get; set; } = "programs";

    public string Token { get; set; } = string.Empty;

    /// <summary>Sent as a bearer token unless a header name is given here.</summary>
    public string? TokenHeader { get; set; }

    public int TimeoutSeconds { get; set; } = 20;

    /// <summary>
    /// How long a fetched list is reused before the service is asked again.
    ///
    /// Programmes change a few times a week and the list is read on every
    /// registration, so asking the service each time would put thousands of
    /// calls a day on it for data that has not moved.
    /// </summary>
    public int CacheMinutes { get; set; } = 15;
}

/// <summary>One programme as the service publishes it.</summary>
public sealed record AwarenessProgramDto(
    [property: JsonPropertyName("programCode")] string? ProgramCode,
    [property: JsonPropertyName("name")] string? Name,
    [property: JsonPropertyName("heldOn")] DateOnly? HeldOn,
    [property: JsonPropertyName("venue")] string? Venue,
    [property: JsonPropertyName("stateCode")] string? StateCode,
    [property: JsonPropertyName("isActive")] bool? IsActive);

/// <summary>
/// Fetches the awareness programmes an applicant can claim attendance at.
///
/// The list is served by the scheme's own programme service when one is
/// configured, and by the local master table otherwise. Two things follow from
/// that, and both are deliberate:
///
/// First, a fetched programme is written into the local table before it is
/// offered. A registration records WHICH programme was attended as a foreign
/// key, so a programme that exists only in a remote response cannot be chosen —
/// there would be nothing to point at, and the attendance would be unprovable
/// afterwards. Upserting on the programme code keeps the reference stable and
/// makes the list reportable alongside everything else.
///
/// Second, a failure falls back to the local table rather than surfacing. An
/// applicant halfway through a registration should not be stopped because an
/// upstream service is having a bad afternoon; the worst case is that a
/// programme added in the last few minutes is missing from the list, which the
/// administrator can add by hand.
/// </summary>
public sealed class AwarenessProgramClient(
    HttpClient http,
    MclsDbContext db,
    IOptions<AwarenessProgramOptions> options,
    ILogger<AwarenessProgramClient> logger) : IAwarenessProgramSource
{
    private readonly AwarenessProgramOptions _options = options.Value;

    // Shared across requests: the list is the same for everybody, and the point
    // of the cache is to keep the service from being asked once per applicant.
    private static readonly SemaphoreSlim RefreshLock = new(1, 1);
    private static DateTime lastFetchedUtc = DateTime.MinValue;

    public async Task<IReadOnlyList<AwarenessProgram>> GetProgramsAsync(CancellationToken ct = default)
    {
        if (_options.Enabled) await RefreshFromServiceAsync(ct);

        return await db.AwarenessPrograms.AsNoTracking()
            .Where(p => p.IsActive)
            .OrderByDescending(p => p.HeldOn)
            .ThenBy(p => p.Name)
            .ToListAsync(ct);
    }

    /// <summary>
    /// Brings the local table up to date with the service, at most once every
    /// CacheMinutes and never more than one caller at a time.
    /// </summary>
    private async Task RefreshFromServiceAsync(CancellationToken ct)
    {
        if (DateTime.UtcNow - lastFetchedUtc < TimeSpan.FromMinutes(_options.CacheMinutes)) return;

        if (!await RefreshLock.WaitAsync(TimeSpan.FromSeconds(2), ct)) return;

        try
        {
            // Checked again inside the lock: several requests can arrive at the
            // moment the cache expires, and only the first should call out.
            if (DateTime.UtcNow - lastFetchedUtc < TimeSpan.FromMinutes(_options.CacheMinutes)) return;

            var fetched = await FetchAsync(ct);

            // A null means the call failed and has been logged; the timestamp is
            // deliberately not moved, so the next request tries again rather
            // than serving a stale list for the whole cache window.
            if (fetched is null) return;

            await MergeAsync(fetched, ct);

            lastFetchedUtc = DateTime.UtcNow;
        }
        finally
        {
            RefreshLock.Release();
        }
    }

    private async Task<List<AwarenessProgramDto>?> FetchAsync(CancellationToken ct)
    {
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, _options.Path);

            if (!string.IsNullOrWhiteSpace(_options.Token))
            {
                if (string.IsNullOrWhiteSpace(_options.TokenHeader))
                {
                    request.Headers.Authorization =
                        new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", _options.Token);
                }
                else
                {
                    request.Headers.TryAddWithoutValidation(_options.TokenHeader, _options.Token);
                }
            }

            using var response = await http.SendAsync(request, ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "The awareness programme service answered {Status}; keeping the local list.",
                    (int)response.StatusCode);

                return null;
            }

            return await response.Content.ReadFromJsonAsync<List<AwarenessProgramDto>>(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException or NotSupportedException
                                      or System.Text.Json.JsonException)
        {
            // Deliberately swallowed. A registration in progress must not fail
            // because an upstream service is unreachable or answered something
            // unreadable; the local list is the fallback and it is complete
            // enough to finish on.
            logger.LogWarning(ex, "The awareness programme service could not be read; keeping the local list.");

            return null;
        }
    }

    /// <summary>
    /// Writes the service's programmes into the master table, keyed on the
    /// programme code.
    ///
    /// Nothing is deleted. A programme that has disappeared from the service is
    /// deactivated rather than removed, because registrations already point at
    /// it and the attendance they record has to remain readable.
    /// </summary>
    private async Task MergeAsync(List<AwarenessProgramDto> fetched, CancellationToken ct)
    {
        var usable = fetched
            .Where(p => !string.IsNullOrWhiteSpace(p.ProgramCode) && !string.IsNullOrWhiteSpace(p.Name))
            .ToList();

        if (usable.Count == 0)
        {
            logger.LogInformation("The awareness programme service returned nothing usable.");
            return;
        }

        var codes = usable.Select(p => p.ProgramCode!).ToHashSet(StringComparer.OrdinalIgnoreCase);

        var existing = await db.AwarenessPrograms.AsTracking()
            .Where(p => p.ProgramCode != null)
            .ToListAsync(ct);

        var byCode = existing
            .Where(p => p.ProgramCode is not null)
            .ToDictionary(p => p.ProgramCode!, StringComparer.OrdinalIgnoreCase);

        var states = await db.States.AsNoTracking()
            .Where(s => s.Code != null)
            .ToDictionaryAsync(s => s.Code, s => s.StateId, ct);

        foreach (var dto in usable)
        {
            var stateId = dto.StateCode is not null && states.TryGetValue(dto.StateCode, out var id)
                ? id
                : (short?)null;

            if (byCode.TryGetValue(dto.ProgramCode!, out var row))
            {
                row.Name = dto.Name!.Trim();
                row.HeldOn = dto.HeldOn;
                row.Venue = dto.Venue?.Trim();
                row.StateId = stateId ?? row.StateId;
                row.IsActive = dto.IsActive ?? true;
                row.Source = "Service";
            }
            else
            {
                db.AwarenessPrograms.Add(new AwarenessProgram
                {
                    ProgramCode = dto.ProgramCode!.Trim(),
                    Name = dto.Name!.Trim(),
                    HeldOn = dto.HeldOn,
                    Venue = dto.Venue?.Trim(),
                    StateId = stateId,
                    IsActive = dto.IsActive ?? true,
                    Source = "Service",
                });
            }
        }

        // Retired upstream, kept here: a registration may already reference it.
        //
        // Only programmes the service itself put here. An administrator's own
        // entries are not the service's to withdraw — the first run of this
        // merge deactivated all five of them, which is silent data loss dressed
        // up as a sync.
        foreach (var row in existing.Where(p =>
                     p.IsActive && p.Source == "Service" && !codes.Contains(p.ProgramCode!)))
        {
            row.IsActive = false;
        }

        await db.SaveChangesAsync(ct);

        logger.LogInformation(
            "Awareness programmes refreshed from the service: {Count} received.", usable.Count);
    }
}

/// <summary>
/// The local master table, used when no programme service is configured.
///
/// Registered as the implementation whenever AwarenessPrograms:Enabled is
/// false, so the calling code never has to ask which source it is talking to.
/// </summary>
public sealed class LocalAwarenessPrograms(MclsDbContext db) : IAwarenessProgramSource
{
    public async Task<IReadOnlyList<AwarenessProgram>> GetProgramsAsync(CancellationToken ct = default)
        => await db.AwarenessPrograms.AsNoTracking()
            .Where(p => p.IsActive)
            .OrderByDescending(p => p.HeldOn)
            .ThenBy(p => p.Name)
            .ToListAsync(ct);
}

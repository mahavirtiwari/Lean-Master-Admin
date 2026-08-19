using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Models;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The four Settings screens: System Settings, Audit logs, Error Logs and APIs.
///
/// All of them sit behind <c>SETTINGS</c> rights because between them they
/// expose configuration, every administrative action taken on the portal, and
/// the integration endpoints — the three things an attacker would most like to
/// read.
/// </summary>
[ApiController]
[Route("api/settings")]
public sealed class SettingsController(MclsDbContext db) : ControllerBase
{
    // ------------------------------------------------------ system settings ---

    /// <summary>
    /// System Settings, grouped into the cards the screen shows.
    ///
    /// A setting marked sensitive returns its value masked. The screen has no
    /// need for the plaintext — it renders a masked field and posts a
    /// replacement — and returning it would put credentials in every browser's
    /// network log.
    /// </summary>
    [HttpGet("system")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetSystemSettings(CancellationToken ct)
    {
        var settings = await db.SystemSettings.AsNoTracking()
            .OrderBy(s => s.CategorySortOrder).ThenBy(s => s.Category).ThenBy(s => s.SortOrder)
            .Select(s => new SystemSettingDto(
                s.SystemSettingId,
                s.Key,
                s.IsSensitive ? "********" : s.Value,
                s.DataType,
                s.Category,
                s.DisplayName,
                s.Description,
                s.IsSensitive,
                s.IsEditable,
                s.IsSensitive ? null : s.DefaultValue,
                s.CategorySortOrder,
                s.IconKey,
                s.ModifiedOnUtc))
            .ToListAsync(ct);

        // Maintenance Mode is drawn as its own panel at the foot of the screen,
        // not as a fifth group card, so it is handed over separately.
        var groups = settings
            .Where(s => s.Category != MaintenanceCategory)
            .GroupBy(s => new { s.Category, s.CategorySortOrder })
            .OrderBy(g => g.Key.CategorySortOrder).ThenBy(g => g.Key.Category)
            .Select(g => new
            {
                category = g.Key.Category,
                iconKey = g.Select(s => s.IconKey).FirstOrDefault(k => k != null),
                sortOrder = g.Key.CategorySortOrder,
                settings = g.ToList(),
            });

        return Ok(new
        {
            groups,
            maintenance = settings.Where(s => s.Category == MaintenanceCategory).ToList(),
        });
    }

    private const string MaintenanceCategory = "Maintenance Mode";

    private static readonly string[] Severities = ["Critical", "Error", "Warning", "Info"];
    private static readonly string[] TriageStates = ["Open", "Acknowledged", "Resolved"];

    /// <summary>
    /// Saves the screen in one go, which is what the "Save Changes" button
    /// does — a per-field PUT would leave the screen half-applied if one field
    /// were rejected midway.
    ///
    /// Non-editable settings are refused rather than silently skipped: a screen
    /// that reports success while dropping a field is worse than one that says
    /// which field it will not take.
    /// </summary>
    [HttpPut("system")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> SaveSystemSettings(
        [FromBody] SystemSettingsBulkSaveRequest request, CancellationToken ct)
    {
        if (request.Settings.Count == 0) return NoContent();

        var ids = request.Settings.Select(s => s.SystemSettingId).ToList();

        var rows = await db.SystemSettings.AsTracking()
            .Where(s => ids.Contains(s.SystemSettingId))
            .ToListAsync(ct);

        var missing = ids.Except(rows.Select(r => r.SystemSettingId)).ToList();
        if (missing.Count > 0)
        {
            return BadRequest(new { message = $"No setting has id {string.Join(", ", missing)}." });
        }

        var locked = rows.Where(r => !r.IsEditable).Select(r => r.DisplayName).ToList();
        if (locked.Count > 0)
        {
            return Problem(
                title: "Some settings are not editable.",
                detail: $"{string.Join(", ", locked)} are maintained by the deployment, not the portal.",
                statusCode: StatusCodes.Status409Conflict);
        }

        foreach (var row in rows)
        {
            var incoming = request.Settings.First(s => s.SystemSettingId == row.SystemSettingId);

            // A masked value coming back means the field was never edited.
            if (row.IsSensitive && incoming.Value == "********") continue;

            if (!IsWellTyped(row.DataType, incoming.Value))
            {
                return BadRequest(new
                {
                    message = $"{row.DisplayName} expects {row.DataType.ToLowerInvariant()}.",
                });
            }

            row.Value = incoming.Value;
            row.ModifiedOnUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Puts every editable setting back to what it shipped as — the screen's
    /// "Reset to Default". Settings with no recorded default are left alone
    /// rather than blanked.
    /// </summary>
    [HttpPost("system/reset")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> ResetSystemSettings(CancellationToken ct)
    {
        var rows = await db.SystemSettings.AsTracking()
            .Where(s => s.IsEditable && s.DefaultValue != null)
            .ToListAsync(ct);

        foreach (var row in rows)
        {
            row.Value = row.DefaultValue;
            row.ModifiedOnUtc = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return Ok(new { reset = rows.Count });
    }

    /// <summary>
    /// Rejects a value the setting's own type cannot hold, so a typo in
    /// "Session Timeout" cannot leave the portal with a timeout of "thirty".
    /// </summary>
    private static bool IsWellTyped(string dataType, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return true;

        return dataType switch
        {
            "Int" => int.TryParse(value, out _),
            "Decimal" => decimal.TryParse(value, out _),
            "Bool" => bool.TryParse(value, out _),
            "Date" => DateTime.TryParse(value, out _),
            _ => true,
        };
    }

    // --------------------------------------------------- payment gateways ---

    /// <summary>
    /// The Payment Gateway Configuration panel: the gateways offered at
    /// checkout, their priority order and their recent success rate.
    /// </summary>
    [HttpGet("payment-gateways")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetPaymentGateways(CancellationToken ct)
    {
        var gateways = await db.PaymentGateways.AsNoTracking()
            .OrderBy(g => g.SortOrder)
            .Select(g => new PaymentGatewayDto(
                g.PaymentGatewayId,
                g.Code,
                g.Name,
                g.RoleLabel,
                g.Mode,
                g.MerchantKeyMask,
                g.Priority,
                g.LastTxnOnUtc,
                g.SuccessRate,
                g.IsEnabled))
            .ToListAsync(ct);

        return Ok(new
        {
            gateways,
            activeCount = gateways.Count(g => g.IsEnabled),
            totalCount = gateways.Count,
            defaultGateway = gateways.FirstOrDefault(g => g.RoleLabel == "Primary")?.Name,
        });
    }

    /// <summary>Enables or disables one gateway from the panel.</summary>
    [HttpPut("payment-gateways/{id:int}")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> UpdatePaymentGateway(
        int id, [FromBody] PaymentGatewaySaveRequest request, CancellationToken ct)
    {
        var gateway = await db.PaymentGateways.AsTracking()
            .SingleOrDefaultAsync(g => g.PaymentGatewayId == id, ct);

        if (gateway is null) return NotFound();

        // A gateway with no merchant key cannot take a payment, so enabling it
        // would only produce failed checkouts.
        if (request.IsEnabled && string.IsNullOrWhiteSpace(gateway.MerchantKeyMask))
        {
            return Problem(
                title: "This gateway is not configured.",
                detail: $"{gateway.Name} has no merchant key. Configure it before enabling it.",
                statusCode: StatusCodes.Status409Conflict);
        }

        gateway.IsEnabled = request.IsEnabled;
        gateway.RoleLabel = request.IsEnabled
            ? (gateway.RoleLabel == "Disabled" ? "Fallback" : gateway.RoleLabel)
            : "Disabled";
        gateway.ModifiedOnUtc = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Saves one setting from the System Settings screen.</summary>
    [HttpPut("system/{id:int}")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> UpdateSystemSetting(
        int id, [FromBody] SystemSettingSaveRequest request, CancellationToken ct)
    {
        var setting = await db.SystemSettings.AsTracking().SingleOrDefaultAsync(s => s.SystemSettingId == id, ct);
        if (setting is null) return NotFound();

        // IsEditable marks settings the schema owns — a database collation or a
        // permission count the API validates at startup. Letting the screen
        // change those would break the portal in a way the screen cannot fix.
        if (!setting.IsEditable)
        {
            return Problem(
                title: "This setting is not editable.",
                detail: $"{setting.DisplayName} is maintained by the deployment, not the portal.",
                statusCode: StatusCodes.Status409Conflict);
        }

        setting.Value = request.Value;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    // ----------------------------------------------------------- audit logs ---

    /// <summary>The Audit Logs screen: who did what, to which record, when.</summary>
    [HttpGet("audit-logs")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetAuditLogs(
        [FromQuery] string? search,
        [FromQuery] string? action,
        [FromQuery] byte? moduleId,
        [FromQuery] int? userId,
        [FromQuery] string? outcome,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        var query = db.AuditLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(a =>
                (a.UserName != null && a.UserName.Contains(term)) ||
                a.EntityName.Contains(term) ||
                (a.EntityKey != null && a.EntityKey.Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(action)) query = query.Where(a => a.Action == action);
        if (!string.IsNullOrWhiteSpace(outcome)) query = query.Where(a => a.Outcome == outcome);
        if (moduleId is { } module) query = query.Where(a => a.ModuleId == module);
        if (userId is { } user) query = query.Where(a => a.UserId == user);
        if (fromUtc is { } from) query = query.Where(a => a.OccurredOnUtc >= from);

        // The screen's PERIOD TO is a date, and a date filter that excludes the
        // named day's own entries is the classic off-by-one on this screen.
        if (toUtc is { } to) query = query.Where(a => a.OccurredOnUtc < to.Date.AddDays(1));

        var total = await query.CountAsync(ct);

        // Module names come from the menu the portal already has, so MODULE can
        // never show a module that does not exist.
        var modules = await db.Modules.AsNoTracking()
            .ToDictionaryAsync(m => m.ModuleId, m => m.Name, ct);

        var rows = await query
            .OrderByDescending(a => a.OccurredOnUtc)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(a => new
            {
                a.AuditLogId, a.OccurredOnUtc, a.UserId, a.UserName, a.RoleName,
                a.ModuleId, a.Action, a.EntityName, a.EntityKey, a.AffectedColumns,
                a.IpAddress, a.Outcome, a.CorrelationId,
            })
            .ToListAsync(ct);

        var items = rows.Select(a => new AuditLogDto(
            a.AuditLogId, a.OccurredOnUtc, a.UserId, a.UserName, a.RoleName, a.ModuleId,
            a.ModuleId is { } id && modules.TryGetValue(id, out var name) ? name : null,
            a.Action, a.EntityName, a.EntityKey, a.AffectedColumns,
            a.IpAddress, a.Outcome, a.CorrelationId)).ToList();

        return Ok(PagedResult<AuditLogDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>
    /// The four count tiles above the Audit Trail. Counted over the same period
    /// the table is showing, so the tiles and the rows always agree.
    /// </summary>
    [HttpGet("audit-logs/summary")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetAuditSummary(
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        CancellationToken ct = default)
    {
        var query = db.AuditLogs.AsNoTracking();

        if (fromUtc is { } from) query = query.Where(a => a.OccurredOnUtc >= from);
        if (toUtc is { } to) query = query.Where(a => a.OccurredOnUtc < to.Date.AddDays(1));

        var summary = await query
            .GroupBy(_ => 1)
            .Select(g => new
            {
                totalEntries = g.Count(),
                modulesTracked = g.Where(a => a.ModuleId != null).Select(a => a.ModuleId).Distinct().Count(),
                distinctUsers = g.Where(a => a.UserId != null).Select(a => a.UserId).Distinct().Count(),
                failedActions = g.Count(a => a.Outcome == "Failed"),
            })
            .SingleOrDefaultAsync(ct);

        return Ok(summary ?? new
        {
            totalEntries = 0,
            modulesTracked = 0,
            distinctUsers = 0,
            failedActions = 0,
        });
    }

    /// <summary>The USER / ROLE, MODULE and ACTION drop-downs on the filter bar.</summary>
    [HttpGet("audit-logs/filters")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetAuditFilters(CancellationToken ct)
    {
        // Only actors that actually appear in the trail — a drop-down offering
        // a filter that can only ever return nothing is worse than no filter.
        var users = await db.AuditLogs.AsNoTracking()
            .Where(a => a.UserId != null && a.UserName != null)
            .GroupBy(a => new { a.UserId, a.UserName, a.RoleName })
            .Select(g => new
            {
                userId = g.Key.UserId,
                name = g.Key.UserName,
                roleName = g.Key.RoleName,
                entries = g.Count(),
            })
            .OrderByDescending(u => u.entries)
            .Take(200)
            .ToListAsync(ct);

        var moduleIds = await db.AuditLogs.AsNoTracking()
            .Where(a => a.ModuleId != null)
            .Select(a => a.ModuleId!.Value)
            .Distinct()
            .ToListAsync(ct);

        var modules = await db.Modules.AsNoTracking()
            .Where(m => moduleIds.Contains(m.ModuleId))
            .OrderBy(m => m.SortOrder)
            .Select(m => new { moduleId = m.ModuleId, name = m.Name })
            .ToListAsync(ct);

        var actions = await db.AuditLogs.AsNoTracking()
            .Select(a => a.Action).Distinct().OrderBy(a => a).ToListAsync(ct);

        return Ok(new { users, modules, actions });
    }

    /// <summary>One audit row including its before / after values.</summary>
    [HttpGet("audit-logs/{id:long}")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetAuditLog(long id, CancellationToken ct)
    {
        var log = await db.AuditLogs.AsNoTracking()
            .SingleOrDefaultAsync(a => a.AuditLogId == id, ct);

        return log is null ? NotFound() : Ok(log);
    }

    // ----------------------------------------------------------- error logs ---

    /// <summary>The Error Logs screen.</summary>
    [HttpGet("error-logs")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetErrorLogs(
        [FromQuery] string? search,
        [FromQuery] string? severity,
        [FromQuery] string? status,
        [FromQuery] byte? moduleId,
        [FromQuery] bool? isResolved,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 8,
        CancellationToken ct = default)
    {
        var query = db.ErrorLogs.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(e =>
                e.Message.Contains(term) ||
                (e.ExceptionType != null && e.ExceptionType.Contains(term)) ||
                (e.RequestPath != null && e.RequestPath.Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(severity)) query = query.Where(e => e.Severity == severity);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(e => e.Status == status);
        if (isResolved is { } resolved) query = query.Where(e => e.IsResolved == resolved);
        if (moduleId is { } module) query = query.Where(e => e.ModuleId == module);
        if (fromUtc is { } from) query = query.Where(e => e.OccurredOnUtc >= from);
        if (toUtc is { } to) query = query.Where(e => e.OccurredOnUtc < to.Date.AddDays(1));

        // The screen shows one row per fault with a COUNT, not one row per
        // occurrence — 118 failed-login events are one problem, not 118 rows.
        var grouped = query
            .Where(e => e.ErrorCode != null)
            .GroupBy(e => e.ErrorCode!)
            .Select(g => new
            {
                ErrorCode = g.Key,
                LastSeen = g.Max(e => e.OccurredOnUtc),
                Occurrences = g.Count(),
                // Worst severity and least-settled status win, so a code with
                // one unresolved Critical never reads as a resolved Warning.
                SeverityRank = g.Min(e =>
                    e.Severity == "Critical" ? 1 : e.Severity == "Error" ? 2 :
                    e.Severity == "Warning" ? 3 : 4),
                StatusRank = g.Min(e =>
                    e.Status == "Open" ? 1 : e.Status == "Acknowledged" ? 2 : 3),
                ModuleId = g.Min(e => e.ModuleId),
                Message = g.Min(e => e.Message),
                LatestId = g.Max(e => e.ErrorLogId),
            });

        var total = await grouped.CountAsync(ct);

        var rows = await grouped
            .OrderBy(g => g.StatusRank).ThenBy(g => g.SeverityRank).ThenByDescending(g => g.LastSeen)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        var modules = await db.Modules.AsNoTracking()
            .ToDictionaryAsync(m => m.ModuleId, m => m.Name, ct);

        var items = rows.Select(g => new ErrorGroupDto(
            g.LatestId,
            g.ErrorCode,
            g.LastSeen,
            g.SeverityRank switch { 1 => "Critical", 2 => "Error", 3 => "Warning", _ => "Info" },
            g.ModuleId,
            g.ModuleId is { } id && modules.TryGetValue(id, out var name) ? name : null,
            // Min() over a non-nullable column is only null-typed to the
            // compiler; an empty group cannot reach here.
            g.Message ?? string.Empty,
            g.Occurrences,
            g.StatusRank switch { 1 => "Open", 2 => "Acknowledged", _ => "Resolved" })).ToList();

        return Ok(PagedResult<ErrorGroupDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>The five count tiles above the Error Log.</summary>
    [HttpGet("error-logs/summary")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetErrorSummary(
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        CancellationToken ct = default)
    {
        var query = db.ErrorLogs.AsNoTracking();

        if (fromUtc is { } from) query = query.Where(e => e.OccurredOnUtc >= from);
        if (toUtc is { } to) query = query.Where(e => e.OccurredOnUtc < to.Date.AddDays(1));

        var counts = await query
            .GroupBy(e => e.Severity)
            .Select(g => new { severity = g.Key, count = g.Count() })
            .ToListAsync(ct);

        // The RESOLVED tile is explicitly a seven-day figure, so it ignores the
        // period filter rather than quietly meaning something else.
        var weekAgo = DateTime.UtcNow.AddDays(-7);

        var resolvedThisWeek = await db.ErrorLogs.AsNoTracking()
            .CountAsync(e => e.ResolvedOnUtc != null && e.ResolvedOnUtc >= weekAgo, ct);

        int Of(string severity) => counts.FirstOrDefault(c => c.severity == severity)?.count ?? 0;

        return Ok(new
        {
            critical = Of("Critical"),
            error = Of("Error"),
            warning = Of("Warning"),
            info = Of("Info"),
            resolvedLast7Days = resolvedThisWeek,
            totalEvents = counts.Sum(c => c.count),
        });
    }

    /// <summary>
    /// The "Error Volume — Last 14 Days" chart: a daily count of ERROR and
    /// CRITICAL events, which is what the subtitle says it counts.
    /// </summary>
    [HttpGet("error-logs/volume")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetErrorVolume([FromQuery] int days = 14, CancellationToken ct = default)
    {
        days = Math.Clamp(days, 1, 90);
        var since = DateTime.UtcNow.Date.AddDays(-(days - 1));

        var counted = await db.ErrorLogs.AsNoTracking()
            .Where(e => e.OccurredOnUtc >= since)
            .Where(e => e.Severity == "Error" || e.Severity == "Critical")
            .GroupBy(e => e.OccurredOnUtc.Date)
            .Select(g => new { day = g.Key, count = g.Count() })
            .ToListAsync(ct);

        // Days with no errors are days worth showing, so the series is filled
        // rather than left with gaps the chart would silently close up.
        var series = Enumerable.Range(0, days)
            .Select(offset => since.AddDays(offset))
            .Select(day => new
            {
                day,
                count = counted.FirstOrDefault(c => c.day == day)?.count ?? 0,
            })
            .ToList();

        return Ok(new { series, peak = series.Count == 0 ? 0 : series.Max(s => s.count) });
    }

    /// <summary>The SEVERITY, MODULE and STATUS drop-downs on the filter bar.</summary>
    [HttpGet("error-logs/filters")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetErrorFilters(CancellationToken ct)
    {
        var moduleIds = await db.ErrorLogs.AsNoTracking()
            .Where(e => e.ModuleId != null)
            .Select(e => e.ModuleId!.Value)
            .Distinct()
            .ToListAsync(ct);

        var modules = await db.Modules.AsNoTracking()
            .Where(m => moduleIds.Contains(m.ModuleId))
            .OrderBy(m => m.SortOrder)
            .Select(m => new { moduleId = m.ModuleId, name = m.Name })
            .ToListAsync(ct);

        return Ok(new { severities = Severities, statuses = TriageStates, modules });
    }

    /// <summary>
    /// Moves every occurrence of one fault to a new triage state, because the
    /// screen acts on the code rather than on a single occurrence.
    /// </summary>
    [HttpPost("error-logs/code/{errorCode}/status")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> SetErrorStatus(
        string errorCode, [FromBody] ErrorStatusRequest request, CancellationToken ct)
    {
        if (request.Status is not ("Open" or "Acknowledged" or "Resolved"))
        {
            return BadRequest(new { message = "Status must be Open, Acknowledged or Resolved." });
        }

        var rows = await db.ErrorLogs.AsTracking()
            .Where(e => e.ErrorCode == errorCode)
            .ToListAsync(ct);

        if (rows.Count == 0) return NotFound();

        var resolved = request.Status == "Resolved";

        foreach (var row in rows)
        {
            row.Status = request.Status;
            row.IsResolved = resolved;
            row.ResolvedOnUtc = resolved ? (row.ResolvedOnUtc ?? DateTime.UtcNow) : null;
            row.ResolutionNote = resolved ? request.Note : null;
        }

        await db.SaveChangesAsync(ct);
        return Ok(new { updated = rows.Count });
    }

    /// <summary>One error including its stack trace.</summary>
    [HttpGet("error-logs/{id:long}")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetErrorLog(long id, CancellationToken ct)
    {
        var log = await db.ErrorLogs.AsNoTracking()
            .SingleOrDefaultAsync(e => e.ErrorLogId == id, ct);

        return log is null ? NotFound() : Ok(log);
    }

    /// <summary>Marks an error resolved with a note.</summary>
    [HttpPost("error-logs/{id:long}/resolve")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> ResolveErrorLog(
        long id, [FromBody] ResolveErrorRequest request, CancellationToken ct)
    {
        var log = await db.ErrorLogs.AsTracking().SingleOrDefaultAsync(e => e.ErrorLogId == id, ct);
        if (log is null) return NotFound();

        log.IsResolved = true;
        log.ResolutionNote = request.ResolutionNote?.Trim();
        log.ResolvedOnUtc = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ----------------------------------------------------------------- APIs ---

    /// <summary>The API Management screen.</summary>
    /// <summary>
    /// Everything the API Management screen draws: the four count tiles, the
    /// issued keys, the published endpoints, the rate-limit tiers and the
    /// outbound webhooks.
    ///
    /// Keys come back as a prefix mask only. There is deliberately no endpoint
    /// anywhere that returns a usable key — it is shown once when generated.
    /// </summary>
    [HttpGet("api-management")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetApiManagement(CancellationToken ct)
    {
        var keys = await db.ApiKeys.AsNoTracking()
            .OrderBy(k => k.SortOrder)
            .Select(k => new ApiKeyDto(
                k.ApiKeyId, k.Name, k.KeyPrefix, k.Owner, k.Status, k.LastUsedOnUtc))
            .ToListAsync(ct);

        var endpoints = await db.ApiEndpoints.AsNoTracking()
            .OrderBy(e => e.SortOrder)
            .Select(e => new ApiEndpointDto(
                e.ApiEndpointId, e.Method, e.Route, e.Description,
                e.Calls24h, e.ErrorRate, e.Status))
            .ToListAsync(ct);

        var limits = await db.ApiRateLimits.AsNoTracking()
            .OrderBy(l => l.SortOrder)
            .Select(l => new ApiRateLimitDto(
                l.ApiRateLimitId, l.TierName, l.RequestsPerMin, l.CurrentUsage,
                l.RequestsPerMin == 0 ? 0 : (int)((double)l.CurrentUsage / l.RequestsPerMin * 100)))
            .ToListAsync(ct);

        var hooks = await db.Webhooks.AsNoTracking()
            .OrderBy(w => w.SortOrder)
            .Select(w => new WebhookDto(w.WebhookId, w.Event, w.TargetUrl, w.Status, w.LastSentUtc))
            .ToListAsync(ct);

        var calls = endpoints.Sum(e => (long)e.Calls24h);

        // A portal-wide error rate is the weighted mean, not the mean of the
        // per-endpoint rates: a quiet endpoint failing often must not drag the
        // headline figure around.
        var weightedErrors = endpoints.Sum(e => e.Calls24h * (double)e.ErrorRate);

        return Ok(new
        {
            keys,
            endpoints,
            rateLimits = limits,
            webhooks = hooks,
            summary = new
            {
                activeEndpoints = endpoints.Count(e => e.Status == "Live"),
                liveKeys = keys.Count(k => k.Status == "Live"),
                calls24h = calls,
                errorRate = calls == 0 ? 0 : Math.Round(weightedErrors / calls, 2),
            },
        });
    }

    /// <summary>
    /// Revokes a key. There is no un-revoke: a key that has been withdrawn is
    /// withdrawn, and the replacement is a new key with a new secret.
    /// </summary>
    [HttpPost("api-management/keys/{id:int}/revoke")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> RevokeApiKey(int id, CancellationToken ct)
    {
        var key = await db.ApiKeys.AsTracking().SingleOrDefaultAsync(k => k.ApiKeyId == id, ct);
        if (key is null) return NotFound();

        if (key.Status == "Revoked")
        {
            return Ok(new { message = $"{key.Name} was already revoked." });
        }

        key.Status = "Revoked";
        key.RevokedOnUtc = DateTime.UtcNow;
        await db.SaveChangesAsync(ct);

        return Ok(new { message = $"{key.Name} revoked. Callers using it will now be refused." });
    }

    [HttpGet("apis")]
    [HasPermission(Permissions.Settings, Permissions.View)]
    public async Task<IActionResult> GetApis(CancellationToken ct)
        => Ok(await db.ApiRegistry.AsNoTracking()
            .OrderBy(a => a.Name)
            .Select(a => new ApiRegistryDto(
                a.ApiRegistryId, a.Code, a.Name, a.Description, a.Direction,
                a.BaseUrl, a.AuthType, a.TimeoutSeconds, a.IsEnabled,
                a.LastCheckedOnUtc, a.LastStatusCode, a.LastLatencyMs))
            .ToListAsync(ct));

    /// <summary>
    /// Saves an API registration. <c>SecretRef</c> is deliberately not settable
    /// here: it names a secret held outside the database, and the screen has no
    /// business moving that pointer.
    /// </summary>
    [HttpPut("apis/{id:int}")]
    [HasPermission(Permissions.Settings, Permissions.Edit)]
    public async Task<IActionResult> UpdateApi(int id, [FromBody] ApiRegistrySaveRequest request, CancellationToken ct)
    {
        var api = await db.ApiRegistry.AsTracking().SingleOrDefaultAsync(a => a.ApiRegistryId == id, ct);
        if (api is null) return NotFound();

        api.Name = request.Name.Trim();
        api.Description = request.Description?.Trim();
        api.BaseUrl = request.BaseUrl?.Trim();
        api.AuthType = request.AuthType?.Trim();
        api.TimeoutSeconds = request.TimeoutSeconds;
        api.IsEnabled = request.IsEnabled;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

public sealed record SystemSettingDto(
    int SystemSettingId,
    string Key,
    string? Value,
    string DataType,
    string Category,
    string DisplayName,
    string? Description,
    bool IsSensitive,
    bool IsEditable,
    string? DefaultValue,
    short CategorySortOrder,
    string? IconKey,
    DateTime? ModifiedOnUtc);

public sealed record PaymentGatewayDto(
    int PaymentGatewayId,
    string Code,
    string Name,
    string RoleLabel,
    string Mode,
    string? MerchantKeyMask,
    byte? Priority,
    DateTime? LastTxnOnUtc,
    decimal? SuccessRate,
    bool IsEnabled);

public sealed record AuditLogDto(
    long AuditLogId,
    DateTime OccurredOnUtc,
    int? UserId,
    string? UserName,
    string? RoleName,
    byte? ModuleId,
    string? ModuleName,
    string Action,
    string EntityName,
    string? EntityKey,
    string? AffectedColumns,
    string? IpAddress,
    string Outcome,
    Guid? CorrelationId);

public sealed record ErrorLogDto(
    long ErrorLogId,
    DateTime OccurredOnUtc,
    string Severity,
    string? Source,
    string? ExceptionType,
    string Message,
    string? RequestMethod,
    string? RequestPath,
    int? StatusCode,
    int? UserId,
    Guid? CorrelationId,
    bool IsResolved,
    DateTime? ResolvedOnUtc);

public sealed record ApiKeyDto(
    int ApiKeyId,
    string Name,
    string KeyPrefix,
    string Owner,
    string Status,
    DateTime? LastUsedOnUtc);

public sealed record ApiEndpointDto(
    int ApiEndpointId,
    string Method,
    string Route,
    string? Description,
    int Calls24h,
    decimal ErrorRate,
    string Status);

public sealed record ApiRateLimitDto(
    int ApiRateLimitId,
    string TierName,
    int RequestsPerMin,
    int CurrentUsage,
    int UsagePercent);

public sealed record WebhookDto(
    int WebhookId,
    string Event,
    string TargetUrl,
    string Status,
    DateTime? LastSentUtc);

public sealed record ApiRegistryDto(
    int ApiRegistryId,
    string Code,
    string Name,
    string? Description,
    string Direction,
    string? BaseUrl,
    string? AuthType,
    int TimeoutSeconds,
    bool IsEnabled,
    DateTime? LastCheckedOnUtc,
    int? LastStatusCode,
    int? LastLatencyMs);

public sealed class SystemSettingSaveRequest
{
    [StringLength(2000)]
    public string? Value { get; init; }
}

public sealed class SystemSettingsBulkSaveRequest
{
    [Required]
    public List<SystemSettingValue> Settings { get; init; } = [];
}

public sealed class SystemSettingValue
{
    public int SystemSettingId { get; init; }

    [StringLength(2000)]
    public string? Value { get; init; }
}

public sealed class PaymentGatewaySaveRequest
{
    public bool IsEnabled { get; init; }
}

public sealed class ResolveErrorRequest
{
    [StringLength(1000)]
    public string? ResolutionNote { get; init; }
}

/// <summary>One fault on the Error Log, with every occurrence of it counted.</summary>
public sealed record ErrorGroupDto(
    long LatestErrorLogId,
    string ErrorCode,
    DateTime LastSeenUtc,
    string Severity,
    byte? ModuleId,
    string? ModuleName,
    string Message,
    int Occurrences,
    string Status);

public sealed class ErrorStatusRequest
{
    [Required, StringLength(15)]
    public string Status { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Note { get; init; }
}

public sealed class ApiRegistrySaveRequest
{
    [Required, StringLength(150)]
    public string Name { get; init; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; init; }

    [StringLength(500)]
    public string? BaseUrl { get; init; }

    [StringLength(50)]
    public string? AuthType { get; init; }

    [Range(1, 600)]
    public int TimeoutSeconds { get; init; } = 30;

    public bool IsEnabled { get; init; }
}

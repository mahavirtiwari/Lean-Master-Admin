using ClosedXML.Excel;
using MCLS.Api.Authorization;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// Reports &amp; Analytics.
///
/// Two halves. The screen's figures come from <see cref="GetSummary"/>, and
/// every panel on it is derived from records the portal actually holds —
/// registrations, applications, their statuses and their states. Where the
/// artboard shows something the scheme does not yet record (training courses,
/// examination results, the QCI/NPC split before those agencies exist), the
/// panel reports that it has nothing rather than showing a number nobody can
/// trace. A report that invents its figures is worse than no report.
///
/// The other half is the downloads, which are the point of the screen: each one
/// is built as a real workbook from a live query, not a CSV renamed .xlsx.
/// </summary>
[ApiController]
[Route("api/reports")]
public sealed class ReportsController(MclsDbContext db) : ControllerBase
{
    private const string ExcelType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    /// <summary>The workbooks on offer, for the download list.</summary>
    private static readonly ReportDefinition[] Catalogue =
    [
        new("registrations", "MSME Registrations",
            "Every registered enterprise with its unit, activity, state and registration date."),
        new("applications", "Certification Applications",
            "Applications with their level, current status, implementing agency and dates."),
        new("state-summary", "State-wise Certification Summary",
            "Registrations, applications and certificates by state, with the certification rate."),
        new("level-summary", "Level-wise Summary",
            "Bronze, Silver and Gold with their pipeline stage counts."),
        new("incentives", "Incentives Master",
            "Published and draft incentives with their category, stakeholder and activation level."),
        new("users", "Portal Users",
            "Portal accounts with their type, role, organisation and status."),
    ];

    [HttpGet("catalogue")]
    [HasPermission(Permissions.Reports, Permissions.View)]
    public IActionResult GetCatalogue() => Ok(Catalogue);

    // ------------------------------------------------------------- the screen ---

    /// <summary>Everything the Reports screen draws.</summary>
    [HttpGet("summary")]
    [HasPermission(Permissions.Reports, Permissions.View)]
    public async Task<IActionResult> GetSummary(
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        [FromQuery] short? stateId,
        [FromQuery] byte? certificationLevelId,
        CancellationToken ct = default)
    {
        var applications = Filtered(fromDate, toDate, stateId, certificationLevelId);

        var levels = await db.CertificationLevels.AsNoTracking()
            .OrderBy(l => l.SortOrder)
            .Select(l => new { l.CertificationLevelId, l.Code, l.Name })
            .ToListAsync(ct);

        // One pass over the filtered applications, grouped by level and stage.
        var byLevel = await applications
            .GroupBy(a => a.CertificationLevelId)
            .Select(g => new
            {
                LevelId = g.Key,
                Enrolled = g.Count(),
                Handholding = g.Count(a => a.Status.Name.Contains("Handholding")),
                Assessing = g.Count(a => a.Status.Name.Contains("Assessment")
                                      || a.Status.Name.Contains("Quality")
                                      || a.Status.Name.Contains("NC")),
                Certified = g.Count(a => a.CertifiedOnUtc != null || a.Status.Name == "Certified"),
                Rejected = g.Count(a => a.Status.Name == "Rejected"),
            })
            .ToListAsync(ct);

        var mis = levels.Select(level =>
        {
            var row = byLevel.FirstOrDefault(b => b.LevelId == level.CertificationLevelId);
            var enrolled = row?.Enrolled ?? 0;
            var certified = row?.Certified ?? 0;

            return new
            {
                level.CertificationLevelId,
                level.Code,
                level.Name,
                enrolled,
                handholding = row?.Handholding ?? 0,
                assessing = row?.Assessing ?? 0,
                certified,
                rejected = row?.Rejected ?? 0,
                certificationRate = enrolled == 0 ? 0d : Math.Round(certified * 100d / enrolled, 1),
            };
        }).ToList();

        // State performance: the certification rate is the score. The artboard
        // calls it a LEAN index out of 100; there is no such index in the
        // scheme's records, and a rate is a real number with the same shape.
        var states = await applications
            .GroupBy(a => new { a.Enterprise.StateId, a.Enterprise.State.Name })
            .Select(g => new
            {
                stateId = g.Key.StateId,
                name = g.Key.Name,
                applications = g.Count(),
                certified = g.Count(a => a.CertifiedOnUtc != null || a.Status.Name == "Certified"),
            })
            .ToListAsync(ct);

        // Ranked by how much of the scheme a state is carrying, not by its
        // rate. Sorting on the rate alone puts a state with one application and
        // one certificate above one with five hundred applications and four
        // hundred certificates — true arithmetic, useless as a ranking.
        var statePerformance = states
            .Select(s => new
            {
                s.stateId,
                s.name,
                s.applications,
                s.certified,
                score = s.applications == 0 ? 0d : Math.Round(s.certified * 100d / s.applications, 1),
            })
            .OrderByDescending(s => s.applications)
            .ThenByDescending(s => s.certified)
            .Take(10)
            .ToList();

        // Upgrades: an enterprise that holds one level and has applied for the
        // next. Counted on enterprises, not applications, because the question
        // is how many MSMEs moved up.
        var levelIds = levels.ToDictionary(l => l.Code, l => l.CertificationLevelId, StringComparer.OrdinalIgnoreCase);

        var conversions = new List<object>();

        foreach (var (fromCode, toCode) in new[] { ("BRONZE", "SILVER"), ("SILVER", "GOLD"), ("BRONZE", "GOLD") })
        {
            if (!levelIds.TryGetValue(fromCode, out var fromId) || !levelIds.TryGetValue(toCode, out var toId))
            {
                continue;
            }

            var holderIds = applications
                .Where(a => a.CertificationLevelId == fromId)
                .Select(a => a.EnterpriseId)
                .Distinct();

            var holders = await holderIds.CountAsync(ct);

            // Those same enterprises that went on to the higher level — not
            // every enterprise at the higher level. Counting the two sets
            // independently produced rates above 100% as soon as more
            // enterprises applied for Gold than for Silver.
            var moved = await applications
                .Where(a => a.CertificationLevelId == toId && holderIds.Contains(a.EnterpriseId))
                .Select(a => a.EnterpriseId)
                .Distinct()
                .CountAsync(ct);

            conversions.Add(new
            {
                from = levels.First(l => l.CertificationLevelId == fromId).Name,
                to = levels.First(l => l.CertificationLevelId == toId).Name,
                holders,
                moved,
                rate = holders == 0 ? 0d : Math.Round(moved * 100d / holders, 1),
            });
        }

        return Ok(new
        {
            mis,
            statePerformance,
            conversions,
            catalogue = Catalogue,

            // Said plainly rather than drawn as an empty chart: the scheme does
            // not record training courses or examinations yet, so the panel the
            // artboard reserves for them has nothing to show.
            training = new
            {
                available = false,
                message = "Training and examination results are not recorded by the portal yet. "
                        + "This panel will fill once the handholding module captures them.",
            },
        });
    }

    // ---------------------------------------------------------- the downloads ---

    /// <summary>One of the catalogue's workbooks.</summary>
    [HttpGet("export/{key}")]
    [HasPermission(Permissions.Reports, Permissions.Export)]
    public async Task<IActionResult> Export(
        string key,
        [FromQuery] DateOnly? fromDate,
        [FromQuery] DateOnly? toDate,
        [FromQuery] short? stateId,
        [FromQuery] byte? certificationLevelId,
        CancellationToken ct = default)
    {
        var definition = Catalogue.FirstOrDefault(r => r.Key == key);

        if (definition is null) return NotFound(new { message = $"There is no report called '{key}'." });

        var (headers, rows) = key switch
        {
            "registrations" => await RegistrationsAsync(fromDate, toDate, stateId, ct),
            "applications" => await ApplicationsAsync(fromDate, toDate, stateId, certificationLevelId, ct),
            "state-summary" => await StateSummaryAsync(fromDate, toDate, certificationLevelId, ct),
            "level-summary" => await LevelSummaryAsync(fromDate, toDate, stateId, ct),
            "incentives" => await IncentivesAsync(ct),
            "users" => await UsersAsync(ct),
            _ => (Array.Empty<string>(), new List<object?[]>()),
        };

        return Workbook(definition, headers, rows);
    }

    /// <summary>The Build Custom Reports panel.</summary>
    [HttpPost("custom")]
    [HasPermission(Permissions.Reports, Permissions.Export)]
    public async Task<IActionResult> Custom([FromBody] CustomReportRequest request, CancellationToken ct)
    {
        var applications = Filtered(request.FromDate, request.ToDate, request.StateId, null);

        if (request.LevelIds is { Count: > 0 })
        {
            applications = applications.Where(a => request.LevelIds.Contains(a.CertificationLevelId));
        }

        var groupBy = (request.GroupBy ?? "State").Trim();

        var (headers, rows) = groupBy.ToLowerInvariant() switch
        {
            "level" => await LevelSummaryAsync(request.FromDate, request.ToDate, request.StateId, ct),
            "status" => await StatusSummaryAsync(applications, ct),
            "agency" => await AgencySummaryAsync(applications, ct),
            _ => await StateSummaryAsync(request.FromDate, request.ToDate, null, ct),
        };

        var definition = new ReportDefinition(
            "custom",
            $"Custom Report — by {groupBy}",
            "Generated from the report builder.");

        return Workbook(definition, headers, rows);
    }

    // ------------------------------------------------------------- the sheets ---

    private async Task<(string[] Headers, List<object?[]> Rows)> RegistrationsAsync(
        DateOnly? fromDate, DateOnly? toDate, short? stateId, CancellationToken ct)
    {
        var query = db.Enterprises.AsNoTracking();

        if (fromDate is { } f) query = query.Where(e => e.RegisteredOnUtc >= f.ToDateTime(TimeOnly.MinValue));
        if (toDate is { } t) query = query.Where(e => e.RegisteredOnUtc < t.AddDays(1).ToDateTime(TimeOnly.MinValue));
        if (stateId is { } s) query = query.Where(e => e.StateId == s);

        var rows = await query
            .OrderByDescending(e => e.RegisteredOnUtc)
            .Select(e => new object?[]
            {
                e.LeanId,
                e.Name,
                e.UdyamRegistrationNo,
                e.OwnerName,
                e.EnterpriseSize,
                e.State.Name,
                e.District != null ? e.District.Name : null,
                e.NicTwoDigit,
                e.NicDescription,
                e.ContactEmail,
                e.ContactMobile,
                e.RegisteredOnUtc,
                e.IsActive ? "Active" : "Inactive",
            })
            .ToListAsync(ct);

        return (
            [
                "LEAN ID", "Enterprise", "Udyam number", "Entrepreneur", "Size", "State", "District",
                "NIC (2-digit)", "Activity", "Email", "Mobile", "Registered on", "Status",
            ],
            rows);
    }

    private async Task<(string[] Headers, List<object?[]> Rows)> ApplicationsAsync(
        DateOnly? fromDate, DateOnly? toDate, short? stateId, byte? levelId, CancellationToken ct)
    {
        var rows = await Filtered(fromDate, toDate, stateId, levelId)
            .OrderByDescending(a => a.RegisteredOnUtc)
            .Select(a => new object?[]
            {
                a.ApplicationNo,
                a.Enterprise.LeanId,
                a.Enterprise.Name,
                a.CertificationLevel.Name,
                a.Status.Name,
                a.Enterprise.State.Name,
                a.ImplementingAgency != null ? a.ImplementingAgency.Name : null,
                a.RegisteredOnUtc,
                a.CertifiedOnUtc,
                a.CertificateNo,
            })
            .ToListAsync(ct);

        return (
            [
                "Application no", "LEAN ID", "Enterprise", "Level", "Status", "State",
                "Implementing agency", "Applied on", "Certified on", "Certificate no",
            ],
            rows);
    }

    private async Task<(string[] Headers, List<object?[]> Rows)> StateSummaryAsync(
        DateOnly? fromDate, DateOnly? toDate, byte? levelId, CancellationToken ct)
    {
        var rows = await Filtered(fromDate, toDate, null, levelId)
            .GroupBy(a => a.Enterprise.State.Name)
            .Select(g => new
            {
                State = g.Key,
                Applications = g.Count(),
                Certified = g.Count(a => a.CertifiedOnUtc != null || a.Status.Name == "Certified"),
                Enterprises = g.Select(a => a.EnterpriseId).Distinct().Count(),
            })
            .OrderByDescending(g => g.Applications)
            .ToListAsync(ct);

        return (
            ["State", "Enterprises", "Applications", "Certified", "Certification rate (%)"],
            rows.Select(r => new object?[]
            {
                r.State,
                r.Enterprises,
                r.Applications,
                r.Certified,
                r.Applications == 0 ? 0d : Math.Round(r.Certified * 100d / r.Applications, 1),
            }).ToList());
    }

    private async Task<(string[] Headers, List<object?[]> Rows)> LevelSummaryAsync(
        DateOnly? fromDate, DateOnly? toDate, short? stateId, CancellationToken ct)
    {
        var rows = await Filtered(fromDate, toDate, stateId, null)
            .GroupBy(a => new { a.CertificationLevelId, a.CertificationLevel.Name })
            .Select(g => new
            {
                Level = g.Key.Name,
                Applications = g.Count(),
                Handholding = g.Count(a => a.Status.Name.Contains("Handholding")),
                Assessing = g.Count(a => a.Status.Name.Contains("Assessment")),
                Certified = g.Count(a => a.CertifiedOnUtc != null || a.Status.Name == "Certified"),
                Rejected = g.Count(a => a.Status.Name == "Rejected"),
            })
            .ToListAsync(ct);

        return (
            ["Level", "Applications", "In handholding", "In assessment", "Certified", "Rejected", "Certification rate (%)"],
            rows.Select(r => new object?[]
            {
                r.Level, r.Applications, r.Handholding, r.Assessing, r.Certified, r.Rejected,
                r.Applications == 0 ? 0d : Math.Round(r.Certified * 100d / r.Applications, 1),
            }).ToList());
    }

    private static async Task<(string[] Headers, List<object?[]> Rows)> StatusSummaryAsync(
        IQueryable<Domain.Entities.Msme.Application> applications, CancellationToken ct)
    {
        var rows = await applications
            .GroupBy(a => a.Status.Name)
            .Select(g => new { Status = g.Key, Count = g.Count() })
            .OrderByDescending(g => g.Count)
            .ToListAsync(ct);

        return (["Status", "Applications"], rows.Select(r => new object?[] { r.Status, r.Count }).ToList());
    }

    private static async Task<(string[] Headers, List<object?[]> Rows)> AgencySummaryAsync(
        IQueryable<Domain.Entities.Msme.Application> applications, CancellationToken ct)
    {
        var rows = await applications
            .GroupBy(a => a.ImplementingAgency != null ? a.ImplementingAgency.Name : "Unassigned")
            .Select(g => new
            {
                Agency = g.Key,
                Applications = g.Count(),
                Certified = g.Count(a => a.CertifiedOnUtc != null || a.Status.Name == "Certified"),
            })
            .OrderByDescending(g => g.Applications)
            .ToListAsync(ct);

        return (
            ["Implementing agency", "Applications", "Certified"],
            rows.Select(r => new object?[] { r.Agency, r.Applications, r.Certified }).ToList());
    }

    private async Task<(string[] Headers, List<object?[]> Rows)> IncentivesAsync(CancellationToken ct)
    {
        var rows = await db.Incentives.AsNoTracking()
            .OrderBy(i => i.Name)
            .Select(i => new object?[]
            {
                i.Code,
                i.Name,
                i.Category != null ? i.Category.Name : null,
                i.Provider.Name,
                i.AdministeringBody,
                i.ActivationLevel,
                i.State != null ? i.State.Name : null,
                i.Status,
                i.ValidFrom,
                i.ValidTo,
                i.ContactName,
                i.ContactEmail,
            })
            .ToListAsync(ct);

        return (
            [
                "Code", "Incentive", "Category", "Stakeholder", "Administering body", "Activation",
                "State", "Status", "Effective from", "Effective till", "Nodal contact", "Contact email",
            ],
            rows);
    }

    private async Task<(string[] Headers, List<object?[]> Rows)> UsersAsync(CancellationToken ct)
    {
        var rows = await db.Users.AsNoTracking()
            .Where(u => !u.IsDeleted)
            .OrderBy(u => u.UserCode)
            .Select(u => new object?[]
            {
                u.UserCode,
                u.FullName,
                u.Email,
                u.PhoneNumber,
                u.AccountType.Name,
                u.Role != null ? u.Role.Name : null,
                u.Organisation != null ? u.Organisation.Name : null,
                u.StateId,
                u.Status.Name,
                u.CreatedOnUtc,
                u.LastLoginOnUtc,
            })
            .ToListAsync(ct);

        return (
            [
                "User ID", "Name", "Email", "Mobile", "Account type", "Role", "Organisation",
                "State", "Status", "Created on", "Last sign-in",
            ],
            rows);
    }

    // ------------------------------------------------------------- plumbing ---

    private IQueryable<Domain.Entities.Msme.Application> Filtered(
        DateOnly? fromDate, DateOnly? toDate, short? stateId, byte? levelId)
    {
        var query = db.Applications.AsNoTracking();

        if (fromDate is { } f) query = query.Where(a => a.RegisteredOnUtc >= f.ToDateTime(TimeOnly.MinValue));
        if (toDate is { } t) query = query.Where(a => a.RegisteredOnUtc < t.AddDays(1).ToDateTime(TimeOnly.MinValue));
        if (stateId is { } s) query = query.Where(a => a.Enterprise.StateId == s);
        if (levelId is { } l) query = query.Where(a => a.CertificationLevelId == l);

        return query;
    }

    /// <summary>
    /// A real workbook, not a CSV with an .xlsx name: a header row the reader
    /// can freeze and filter, dates formatted as dates so Excel sorts them
    /// properly, and columns sized to their contents.
    /// </summary>
    private FileContentResult Workbook(ReportDefinition definition, string[] headers, List<object?[]> rows)
    {
        using var workbook = new XLWorkbook();
        var sheet = workbook.AddWorksheet(Sanitise(definition.Title));

        // A title line above the table, so a printed sheet says what it is and
        // when it was taken.
        sheet.Cell(1, 1).Value = definition.Title;
        sheet.Cell(1, 1).Style.Font.SetBold().Font.SetFontSize(13);
        sheet.Cell(2, 1).Value = $"MSME Competitive (LEAN) Scheme · generated {DateTime.Now:dd MMM yyyy HH:mm}";
        sheet.Cell(2, 1).Style.Font.SetFontColor(XLColor.FromHtml("#5D6B62")).Font.SetFontSize(9);

        const int headerRow = 4;

        for (var c = 0; c < headers.Length; c++)
        {
            var cell = sheet.Cell(headerRow, c + 1);

            cell.Value = headers[c];
            cell.Style.Font.SetBold().Font.SetFontColor(XLColor.White);
            cell.Style.Fill.SetBackgroundColor(XLColor.FromHtml("#0F7B45"));
            cell.Style.Alignment.SetVertical(XLAlignmentVerticalValues.Center);
        }

        for (var r = 0; r < rows.Count; r++)
        {
            for (var c = 0; c < rows[r].Length; c++)
            {
                var cell = sheet.Cell(headerRow + 1 + r, c + 1);

                switch (rows[r][c])
                {
                    case null:
                        break;
                    case DateTime date:
                        cell.Value = date;
                        cell.Style.DateFormat.Format = "dd-MMM-yyyy";
                        break;
                    case DateOnly day:
                        cell.Value = day.ToDateTime(TimeOnly.MinValue);
                        cell.Style.DateFormat.Format = "dd-MMM-yyyy";
                        break;
                    case bool flag:
                        cell.Value = flag ? "Yes" : "No";
                        break;
                    case int number:
                        cell.Value = number;
                        break;
                    case double number:
                        cell.Value = number;
                        break;
                    case decimal number:
                        cell.Value = number;
                        break;
                    default:
                        cell.Value = rows[r][c]!.ToString();
                        break;
                }
            }
        }

        if (rows.Count > 0)
        {
            sheet.Range(headerRow, 1, headerRow + rows.Count, headers.Length).SetAutoFilter();
        }

        sheet.SheetView.FreezeRows(headerRow);
        sheet.Columns().AdjustToContents(10d, 55d);

        using var stream = new MemoryStream();
        workbook.SaveAs(stream);

        var name = $"{definition.Key}-{DateTime.Now:yyyyMMdd-HHmm}.xlsx";

        return File(stream.ToArray(), ExcelType, name);
    }

    /// <summary>Excel refuses several characters in a sheet name, and 31 is its limit.</summary>
    private static string Sanitise(string title)
    {
        var cleaned = new string(title.Where(c => !"[]:*?/\\".Contains(c)).ToArray()).Trim();

        return cleaned.Length <= 31 ? cleaned : cleaned[..31];
    }
}

public sealed record ReportDefinition(string Key, string Title, string Description);

public sealed class CustomReportRequest
{
    public DateOnly? FromDate { get; init; }
    public DateOnly? ToDate { get; init; }
    public short? StateId { get; init; }
    public List<byte>? LevelIds { get; init; }

    /// <summary>State, Level, Status or Agency.</summary>
    public string? GroupBy { get; init; }
}

using System.ComponentModel.DataAnnotations;
using System.Globalization;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Application.Common.Models;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The scheme pipeline. One controller serves both the Handholding and the
/// Assessments list screens: they are the same rows filtered by stage.
/// </summary>
[ApiController]
[Route("api/applications")]
public sealed class ApplicationsController(
    MclsDbContext db,
    ICurrentUser currentUser,
    ISequenceService sequences,
    IEmailQueue email) : ControllerBase
{
    /// <summary>
    /// Paged applications. <c>stage</c> selects Handholding or Assessment;
    /// <c>statusCode</c> narrows to one column of that stage.
    /// </summary>
    [HttpGet]
    [HasPermission(Permissions.Handholding, Permissions.View)]
    public async Task<ActionResult<PagedResult<ApplicationListDto>>> GetApplications(
        [FromQuery] ApplicationListQuery query, CancellationToken ct)
    {
        var q = db.Database
            .SqlQuery<ApplicationListDto>($"SELECT * FROM msme.vw_ApplicationList")
            .AsQueryable();

        q = ApplyVisibilityScope(q);

        if (!string.IsNullOrWhiteSpace(query.Stage)) q = q.Where(a => a.Stage == query.Stage);
        if (!string.IsNullOrWhiteSpace(query.StatusCode)) q = q.Where(a => a.StatusCode == query.StatusCode);
        if (query.CertificationLevelId is { } level) q = q.Where(a => a.CertificationLevelId == level);
        if (query.SectorId is { } sector) q = q.Where(a => a.SectorId == sector);
        if (query.StateId is { } state) q = q.Where(a => a.StateId == state);
        if (query.ImplementingAgencyId is { } ia) q = q.Where(a => a.ImplementingAgencyId == ia);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            q = q.Where(a =>
                a.EnterpriseName.Contains(term) ||
                a.ApplicationNo.Contains(term) ||
                a.UdyamRegistrationNo.Contains(term));
        }

        var total = await q.CountAsync(ct);

        q = (query.SortBy?.ToLowerInvariant(), query.SortDescending) switch
        {
            ("enterprise", false) => q.OrderBy(a => a.EnterpriseName),
            ("enterprise", true) => q.OrderByDescending(a => a.EnterpriseName),
            ("ageing", false) => q.OrderBy(a => a.DaysInPipeline),
            ("ageing", true) => q.OrderByDescending(a => a.DaysInPipeline),
            (_, false) => q.OrderBy(a => a.RegisteredOnUtc),
            _ => q.OrderByDescending(a => a.RegisteredOnUtc),
        };

        var items = await q
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);

        return Ok(PagedResult<ApplicationListDto>.Create(items, total, query.PageNumber, query.PageSize));
    }

    /// <summary>One application, with its status history.</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Handholding, Permissions.View)]
    public async Task<IActionResult> GetApplication(int id, CancellationToken ct)
    {
        var application = await db.Database
            .SqlQuery<ApplicationListDto>(
                $"SELECT * FROM msme.vw_ApplicationList WHERE ApplicationId = {id}")
            .SingleOrDefaultAsync(ct);

        if (application is null) return NotFound();

        var history = await db.ApplicationStatusHistory
            .AsNoTracking()
            .Where(h => h.ApplicationId == id)
            .OrderByDescending(h => h.ChangedOnUtc)
            .Select(h => new StatusHistoryDto(
                h.ChangedOnUtc,
                h.FromStatusId,
                h.ToStatusId,
                h.Remark,
                db.Users.Where(u => u.Id == h.ChangedByUserId).Select(u => u.FullName).FirstOrDefault()))
            .ToListAsync(ct);

        // The moves available from here, so the UI shows only valid actions
        // rather than hard-coding the workflow a second time.
        var transitions = await db.ApplicationStatusTransitions
            .AsNoTracking()
            .Where(t => t.FromStatusId == application.ApplicationStatusId)
            .Join(db.ApplicationStatuses, t => t.ToStatusId, s => s.ApplicationStatusId,
                (t, s) => new AvailableTransitionDto(
                    s.ApplicationStatusId, s.Code, s.Name, t.RequiresRemark))
            .ToListAsync(ct);

        return Ok(new { application, history, availableTransitions = transitions });
    }

    /// <summary>Registers a new application and raises its invoice.</summary>
    [HttpPost]
    [HasPermission(Permissions.Handholding, Permissions.Create)]
    public async Task<IActionResult> Register(
        [FromBody] RegisterApplicationRequest request, CancellationToken ct)
    {
        var enterprise = await db.Enterprises
            .AsNoTracking()
            .Where(e => e.EnterpriseId == request.EnterpriseId && e.IsActive)
            .Select(e => new { e.EnterpriseId, e.Name, e.ContactEmail })
            .SingleOrDefaultAsync(ct);

        if (enterprise is null)
        {
            return BadRequest(new { message = "The enterprise does not exist or is inactive." });
        }

        // One open application per enterprise per level — matches the filtered
        // unique index, checked here so the user gets a clear message rather
        // than a 409 from the database.
        var alreadyOpen = await db.Applications.AnyAsync(a =>
            a.EnterpriseId == request.EnterpriseId &&
            a.CertificationLevelId == request.CertificationLevelId &&
            a.RejectedOnUtc == null && a.CertifiedOnUtc == null, ct);

        if (alreadyOpen)
        {
            return Conflict(new
            {
                message = "This enterprise already has an open application at that certification level.",
            });
        }

        var year = DateTime.UtcNow.Year.ToString(CultureInfo.InvariantCulture);
        var applicationNo = await sequences.NextAsync("Application", year, ct);

        var application = new Domain.Entities.Msme.Application
        {
            ApplicationNo = applicationNo,
            EnterpriseId = request.EnterpriseId,
            CertificationLevelId = request.CertificationLevelId,
            ApplicationStatusId = (byte)ApplicationStatusId.Registered,
            ImplementingAgencyId = request.ImplementingAgencyId,
            RegisteredOnUtc = DateTime.UtcNow,
            CreatedByUserId = currentUser.UserId,
        };

        db.Applications.Add(application);
        await db.SaveChangesAsync(ct);

        // Freezes the fee and the subsidy split at today's rates.
        var invoiceIdParam = new SqlParameter
        {
            ParameterName = "@InvoiceId",
            SqlDbType = System.Data.SqlDbType.Int,
            Direction = System.Data.ParameterDirection.Output,
        };

        await db.Database.ExecuteSqlRawAsync(
            "EXEC fee.usp_Invoice_Raise @ApplicationId, @CreatedByUserId, @InvoiceId OUTPUT",
            [
                new SqlParameter("@ApplicationId", application.ApplicationId),
                new SqlParameter("@CreatedByUserId", currentUser.UserId ?? 0),
                invoiceIdParam,
            ],
            ct);

        var invoice = await db.Invoices
            .AsNoTracking()
            .Where(i => i.ApplicationId == application.ApplicationId && i.Status != "Cancelled")
            .Select(i => new { i.InvoiceId, i.InvoiceNo, i.GrossAmount, i.SubsidyAmount, i.PayableByUnit })
            .SingleOrDefaultAsync(ct);

        if (!string.IsNullOrWhiteSpace(enterprise.ContactEmail))
        {
            await email.QueueTemplatedAsync("APPLICATION_REGISTERED", enterprise.ContactEmail, null,
                new Dictionary<string, string>
                {
                    ["user_name"] = enterprise.Name,
                    ["unit_name"] = enterprise.Name,
                    ["application_no"] = applicationNo,
                    ["tier"] = ((CertificationLevelId)request.CertificationLevelId).ToString(),
                    ["payable_amount"] = invoice?.PayableByUnit.ToString("C", new System.Globalization.CultureInfo("en-IN"))
                                         ?? "—",
                }, ct);
        }

        return CreatedAtAction(nameof(GetApplication), new { id = application.ApplicationId }, new
        {
            applicationId = application.ApplicationId,
            applicationNo,
            invoice,
        });
    }

    /// <summary>
    /// Moves an application along the pipeline.
    ///
    /// Validation lives in <c>msme.usp_Application_ChangeStatus</c>, which
    /// refuses any move not listed in <c>ApplicationStatusTransition</c>. The
    /// workflow is therefore defined once, in data, rather than duplicated in
    /// C# where the two could drift apart.
    /// </summary>
    [HttpPost("{id:int}/status")]
    [HasPermission(Permissions.Handholding, Permissions.Edit)]
    public async Task<IActionResult> ChangeStatus(
        int id, [FromBody] ChangeApplicationStatusRequest request, CancellationToken ct)
    {
        if (!await db.Applications.AnyAsync(a => a.ApplicationId == id, ct))
        {
            return NotFound();
        }

        try
        {
            await db.Database.ExecuteSqlRawAsync(
                "EXEC msme.usp_Application_ChangeStatus @ApplicationId, @ToStatusId, @Remark, @ChangedByUserId",
                [
                    new SqlParameter("@ApplicationId", id),
                    new SqlParameter("@ToStatusId", request.ToStatusId),
                    new SqlParameter("@Remark", (object?)request.Remark ?? DBNull.Value),
                    new SqlParameter("@ChangedByUserId", currentUser.UserId ?? 0),
                ],
                ct);
        }
        catch (SqlException ex) when (ex.Class == 16)
        {
            // RAISERROR severity 16 is the procedure rejecting the request on
            // business grounds — a bad transition or a missing remark. That is
            // a 400, not a 500.
            return BadRequest(new { message = ex.Message });
        }

        await NotifyStatusChangeAsync(id, request.ToStatusId, request.Remark, ct);

        return NoContent();
    }

    /// <summary>The dashboard counters.</summary>
    /// <summary>
    /// The dashboard tiles, narrowed by the screen's filter bar.
    ///
    /// Computed here rather than read from <c>msme.vw_DashboardTiles</c>: the
    /// view aggregates the whole scheme and takes no arguments, so with it the
    /// six filters on the design could only ever be decorative. The unfiltered
    /// call still returns the same totals the view does.
    /// </summary>
    [HttpGet("dashboard")]
    [HasPermission(Permissions.Dashboard, Permissions.View)]
    public async Task<IActionResult> GetDashboard(
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate,
        [FromQuery] short? stateId,
        [FromQuery] int? districtId,
        [FromQuery] byte? certificationLevelId,
        [FromQuery] int? implementingAgencyId,
        CancellationToken ct = default)
    {
        var query = FilteredApplications(
            fromDate, toDate, stateId, districtId, certificationLevelId, implementingAgencyId);

        // One round trip: counting each status separately would be eleven.
        var byStatus = await query
            .GroupBy(a => a.ApplicationStatusId)
            .Select(g => new { StatusId = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var byLevel = await query
            .Where(a => a.ApplicationStatusId == (byte)ApplicationStatusId.Certified)
            .GroupBy(a => a.CertificationLevelId)
            .Select(g => new { LevelId = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        var cutoff = DateTime.UtcNow.AddDays(-30);
        var recent = await query.CountAsync(a => a.RegisteredOnUtc >= cutoff, ct);

        int Status(ApplicationStatusId status)
            => byStatus.FirstOrDefault(x => x.StatusId == (byte)status)?.Count ?? 0;

        int Level(CertificationLevelId level)
            => byLevel.FirstOrDefault(x => x.LevelId == (byte)level)?.Count ?? 0;

        // Every figure on the dashboard is also split by delivery agency: the KPI
        // cards carry a "QCI: n | NPC: n" line and each level card an Agency
        // Breakdown panel. Counted here in one pass rather than per card.
        var byAgency = await query
            .Where(a => a.ImplementingAgencyId != null)
            .GroupBy(a => new { a.ImplementingAgencyId, a.ImplementingAgency!.Name })
            .Select(g => new
            {
                g.Key.ImplementingAgencyId,
                g.Key.Name,
                Registered = g.Count(),
                Certified = g.Count(x => x.ApplicationStatusId == (byte)ApplicationStatusId.Certified),
                PaymentReceived = g.Count(x => x.ApplicationStatusId == (byte)ApplicationStatusId.PaymentReceived),
                InProgress = g.Count(x =>
                    x.ApplicationStatusId == (byte)ApplicationStatusId.HandholdingInProgress
                 || x.ApplicationStatusId == (byte)ApplicationStatusId.AssessmentInProgress),
            })
            .ToListAsync(ct);

        // The same split again, per certification level, for the three cards.
        var byLevelAgency = await query
            .Where(a => a.ImplementingAgencyId != null)
            .GroupBy(a => new
            {
                a.CertificationLevelId,
                a.ImplementingAgencyId,
                AgencyName = a.ImplementingAgency!.Name,
            })
            .Select(g => new
            {
                g.Key.CertificationLevelId,
                g.Key.AgencyName,
                Applied = g.Count(),
                Certified = g.Count(x => x.ApplicationStatusId == (byte)ApplicationStatusId.Certified),
                InProgress = g.Count(x =>
                    x.ApplicationStatusId == (byte)ApplicationStatusId.HandholdingInProgress
                 || x.ApplicationStatusId == (byte)ApplicationStatusId.AssessmentInProgress),
            })
            .ToListAsync(ct);

        // The headline card is attributed by the awareness programme the MSME
        // attended — QCI, NPC, or Self where it attended none — not by the
        // agency that delivers its handholding afterwards. Those are different
        // questions, and this card asks the first.
        var enterprises = query.Select(a => a.Enterprise).Distinct();

        var byAwareness = await enterprises
            .GroupBy(e => e.AwarenessAgency)
            .Select(g => new { Agency = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        int Awareness(string agency)
            => byAwareness.FirstOrDefault(x => x.Agency == agency)?.Count ?? 0;

        // Financial Support: the Government's share of the fee, across the
        // invoices raised for the applications in view. Deliberately not split
        // by agency — the support comes from the scheme, not from whoever
        // delivers the handholding.
        var subsidyDisbursed = await db.Invoices.AsNoTracking()
            .Where(i => query.Any(a => a.ApplicationId == i.ApplicationId))
            .SumAsync(i => (decimal?)i.SubsidyAmount, ct) ?? 0m;

        var registrationSplit = new
        {
            qci = Awareness("QCI"),
            npc = Awareness("NPC"),
            self = Awareness("Self"),
            unattributed = byAwareness.FirstOrDefault(x => x.Agency == null)?.Count ?? 0,
        };

        var tiles = new DashboardTilesDto(
            byStatus.Sum(x => x.Count),
            Status(ApplicationStatusId.Registered),
            Status(ApplicationStatusId.PaymentReceived),
            Status(ApplicationStatusId.HandholdingInProgress),
            Status(ApplicationStatusId.HandholdingCompleted),
            Status(ApplicationStatusId.AssessmentScheduled),
            Status(ApplicationStatusId.AssessmentInProgress),
            Status(ApplicationStatusId.NcRaised),
            Status(ApplicationStatusId.QualityCheck),
            Status(ApplicationStatusId.Certified),
            Status(ApplicationStatusId.Rejected),
            Level(CertificationLevelId.Bronze),
            Level(CertificationLevelId.Silver),
            Level(CertificationLevelId.Gold),
            recent);

        return Ok(new
        {
            tiles.TotalApplications, tiles.Registered, tiles.PaymentReceived,
            tiles.HandholdingInProgress, tiles.HandholdingCompleted,
            tiles.AssessmentScheduled, tiles.AssessmentInProgress,
            tiles.NcRaised, tiles.QualityCheck, tiles.Certified, tiles.Rejected,
            tiles.CertifiedBronze, tiles.CertifiedSilver, tiles.CertifiedGold,
            tiles.RegisteredLast30Days,

            // Total Registered MSMEs splits three ways, by who brought them in.
            registrationSplit,
            subsidyDisbursed,

            // Short name is what the cards print: "QCI", "NPC".
            agencies = byAgency.Select(a => new
            {
                name = ShortAgencyName(a.Name),
                registered = a.Registered,
                certified = a.Certified,
                paymentReceived = a.PaymentReceived,
                inProgress = a.InProgress,
            }),

            levelAgencies = byLevelAgency.Select(a => new
            {
                certificationLevelId = a.CertificationLevelId,
                name = ShortAgencyName(a.AgencyName),
                applied = a.Applied,
                certified = a.Certified,
                inProgress = a.InProgress,
            }),
        });
    }

    /// <summary>
    /// "Quality Council of India (QCI)" -> "QCI". The cards have room for the
    /// acronym only, and the organisation name carries it in brackets.
    /// </summary>
    private static string ShortAgencyName(string name)
    {
        var open = name.LastIndexOf('(');
        var close = name.LastIndexOf(')');

        return open >= 0 && close > open
            ? name[(open + 1)..close]
            : name;
    }

    /// <summary>
    /// The filter bar's dropdown contents, so the screen does not have to guess
    /// which agencies exist.
    /// </summary>
    [HttpGet("dashboard/filters")]
    [HasPermission(Permissions.Dashboard, Permissions.View)]
    public async Task<IActionResult> GetDashboardFilters(CancellationToken ct)
        => Ok(new
        {
            certificationLevels = await db.CertificationLevels.AsNoTracking()
                .OrderBy(l => l.SortOrder)
                .Select(l => new { id = l.CertificationLevelId, name = l.Name })
                .ToListAsync(ct),

            // Implementing agencies are organisations of that account type.
            implementingAgencies = await db.Organisations.AsNoTracking()
                .Where(o => o.AccountTypeId == 1 && o.IsActive)
                .OrderBy(o => o.Name)
                .Select(o => new { id = o.OrganisationId, name = o.Name })
                .ToListAsync(ct),
        });

    /// <summary>
    /// The four demographic panels: Gender, Enterprise Type, Social Category and
    /// the NIC 2008 sector split.
    ///
    /// All four come from columns Udyam supplies, which is why they are counted
    /// on the enterprise rather than the application — an enterprise's promoter
    /// gender does not change per application.
    /// </summary>
    [HttpGet("dashboard/demographics")]
    [HasPermission(Permissions.Dashboard, Permissions.View)]
    public async Task<IActionResult> GetDemographics(
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate,
        [FromQuery] short? stateId,
        [FromQuery] int? districtId,
        [FromQuery] byte? certificationLevelId,
        [FromQuery] int? implementingAgencyId,
        [FromQuery] string? basis = null,
        CancellationToken ct = default)
    {
        var applications = FilteredApplications(
            fromDate, toDate, stateId, districtId, certificationLevelId, implementingAgencyId);

        // The panels can be read two ways: every MSME that registered, or only
        // those that went on to certify. They answer different questions — the
        // first is who the scheme reaches, the second who it carries through —
        // so the screen asks which one it wants.
        if (string.Equals(basis, "certified", StringComparison.OrdinalIgnoreCase))
        {
            applications = applications
                .Where(a => a.ApplicationStatusId == (byte)ApplicationStatusId.Certified);
        }

        // Distinct enterprises behind the filtered applications.
        var enterpriseIds = applications
            .Select(a => a.EnterpriseId)
            .Distinct();

        var enterprises = db.Enterprises.AsNoTracking()
            .Where(e => enterpriseIds.Contains(e.EnterpriseId));

        var total = await enterprises.CountAsync(ct);

        var gender = await Split(enterprises.GroupBy(e => e.Gender), ct);
        var size = await Split(enterprises.GroupBy(e => e.EnterpriseSize), ct);
        var social = await Split(enterprises.GroupBy(e => e.SocialCategory), ct);

        var nic = await enterprises
            .Where(e => e.NicTwoDigit != null)
            .GroupBy(e => new { e.NicTwoDigit, e.NicDescription })
            .Select(g => new
            {
                code = g.Key.NicTwoDigit,
                name = g.Key.NicDescription,
                enterprises = g.Count(),
            })
            .OrderByDescending(x => x.enterprises)
            // Every division the filter allows, not the top ten: the panel
            // scrolls, and a division missing from a list of ten is a division
            // its own officers cannot find.
            .ToListAsync(ct);

        // Certified counts per division, so the NIC table can show the split the
        // design asks for ("Applications and certification split by division").
        var certifiedByNic = await FilteredApplications(
                fromDate, toDate, stateId, districtId, certificationLevelId, implementingAgencyId)
            .Where(a => a.ApplicationStatusId == (byte)ApplicationStatusId.Certified
                     && a.Enterprise.NicTwoDigit != null)
            .GroupBy(a => a.Enterprise.NicTwoDigit)
            .Select(g => new { code = g.Key, certified = g.Count() })
            .ToListAsync(ct);

        return Ok(new
        {
            total,
            // Ordered as the design lists them rather than by size, so the rows
            // do not reshuffle as the filters change.
            gender = Ordered(gender, total, ["Male", "Female", "Others"]),
            enterpriseType = Ordered(size, total, ["Micro", "Small", "Medium"]),
            socialCategory = Ordered(social, total, ["General", "OBC", "SC", "ST"]),
            nic = nic.Select(n => new
            {
                n.code,
                n.name,
                n.enterprises,
                certified = certifiedByNic.FirstOrDefault(c => c.code == n.code)?.certified ?? 0,
                percent = total > 0 ? Math.Round(n.enterprises * 100.0 / total, 1) : 0,
            }),
        });
    }

    private static async Task<Dictionary<string, int>> Split(
        IQueryable<IGrouping<string?, MCLS.Domain.Entities.Msme.Enterprise>> grouped,
        CancellationToken ct)
    {
        var rows = await grouped
            .Select(g => new { Key = g.Key, Count = g.Count() })
            .ToListAsync(ct);

        return rows
            .Where(r => !string.IsNullOrWhiteSpace(r.Key))
            .ToDictionary(r => r.Key!, r => r.Count, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Emits the buckets in the design's order, with anything unexpected folded
    /// into a trailing "Other" rather than dropped — a value the registry adds
    /// later should still be counted somewhere.
    /// </summary>
    private static object[] Ordered(
        Dictionary<string, int> source, int total, string[] order)
    {
        var rows = new List<object>();
        var accounted = 0;

        foreach (var label in order)
        {
            var count = source.TryGetValue(label, out var n) ? n : 0;
            accounted += count;

            rows.Add(new
            {
                label,
                count,
                percent = total > 0 ? Math.Round(count * 100.0 / total, 1) : 0,
            });
        }

        var remainder = source.Where(kv => !order.Contains(kv.Key, StringComparer.OrdinalIgnoreCase))
                              .Sum(kv => kv.Value);

        if (remainder > 0)
        {
            rows.Add(new
            {
                label = "Other",
                count = remainder,
                percent = total > 0 ? Math.Round(remainder * 100.0 / total, 1) : 0,
            });
        }

        return [.. rows];
    }

    /// <summary>Shared by the tiles and the geography panel so both agree.</summary>
    private IQueryable<MCLS.Domain.Entities.Msme.Application> FilteredApplications(
        DateTime? fromDate,
        DateTime? toDate,
        short? stateId,
        int? districtId,
        byte? certificationLevelId,
        int? implementingAgencyId)
    {
        var query = db.Applications.AsNoTracking();

        if (fromDate is { } from) query = query.Where(a => a.RegisteredOnUtc >= from);
        // Inclusive of the whole end day, which is what a date picker implies.
        if (toDate is { } to) query = query.Where(a => a.RegisteredOnUtc < to.Date.AddDays(1));

        if (stateId is { } state) query = query.Where(a => a.Enterprise.StateId == state);
        if (districtId is { } district) query = query.Where(a => a.Enterprise.DistrictId == district);
        if (certificationLevelId is { } level) query = query.Where(a => a.CertificationLevelId == level);
        if (implementingAgencyId is { } agency) query = query.Where(a => a.ImplementingAgencyId == agency);

        return query;
    }

    // ------------------------------------------------------------- helpers --

    /// <summary>
    /// Narrows the query to what this caller may see. An implementing agency
    /// sees its own applications, a consultant sees the ones assigned to them,
    /// an assessment agency sees the ones it assesses. Ministry, state and
    /// operations roles see everything.
    /// </summary>
    private IQueryable<ApplicationListDto> ApplyVisibilityScope(IQueryable<ApplicationListDto> q)
    {
        var accountType = currentUser.AccountTypeId;

        return accountType switch
        {
            (byte)AccountTypeId.ImplementingAgency when currentUser.OrganisationId is { } orgId
                => q.Where(a => a.ImplementingAgencyId == orgId),

            (byte)AccountTypeId.AssessmentAgency when currentUser.OrganisationId is { } agencyId
                => q.Where(a => a.AssessmentAgencyId == agencyId),

            (byte)AccountTypeId.Consultants when currentUser.UserId is { } userId
                => q.Where(a => a.ConsultantUserId == userId),

            // A state officer sees only their own state's units.
            (byte)AccountTypeId.StateSpecific when currentUser.StateId is { } stateId
                => q.Where(a => a.StateId == stateId),

            _ => q,
        };
    }

    private async Task NotifyStatusChangeAsync(
        int applicationId, byte toStatusId, string? remark, CancellationToken ct)
    {
        var context = await db.Applications
            .AsNoTracking()
            .Where(a => a.ApplicationId == applicationId)
            .Select(a => new
            {
                a.ApplicationNo,
                a.CertificateNo,
                a.CertificateValidTillUtc,
                UnitName = a.Enterprise.Name,
                a.Enterprise.ContactEmail,
                Level = a.CertificationLevel.Name,
            })
            .SingleOrDefaultAsync(ct);

        if (context?.ContactEmail is null) return;

        var (templateCode, extra) = (ApplicationStatusId)toStatusId switch
        {
            ApplicationStatusId.PaymentReceived =>
                ("PAYMENT_RECEIVED", new Dictionary<string, string>()),

            ApplicationStatusId.Certified =>
                ("CERTIFICATE_ISSUED", new Dictionary<string, string>
                {
                    ["certificate_no"] = context.CertificateNo ?? "—",
                    ["valid_till"] = context.CertificateValidTillUtc?.ToString("dd MMM yyyy", CultureInfo.InvariantCulture) ?? "—",
                }),

            ApplicationStatusId.Rejected =>
                ("APPLICATION_REJECTED", new Dictionary<string, string>
                {
                    ["reason"] = remark ?? "—",
                }),

            // Every other transition is internal and does not warrant an e-mail.
            _ => (null, new Dictionary<string, string>())!,
        };

        if (templateCode is null) return;

        var values = new Dictionary<string, string>
        {
            ["user_name"] = context.UnitName,
            ["unit_name"] = context.UnitName,
            ["application_no"] = context.ApplicationNo,
            ["tier"] = context.Level,
        };

        foreach (var (key, value) in extra) values[key] = value;

        await email.QueueTemplatedAsync(templateCode, context.ContactEmail, null, values, ct);
    }

    /// <summary>
    /// The geography panels on the dashboard.
    ///
    /// Both panels carry three columns — the place, its registered MSMEs and
    /// its certified ones — because the screen lets the reader rank by either,
    /// and a panel that only knows one of them cannot answer the other without
    /// a second round trip.
    ///
    /// States are capped at ten, which is what the design lists. Districts are
    /// not capped: the design scrolls them, and narrowing to a state is what
    /// the filter above is for. The cap that remains is a guard against a
    /// pathological filter, not a page size.
    /// </summary>
    [HttpGet("geography")]
    [HasPermission(Permissions.Dashboard, Permissions.View)]
    public async Task<IActionResult> GetGeography(
        [FromQuery] DateTime? fromDate,
        [FromQuery] DateTime? toDate,
        [FromQuery] short? stateId,
        [FromQuery] int? districtId,
        [FromQuery] byte? certificationLevelId,
        [FromQuery] int? implementingAgencyId,
        [FromQuery] int topStates = 10,
        CancellationToken ct = default)
    {
        var applications = FilteredApplications(
            fromDate, toDate, stateId, districtId, certificationLevelId, implementingAgencyId);

        var states = await applications
            .GroupBy(a => new { a.Enterprise.StateId, a.Enterprise.State.Name })
            .Select(g => new
            {
                g.Key.StateId,
                Name = g.Key.Name,
                Registered = g.Select(a => a.EnterpriseId).Distinct().Count(),
                Certified = g.Count(a => a.ApplicationStatusId == (byte)ApplicationStatusId.Certified),
            })
            .OrderByDescending(x => x.Certified)
            .ThenByDescending(x => x.Registered)
            .Take(topStates)
            .ToListAsync(ct);

        // Districts are optional on an enterprise, so rows without one are
        // dropped rather than bucketed under a blank name.
        var districts = await applications
            .Where(a => a.Enterprise.DistrictId != null)
            .GroupBy(a => new
            {
                District = a.Enterprise.District!.Name,
                State = a.Enterprise.State.Name,
            })
            .Select(g => new
            {
                g.Key.District,
                g.Key.State,
                Registered = g.Select(a => a.EnterpriseId).Distinct().Count(),
                Certified = g.Count(a => a.ApplicationStatusId == (byte)ApplicationStatusId.Certified),
            })
            .OrderByDescending(x => x.Certified)
            .ThenByDescending(x => x.Registered)
            .Take(800)
            .ToListAsync(ct);

        return Ok(new
        {
            states = states.Select(s => new
            {
                stateId = s.StateId,
                name = s.Name,
                registered = s.Registered,
                certified = s.Certified,
            }),
            districts = districts.Select(d => new
            {
                name = d.District,
                state = d.State,
                registered = d.Registered,
                certified = d.Certified,
            }),
        });
    }
}

// ------------------------------------------------------------- contracts ----

public sealed class ApplicationListQuery : PagedQuery
{
    /// <summary>Handholding, Assessment or Closed.</summary>
    public string? Stage { get; set; }

    /// <summary>A single status, e.g. <c>PAYMENT_RECEIVED</c>.</summary>
    public string? StatusCode { get; set; }

    public byte? CertificationLevelId { get; set; }
    public short? SectorId { get; set; }
    public short? StateId { get; set; }
    public int? ImplementingAgencyId { get; set; }
}

public sealed class ApplicationListDto
{
    public int ApplicationId { get; init; }
    public string ApplicationNo { get; init; } = string.Empty;
    public int EnterpriseId { get; init; }
    public string EnterpriseName { get; init; } = string.Empty;
    public string UdyamRegistrationNo { get; init; } = string.Empty;
    public string EnterpriseSize { get; init; } = string.Empty;
    public short SectorId { get; init; }
    public string SectorCode { get; init; } = string.Empty;
    public string SectorName { get; init; } = string.Empty;
    public short StateId { get; init; }
    public string StateName { get; init; } = string.Empty;
    public string? DistrictName { get; init; }
    public string SubsidyCategoryCode { get; init; } = string.Empty;
    public string SubsidyCategoryName { get; init; } = string.Empty;
    public byte CertificationLevelId { get; init; }
    public string CertificationLevel { get; init; } = string.Empty;
    public byte ApplicationStatusId { get; init; }
    public string StatusCode { get; init; } = string.Empty;
    public string StatusName { get; init; } = string.Empty;
    public string Stage { get; init; } = string.Empty;
    public string? StatusColour { get; init; }
    public int? ImplementingAgencyId { get; init; }
    public string? ImplementingAgencyName { get; init; }
    public int? ConsultantUserId { get; init; }
    public string? ConsultantName { get; init; }
    public int? AssessmentAgencyId { get; init; }
    public string? AssessmentAgencyName { get; init; }
    public DateTime RegisteredOnUtc { get; init; }
    public DateTime? PaymentReceivedOnUtc { get; init; }
    public DateTime? HandholdingStartedOnUtc { get; init; }
    public DateTime? HandholdingCompletedOnUtc { get; init; }
    public DateTime? CertifiedOnUtc { get; init; }
    public string? CertificateNo { get; init; }
    public DateTime? CertificateValidTillUtc { get; init; }
    public decimal? LatestScore { get; init; }
    public int DaysInPipeline { get; init; }
}

public sealed record StatusHistoryDto(
    DateTime ChangedOnUtc, byte? FromStatusId, byte ToStatusId, string? Remark, string? ChangedByName);

public sealed record AvailableTransitionDto(
    byte ToStatusId, string Code, string Name, bool RequiresRemark);

public sealed class RegisterApplicationRequest
{
    [Required] public int EnterpriseId { get; set; }
    [Required] public byte CertificationLevelId { get; set; }
    public int? ImplementingAgencyId { get; set; }
}

public sealed class ChangeApplicationStatusRequest
{
    [Required] public byte ToStatusId { get; set; }

    /// <summary>Required for some transitions; the procedure enforces which.</summary>
    [MaxLength(1000)] public string? Remark { get; set; }
}

public sealed record DashboardTilesDto(
    int TotalApplications, int Registered, int PaymentReceived, int HandholdingInProgress,
    int HandholdingCompleted, int AssessmentScheduled, int AssessmentInProgress,
    int NcRaised, int QualityCheck, int Certified, int Rejected,
    int CertifiedBronze, int CertifiedSilver, int CertifiedGold, int RegisteredLast30Days);


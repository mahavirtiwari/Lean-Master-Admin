using MCLS.Api.Services;
using MCLS.Application.Common.Interfaces;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The applicant's own view of the scheme (D1).
///
/// Separate from the admin controllers on purpose: an applicant sees exactly
/// one enterprise — their own — and reaches it through the account issued at
/// registration, never by passing an id. Nothing here takes an enterprise
/// identifier for that reason.
/// </summary>
[ApiController]
[Route("api/msme")]
[Authorize]
public sealed class MsmeController(
    MclsDbContext db,
    ICurrentUser currentUser,
    IConfiguration configuration) : ControllerBase
{
    /// <summary>
    /// The certificates that open an incentive marked "Both".
    ///
    /// Both spellings are held because the level's name is master data an
    /// administrator can edit — it reads "Lean Silver" today and could read
    /// "Silver" tomorrow, and an incentive must not silently lock itself
    /// because somebody tidied a label.
    /// </summary>
    private static readonly string[] UnlockingLevels =
        ["Lean Silver", "Lean Gold", "Silver", "Gold"];

    /// <summary>
    /// The applicant's pledge certificate, generated and streamed.
    ///
    /// Same document as the one offered during registration, reachable from the
    /// dashboard afterwards. Nothing is stored — see PledgeCertificate.
    /// </summary>
    [HttpGet("pledge")]
    public async Task<IActionResult> DownloadPledge(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return Unauthorized();

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => new
            {
                e.EnterpriseId,
                e.Name,
                e.UdyamRegistrationNo,
                e.RegisteredOnUtc,
                Address = db.EnterprisePlants
                    .Where(p => p.EnterprisePlantId == e.SelectedPlantId)
                    .Select(p => p.AddressLine)
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (enterprise is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var template = PledgeCertificate.TemplatePath;

        if (!System.IO.File.Exists(template))
        {
            return Problem(
                title: "The pledge certificate could not be produced.",
                detail: "The certificate template is not installed on the server.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        var pledgedOn = DateOnly.FromDateTime(enterprise.RegisteredOnUtc.ToLocalTime());

        var reference = PledgeCertificate.BuildReference(pledgedOn, enterprise.EnterpriseId);

        var details = new PledgeDetails(
            enterprise.Name,
            enterprise.Address ?? string.Empty,
            enterprise.UdyamRegistrationNo,
            pledgedOn,
            reference,
            PortalLinks.VerifyPledgeUrl(Request, configuration, reference));

        var pdf = PledgeCertificate.Render(details, template);

        return File(pdf, "application/pdf", $"pledge_certificate_{details.Reference}.pdf");
    }

    /// <summary>Everything the applicant dashboard draws.</summary>
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        var userId = currentUser.UserId;

        if (userId is null) return Unauthorized();

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => new
            {
                e.EnterpriseId,
                e.LeanId,
                e.Name,
                e.UdyamRegistrationNo,
                e.OwnerName,
                e.EnterpriseSize,
                e.RegisteredOnUtc,
                e.IsActive,
                e.NicTwoDigit,
                e.NicFourDigit,
                e.NicFiveDigit,
                e.NicDescription,
                e.MajorActivity,
                // The chosen activity carries the name against each NIC level;
                // the enterprise row only holds the codes, and the sidebar shows
                // "25 - Manufacture of fabricated metal products" per level.
                Chosen = db.EnterpriseActivities
                    .Where(a => a.EnterpriseActivityId == e.SelectedActivityId)
                    .Select(a => new
                    {
                        a.Activity,
                        a.NicTwoDigitName,
                        a.NicFourDigitName,
                        a.NicFiveDigitName,
                    })
                    .FirstOrDefault(),
                Plant = db.EnterprisePlants
                    .Where(p => p.EnterprisePlantId == e.SelectedPlantId)
                    .Select(p => new
                    {
                        p.UnitName,
                        p.AddressLine,
                        p.Pincode,
                        State = p.State != null ? p.State.Name : null,
                        District = p.District != null ? p.District.Name : null,
                    })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        // An account with no enterprise is a staff account that wandered here,
        // or an applicant whose registration did not finish. Either way there
        // is nothing to draw, and 404 says so without guessing.
        if (enterprise is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var levels = await db.CertificationLevels.AsNoTracking()
            .OrderBy(l => l.SortOrder)
            .Select(l => new { l.CertificationLevelId, l.Code, l.Name, l.RequiresAssessment, l.SortOrder })
            .ToListAsync(ct);

        var applications = await db.Applications.AsNoTracking()
            .Where(a => a.EnterpriseId == enterprise.EnterpriseId)
            .Select(a => new
            {
                a.ApplicationId,
                a.ApplicationNo,
                a.CertificationLevelId,
                Status = a.Status.Name,
                a.RegisteredOnUtc,
                a.CertifiedOnUtc,
            })
            .ToListAsync(ct);

        // Bronze and Silver are both open from the start; Gold opens only once
        // Silver has been certified (Gold eligibility = Silver completed). A
        // level with a live application shows that application's state instead.
        var certified = applications
            .Where(a => a.CertifiedOnUtc != null)
            .Select(a => a.CertificationLevelId)
            .ToHashSet();

        var levelCards = levels.Select((l, index) =>
        {
            var application = applications.FirstOrDefault(a => a.CertificationLevelId == l.CertificationLevelId);
            var previous = index == 0 ? null : levels[index - 1];
            var open = index <= 1 || (previous is not null && certified.Contains(previous.CertificationLevelId));

            return new
            {
                l.Code,
                l.Name,
                l.SortOrder,
                Delivery = l.RequiresAssessment ? "Onsite + Remote" : "E-Learning",
                Cost = l.RequiresAssessment ? "PAID" : "FREE",
                State = application is not null
                    ? (application.CertifiedOnUtc != null ? "Certified" : "In progress")
                    : open ? "Open" : "Locked",
                RequiresBefore = open ? null : previous?.Name,
                application?.ApplicationNo,
                ApplicationStatus = application?.Status,
            };
        }).ToList();

        // Incentives unlock on an assessed certificate, so they are all locked
        // until one of the assessed levels is certified.
        var assessedLevelIds = levels.Where(l => l.RequiresAssessment)
            .Select(l => l.CertificationLevelId).ToHashSet();

        var incentivesUnlocked = certified.Any(id => assessedLevelIds.Contains(id));

        // Which certificates this enterprise actually holds, by name, so an
        // incentive that opens at Silver is shown open to a Silver holder even
        // though Gold is still locked.
        var certifiedLevels = levels
            .Where(l => certified.Contains(l.CertificationLevelId))
            .Select(l => l.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        // The five boxes, each carrying its own incentives.
        //
        // Every box is listed whether or not this enterprise has earned it:
        // the scheme's rule is that they are visible from the start and only
        // the benefit behind them is locked. VisibleBeforeUnlock lets one
        // incentive opt out of being advertised early; the box itself always
        // stays.
        var categories = await db.IncentiveCategories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .Select(c => new
            {
                c.CategoryId,
                c.Code,
                c.Name,
                c.Description,
                c.TypicalPartners,
                c.AccentHex,
                Incentives = c.Incentives
                    .Where(i => i.Status == "Active")
                    .OrderBy(i => i.Name)
                    .Select(i => new
                    {
                        i.IncentiveId,
                        i.Name,
                        i.Description,
                        i.ActivationLevel,
                        Provider = i.Provider.Name,
                        Owner = i.AdministeringBody,
                        i.VisibleBeforeUnlock,
                        i.ExternalUrl,
                        i.VideoUrl,
                    })
                    .ToList(),
            })
            .ToListAsync(ct);

        var incentiveGroups = categories.Select(c =>
        {
            var open = c.Incentives
                .Select(i => new
                {
                    i.IncentiveId,
                    i.Name,
                    i.Description,
                    activation = i.ActivationLevel ?? "Both",
                    stakeholder = i.Owner ?? i.Provider,
                    i.ExternalUrl,
                    i.VideoUrl,

                    // Unlocked when the enterprise holds a certificate this
                    // incentive activates on. "Both" means either one does.
                    unlocked = (i.ActivationLevel ?? "Both") == "Both"
                        ? certifiedLevels.Overlaps(UnlockingLevels)
                        : certifiedLevels.Contains(i.ActivationLevel!)
                            || certifiedLevels.Contains($"Lean {i.ActivationLevel}"),
                })
                .Where(i => i.unlocked || c.Incentives.First(x => x.IncentiveId == i.IncentiveId).VisibleBeforeUnlock)
                .ToList();

            return new
            {
                c.CategoryId,
                c.Code,
                c.Name,
                c.Description,
                partners = c.TypicalPartners,
                accent = c.AccentHex,
                count = c.Incentives.Count,
                unlockedCount = open.Count(i => i.unlocked),
                items = open,
            };
        }).ToList();

        return Ok(new
        {
            enterprise = new
            {
                enterprise.LeanId,
                enterprise.Name,
                udyamNumber = enterprise.UdyamRegistrationNo,
                entrepreneur = enterprise.OwnerName,
                size = enterprise.EnterpriseSize,
                registeredOn = enterprise.RegisteredOnUtc,
                isActive = enterprise.IsActive,
                nicTwoDigit = enterprise.NicTwoDigit,
                nicFourDigit = enterprise.NicFourDigit,
                nicFiveDigit = enterprise.NicFiveDigit,
                nicTwoDigitName = enterprise.Chosen != null ? enterprise.Chosen.NicTwoDigitName : null,
                nicFourDigitName = enterprise.Chosen != null ? enterprise.Chosen.NicFourDigitName : null,
                nicFiveDigitName = enterprise.Chosen != null ? enterprise.Chosen.NicFiveDigitName : null,
                majorActivity = enterprise.Chosen != null ? enterprise.Chosen.Activity : enterprise.MajorActivity,
                activity = enterprise.NicDescription,
                unit = enterprise.Plant is null ? null : new
                {
                    enterprise.Plant.UnitName,
                    address = enterprise.Plant.AddressLine,
                    enterprise.Plant.Pincode,
                    enterprise.Plant.State,
                    enterprise.Plant.District,
                },
            },
            levels = levelCards,
            incentives = new
            {
                unlocked = incentivesUnlocked,
                groups = incentiveGroups,
            },
        });
    }

    /// <summary>
    /// The applicant's profile (P01): the enterprise's Udyam details, read-only,
    /// and the SPOC contact. The Udyam fields are what the registry returned and
    /// are not editable here — a change goes through re-validation with Udyam.
    /// </summary>
    [HttpGet("profile")]
    public async Task<IActionResult> GetProfile(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return Unauthorized();

        var profile = await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => new
            {
                enterprise = new
                {
                    e.Name,
                    e.LeanId,
                    e.UdyamRegistrationNo,
                    e.OwnerName,
                    e.Gender,
                    e.SocialCategory,
                    e.AddressLine,
                    e.Pan,
                    registeredOn = e.RegisteredOnUtc,
                    e.EnterpriseSize,
                    e.OrganisationType,
                    activity = e.NicDescription,
                    e.TotalEmployees,
                },
                spoc = new
                {
                    name = db.Users.Where(u => u.Id == e.PrimaryUserId).Select(u => u.FullName).FirstOrDefault(),
                    designation = db.Users.Where(u => u.Id == e.PrimaryUserId).Select(u => u.Designation).FirstOrDefault(),
                    email = e.ContactEmail,
                    mobile = e.ContactMobile,
                },
            })
            .FirstOrDefaultAsync(ct);

        return profile is null
            ? NotFound(new { message = "No enterprise is linked to this account." })
            : Ok(profile);
    }

    /// <summary>
    /// The documents and videos the Ministry publishes to MSMEs (D01) — the
    /// same library the admin Documents menu maintains, filtered to the MSME
    /// audience. A video points at where it is hosted; a file streams from the
    /// registration document endpoint.
    /// </summary>
    [HttpGet("documents")]
    public async Task<IActionResult> GetDocuments(CancellationToken ct)
    {
        const byte msmeEnterprise = 10;

        var rows = await db.Documents.AsNoTracking()
            .Where(d => d.IsActive && !d.IsDeleted
                        && (d.CurrentVersionId != null || d.VideoUrl != null)
                        && d.Audiences.Any(a => a.AccountTypeId == msmeEnterprise))
            .OrderBy(d => d.Title)
            .Select(d => new
            {
                d.DocumentId,
                d.Title,
                d.Description,
                d.VideoUrl,
                VersionId = d.CurrentVersionId,
                ContentType = d.CurrentVersion != null ? d.CurrentVersion.ContentType : null,
                FileName = d.CurrentVersion != null ? d.CurrentVersion.OriginalFileName : null,
            })
            .ToListAsync(ct);

        return Ok(rows.Select(r => new
        {
            r.DocumentId,
            r.Title,
            r.Description,
            r.FileName,
            kind = r.VideoUrl != null ? "video" : "document",
            url = r.VideoUrl ?? $"/api/registration/applicant-documents/{r.DocumentId}/{r.VersionId}",
        }));
    }

    /// <summary>
    /// The applicant's invoices and receipts (Y00). Each paid application yields
    /// an invoice and a receipt line for the amount paid; nothing is shown until
    /// a payment has been made, so an unpaid enterprise sees an empty list.
    /// </summary>
    [HttpGet("payments")]
    public async Task<IActionResult> GetPayments(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return Unauthorized();

        var enterpriseId = await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => (int?)e.EnterpriseId)
            .FirstOrDefaultAsync(ct);

        if (enterpriseId is null) return Ok(new { payments = Array.Empty<object>() });

        var paid = await db.ApplicationSubmissions.AsNoTracking()
            .Where(s => s.EnterpriseId == enterpriseId && s.PaymentStatus == "Paid" && s.PaidAmount != null)
            .OrderByDescending(s => s.PaidOnUtc)
            .Select(s => new
            {
                level = db.CertificationLevels
                    .Where(l => l.CertificationLevelId == s.CertificationLevelId)
                    .Select(l => l.Name)
                    .FirstOrDefault(),
                s.PaidAmount,
                s.PaidOnUtc,
                s.PaymentMethod,
                s.PaymentReference,
            })
            .ToListAsync(ct);

        var payments = new List<object>();
        foreach (var p in paid)
        {
            var name = string.IsNullOrWhiteSpace(p.level) ? "LEAN" : p.level!;
            if (!name.StartsWith("LEAN", StringComparison.OrdinalIgnoreCase)) name = "LEAN " + name;

            payments.Add(new
            {
                kind = "invoice",
                title = $"{name} Invoice",
                amount = p.PaidAmount,
                reference = p.PaymentReference,
                paidOn = p.PaidOnUtc,
            });
            payments.Add(new
            {
                kind = "receipt",
                title = $"{name} Receipt",
                amount = p.PaidAmount,
                reference = p.PaymentReference,
                paidOn = p.PaidOnUtc,
                method = p.PaymentMethod,
            });
        }

        return Ok(new { payments });
    }

    /// <summary>
    /// The applicant's recent activity as notifications (H03) — derived from
    /// their own records, newest first. There is no separate notifications
    /// store yet; these are the events the applicant would expect to see.
    /// </summary>
    [HttpGet("notifications")]
    public async Task<IActionResult> GetNotifications(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return Unauthorized();

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => new { e.EnterpriseId })
            .FirstOrDefaultAsync(ct);
        if (enterprise is null) return Ok(Array.Empty<Notification>());

        var items = new List<Notification>();

        var submission = await db.ApplicationSubmissions.AsNoTracking()
            .Where(s => s.EnterpriseId == enterprise.EnterpriseId && s.CertificationLevelId == 2)
            .Select(s => new { s.Status, s.SubmittedOnUtc, s.PaymentStatus, s.PaidAmount, s.PaidOnUtc })
            .FirstOrDefaultAsync(ct);

        if (submission is { PaymentStatus: "Paid", PaidOnUtc: { } paidOn })
            items.Add(new Notification("Payment received", $"₹{submission.PaidAmount:N0} for LEAN Silver", paidOn, "payment"));
        if (submission is { Status: "Submitted", SubmittedOnUtc: { } submittedOn })
            items.Add(new Notification("Application submitted", "Your LEAN Silver application is under review", submittedOn, "application"));

        var certs = await db.Applications.AsNoTracking()
            .Where(a => a.EnterpriseId == enterprise.EnterpriseId && a.CertifiedOnUtc != null)
            .Select(a => new { a.CertificationLevel.Name, a.CertifiedOnUtc })
            .ToListAsync(ct);
        foreach (var c in certs)
            items.Add(new Notification($"{c.Name} certificate issued", "Available in Documents", c.CertifiedOnUtc!.Value, "certificate"));

        return Ok(items.OrderByDescending(i => i.OnUtc));
    }

    private sealed record Notification(string Title, string Detail, DateTime OnUtc, string Kind);
}

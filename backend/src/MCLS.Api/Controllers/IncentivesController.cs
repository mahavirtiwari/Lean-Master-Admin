using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Incentive;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The incentives an MSME unlocks on certification.
///
/// Two groupings, and they answer different questions. The <em>provider</em> is
/// who funds it — Ministry of MSME, State Govt., Financial Institutions, Others
/// — and is what the four sub-menus and the four create forms are organised by.
/// The <em>category</em> is what it is for, and is what the overview leads with
/// and what an MSME sees on its dashboard.
///
/// The rule the banner states is worth keeping in view when reading this code:
/// incentives activate on Silver or Gold certification only. LEAN Bronze does
/// not activate them, and every box stays visible to the MSME but locked until
/// the milestone is verified. Nothing here filters an incentive out for an
/// uncertified enterprise — visibility is deliberate, and the lock is applied
/// where the benefit is claimed.
/// </summary>
[ApiController]
[Route("api/incentives")]
public sealed class IncentivesController(
    MclsDbContext db,
    IFileStorage files,
    ICurrentUser currentUser) : ControllerBase
{
    private const string ResourceFolder = "incentives";

    // ------------------------------------------------------------ reading ---

    /// <summary>The four providers, with their active counts.</summary>
    [HttpGet("providers")]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> GetProviders(CancellationToken ct)
        => Ok(await db.IncentiveProviders.AsNoTracking()
            .Where(p => p.IsActive)
            .OrderBy(p => p.SortOrder)
            .Select(p => new IncentiveProviderDto(
                p.ProviderId,
                p.Code,
                p.Name,
                p.Description,
                p.Incentives.Count(i => i.Status == "Active")))
            .ToListAsync(ct));

    /// <summary>The five category boxes, for the overview and the create forms.</summary>
    [HttpGet("categories")]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> GetCategories(CancellationToken ct)
        => Ok(await CategoryCards(ct));

    /// <summary>
    /// Everything the Incentives Management overview draws: the five category
    /// boxes and the totals beneath them.
    /// </summary>
    [HttpGet("overview")]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> GetOverview(CancellationToken ct)
        => Ok(new
        {
            categories = await CategoryCards(ct),
            providers = await db.IncentiveProviders.AsNoTracking()
                .Where(p => p.IsActive)
                .OrderBy(p => p.SortOrder)
                .Select(p => new
                {
                    p.ProviderId,
                    p.Code,
                    p.Name,
                    active = p.Incentives.Count(i => i.Status == "Active"),
                    total = p.Incentives.Count(),
                })
                .ToListAsync(ct),
            totals = await Totals(db.Incentives.AsNoTracking(), ct),
        });

    /// <summary>
    /// The list, optionally narrowed to one provider — which is how the four
    /// sub-menu routes are served — and to a category, an activation level, a
    /// status or a search term.
    /// </summary>
    [HttpGet]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> GetIncentives(
        [FromQuery] string? providerCode,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] byte? categoryId,
        [FromQuery] string? activation,
        [FromQuery] short? stateId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var query = Filtered(providerCode, search, status, categoryId, activation, stateId);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(i => i.Status == "Active")
            .ThenBy(i => i.Name)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            // Projected inline rather than through a helper: a method call in a
            // Select is evaluated on the client, and the navigations it counts
            // — resources, disbursements — are not loaded there, so every count
            // came back zero while the rows existed in the table.
            .Select(i => new IncentiveListItemDto(
                i.IncentiveId,
                i.Code,
                i.Name,
                i.Category != null ? i.Category.Name : null,
                i.Category != null ? i.Category.AccentHex : null,
                i.ActivationLevel ?? "Both",
                i.AdministeringBody ?? i.Provider.Name,
                i.Disbursements.Select(d => d.EnterpriseId).Distinct().Count(),
                i.Disbursements.Where(d => d.Status == "Disbursed").Sum(d => (decimal?)d.Amount) ?? 0m,
                i.Status,
                i.Resources.Count(r => r.Kind == "Video"),
                i.Resources.Count(r => r.Kind == "Link"),
                i.Resources.Count(r => r.Kind == "Document"),
                i.CreatedOnUtc))
            .ToListAsync(ct);

        return Ok(new
        {
            page = PagedResult<IncentiveListItemDto>.Create(items, total, pageNumber, pageSize),

            // The four tiles above the table count the provider's whole set,
            // not the page or the current filter — they are the standing
            // position, which is what somebody arriving at the screen wants.
            totals = await Totals(Filtered(providerCode, null, null, null, null, null), ct),
        });
    }

    /// <summary>One incentive, with everything attached to it.</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> GetIncentive(int id, CancellationToken ct)
    {
        var incentive = await db.Incentives.AsNoTracking()
            .Where(i => i.IncentiveId == id)
            .Select(i => new IncentiveDetailDto(
                i.IncentiveId,
                i.Code,
                i.Name,
                i.ProviderId,
                i.Provider.Code,
                i.Provider.Name,
                i.CategoryId,
                i.Category != null ? i.Category.Name : null,
                i.SchemeCode,
                i.ActivationLevel,
                i.AdministeringBody,
                i.StateId,
                i.State != null ? i.State.Name : null,
                i.Description,
                i.EligibilityCriteria,
                i.BenefitDescription,
                i.OutlayAmount,
                i.BudgetHead,
                i.GazetteNo,
                i.ProductType,
                i.RateConcessionBps,
                i.AgencyType,
                i.ExternalSchemeId,
                i.ContactName,
                i.ContactDesignation,
                i.ContactMobile,
                i.ContactEmail,
                i.VisibleBeforeUnlock,
                i.NotifyOnPublish,
                i.RequireClaimDocument,
                i.Status,
                i.ValidFrom,
                i.ValidTo,
                i.ExternalUrl,
                i.VideoUrl,
                i.Resources
                    .OrderBy(r => r.SortOrder)
                    .Select(r => new IncentiveResourceDto(
                        r.ResourceId, r.Kind, r.Title, r.Url, r.FileName, r.SizeBytes))
                    .ToList()))
            .SingleOrDefaultAsync(ct);

        return incentive is null ? NotFound() : Ok(incentive);
    }

    // ------------------------------------------------------------ writing ---

    /// <summary>The Create New Incentive screen, in any of its four forms.</summary>
    [HttpPost]
    [HasPermission(Permissions.Incentives, Permissions.Create)]
    public async Task<IActionResult> CreateIncentive([FromBody] IncentiveSaveRequest request, CancellationToken ct)
    {
        var code = await ResolveCodeAsync(request, null, ct);

        if (code is null) return ValidationProblem(ModelState);

        var incentive = new Incentive { Code = code };

        Apply(request, incentive);

        db.Incentives.Add(incentive);
        await db.SaveChangesAsync(ct);

        await ReplaceLinksAsync(incentive.IncentiveId, request, ct);

        return CreatedAtAction(nameof(GetIncentive), new { id = incentive.IncentiveId }, new { incentive.IncentiveId });
    }

    /// <summary>Saves an edited incentive.</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Incentives, Permissions.Edit)]
    public async Task<IActionResult> UpdateIncentive(int id, [FromBody] IncentiveSaveRequest request, CancellationToken ct)
    {
        var incentive = await db.Incentives.AsTracking().SingleOrDefaultAsync(i => i.IncentiveId == id, ct);
        if (incentive is null) return NotFound();

        var code = await ResolveCodeAsync(request, id, ct);
        if (code is null) return ValidationProblem(ModelState);

        incentive.Code = code;
        Apply(request, incentive);

        await db.SaveChangesAsync(ct);
        await ReplaceLinksAsync(id, request, ct);

        return NoContent();
    }

    /// <summary>Activates or disables an incentive from the list's Actions column.</summary>
    [HttpPost("{id:int}/status")]
    [HasPermission(Permissions.Incentives, Permissions.Edit)]
    public async Task<IActionResult> SetStatus(int id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var incentive = await db.Incentives.AsTracking().SingleOrDefaultAsync(i => i.IncentiveId == id, ct);
        if (incentive is null) return NotFound();

        incentive.Status = request.IsActive ? "Active" : "Inactive";
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    // ---------------------------------------------------------- resources ---

    /// <summary>Attaches a guidelines or gazette document to an incentive.</summary>
    [HttpPost("{id:int}/documents")]
    [HasPermission(Permissions.Incentives, Permissions.Edit)]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> UploadDocument(int id, [FromForm] IncentiveDocumentRequest request, CancellationToken ct)
    {
        if (!await db.Incentives.AnyAsync(i => i.IncentiveId == id, ct)) return NotFound();

        if (request.File is null || request.File.Length == 0)
        {
            ModelState.AddModelError(nameof(request.File), "Choose a file to upload.");
            return ValidationProblem(ModelState);
        }

        if (!files.IsExtensionAllowed(request.File.FileName))
        {
            ModelState.AddModelError(nameof(request.File), "That file type is not accepted.");
            return ValidationProblem(ModelState);
        }

        await using var upload = request.File.OpenReadStream();
        var stored = await files.SaveAsync(upload, request.File.FileName, ResourceFolder, ct);

        var resource = new IncentiveResource
        {
            IncentiveId = id,
            Kind = "Document",
            Title = string.IsNullOrWhiteSpace(request.Title) ? request.File.FileName : request.Title.Trim(),
            StoragePath = $"{stored.RelativePath}|{stored.StoredFileName}",
            FileName = request.File.FileName,
            SizeBytes = stored.SizeBytes,
            SortOrder = 9,
            CreatedOnUtc = DateTime.UtcNow,
            CreatedByUserId = currentUser.UserId,
        };

        db.IncentiveResources.Add(resource);
        await db.SaveChangesAsync(ct);

        return Ok(new IncentiveResourceDto(
            resource.ResourceId, resource.Kind, resource.Title, null, resource.FileName, resource.SizeBytes));
    }

    /// <summary>Streams an attached document back.</summary>
    [HttpGet("resources/{resourceId:int}/download")]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> DownloadResource(int resourceId, CancellationToken ct)
    {
        var resource = await db.IncentiveResources.AsNoTracking()
            .SingleOrDefaultAsync(r => r.ResourceId == resourceId, ct);

        if (resource?.StoragePath is null) return NotFound();

        var parts = resource.StoragePath.Split('|');
        if (parts.Length != 2) return NotFound();

        var stream = await files.OpenReadAsync(parts[0], parts[1], ct);

        return File(stream, "application/octet-stream", resource.FileName ?? "document");
    }

    /// <summary>Removes one attached resource.</summary>
    [HttpDelete("resources/{resourceId:int}")]
    [HasPermission(Permissions.Incentives, Permissions.Edit)]
    public async Task<IActionResult> DeleteResource(int resourceId, CancellationToken ct)
    {
        var resource = await db.IncentiveResources.AsTracking()
            .SingleOrDefaultAsync(r => r.ResourceId == resourceId, ct);

        if (resource is null) return NotFound();

        db.IncentiveResources.Remove(resource);
        await db.SaveChangesAsync(ct);

        // The file goes only after the row it belonged to is gone: an orphaned
        // file wastes disk, an orphaned row breaks a download.
        if (resource.StoragePath is { } path && path.Split('|') is { Length: 2 } parts)
        {
            try
            {
                await files.DeleteAsync(parts[0], parts[1], ct);
            }
            catch (IOException)
            {
                // Already gone, or held open. The row is what mattered.
            }
        }

        return NoContent();
    }

    // ------------------------------------------------------------ helpers ---

    private IQueryable<Incentive> Filtered(
        string? providerCode, string? search, string? status,
        byte? categoryId, string? activation, short? stateId)
    {
        var query = db.Incentives.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(providerCode))
        {
            var code = providerCode.Trim();
            query = query.Where(i => i.Provider.Code == code);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(i =>
                i.Name.Contains(term) ||
                i.Code.Contains(term) ||
                (i.AdministeringBody != null && i.AdministeringBody.Contains(term)));
        }

        if (!string.IsNullOrWhiteSpace(status) && status != "All") query = query.Where(i => i.Status == status);
        if (categoryId is { } category) query = query.Where(i => i.CategoryId == category);
        if (stateId is { } state) query = query.Where(i => i.StateId == state);

        if (!string.IsNullOrWhiteSpace(activation) && activation != "All")
        {
            var level = activation.Trim();

            // "Both" covers Silver and Gold, so an incentive marked Both belongs
            // in the answer to either — filtering on the stored value alone
            // would hide exactly the ones that apply to everybody.
            query = level == "Both"
                ? query.Where(i => i.ActivationLevel == "Both")
                : query.Where(i => i.ActivationLevel == level || i.ActivationLevel == "Both");
        }

        return query;
    }

    private async Task<List<IncentiveCategoryDto>> CategoryCards(CancellationToken ct)
        => await db.IncentiveCategories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .Select(c => new IncentiveCategoryDto(
                c.CategoryId,
                c.Code,
                c.Name,
                c.Description,
                c.TypicalPartners,
                c.AccentHex,
                c.Incentives.Count(i => i.Status == "Active"),
                c.Incentives.Count(),

                // The badge on the card: the level that unlocks this box. Mixed
                // contents read as Both, which is what an MSME needs to know —
                // something in here opens at Silver.
                c.Incentives.Any(i => i.Status == "Active" && i.ActivationLevel == "Both")
                    || (c.Incentives.Any(i => i.Status == "Active" && i.ActivationLevel == "Silver")
                        && c.Incentives.Any(i => i.Status == "Active" && i.ActivationLevel == "Gold"))
                    ? "Both"
                    : c.Incentives.Any(i => i.Status == "Active" && i.ActivationLevel == "Silver")
                        ? "Silver"
                        : c.Incentives.Any(i => i.Status == "Active" && i.ActivationLevel == "Gold")
                            ? "Gold"
                            : "Both"))
            .ToListAsync(ct);

    private static async Task<object> Totals(IQueryable<Incentive> query, CancellationToken ct)
    {
        var counts = await query
            .GroupBy(_ => 1)
            .Select(g => new
            {
                active = g.Count(i => i.Status == "Active"),
                draft = g.Count(i => i.Status == "Draft"),
                total = g.Count(),
                beneficiaries = g.SelectMany(i => i.Disbursements).Select(d => d.EnterpriseId).Distinct().Count(),
                disbursed = g.SelectMany(i => i.Disbursements)
                    .Where(d => d.Status == "Disbursed")
                    .Sum(d => (decimal?)d.Amount) ?? 0m,
            })
            .SingleOrDefaultAsync(ct);

        return counts ?? new { active = 0, draft = 0, total = 0, beneficiaries = 0, disbursed = 0m };
    }

    /// <summary>
    /// The code an incentive is filed under.
    ///
    /// The forms do not ask for one — they ask for the scheme's own code, which
    /// is the department's, not ours, and is not always given. So the code is
    /// derived from the provider and the next free number, and only checked for
    /// collision when the caller supplies one.
    /// </summary>
    private async Task<string?> ResolveCodeAsync(IncentiveSaveRequest request, int? id, CancellationToken ct)
    {
        if (!string.IsNullOrWhiteSpace(request.Code))
        {
            var supplied = request.Code.Trim();

            if (await db.Incentives.AnyAsync(i => i.Code == supplied && i.IncentiveId != id, ct))
            {
                ModelState.AddModelError(nameof(request.Code), $"Incentive code {supplied} already exists.");
                return null;
            }

            return supplied;
        }

        if (id is not null)
        {
            return await db.Incentives.AsNoTracking()
                .Where(i => i.IncentiveId == id)
                .Select(i => i.Code)
                .SingleAsync(ct);
        }

        var prefix = await db.IncentiveProviders.AsNoTracking()
            .Where(p => p.ProviderId == request.ProviderId)
            .Select(p => p.Code)
            .SingleOrDefaultAsync(ct) ?? "INC";

        prefix = prefix.Length <= 3 ? prefix : prefix[..3];

        var year = DateTime.UtcNow.Year;
        var used = await db.Incentives.AsNoTracking()
            .CountAsync(i => i.ProviderId == request.ProviderId, ct);

        string candidate;
        var next = used + 1;

        do
        {
            candidate = $"{prefix}-{year}-{next:D3}";
            next++;
        }
        while (await db.Incentives.AnyAsync(i => i.Code == candidate, ct));

        return candidate;
    }

    private static void Apply(IncentiveSaveRequest request, Incentive incentive)
    {
        incentive.Name = request.Name.Trim();
        incentive.ProviderId = request.ProviderId;
        incentive.CategoryId = request.CategoryId;
        incentive.SchemeCode = Clean(request.SchemeCode);
        incentive.AdministeringBody = Clean(request.AdministeringBody);
        incentive.StateId = request.StateId;
        incentive.Description = Clean(request.Description);
        incentive.EligibilityCriteria = Clean(request.EligibilityCriteria);
        incentive.BenefitDescription = Clean(request.BenefitDescription);
        incentive.OutlayAmount = request.OutlayAmount;
        incentive.BudgetHead = Clean(request.BudgetHead);
        incentive.GazetteNo = Clean(request.GazetteNo);
        incentive.ProductType = Clean(request.ProductType);
        incentive.RateConcessionBps = request.RateConcessionBps;
        incentive.AgencyType = Clean(request.AgencyType);
        incentive.ExternalSchemeId = Clean(request.ExternalSchemeId);
        incentive.ContactName = Clean(request.ContactName);
        incentive.ContactDesignation = Clean(request.ContactDesignation);
        incentive.ContactMobile = Clean(request.ContactMobile);
        incentive.ContactEmail = Clean(request.ContactEmail);
        incentive.VisibleBeforeUnlock = request.VisibleBeforeUnlock;
        incentive.NotifyOnPublish = request.NotifyOnPublish;
        incentive.RequireClaimDocument = request.RequireClaimDocument;
        incentive.ValidFrom = request.ValidFrom;
        incentive.ValidTo = request.ValidTo;
        incentive.ExternalUrl = Clean(request.ExternalUrl);
        incentive.VideoUrl = Clean(request.VideoUrl);
        incentive.Status = request.Status is { Length: > 0 } status ? status : "Active";

        var activation = Clean(request.ActivationLevel) ?? "Both";

        incentive.ActivationLevel = activation;

        // The level id is kept in step so anything reading it alone still gets
        // a true answer; Both has no single level, and is null by design.
        incentive.CertificationLevelId = activation switch
        {
            "Silver" => (byte?)2,
            "Gold" => (byte?)3,
            _ => null,
        };
    }

    /// <summary>
    /// Rewrites the video and portal links attached to an incentive.
    ///
    /// Uploaded documents are left alone: they are added and removed by their
    /// own endpoints, and a save from the form must not delete a file the form
    /// never carried.
    /// </summary>
    private async Task ReplaceLinksAsync(int incentiveId, IncentiveSaveRequest request, CancellationToken ct)
    {
        var existing = await db.IncentiveResources.AsTracking()
            .Where(r => r.IncentiveId == incentiveId && r.Kind != "Document")
            .ToListAsync(ct);

        db.IncentiveResources.RemoveRange(existing);

        var now = DateTime.UtcNow;

        if (Clean(request.VideoUrl) is { } video)
        {
            db.IncentiveResources.Add(new IncentiveResource
            {
                IncentiveId = incentiveId,
                Kind = "Video",
                Title = "Video guide",
                Url = video,
                SortOrder = 1,
                CreatedOnUtc = now,
                CreatedByUserId = currentUser.UserId,
            });
        }

        if (Clean(request.ExternalUrl) is { } portal)
        {
            db.IncentiveResources.Add(new IncentiveResource
            {
                IncentiveId = incentiveId,
                Kind = "Link",
                Title = "Scheme portal",
                Url = portal,
                SortOrder = 2,
                CreatedOnUtc = now,
                CreatedByUserId = currentUser.UserId,
            });
        }

        await db.SaveChangesAsync(ct);
    }

    private static string? Clean(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}

// --------------------------------------------------------------------- dtos ---

public sealed record IncentiveProviderDto(
    byte ProviderId,
    string Code,
    string Name,
    string? Description,
    int ActiveIncentiveCount);

public sealed record IncentiveCategoryDto(
    byte CategoryId,
    string Code,
    string Name,
    string? Description,
    string? TypicalPartners,
    string AccentHex,
    int ActiveCount,
    int TotalCount,
    string ActivationBadge);

/// <summary>One row of the list, in the columns the artboard draws.</summary>
public sealed record IncentiveListItemDto(
    int IncentiveId,
    string Code,
    string Name,
    string? CategoryName,
    string? CategoryAccent,
    string ActivationLevel,
    string Stakeholder,
    int Beneficiaries,
    decimal ValueDisbursed,
    string Status,

    // Counted by kind rather than totalled: the list draws one icon per kind
    // with its own count, which a single total cannot be split back into.
    int VideoCount,
    int LinkCount,
    int DocumentCount,
    DateTime CreatedOnUtc);

public sealed record IncentiveResourceDto(
    int ResourceId,
    string Kind,
    string Title,
    string? Url,
    string? FileName,
    long? SizeBytes);

public sealed record IncentiveDetailDto(
    int IncentiveId,
    string Code,
    string Name,
    byte ProviderId,
    string ProviderCode,
    string ProviderName,
    byte? CategoryId,
    string? CategoryName,
    string? SchemeCode,
    string? ActivationLevel,
    string? AdministeringBody,
    short? StateId,
    string? StateName,
    string? Description,
    string? EligibilityCriteria,
    string? BenefitDescription,
    decimal? OutlayAmount,
    string? BudgetHead,
    string? GazetteNo,
    string? ProductType,
    int? RateConcessionBps,
    string? AgencyType,
    string? ExternalSchemeId,
    string? ContactName,
    string? ContactDesignation,
    string? ContactMobile,
    string? ContactEmail,
    bool VisibleBeforeUnlock,
    bool NotifyOnPublish,
    bool RequireClaimDocument,
    string Status,
    DateOnly? ValidFrom,
    DateOnly? ValidTo,
    string? ExternalUrl,
    string? VideoUrl,
    List<IncentiveResourceDto> Resources);

public sealed class IncentiveSaveRequest
{
    /// <summary>Left empty on create: the server allocates one.</summary>
    [StringLength(30)]
    public string? Code { get; init; }

    [Required, StringLength(250)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public byte ProviderId { get; init; }

    public byte? CategoryId { get; init; }

    [StringLength(40)]
    public string? SchemeCode { get; init; }

    /// <summary>Silver, Gold or Both.</summary>
    [StringLength(10)]
    public string? ActivationLevel { get; init; }

    /// <summary>
    /// Whoever owns the scheme, whatever the form calls it: the administering
    /// department, the state department, the bank, or the issuing agency.
    /// </summary>
    [StringLength(200)]
    public string? AdministeringBody { get; init; }

    public short? StateId { get; init; }

    [StringLength(2000)]
    public string? Description { get; init; }

    [StringLength(2000)]
    public string? EligibilityCriteria { get; init; }

    [StringLength(1000)]
    public string? BenefitDescription { get; init; }

    public decimal? OutlayAmount { get; init; }

    [StringLength(200)]
    public string? BudgetHead { get; init; }

    [StringLength(80)]
    public string? GazetteNo { get; init; }

    [StringLength(120)]
    public string? ProductType { get; init; }

    public int? RateConcessionBps { get; init; }

    [StringLength(80)]
    public string? AgencyType { get; init; }

    [StringLength(80)]
    public string? ExternalSchemeId { get; init; }

    [StringLength(160)]
    public string? ContactName { get; init; }

    [StringLength(160)]
    public string? ContactDesignation { get; init; }

    [StringLength(15)]
    public string? ContactMobile { get; init; }

    [StringLength(256), EmailAddress]
    public string? ContactEmail { get; init; }

    public bool VisibleBeforeUnlock { get; init; } = true;
    public bool NotifyOnPublish { get; init; }
    public bool RequireClaimDocument { get; init; }

    /// <summary>Active or Draft — Save Incentive and Save as Draft.</summary>
    [StringLength(15)]
    public string? Status { get; init; }

    public DateOnly? ValidFrom { get; init; }
    public DateOnly? ValidTo { get; init; }

    [StringLength(500)]
    public string? ExternalUrl { get; init; }

    [StringLength(1000)]
    public string? VideoUrl { get; init; }
}

public sealed class IncentiveDocumentRequest
{
    public IFormFile? File { get; init; }

    [StringLength(300)]
    public string? Title { get; init; }
}

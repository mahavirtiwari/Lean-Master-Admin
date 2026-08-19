using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Incentive;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The incentives an MSME unlocks on certification, grouped by who provides
/// them: Ministry of MSME, State Government, Financial Institutions, Others.
///
/// The rule the screen states in its banner is worth keeping in view when
/// reading this code: incentives activate on Silver or Gold certification only.
/// LEAN Bronze does not activate them, and every incentive box stays visible to
/// the MSME but locked until the milestone is verified. Nothing here filters an
/// incentive out for an uncertified enterprise — visibility is deliberate, and
/// the lock is applied where the benefit is claimed.
/// </summary>
[ApiController]
[Route("api/incentives")]
public sealed class IncentivesController(MclsDbContext db) : ControllerBase
{
    /// <summary>The provider cards across the top, with their active counts.</summary>
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

    /// <summary>
    /// The All Incentives list, optionally narrowed to one provider — which is
    /// how the four sub-menu routes (Ministry, State Govt., Financial
    /// Institutions, Others) are served.
    /// </summary>
    [HttpGet]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> GetIncentives(
        [FromQuery] string? providerCode,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] byte? certificationLevelId,
        [FromQuery] short? stateId,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
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
            query = query.Where(i => i.Name.Contains(term) || i.Code.Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(i => i.Status == status);
        if (certificationLevelId is { } level) query = query.Where(i => i.CertificationLevelId == level);
        if (stateId is { } state) query = query.Where(i => i.StateId == state);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderBy(i => i.Name)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new IncentiveDto(
                i.IncentiveId,
                i.Code,
                i.Name,
                i.ProviderId,
                i.Provider.Name,
                i.AdministeringBody,
                i.CertificationLevelId,
                i.CertificationLevel != null ? i.CertificationLevel.Name : null,
                i.StateId,
                i.State != null ? i.State.Name : null,
                i.Description,
                i.EligibilityCriteria,
                i.BenefitDescription,
                i.OutlayAmount,
                i.Status,
                i.ValidFrom,
                i.ValidTo,
                i.ExternalUrl))
            .ToListAsync(ct);

        return Ok(PagedResult<IncentiveDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>One incentive, for the view and edit forms.</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Incentives, Permissions.View)]
    public async Task<IActionResult> GetIncentive(int id, CancellationToken ct)
    {
        var incentive = await db.Incentives.AsNoTracking()
            .Where(i => i.IncentiveId == id)
            .Select(i => new IncentiveDto(
                i.IncentiveId, i.Code, i.Name, i.ProviderId, i.Provider.Name,
                i.AdministeringBody, i.CertificationLevelId,
                i.CertificationLevel != null ? i.CertificationLevel.Name : null,
                i.StateId, i.State != null ? i.State.Name : null,
                i.Description, i.EligibilityCriteria, i.BenefitDescription,
                i.OutlayAmount, i.Status, i.ValidFrom, i.ValidTo, i.ExternalUrl))
            .SingleOrDefaultAsync(ct);

        return incentive is null ? NotFound() : Ok(incentive);
    }

    /// <summary>The Create New Incentive screen.</summary>
    [HttpPost]
    [HasPermission(Permissions.Incentives, Permissions.Create)]
    public async Task<IActionResult> CreateIncentive([FromBody] IncentiveSaveRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim();

        if (await db.Incentives.AnyAsync(i => i.Code == code, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Incentive code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        var incentive = new Incentive
        {
            Code = code,
            Name = request.Name.Trim(),
            ProviderId = request.ProviderId,
            AdministeringBody = request.AdministeringBody?.Trim(),
            CertificationLevelId = request.CertificationLevelId,
            StateId = request.StateId,
            Description = request.Description?.Trim(),
            EligibilityCriteria = request.EligibilityCriteria?.Trim(),
            BenefitDescription = request.BenefitDescription?.Trim(),
            OutlayAmount = request.OutlayAmount,
            Status = request.Status ?? "Active",
            ValidFrom = request.ValidFrom,
            ValidTo = request.ValidTo,
            ExternalUrl = request.ExternalUrl?.Trim(),
        };

        db.Incentives.Add(incentive);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetIncentive), new { id = incentive.IncentiveId }, null);
    }

    /// <summary>Saves an edited incentive.</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Incentives, Permissions.Edit)]
    public async Task<IActionResult> UpdateIncentive(int id, [FromBody] IncentiveSaveRequest request, CancellationToken ct)
    {
        var incentive = await db.Incentives.AsTracking().SingleOrDefaultAsync(i => i.IncentiveId == id, ct);
        if (incentive is null) return NotFound();

        var code = request.Code.Trim();

        if (await db.Incentives.AnyAsync(i => i.Code == code && i.IncentiveId != id, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Incentive code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        incentive.Code = code;
        incentive.Name = request.Name.Trim();
        incentive.ProviderId = request.ProviderId;
        incentive.AdministeringBody = request.AdministeringBody?.Trim();
        incentive.CertificationLevelId = request.CertificationLevelId;
        incentive.StateId = request.StateId;
        incentive.Description = request.Description?.Trim();
        incentive.EligibilityCriteria = request.EligibilityCriteria?.Trim();
        incentive.BenefitDescription = request.BenefitDescription?.Trim();
        incentive.OutlayAmount = request.OutlayAmount;
        incentive.ValidFrom = request.ValidFrom;
        incentive.ValidTo = request.ValidTo;
        incentive.ExternalUrl = request.ExternalUrl?.Trim();
        if (request.Status is { } status) incentive.Status = status;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Activates or suspends an incentive.</summary>
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
}

public sealed record IncentiveProviderDto(
    byte ProviderId,
    string Code,
    string Name,
    string? Description,
    int ActiveIncentiveCount);

public sealed record IncentiveDto(
    int IncentiveId,
    string Code,
    string Name,
    byte ProviderId,
    string ProviderName,
    string? AdministeringBody,
    byte? CertificationLevelId,
    string? CertificationLevelName,
    short? StateId,
    string? StateName,
    string? Description,
    string? EligibilityCriteria,
    string? BenefitDescription,
    decimal? OutlayAmount,
    string Status,
    DateOnly? ValidFrom,
    DateOnly? ValidTo,
    string? ExternalUrl);

public sealed class IncentiveSaveRequest
{
    [Required, StringLength(30)]
    public string Code { get; init; } = string.Empty;

    [Required, StringLength(250)]
    public string Name { get; init; } = string.Empty;

    [Required]
    public byte ProviderId { get; init; }

    [StringLength(200)]
    public string? AdministeringBody { get; init; }

    public byte? CertificationLevelId { get; init; }
    public short? StateId { get; init; }

    [StringLength(1000)]
    public string? Description { get; init; }

    [StringLength(1000)]
    public string? EligibilityCriteria { get; init; }

    [StringLength(1000)]
    public string? BenefitDescription { get; init; }

    public decimal? OutlayAmount { get; init; }

    [StringLength(30)]
    public string? Status { get; init; }

    public DateOnly? ValidFrom { get; init; }
    public DateOnly? ValidTo { get; init; }

    [StringLength(500), Url]
    public string? ExternalUrl { get; init; }
}

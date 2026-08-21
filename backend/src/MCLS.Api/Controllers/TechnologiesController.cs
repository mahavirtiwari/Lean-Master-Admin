using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Api.Services;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Enums;
using MCLS.Application.Common.Interfaces;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The Technology Upgradation master: the TU-nn technologies an MSME can adopt
/// under the scheme.
///
/// As the design's banner says, a technology added here becomes selectable in
/// Handholding, Assessments, Incentives and Reports, and disabling one hides it
/// from new records while leaving existing records untouched. That is exactly
/// why <c>IsActive</c> is a flag and there is no delete endpoint.
/// </summary>
[ApiController]
[Route("api/technologies")]
public sealed class TechnologiesController(MclsDbContext db, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>The Technology List, with search plus category and status filters.</summary>
    [HttpGet]
    [HasPermission(Permissions.TechnologyUpgradation, Permissions.View)]
    public async Task<IActionResult> GetTechnologies(
        [FromQuery] string? search,
        [FromQuery] short? categoryId,
        [FromQuery] short? sectorId,
        [FromQuery] bool? isActive,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var query = db.Technologies.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(t => t.Name.Contains(term) || t.Code.Contains(term));
        }

        if (categoryId is { } category) query = query.Where(t => t.TechnologyCategoryId == category);
        if (sectorId is { } sector) query = query.Where(t => t.SectorId == sector);
        if (isActive is { } active) query = query.Where(t => t.IsActive == active);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderBy(t => t.Code)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new TechnologyDto(
                t.TechnologyId,
                t.Code,
                t.Name,
                t.Description,
                t.TechnologyCategoryId,
                t.TechnologyCategory.Name,
                t.SectorId,
                t.Sector != null ? t.Sector.Name : null,
                t.IsActive))
            .ToListAsync(ct);

        return Ok(PagedResult<TechnologyDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>The four counters across the top of the screen.</summary>
    [HttpGet("summary")]
    [HasPermission(Permissions.TechnologyUpgradation, Permissions.View)]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
        => Ok(new
        {
            totalTechnologies = await db.Technologies.CountAsync(ct),
            active = await db.Technologies.CountAsync(t => t.IsActive, ct),
            categories = await db.TechnologyCategories.CountAsync(c => c.IsActive, ct),
            msmesAdopted = await db.Enterprises.CountAsync(ct),
        });

    /// <summary>Categories for the Add Technology form's dropdown.</summary>
    [HttpGet("categories")]
    [HasPermission(Permissions.TechnologyUpgradation, Permissions.View)]
    public async Task<IActionResult> GetCategories(CancellationToken ct)
        => Ok(await db.TechnologyCategories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .Select(c => new TechnologyCategoryDto(c.TechnologyCategoryId, c.Name))
            .ToListAsync(ct));

    /// <summary>One technology, for the Edit Technology screen.</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.TechnologyUpgradation, Permissions.View)]
    public async Task<IActionResult> GetTechnology(short id, CancellationToken ct)
    {
        var technology = await db.Technologies.AsNoTracking()
            .Where(t => t.TechnologyId == id)
            .Select(t => new TechnologyDto(
                t.TechnologyId, t.Code, t.Name, t.Description,
                t.TechnologyCategoryId, t.TechnologyCategory.Name,
                t.SectorId, t.Sector != null ? t.Sector.Name : null, t.IsActive))
            .SingleOrDefaultAsync(ct);

        return technology is null ? NotFound() : Ok(technology);
    }

    /// <summary>Adds a technology from the "Add Technology" card.</summary>
    [HttpPost]
    [HasPermission(Permissions.TechnologyUpgradation, Permissions.Create)]
    public async Task<IActionResult> CreateTechnology([FromBody] TechnologySaveRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim();

        if (await db.Technologies.AnyAsync(t => t.Code == code, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Technology code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        var technology = new Technology
        {
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            TechnologyCategoryId = request.TechnologyCategoryId,
            SectorId = request.SectorId,
            IsActive = true,
        };

        db.Technologies.Add(technology);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetTechnology), new { id = technology.TechnologyId }, null);
    }

    /// <summary>Saves the Edit Technology screen.</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.TechnologyUpgradation, Permissions.Edit)]
    public async Task<IActionResult> UpdateTechnology(short id, [FromBody] TechnologySaveRequest request, CancellationToken ct)
    {
        var technology = await db.Technologies.AsTracking().SingleOrDefaultAsync(t => t.TechnologyId == id, ct);
        if (technology is null) return NotFound();

        var code = request.Code.Trim();

        if (await db.Technologies.AnyAsync(t => t.Code == code && t.TechnologyId != id, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Technology code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        technology.Code = code;
        technology.Name = request.Name.Trim();
        technology.Description = request.Description?.Trim();
        technology.TechnologyCategoryId = request.TechnologyCategoryId;
        technology.SectorId = request.SectorId;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>The Enable / Disable Technology dialogs.</summary>
    [HttpPost("{id:int}/status")]
    [HasPermission(Permissions.TechnologyUpgradation, Permissions.Edit)]
    public async Task<IActionResult> SetStatus(short id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var technology = await db.Technologies.AsTracking().SingleOrDefaultAsync(t => t.TechnologyId == id, ct);
        if (technology is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            ModelState.AddModelError(nameof(request.Reason), StatusChanges.ReasonRequired);
            return ValidationProblem(ModelState);
        }

        StatusChanges.Record(
            db, "Technology", id, technology.Name,
            technology.IsActive, request.IsActive, request.Reason, currentUser.UserId);

        technology.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }
}

public sealed record TechnologyDto(
    short TechnologyId,
    string Code,
    string Name,
    string? Description,
    short TechnologyCategoryId,
    string CategoryName,
    short? SectorId,
    string? SectorName,
    bool IsActive);

public sealed record TechnologyCategoryDto(short TechnologyCategoryId, string Name);

public sealed class TechnologySaveRequest
{
    [Required, StringLength(20)]
    public string Code { get; init; } = string.Empty;

    [Required, StringLength(200)]
    public string Name { get; init; } = string.Empty;

    // The design caps the description field at 300 characters and shows a
    // live counter, so the server enforces the same limit.
    [StringLength(300)]
    public string? Description { get; init; }

    [Required]
    public short TechnologyCategoryId { get; init; }

    public short? SectorId { get; init; }
}

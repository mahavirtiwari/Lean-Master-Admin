using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Api.Services;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// NIC 2008 industrial divisions offered to an MSME during registration.
///
/// Sectors are never deleted, only disabled: enterprises and technologies point
/// at them, and removing a row would orphan records that are years old. The
/// "Disable" action on the design is therefore a status change, which is also
/// why the list has an All / Active / Inactive filter rather than a bin.
/// </summary>
[ApiController]
[Route("api/sectors")]
public sealed class SectorsController(MclsDbContext db) : ControllerBase
{
    /// <summary>The sector list behind Masters &gt; Sectors, with its search and status filter.</summary>
    [HttpGet]
    [HasPermission(Permissions.Sectors, Permissions.View)]
    public async Task<IActionResult> GetSectors(
        [FromQuery] string? search,
        [FromQuery] bool? isActive,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var query = db.Sectors.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(s => s.Name.Contains(term) || s.NicCode.Contains(term));
        }

        if (isActive is { } active)
        {
            query = query.Where(s => s.IsActive == active);
        }

        var total = await query.CountAsync(ct);

        // MSMEs mapped is a column on the design, so it is counted here rather
        // than left to the client to fetch per row.
        var items = await query
            .OrderBy(s => s.NicCode)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(s => new SectorRowDto(
                s.SectorId,
                s.NicCode,
                s.Name,
                s.Description,
                s.IsActive,
                db.Enterprises.Count(e => e.SectorId == s.SectorId)))
            .ToListAsync(ct);

        return Ok(PagedResult<SectorRowDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>Header counters shown above the list.</summary>
    [HttpGet("summary")]
    [HasPermission(Permissions.Sectors, Permissions.View)]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
        => Ok(new
        {
            total = await db.Sectors.CountAsync(ct),
            active = await db.Sectors.CountAsync(s => s.IsActive, ct),
            mapped = await db.Enterprises.CountAsync(ct),
        });

    /// <summary>Adds a sector from the "Add Sector" card.</summary>
    [HttpPost]
    [HasPermission(Permissions.Sectors, Permissions.Create)]
    public async Task<IActionResult> CreateSector([FromBody] SectorSaveRequest request, CancellationToken ct)
    {
        var code = request.NicCode.Trim();

        if (await db.Sectors.AnyAsync(s => s.NicCode == code, ct))
        {
            ModelState.AddModelError(nameof(request.NicCode), $"Sector code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        var sector = new Sector
        {
            NicCode = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            IsActive = true,
        };

        db.Sectors.Add(sector);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetSector), new { id = sector.SectorId }, ToDto(sector, 0));
    }

    /// <summary>One sector, for the edit form.</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Sectors, Permissions.View)]
    public async Task<IActionResult> GetSector(short id, CancellationToken ct)
    {
        var sector = await db.Sectors.AsNoTracking()
            .SingleOrDefaultAsync(s => s.SectorId == id, ct);

        if (sector is null) return NotFound();

        var mapped = await db.Enterprises.CountAsync(e => e.SectorId == id, ct);
        return Ok(ToDto(sector, mapped));
    }

    /// <summary>Saves the Edit Sector screen.</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Sectors, Permissions.Edit)]
    public async Task<IActionResult> UpdateSector(short id, [FromBody] SectorSaveRequest request, CancellationToken ct)
    {
        var sector = await db.Sectors.AsTracking().SingleOrDefaultAsync(s => s.SectorId == id, ct);
        if (sector is null) return NotFound();

        var code = request.NicCode.Trim();

        if (await db.Sectors.AnyAsync(s => s.NicCode == code && s.SectorId != id, ct))
        {
            ModelState.AddModelError(nameof(request.NicCode), $"Sector code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        sector.NicCode = code;
        sector.Name = request.Name.Trim();
        sector.Description = request.Description?.Trim();

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The Enable / Disable confirmation dialogs. Disabling hides the sector
    /// from new registrations; enterprises already mapped to it keep working.
    /// </summary>
    [HttpPost("{id:int}/status")]
    [HasPermission(Permissions.Sectors, Permissions.Edit)]
    public async Task<IActionResult> SetStatus(short id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var sector = await db.Sectors.AsTracking().SingleOrDefaultAsync(s => s.SectorId == id, ct);
        if (sector is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            ModelState.AddModelError(nameof(request.Reason), StatusChanges.ReasonRequired);
            return ValidationProblem(ModelState);
        }

        StatusChanges.Record(
            db, "Sector", id, sector.Name,
            sector.IsActive, request.IsActive, request.Reason, currentUser.UserId);

        sector.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    private static SectorRowDto ToDto(Sector s, int mapped)
        => new(s.SectorId, s.NicCode, s.Name, s.Description, s.IsActive, mapped);
}

public sealed record SectorRowDto(
    short SectorId,
    string NicCode,
    string Name,
    string? Description,
    bool IsActive,
    int MsmesMapped);

public sealed class SectorSaveRequest
{
    [Required, StringLength(10)]
    public string NicCode { get; init; } = string.Empty;

    [Required, StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; init; }
}

/// <summary>Shared by every master's enable / disable dialog.</summary>
public sealed class StatusChangeRequest
{
    public bool IsActive { get; init; }

    [StringLength(500)]
    public string? Reason { get; init; }
}

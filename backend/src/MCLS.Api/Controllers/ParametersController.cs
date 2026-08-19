using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The LEAN parameters an assessor scores against, e.g. LP-01 "5S — Workplace
/// Organisation".
///
/// A parameter is referenced by every questionnaire requirement, so like
/// sectors these are disabled rather than deleted.
/// </summary>
[ApiController]
[Route("api/parameters")]
public sealed class ParametersController(MclsDbContext db) : ControllerBase
{
    /// <summary>The LEAN Parameters list, with search and status filter.</summary>
    [HttpGet]
    [HasPermission(Permissions.Parameter, Permissions.View)]
    public async Task<IActionResult> GetParameters(
        [FromQuery] string? search,
        [FromQuery] bool? isActive,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var query = db.Parameters.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(p => p.Name.Contains(term) || p.Code.Contains(term));
        }

        if (isActive is { } active)
        {
            query = query.Where(p => p.IsActive == active);
        }

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderBy(p => p.SortOrder).ThenBy(p => p.Code)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(p => new ParameterRowDto(
                p.ParameterId, p.Code, p.Name, p.Description, p.SortOrder, p.IsActive))
            .ToListAsync(ct);

        return Ok(PagedResult<ParameterRowDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>One parameter, for the Edit Parameter screen.</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Parameter, Permissions.View)]
    public async Task<IActionResult> GetParameter(short id, CancellationToken ct)
    {
        var parameter = await db.Parameters.AsNoTracking()
            .Where(p => p.ParameterId == id)
            .Select(p => new ParameterRowDto(
                p.ParameterId, p.Code, p.Name, p.Description, p.SortOrder, p.IsActive))
            .SingleOrDefaultAsync(ct);

        return parameter is null ? NotFound() : Ok(parameter);
    }

    /// <summary>Adds a parameter from the "Add Parameter" card.</summary>
    [HttpPost]
    [HasPermission(Permissions.Parameter, Permissions.Create)]
    public async Task<IActionResult> CreateParameter([FromBody] ParameterSaveRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim();

        if (await db.Parameters.AnyAsync(p => p.Code == code, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Parameter code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        // Appended to the end of the list unless the caller places it, which
        // keeps the assessor-facing order stable when a parameter is added.
        var sortOrder = request.SortOrder
            ?? (short)(await db.Parameters.MaxAsync(p => (short?)p.SortOrder, ct) ?? 0) + 1;

        var parameter = new Parameter
        {
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            SortOrder = (short)sortOrder,
            IsActive = true,
        };

        db.Parameters.Add(parameter);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(
            nameof(GetParameter),
            new { id = parameter.ParameterId },
            new ParameterRowDto(parameter.ParameterId, parameter.Code, parameter.Name,
                parameter.Description, parameter.SortOrder, parameter.IsActive));
    }

    /// <summary>Saves the Edit Parameter screen.</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Parameter, Permissions.Edit)]
    public async Task<IActionResult> UpdateParameter(short id, [FromBody] ParameterSaveRequest request, CancellationToken ct)
    {
        var parameter = await db.Parameters.AsTracking().SingleOrDefaultAsync(p => p.ParameterId == id, ct);
        if (parameter is null) return NotFound();

        var code = request.Code.Trim();

        if (await db.Parameters.AnyAsync(p => p.Code == code && p.ParameterId != id, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Parameter code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        parameter.Code = code;
        parameter.Name = request.Name.Trim();
        parameter.Description = request.Description?.Trim();
        if (request.SortOrder is { } order) parameter.SortOrder = order;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>The Enable / Disable Parameter dialogs.</summary>
    [HttpPost("{id:int}/status")]
    [HasPermission(Permissions.Parameter, Permissions.Edit)]
    public async Task<IActionResult> SetStatus(short id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var parameter = await db.Parameters.AsTracking().SingleOrDefaultAsync(p => p.ParameterId == id, ct);
        if (parameter is null) return NotFound();

        parameter.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }
}

public sealed record ParameterRowDto(
    short ParameterId,
    string Code,
    string Name,
    string? Description,
    short SortOrder,
    bool IsActive);

public sealed class ParameterSaveRequest
{
    [Required, StringLength(20)]
    public string Code { get; init; } = string.Empty;

    [Required, StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [StringLength(500)]
    public string? Description { get; init; }

    public short? SortOrder { get; init; }
}

using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Api.Services;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The two configurable lists the application collects before ESG: the Basic
/// Information items (site photographs, declarations, energy sources) and the
/// document-upload checklist. Both are one super-admin menu, so they share a
/// controller and a permission (<c>BASIC_INFO_DOCS</c>).
/// </summary>
[ApiController]
[Route("api/application-forms")]
public sealed class ApplicationFormsController(MclsDbContext db, ICurrentUser currentUser) : ControllerBase
{
    private static readonly string[] InputTypes = ["photo", "yesno", "text", "number", "checklist"];

    // -------------------------------------------------------- basic info items ---

    [HttpGet("basic-info")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.View)]
    public async Task<IActionResult> GetBasicInfoItems([FromQuery] bool includeInactive = false, CancellationToken ct = default)
    {
        var query = db.BasicInfoItems.AsNoTracking();
        if (!includeInactive) query = query.Where(i => i.IsActive);

        var items = await query
            .OrderBy(i => i.SortOrder).ThenBy(i => i.Code)
            .Select(i => new BasicInfoItemDto(
                i.BasicInfoItemId, i.Code, i.GroupName, i.Label, i.HelpText,
                i.InputType, i.IsRequired, i.SortOrder, i.IsActive))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost("basic-info")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.Create)]
    public async Task<IActionResult> CreateBasicInfoItem([FromBody] BasicInfoItemSaveRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim();

        if (!InputTypes.Contains(request.InputType))
        {
            ModelState.AddModelError(nameof(request.InputType), "Choose a valid input type.");
            return ValidationProblem(ModelState);
        }
        if (await db.BasicInfoItems.AnyAsync(i => i.Code == code, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Item code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        var sortOrder = request.SortOrder
            ?? (short)((await db.BasicInfoItems.MaxAsync(i => (short?)i.SortOrder, ct) ?? 0) + 1);

        var item = new BasicInfoItem
        {
            Code = code,
            GroupName = request.GroupName.Trim(),
            Label = request.Label.Trim(),
            HelpText = request.HelpText?.Trim(),
            InputType = request.InputType,
            IsRequired = request.IsRequired,
            SortOrder = sortOrder,
            IsActive = true,
        };

        db.BasicInfoItems.Add(item);
        await db.SaveChangesAsync(ct);

        return Ok(new BasicInfoItemDto(item.BasicInfoItemId, item.Code, item.GroupName, item.Label,
            item.HelpText, item.InputType, item.IsRequired, item.SortOrder, item.IsActive));
    }

    [HttpPut("basic-info/{id:int}")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.Edit)]
    public async Task<IActionResult> UpdateBasicInfoItem(short id, [FromBody] BasicInfoItemSaveRequest request, CancellationToken ct)
    {
        var item = await db.BasicInfoItems.AsTracking().SingleOrDefaultAsync(i => i.BasicInfoItemId == id, ct);
        if (item is null) return NotFound();

        var code = request.Code.Trim();
        if (!InputTypes.Contains(request.InputType))
        {
            ModelState.AddModelError(nameof(request.InputType), "Choose a valid input type.");
            return ValidationProblem(ModelState);
        }
        if (await db.BasicInfoItems.AnyAsync(i => i.Code == code && i.BasicInfoItemId != id, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Item code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        item.Code = code;
        item.GroupName = request.GroupName.Trim();
        item.Label = request.Label.Trim();
        item.HelpText = request.HelpText?.Trim();
        item.InputType = request.InputType;
        item.IsRequired = request.IsRequired;
        if (request.SortOrder is { } order) item.SortOrder = order;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("basic-info/{id:int}/status")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.Edit)]
    public async Task<IActionResult> SetBasicInfoStatus(short id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var item = await db.BasicInfoItems.AsTracking().SingleOrDefaultAsync(i => i.BasicInfoItemId == id, ct);
        if (item is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            ModelState.AddModelError(nameof(request.Reason), StatusChanges.ReasonRequired);
            return ValidationProblem(ModelState);
        }

        StatusChanges.Record(db, "BasicInfoItem", id, item.Label,
            item.IsActive, request.IsActive, request.Reason, currentUser.UserId);

        item.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ------------------------------------------------- document requirements ---

    [HttpGet("documents")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.View)]
    public async Task<IActionResult> GetDocumentRequirements([FromQuery] bool includeInactive = false, CancellationToken ct = default)
    {
        var query = db.DocumentRequirements.AsNoTracking();
        if (!includeInactive) query = query.Where(d => d.IsActive);

        var items = await query
            .OrderBy(d => d.SortOrder).ThenBy(d => d.Code)
            .Select(d => new DocumentRequirementDto(
                d.DocumentRequirementId, d.Code, d.Name, d.HelpText, d.CertificationLevelId,
                d.AcceptedTypes, d.IsMandatory, d.SortOrder, d.IsActive))
            .ToListAsync(ct);

        return Ok(items);
    }

    [HttpPost("documents")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.Create)]
    public async Task<IActionResult> CreateDocumentRequirement([FromBody] DocumentRequirementSaveRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim();
        if (await db.DocumentRequirements.AnyAsync(d => d.Code == code, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Document code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        var sortOrder = request.SortOrder
            ?? (short)((await db.DocumentRequirements.MaxAsync(d => (short?)d.SortOrder, ct) ?? 0) + 1);

        var item = new DocumentRequirement
        {
            Code = code,
            Name = request.Name.Trim(),
            HelpText = request.HelpText?.Trim(),
            CertificationLevelId = request.CertificationLevelId,
            AcceptedTypes = string.IsNullOrWhiteSpace(request.AcceptedTypes)
                ? "image/*,application/pdf" : request.AcceptedTypes.Trim(),
            IsMandatory = request.IsMandatory,
            SortOrder = sortOrder,
            IsActive = true,
        };

        db.DocumentRequirements.Add(item);
        await db.SaveChangesAsync(ct);

        return Ok(new DocumentRequirementDto(item.DocumentRequirementId, item.Code, item.Name,
            item.HelpText, item.CertificationLevelId, item.AcceptedTypes, item.IsMandatory,
            item.SortOrder, item.IsActive));
    }

    [HttpPut("documents/{id:int}")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.Edit)]
    public async Task<IActionResult> UpdateDocumentRequirement(short id, [FromBody] DocumentRequirementSaveRequest request, CancellationToken ct)
    {
        var item = await db.DocumentRequirements.AsTracking().SingleOrDefaultAsync(d => d.DocumentRequirementId == id, ct);
        if (item is null) return NotFound();

        var code = request.Code.Trim();
        if (await db.DocumentRequirements.AnyAsync(d => d.Code == code && d.DocumentRequirementId != id, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Document code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        item.Code = code;
        item.Name = request.Name.Trim();
        item.HelpText = request.HelpText?.Trim();
        item.CertificationLevelId = request.CertificationLevelId;
        if (!string.IsNullOrWhiteSpace(request.AcceptedTypes)) item.AcceptedTypes = request.AcceptedTypes.Trim();
        item.IsMandatory = request.IsMandatory;
        if (request.SortOrder is { } order) item.SortOrder = order;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("documents/{id:int}/status")]
    [HasPermission(Permissions.BasicInfoDocs, Permissions.Edit)]
    public async Task<IActionResult> SetDocumentStatus(short id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var item = await db.DocumentRequirements.AsTracking().SingleOrDefaultAsync(d => d.DocumentRequirementId == id, ct);
        if (item is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            ModelState.AddModelError(nameof(request.Reason), StatusChanges.ReasonRequired);
            return ValidationProblem(ModelState);
        }

        StatusChanges.Record(db, "DocumentRequirement", id, item.Name,
            item.IsActive, request.IsActive, request.Reason, currentUser.UserId);

        item.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

public sealed record BasicInfoItemDto(
    short BasicInfoItemId, string Code, string GroupName, string Label, string? HelpText,
    string InputType, bool IsRequired, short SortOrder, bool IsActive);

public sealed record DocumentRequirementDto(
    short DocumentRequirementId, string Code, string Name, string? HelpText,
    byte? CertificationLevelId, string AcceptedTypes, bool IsMandatory, short SortOrder, bool IsActive);

public sealed class BasicInfoItemSaveRequest
{
    [Required, StringLength(30)] public string Code { get; init; } = string.Empty;
    [Required, StringLength(100)] public string GroupName { get; init; } = string.Empty;
    [Required, StringLength(300)] public string Label { get; init; } = string.Empty;
    [StringLength(300)] public string? HelpText { get; init; }
    [Required, StringLength(20)] public string InputType { get; init; } = "text";
    public bool IsRequired { get; init; } = true;
    public short? SortOrder { get; init; }
}

public sealed class DocumentRequirementSaveRequest
{
    [Required, StringLength(30)] public string Code { get; init; } = string.Empty;
    [Required, StringLength(300)] public string Name { get; init; } = string.Empty;
    [StringLength(300)] public string? HelpText { get; init; }
    public byte? CertificationLevelId { get; init; }
    [StringLength(200)] public string? AcceptedTypes { get; init; }
    public bool IsMandatory { get; init; } = true;
    public short? SortOrder { get; init; }
}

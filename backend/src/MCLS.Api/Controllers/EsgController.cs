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
/// The ESG checklist an applicant answers on the LEAN Silver application:
/// sections holding Yes / No / Not Applicable questions, some of which appear
/// only when a parent question was answered a particular way.
///
/// Administered like Sectors and Parameters — a section or question in use is
/// disabled rather than deleted, so an application already answered against it
/// keeps its meaning.
/// </summary>
[ApiController]
[Route("api/esg")]
public sealed class EsgController(MclsDbContext db, ICurrentUser currentUser) : ControllerBase
{
    // ---------------------------------------------------------------- sections ---

    /// <summary>Every section with its question count, in display order.</summary>
    [HttpGet("sections")]
    [HasPermission(Permissions.EsgChecklist, Permissions.View)]
    public async Task<IActionResult> GetSections([FromQuery] bool includeInactive = false, CancellationToken ct = default)
    {
        var query = db.EsgSections.AsNoTracking();
        if (!includeInactive) query = query.Where(s => s.IsActive);

        var sections = await query
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Code)
            .Select(s => new EsgSectionDto(
                s.EsgSectionId, s.Code, s.Name, s.Description, s.SortOrder, s.IsActive,
                s.Questions.Count(q => q.IsActive)))
            .ToListAsync(ct);

        return Ok(sections);
    }

    [HttpPost("sections")]
    [HasPermission(Permissions.EsgChecklist, Permissions.Create)]
    public async Task<IActionResult> CreateSection([FromBody] EsgSectionSaveRequest request, CancellationToken ct)
    {
        var code = request.Code.Trim();

        if (await db.EsgSections.AnyAsync(s => s.Code == code, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Section code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        var sortOrder = request.SortOrder
            ?? (short)((await db.EsgSections.MaxAsync(s => (short?)s.SortOrder, ct) ?? 0) + 1);

        var section = new EsgSection
        {
            Code = code,
            Name = request.Name.Trim(),
            Description = request.Description?.Trim(),
            SortOrder = sortOrder,
            IsActive = true,
        };

        db.EsgSections.Add(section);
        await db.SaveChangesAsync(ct);

        return Ok(new EsgSectionDto(
            section.EsgSectionId, section.Code, section.Name, section.Description,
            section.SortOrder, section.IsActive, 0));
    }

    [HttpPut("sections/{id:int}")]
    [HasPermission(Permissions.EsgChecklist, Permissions.Edit)]
    public async Task<IActionResult> UpdateSection(short id, [FromBody] EsgSectionSaveRequest request, CancellationToken ct)
    {
        var section = await db.EsgSections.AsTracking().SingleOrDefaultAsync(s => s.EsgSectionId == id, ct);
        if (section is null) return NotFound();

        var code = request.Code.Trim();
        if (await db.EsgSections.AnyAsync(s => s.Code == code && s.EsgSectionId != id, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Section code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        section.Code = code;
        section.Name = request.Name.Trim();
        section.Description = request.Description?.Trim();
        if (request.SortOrder is { } order) section.SortOrder = order;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("sections/{id:int}/status")]
    [HasPermission(Permissions.EsgChecklist, Permissions.Edit)]
    public async Task<IActionResult> SetSectionStatus(short id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var section = await db.EsgSections.AsTracking().SingleOrDefaultAsync(s => s.EsgSectionId == id, ct);
        if (section is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            ModelState.AddModelError(nameof(request.Reason), StatusChanges.ReasonRequired);
            return ValidationProblem(ModelState);
        }

        StatusChanges.Record(db, "EsgSection", id, section.Name,
            section.IsActive, request.IsActive, request.Reason, currentUser.UserId);

        section.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // --------------------------------------------------------------- questions ---

    /// <summary>The questions in one section, parents before the children they gate.</summary>
    [HttpGet("sections/{sectionId:int}/questions")]
    [HasPermission(Permissions.EsgChecklist, Permissions.View)]
    public async Task<IActionResult> GetQuestions(short sectionId, [FromQuery] bool includeInactive = false, CancellationToken ct = default)
    {
        var query = db.EsgQuestions.AsNoTracking().Where(q => q.EsgSectionId == sectionId);
        if (!includeInactive) query = query.Where(q => q.IsActive);

        var questions = await query
            .OrderBy(q => q.SortOrder).ThenBy(q => q.EsgQuestionId)
            .Select(q => new EsgQuestionDto(
                q.EsgQuestionId, q.EsgSectionId, q.Code, q.Text, q.HelpText, q.SortOrder,
                q.ParentQuestionId, q.Parent != null ? q.Parent.Text : null,
                q.ShowWhenAnswer, q.IsActive))
            .ToListAsync(ct);

        return Ok(questions);
    }

    [HttpPost("questions")]
    [HasPermission(Permissions.EsgChecklist, Permissions.Create)]
    public async Task<IActionResult> CreateQuestion([FromBody] EsgQuestionSaveRequest request, CancellationToken ct)
    {
        var error = await ValidateQuestionAsync(request, null, ct);
        if (error is not null) return error;

        var code = request.Code.Trim();
        var sortOrder = request.SortOrder
            ?? (short)((await db.EsgQuestions.Where(q => q.EsgSectionId == request.EsgSectionId)
                    .MaxAsync(q => (short?)q.SortOrder, ct) ?? 0) + 1);

        var question = new EsgQuestion
        {
            EsgSectionId = request.EsgSectionId,
            Code = code,
            Text = request.Text.Trim(),
            HelpText = request.HelpText?.Trim(),
            SortOrder = sortOrder,
            ParentQuestionId = request.ParentQuestionId,
            ShowWhenAnswer = request.ParentQuestionId is null ? null : request.ShowWhenAnswer,
            IsActive = true,
        };

        db.EsgQuestions.Add(question);
        await db.SaveChangesAsync(ct);

        return Ok(new EsgQuestionDto(
            question.EsgQuestionId, question.EsgSectionId, question.Code, question.Text,
            question.HelpText, question.SortOrder, question.ParentQuestionId, null,
            question.ShowWhenAnswer, question.IsActive));
    }

    [HttpPut("questions/{id:int}")]
    [HasPermission(Permissions.EsgChecklist, Permissions.Edit)]
    public async Task<IActionResult> UpdateQuestion(int id, [FromBody] EsgQuestionSaveRequest request, CancellationToken ct)
    {
        var question = await db.EsgQuestions.AsTracking().SingleOrDefaultAsync(q => q.EsgQuestionId == id, ct);
        if (question is null) return NotFound();

        var error = await ValidateQuestionAsync(request, id, ct);
        if (error is not null) return error;

        question.EsgSectionId = request.EsgSectionId;
        question.Code = request.Code.Trim();
        question.Text = request.Text.Trim();
        question.HelpText = request.HelpText?.Trim();
        if (request.SortOrder is { } order) question.SortOrder = order;
        question.ParentQuestionId = request.ParentQuestionId;
        question.ShowWhenAnswer = request.ParentQuestionId is null ? null : request.ShowWhenAnswer;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    [HttpPost("questions/{id:int}/status")]
    [HasPermission(Permissions.EsgChecklist, Permissions.Edit)]
    public async Task<IActionResult> SetQuestionStatus(int id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var question = await db.EsgQuestions.AsTracking().SingleOrDefaultAsync(q => q.EsgQuestionId == id, ct);
        if (question is null) return NotFound();

        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            ModelState.AddModelError(nameof(request.Reason), StatusChanges.ReasonRequired);
            return ValidationProblem(ModelState);
        }

        // Disabling a parent would orphan the questions that depend on it; block
        // it while any active child still points here.
        if (question.IsActive && !request.IsActive)
        {
            var activeChildren = await db.EsgQuestions
                .CountAsync(q => q.ParentQuestionId == id && q.IsActive, ct);
            if (activeChildren > 0)
            {
                ModelState.AddModelError(nameof(request.IsActive),
                    $"Disable the {activeChildren} dependent question(s) first — they are shown only by this one.");
                return ValidationProblem(ModelState);
            }
        }

        StatusChanges.Record(db, "EsgQuestion", id, question.Code,
            question.IsActive, request.IsActive, request.Reason, currentUser.UserId);

        question.IsActive = request.IsActive;
        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The questions in a section that may serve as a parent for a conditional
    /// question — everything active except the one being edited and its own
    /// descendants, so a cycle cannot be built.
    /// </summary>
    [HttpGet("sections/{sectionId:int}/parent-options")]
    [HasPermission(Permissions.EsgChecklist, Permissions.View)]
    public async Task<IActionResult> GetParentOptions(short sectionId, [FromQuery] int? excludeQuestionId, CancellationToken ct)
    {
        var candidates = await db.EsgQuestions.AsNoTracking()
            .Where(q => q.EsgSectionId == sectionId && q.IsActive)
            .OrderBy(q => q.SortOrder)
            .Select(q => new { q.EsgQuestionId, q.Code, q.Text, q.ParentQuestionId })
            .ToListAsync(ct);

        var excluded = new HashSet<int>();
        if (excludeQuestionId is int id)
        {
            excluded.Add(id);
            // Walk down: any question whose parent chain reaches id is a
            // descendant and cannot become its parent.
            bool added = true;
            while (added)
            {
                added = false;
                foreach (var c in candidates)
                {
                    if (c.ParentQuestionId is int p && excluded.Contains(p) && excluded.Add(c.EsgQuestionId))
                        added = true;
                }
            }
        }

        return Ok(candidates
            .Where(c => !excluded.Contains(c.EsgQuestionId))
            .Select(c => new { c.EsgQuestionId, c.Code, c.Text }));
    }

    private async Task<IActionResult?> ValidateQuestionAsync(EsgQuestionSaveRequest request, int? editingId, CancellationToken ct)
    {
        var code = request.Code.Trim();

        if (!await db.EsgSections.AnyAsync(s => s.EsgSectionId == request.EsgSectionId, ct))
        {
            ModelState.AddModelError(nameof(request.EsgSectionId), "The section does not exist.");
            return ValidationProblem(ModelState);
        }

        if (await db.EsgQuestions.AnyAsync(q => q.Code == code && q.EsgQuestionId != editingId, ct))
        {
            ModelState.AddModelError(nameof(request.Code), $"Question code {code} already exists.");
            return ValidationProblem(ModelState);
        }

        if (request.ParentQuestionId is int parentId)
        {
            if (parentId == editingId)
            {
                ModelState.AddModelError(nameof(request.ParentQuestionId), "A question cannot depend on itself.");
                return ValidationProblem(ModelState);
            }

            var parent = await db.EsgQuestions.AsNoTracking()
                .SingleOrDefaultAsync(q => q.EsgQuestionId == parentId, ct);

            if (parent is null || parent.EsgSectionId != request.EsgSectionId)
            {
                ModelState.AddModelError(nameof(request.ParentQuestionId),
                    "The parent question must be an existing question in the same section.");
                return ValidationProblem(ModelState);
            }

            if (request.ShowWhenAnswer is not ("Yes" or "No"))
            {
                ModelState.AddModelError(nameof(request.ShowWhenAnswer),
                    "Choose whether the question appears on Yes or on No.");
                return ValidationProblem(ModelState);
            }
        }

        return null;
    }
}

public sealed record EsgSectionDto(
    short EsgSectionId, string Code, string Name, string? Description,
    short SortOrder, bool IsActive, int QuestionCount);

public sealed record EsgQuestionDto(
    int EsgQuestionId, short EsgSectionId, string Code, string Text, string? HelpText,
    short SortOrder, int? ParentQuestionId, string? ParentText, string? ShowWhenAnswer, bool IsActive);

public sealed class EsgSectionSaveRequest
{
    [Required, StringLength(30)] public string Code { get; init; } = string.Empty;
    [Required, StringLength(200)] public string Name { get; init; } = string.Empty;
    [StringLength(500)] public string? Description { get; init; }
    public short? SortOrder { get; init; }
}

public sealed class EsgQuestionSaveRequest
{
    [Required] public short EsgSectionId { get; init; }
    [Required, StringLength(30)] public string Code { get; init; } = string.Empty;
    [Required, StringLength(1000)] public string Text { get; init; } = string.Empty;
    [StringLength(500)] public string? HelpText { get; init; }
    public short? SortOrder { get; init; }
    public int? ParentQuestionId { get; init; }
    [StringLength(3)] public string? ShowWhenAnswer { get; init; }
}

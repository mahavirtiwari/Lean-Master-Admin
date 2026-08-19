using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Assess;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The Questionnaire Manager behind the Silver and Gold sub-menus: the
/// requirements an assessor works through and the checkpoints under each.
///
/// Silver and Gold are separate modules in the permission matrix, so the level
/// on the route decides which permission is required. That is why the actions
/// take a level and resolve the permission themselves rather than carrying a
/// fixed <c>[HasPermission]</c> attribute — a single QUESTIONNAIRE right would
/// let someone cleared for Silver rewrite the Gold standard.
/// </summary>
[ApiController]
[Route("api/questionnaires")]
public sealed class QuestionnairesController(
    MclsDbContext db,
    ICurrentUser currentUser,
    IDateTimeProvider clock) : ControllerBase
{
    /// <summary>
    /// Everything the Questionnaire Manager draws (5-green.svg): the three
    /// level cards, the weightages table and the question bank.
    ///
    /// The bank is a flattened view of Questionnaire → Requirement →
    /// Checkpoint: a "question" on this screen is a checkpoint, and its
    /// Course/Module is the requirement it hangs off. That is why there is no
    /// separate question table — the assessment content already has this shape.
    /// </summary>
    [HttpGet("manager")]
    public async Task<IActionResult> GetManager(
        [FromQuery] string? level,
        [FromQuery] string? search,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        if (!CanView(level)) return Forbid();

        var levels = await db.CertificationLevels.AsNoTracking()
            .OrderBy(l => l.SortOrder)
            .Select(l => new
            {
                l.CertificationLevelId,
                l.Code,
                l.Name,
                Questions = db.Checkpoints.Count(c =>
                    c.Requirement.Questionnaire.CertificationLevelId == l.CertificationLevelId && c.IsActive),
                Modules = db.Requirements.Count(r =>
                    r.Questionnaire.CertificationLevelId == l.CertificationLevelId && r.IsActive),
                PassMark = db.ExamConfigs
                    .Where(e => e.CertificationLevelId == l.CertificationLevelId)
                    .Select(e => (decimal?)e.PassMarkPercent).FirstOrDefault(),
                // A level reads Published when any questionnaire on it is; the
                // cards distinguish a live standard from one still in draft.
                Status = db.Questionnaires.Any(q =>
                    q.CertificationLevelId == l.CertificationLevelId && q.Status == "Published")
                    ? "Published" : "Draft",
                LastUpdatedUtc = db.Questionnaires
                    .Where(q => q.CertificationLevelId == l.CertificationLevelId)
                    .Max(q => (DateTime?)q.ModifiedOnUtc),
            })
            .ToListAsync(ct);

        var config = await db.ExamConfigs.AsNoTracking()
            .Join(db.CertificationLevels, e => e.CertificationLevelId, l => l.CertificationLevelId,
                (e, l) => new { l.SortOrder, l.Name, l.Code, e })
            .OrderBy(x => x.SortOrder)
            .Select(x => new
            {
                x.Code,
                levelName = x.Name,
                x.e.TotalQuestions,
                x.e.PassMarkPercent,
                x.e.NegativeMarkPerWrong,
                x.e.TimeLimitMinutes,
                x.e.MaxAttempts,
            })
            .ToListAsync(ct);

        // The bank itself, filtered to the level in view when one is given.
        var bank = db.Checkpoints.AsNoTracking().Where(c => c.IsActive);

        if (!string.IsNullOrWhiteSpace(level))
        {
            bank = bank.Where(c => c.Requirement.Questionnaire.CertificationLevel.Code == level);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            bank = bank.Where(c =>
                c.CheckpointText.Contains(term) || c.Requirement.Title.Contains(term));
        }

        var total = await bank.CountAsync(ct);

        var questions = await bank
            .OrderBy(c => c.Requirement.Questionnaire.CertificationLevel.SortOrder)
            .ThenBy(c => c.Requirement.SequenceNo).ThenBy(c => c.SequenceNo)
            .Skip((pageNumber - 1) * pageSize).Take(pageSize)
            .Select(c => new
            {
                c.CheckpointId,
                questionId = "Q-" + c.Requirement.Questionnaire.CertificationLevel.Code.Substring(0, 1)
                             + "-" + c.CheckpointId,
                preview = c.CheckpointText,
                levelCode = c.Requirement.Questionnaire.CertificationLevel.Code,
                levelName = c.Requirement.Questionnaire.CertificationLevel.Name,
                module = c.Requirement.Title,
                // Mandatory checkpoints carry the weight, so they read as the
                // harder ones; there is no separate difficulty column to fake.
                difficulty = c.IsMandatory ? "Hard" : "Medium",
                status = c.IsActive ? "Active" : "Archived",
                version = "v" + c.Requirement.Questionnaire.VersionNo + ".0",
                c.Requirement.RequirementId,
            })
            .ToListAsync(ct);

        return Ok(new
        {
            levels,
            examConfig = config,
            bank = new { items = questions, totalCount = total, pageNumber, pageSize },
        });
    }

    /// <summary>The three level cards across the top of the Questionnaire Manager.</summary>
    [HttpGet("summary")]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
    {
        if (!CanView(null)) return Forbid();

        var levels = await db.CertificationLevels.AsNoTracking()
            .OrderBy(l => l.SortOrder)
            .Select(l => new
            {
                l.CertificationLevelId,
                l.Code,
                l.Name,
                Questions = db.Checkpoints.Count(c =>
                    c.Requirement.Questionnaire.CertificationLevelId == l.CertificationLevelId
                    && c.IsActive),
                Modules = db.Requirements.Count(r =>
                    r.Questionnaire.CertificationLevelId == l.CertificationLevelId
                    && r.IsActive),
                Questionnaires = db.Questionnaires.Count(q =>
                    q.CertificationLevelId == l.CertificationLevelId),
            })
            .ToListAsync(ct);

        return Ok(levels);
    }

    /// <summary>Questionnaires for one certification level.</summary>
    [HttpGet]
    public async Task<IActionResult> GetQuestionnaires(
        [FromQuery] string? level,
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        if (!CanView(level)) return Forbid();

        var query = db.Questionnaires.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(level))
        {
            var code = level.Trim().ToUpperInvariant();
            query = query.Where(q => q.CertificationLevel.Code == code);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(q => q.Name.Contains(term) || q.Code.Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(q => q.Status == status);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(q => q.VersionNo).ThenBy(q => q.Name)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(q => new QuestionnaireDto(
                q.QuestionnaireId, q.Code, q.Name,
                q.CertificationLevelId, q.CertificationLevel.Name,
                q.SectorId, q.Sector != null ? q.Sector.Name : null,
                q.VersionNo, q.Status, q.EffectiveFrom, q.EffectiveTo, q.PublishedOnUtc,
                q.Requirements.Count(r => r.IsActive),
                q.Requirements.SelectMany(r => r.Checkpoints).Count(c => c.IsActive)))
            .ToListAsync(ct);

        return Ok(PagedResult<QuestionnaireDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>One questionnaire with its requirements and checkpoints.</summary>
    [HttpGet("{id:int}")]
    public async Task<IActionResult> GetQuestionnaire(int id, CancellationToken ct)
    {
        var questionnaire = await db.Questionnaires.AsNoTracking()
            .Where(q => q.QuestionnaireId == id)
            .Select(q => new
            {
                q.QuestionnaireId,
                q.Code,
                q.Name,
                q.CertificationLevelId,
                LevelCode = q.CertificationLevel.Code,
                LevelName = q.CertificationLevel.Name,
                q.SectorId,
                SectorName = q.Sector != null ? q.Sector.Name : null,
                q.VersionNo,
                q.Status,
                q.EffectiveFrom,
                q.EffectiveTo,
                Requirements = q.Requirements
                    .Where(r => r.IsActive)
                    .OrderBy(r => r.SequenceNo)
                    .Select(r => new RequirementDto(
                        r.RequirementId, r.ParameterId, r.Parameter.Name,
                        r.SequenceNo, r.Title, r.Narrative, r.Bullets,
                        r.Purpose, r.Benefits, r.SuggestedAction, r.MaxScore,
                        r.Checkpoints
                            .Where(c => c.IsActive)
                            .OrderBy(c => c.SequenceNo)
                            .Select(c => new CheckpointDto(
                                c.CheckpointId, c.SequenceNo, c.CheckpointText,
                                c.Evidence, c.Kpi, c.Unit, c.Frequency,
                                c.ExpectedResponse, c.Weight, c.IsMandatory))
                            .ToList()))
                    .ToList(),
            })
            .SingleOrDefaultAsync(ct);

        if (questionnaire is null) return NotFound();
        if (!CanView(questionnaire.LevelCode)) return Forbid();

        return Ok(questionnaire);
    }

    /// <summary>The Create New Question screen: adds a checkpoint under a requirement.</summary>
    [HttpPost("requirements/{requirementId:int}/checkpoints")]
    public async Task<IActionResult> CreateCheckpoint(
        int requirementId, [FromBody] CheckpointSaveRequest request, CancellationToken ct)
    {
        var requirement = await db.Requirements
            .AsTracking()
            .Include(r => r.Questionnaire).ThenInclude(q => q.CertificationLevel)
            .SingleOrDefaultAsync(r => r.RequirementId == requirementId, ct);

        if (requirement is null) return NotFound();

        var levelCode = requirement.Questionnaire.CertificationLevel.Code;
        if (!CanEdit(levelCode)) return Forbid();

        // A published questionnaire is the standard live assessments are being
        // scored against. Editing it in place would change scores already
        // awarded, so a new version has to be raised instead.
        if (requirement.Questionnaire.Status == "Published")
        {
            return Problem(
                title: "This questionnaire is published.",
                detail: "Raise a new version before adding or changing questions.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var sequence = request.SequenceNo
            ?? (short)((await db.Checkpoints
                .Where(c => c.RequirementId == requirementId)
                .MaxAsync(c => (short?)c.SequenceNo, ct) ?? 0) + 1);

        var checkpoint = new Checkpoint
        {
            RequirementId = requirementId,
            SequenceNo = sequence,
            CheckpointText = request.CheckpointText.Trim(),
            Evidence = request.Evidence?.Trim(),
            Kpi = request.Kpi?.Trim(),
            Unit = request.Unit?.Trim(),
            Frequency = request.Frequency?.Trim(),
            ExpectedResponse = request.ExpectedResponse?.Trim(),
            Weight = request.Weight,
            IsMandatory = request.IsMandatory,
            IsActive = true,
        };

        db.Checkpoints.Add(checkpoint);
        await db.SaveChangesAsync(ct);

        return Ok(new { checkpoint.CheckpointId });
    }

    /// <summary>Edits a checkpoint.</summary>
    [HttpPut("checkpoints/{id:int}")]
    public async Task<IActionResult> UpdateCheckpoint(int id, [FromBody] CheckpointSaveRequest request, CancellationToken ct)
    {
        var checkpoint = await db.Checkpoints
            .AsTracking()
            .Include(c => c.Requirement).ThenInclude(r => r.Questionnaire).ThenInclude(q => q.CertificationLevel)
            .SingleOrDefaultAsync(c => c.CheckpointId == id, ct);

        if (checkpoint is null) return NotFound();
        if (!CanEdit(checkpoint.Requirement.Questionnaire.CertificationLevel.Code)) return Forbid();

        checkpoint.CheckpointText = request.CheckpointText.Trim();
        checkpoint.Evidence = request.Evidence?.Trim();
        checkpoint.Kpi = request.Kpi?.Trim();
        checkpoint.Unit = request.Unit?.Trim();
        checkpoint.Frequency = request.Frequency?.Trim();
        checkpoint.ExpectedResponse = request.ExpectedResponse?.Trim();
        checkpoint.Weight = request.Weight;
        checkpoint.IsMandatory = request.IsMandatory;
        if (request.SequenceNo is { } sequence) checkpoint.SequenceNo = sequence;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Retires a checkpoint. Kept on the row so past responses still resolve.</summary>
    [HttpDelete("checkpoints/{id:int}")]
    public async Task<IActionResult> DeleteCheckpoint(int id, CancellationToken ct)
    {
        var checkpoint = await db.Checkpoints
            .AsTracking()
            .Include(c => c.Requirement).ThenInclude(r => r.Questionnaire).ThenInclude(q => q.CertificationLevel)
            .SingleOrDefaultAsync(c => c.CheckpointId == id, ct);

        if (checkpoint is null) return NotFound();
        if (!CanDelete(checkpoint.Requirement.Questionnaire.CertificationLevel.Code)) return Forbid();

        checkpoint.IsActive = false;
        await db.SaveChangesAsync(ct);

        return NoContent();
    }

    /// <summary>The "Publish Changes" button: makes a draft the live standard.</summary>
    [HttpPost("{id:int}/publish")]
    public async Task<IActionResult> Publish(int id, CancellationToken ct)
    {
        var questionnaire = await db.Questionnaires
            .AsTracking()
            .Include(q => q.CertificationLevel)
            .SingleOrDefaultAsync(q => q.QuestionnaireId == id, ct);

        if (questionnaire is null) return NotFound();
        if (!CanEdit(questionnaire.CertificationLevel.Code)) return Forbid();

        questionnaire.Status = "Published";
        questionnaire.PublishedOnUtc = clock.UtcNow;
        questionnaire.PublishedByUserId = currentUser.UserId;
        questionnaire.EffectiveFrom ??= clock.Today;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // The permission module for a level. A null or unrecognised level means the
    // caller is asking across both, so either right is enough to look.
    private static string ModuleFor(string levelCode)
        => levelCode.ToUpperInvariant() switch
        {
            "GOLD" => Permissions.QuestionnaireGold,
            _ => Permissions.QuestionnaireSilver,
        };

    private bool CanView(string? levelCode)
        => string.IsNullOrWhiteSpace(levelCode)
            ? currentUser.HasPermission(Permissions.QuestionnaireSilver, Permissions.View)
              || currentUser.HasPermission(Permissions.QuestionnaireGold, Permissions.View)
            : currentUser.HasPermission(ModuleFor(levelCode), Permissions.View);

    private bool CanEdit(string levelCode)
        => currentUser.HasPermission(ModuleFor(levelCode), Permissions.Edit);

    private bool CanDelete(string levelCode)
        => currentUser.HasPermission(ModuleFor(levelCode), Permissions.Delete);
}

public sealed record QuestionnaireDto(
    int QuestionnaireId,
    string Code,
    string Name,
    byte CertificationLevelId,
    string CertificationLevelName,
    short? SectorId,
    string? SectorName,
    short VersionNo,
    string Status,
    DateOnly? EffectiveFrom,
    DateOnly? EffectiveTo,
    DateTime? PublishedOnUtc,
    int RequirementCount,
    int CheckpointCount);

public sealed record RequirementDto(
    int RequirementId,
    short ParameterId,
    string ParameterName,
    short SequenceNo,
    string Title,
    string? Narrative,
    string? Bullets,
    string? Purpose,
    string? Benefits,
    string? SuggestedAction,
    decimal MaxScore,
    IReadOnlyList<CheckpointDto> Checkpoints);

public sealed record CheckpointDto(
    int CheckpointId,
    short SequenceNo,
    string CheckpointText,
    string? Evidence,
    string? Kpi,
    string? Unit,
    string? Frequency,
    string? ExpectedResponse,
    decimal Weight,
    bool IsMandatory);

public sealed class CheckpointSaveRequest
{
    [Required, StringLength(1000)]
    public string CheckpointText { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Evidence { get; init; }

    [StringLength(300)]
    public string? Kpi { get; init; }

    [StringLength(50)]
    public string? Unit { get; init; }

    [StringLength(50)]
    public string? Frequency { get; init; }

    [StringLength(300)]
    public string? ExpectedResponse { get; init; }

    [Range(0, 1000)]
    public decimal Weight { get; init; } = 1m;

    public bool IsMandatory { get; init; }

    public short? SequenceNo { get; init; }
}

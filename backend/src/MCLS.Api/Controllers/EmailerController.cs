using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Comm;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The Emailer module: broadcast campaigns and the transactional templates the
/// portal sends automatically.
///
/// Campaigns are queued, never sent inline. A broadcast to every certified MSME
/// is tens of thousands of messages; doing that inside the request would hold
/// the connection open for minutes and lose the whole run if it timed out.
/// <c>EmailDispatchService</c> drains <c>comm.EmailMessage</c> in the
/// background, which also gives the screen its sent / failed counts.
/// </summary>
[ApiController]
[Route("api/emailer")]
public sealed class EmailerController(
    MclsDbContext db,
    ICurrentUser currentUser,
    IDateTimeProvider clock) : ControllerBase
{
    // ------------------------------------------------------------ campaigns ---

    /// <summary>The campaign list on the Emailer screen.</summary>
    [HttpGet("campaigns")]
    [HasPermission(Permissions.Emailer, Permissions.View)]
    public async Task<IActionResult> GetCampaigns(
        [FromQuery] string? search,
        [FromQuery] string? status,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var query = db.EmailCampaigns.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c => c.Name.Contains(term) || c.Subject.Contains(term));
        }

        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(c => c.Status == status);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(c => c.CreatedOnUtc)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(c => new EmailCampaignDto(
                c.EmailCampaignId, c.Name, c.Subject, c.Status,
                c.ScheduledForUtc, c.SentOnUtc,
                c.RecipientCount, c.SentCount, c.FailedCount,
                c.CreatedOnUtc,
                c.Audiences.Select(a => a.AccountTypeId).ToList()))
            .ToListAsync(ct);

        return Ok(PagedResult<EmailCampaignDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>The counters above the campaign list.</summary>
    [HttpGet("summary")]
    [HasPermission(Permissions.Emailer, Permissions.View)]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
    {
        var sent = await db.EmailMessages.CountAsync(m => m.Status == "Sent", ct);
        var failed = await db.EmailMessages.CountAsync(m => m.Status == "Failed", ct);
        var attempted = sent + failed;

        return Ok(new
        {
            campaigns = await db.EmailCampaigns.CountAsync(ct),
            templates = await db.EmailTemplates.CountAsync(t => t.IsActive, ct),
            recipients = await db.EmailMessages.CountAsync(ct),

            // Delivered over attempted, not over queued: a message still
            // waiting to go out has not failed, and counting it as undelivered
            // would make the rate sag every time a campaign is queued.
            deliveryRate = attempted == 0
                ? 0m
                : Math.Round((decimal)sent / attempted * 100, 1),

            scheduled = await db.EmailCampaigns.CountAsync(c => c.Status == "Scheduled", ct),
            sent,
            failed,
        });
    }

    /// <summary>
    /// The account types a campaign can be addressed to, with how many active
    /// users each currently reaches.
    ///
    /// This is deliberately NOT the User Management list. That one is filtered
    /// to types the Ministry issues accounts for, which excludes MSME
    /// Enterprise — the scheme's largest audience and the one most campaigns
    /// are aimed at. Reusing it here silently made it impossible to mail them.
    /// </summary>
    [HttpGet("audiences")]
    [HasPermission(Permissions.Emailer, Permissions.View)]
    public async Task<IActionResult> GetAudiences(CancellationToken ct)
        => Ok(await db.AccountTypes.AsNoTracking()
            .Where(a => a.IsActive)
            .OrderBy(a => a.SortOrder)
            .Select(a => new
            {
                accountTypeId = a.AccountTypeId,
                code = a.Code,
                name = a.Name,
                shortName = a.ShortName,
                sortOrder = a.SortOrder,
                activeUsers = db.Users.Count(u =>
                    u.AccountTypeId == a.AccountTypeId && u.Status.Code == "ACTIVE"),
            })
            .ToListAsync(ct));

    /// <summary>One campaign.</summary>
    [HttpGet("campaigns/{id:int}")]
    [HasPermission(Permissions.Emailer, Permissions.View)]
    public async Task<IActionResult> GetCampaign(int id, CancellationToken ct)
    {
        var campaign = await db.EmailCampaigns.AsNoTracking()
            .Where(c => c.EmailCampaignId == id)
            .Select(c => new EmailCampaignDetailDto(
                c.EmailCampaignId, c.Name, c.Subject, c.BodyHtml, c.EmailTemplateId,
                c.Status, c.ScheduledForUtc, c.SentOnUtc,
                c.RecipientCount, c.SentCount, c.FailedCount, c.CreatedOnUtc,
                c.Audiences.Select(a => a.AccountTypeId).ToList()))
            .SingleOrDefaultAsync(ct);

        return campaign is null ? NotFound() : Ok(campaign);
    }

    /// <summary>Composes a campaign. It is saved as a draft; sending is a separate step.</summary>
    [HttpPost("campaigns")]
    [HasPermission(Permissions.Emailer, Permissions.Create)]
    public async Task<IActionResult> CreateCampaign([FromBody] EmailCampaignSaveRequest request, CancellationToken ct)
    {
        if (request.AccountTypeIds.Count == 0)
        {
            ModelState.AddModelError(nameof(request.AccountTypeIds), "Select at least one audience.");
            return ValidationProblem(ModelState);
        }

        var campaign = new EmailCampaign
        {
            Name = request.Name.Trim(),
            Subject = request.Subject.Trim(),
            BodyHtml = request.BodyHtml,
            EmailTemplateId = request.EmailTemplateId,
            Status = request.ScheduledForUtc is null ? "Draft" : "Scheduled",
            ScheduledForUtc = request.ScheduledForUtc,
            CreatedByUserId = currentUser.UserId ?? 0,
            CreatedOnUtc = clock.UtcNow,
        };

        foreach (var accountTypeId in request.AccountTypeIds.Distinct())
        {
            campaign.Audiences.Add(new EmailCampaignAudience { AccountTypeId = accountTypeId });
        }

        // Counted at compose time so the screen can show the reach before the
        // campaign is committed to.
        campaign.RecipientCount = await db.Users
            .CountAsync(u => request.AccountTypeIds.Contains(u.AccountTypeId)
                          && u.StatusId == (byte)UserStatusId.Active, ct);

        db.EmailCampaigns.Add(campaign);
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetCampaign), new { id = campaign.EmailCampaignId }, null);
    }

    /// <summary>
    /// Queues a draft campaign. Every recipient becomes a row in
    /// <c>comm.EmailMessage</c> for the dispatch service to pick up.
    /// </summary>
    [HttpPost("campaigns/{id:int}/send")]
    [HasPermission(Permissions.Emailer, Permissions.Create)]
    public async Task<IActionResult> SendCampaign(int id, CancellationToken ct)
    {
        var campaign = await db.EmailCampaigns
            .AsTracking()
            .Include(c => c.Audiences)
            .SingleOrDefaultAsync(c => c.EmailCampaignId == id, ct);

        if (campaign is null) return NotFound();

        if (campaign.Status is "Sent" or "Sending")
        {
            return Problem(
                title: "This campaign has already been sent.",
                statusCode: StatusCodes.Status409Conflict);
        }

        var audienceIds = campaign.Audiences.Select(a => a.AccountTypeId).ToList();

        var recipients = await db.Users.AsNoTracking()
            .Where(u => audienceIds.Contains(u.AccountTypeId)
                     && u.StatusId == (byte)UserStatusId.Active
                     && u.Email != null)
            .Select(u => new { u.Id, u.Email })
            .ToListAsync(ct);

        foreach (var recipient in recipients)
        {
            db.EmailMessages.Add(new EmailMessage
            {
                EmailCampaignId = campaign.EmailCampaignId,
                EmailTemplateId = campaign.EmailTemplateId,
                ToAddress = recipient.Email!,
                ToUserId = recipient.Id,
                Subject = campaign.Subject,
                BodyHtml = campaign.BodyHtml,
                Status = "Queued",
                QueuedOnUtc = clock.UtcNow,
            });
        }

        campaign.Status = "Sending";
        campaign.RecipientCount = recipients.Count;
        campaign.SentOnUtc = clock.UtcNow;

        await db.SaveChangesAsync(ct);

        return Ok(new { queued = recipients.Count });
    }

    // ------------------------------------------------------------ templates ---

    /// <summary>The Transactional Templates screen.</summary>
    [HttpGet("templates")]
    [HasPermission(Permissions.Emailer, Permissions.View)]
    public async Task<IActionResult> GetTemplates(
        [FromQuery] string? search,
        [FromQuery] bool? isActive,
        CancellationToken ct = default)
    {
        var query = db.EmailTemplates.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(t =>
                t.Name.Contains(term) || t.Code.Contains(term) ||
                t.Subject.Contains(term) ||
                (t.TriggerEvent != null && t.TriggerEvent.Contains(term)));
        }

        if (isActive is { } active) query = query.Where(t => t.IsActive == active);

        return Ok(await query
            .OrderBy(t => t.Name)
            .Select(t => new EmailTemplateDto(
                t.EmailTemplateId, t.Code, t.Name, t.Subject, t.BodyHtml,
                t.AvailableTags, t.TriggerEvent, t.ReplyToAddress, t.CopyToAddress,
                t.IsTransactional, t.IsActive, t.ModifiedOnUtc,
                t.Audiences.Select(a => a.AccountTypeId).ToList()))
            .ToListAsync(ct));
    }

    /// <summary>One template, for the Edit Template screen.</summary>
    [HttpGet("templates/{id:int}")]
    [HasPermission(Permissions.Emailer, Permissions.View)]
    public async Task<IActionResult> GetTemplate(int id, CancellationToken ct)
    {
        var template = await db.EmailTemplates.AsNoTracking()
            .Where(t => t.EmailTemplateId == id)
            .Select(t => new EmailTemplateDto(
                t.EmailTemplateId, t.Code, t.Name, t.Subject, t.BodyHtml,
                t.AvailableTags, t.TriggerEvent, t.ReplyToAddress, t.CopyToAddress,
                t.IsTransactional, t.IsActive, t.ModifiedOnUtc,
                t.Audiences.Select(a => a.AccountTypeId).ToList()))
            .SingleOrDefaultAsync(ct);

        return template is null ? NotFound() : Ok(template);
    }

    /// <summary>
    /// Saves an edited template. The code is fixed: the portal looks templates
    /// up by it when sending, so renaming one would silently stop that mail.
    /// </summary>
    [HttpPut("templates/{id:int}")]
    [HasPermission(Permissions.Emailer, Permissions.Edit)]
    public async Task<IActionResult> UpdateTemplate(int id, [FromBody] EmailTemplateSaveRequest request, CancellationToken ct)
    {
        var template = await db.EmailTemplates.AsTracking().SingleOrDefaultAsync(t => t.EmailTemplateId == id, ct);
        if (template is null) return NotFound();

        template.Name = request.Name.Trim();
        template.Subject = request.Subject.Trim();
        template.BodyHtml = request.BodyHtml;
        template.BodyText = request.BodyText;
        template.IsActive = request.IsActive;

        // Reply-to and copy-to are editable; TriggerEvent deliberately is not.
        // It decides WHEN this mail fires, and repointing a live template at a
        // different scheme event from an edit screen would be silent and
        // unrecoverable.
        template.ReplyToAddress = string.IsNullOrWhiteSpace(request.ReplyToAddress)
            ? null : request.ReplyToAddress.Trim();
        template.CopyToAddress = string.IsNullOrWhiteSpace(request.CopyToAddress)
            ? null : request.CopyToAddress.Trim();

        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

public sealed record EmailCampaignDto(
    int EmailCampaignId,
    string Name,
    string Subject,
    string Status,
    DateTime? ScheduledForUtc,
    DateTime? SentOnUtc,
    int RecipientCount,
    int SentCount,
    int FailedCount,
    DateTime CreatedOnUtc,
    IReadOnlyList<byte> AccountTypeIds);

public sealed record EmailCampaignDetailDto(
    int EmailCampaignId,
    string Name,
    string Subject,
    string BodyHtml,
    int? EmailTemplateId,
    string Status,
    DateTime? ScheduledForUtc,
    DateTime? SentOnUtc,
    int RecipientCount,
    int SentCount,
    int FailedCount,
    DateTime CreatedOnUtc,
    IReadOnlyList<byte> AccountTypeIds);

public sealed record EmailTemplateDto(
    int EmailTemplateId,
    string Code,
    string Name,
    string Subject,
    string BodyHtml,
    string? AvailableTags,
    string? TriggerEvent,
    string? ReplyToAddress,
    string? CopyToAddress,
    bool IsTransactional,
    bool IsActive,
    DateTime? ModifiedOnUtc,
    IReadOnlyList<byte> AccountTypeIds);

public sealed class EmailCampaignSaveRequest
{
    [Required, StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required, StringLength(300)]
    public string Subject { get; init; } = string.Empty;

    [Required]
    public string BodyHtml { get; init; } = string.Empty;

    public int? EmailTemplateId { get; init; }
    public DateTime? ScheduledForUtc { get; init; }

    public List<byte> AccountTypeIds { get; init; } = [];
}

public sealed class EmailTemplateSaveRequest
{
    [Required, StringLength(200)]
    public string Name { get; init; } = string.Empty;

    [Required, StringLength(300)]
    public string Subject { get; init; } = string.Empty;

    [Required]
    public string BodyHtml { get; init; } = string.Empty;

    public string? BodyText { get; init; }

    [EmailAddress, StringLength(256)]
    public string? ReplyToAddress { get; init; }

    [EmailAddress, StringLength(256)]
    public string? CopyToAddress { get; init; }

    public bool IsActive { get; init; } = true;
}

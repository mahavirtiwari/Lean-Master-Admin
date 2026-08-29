using System.ComponentModel.DataAnnotations;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Msme;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// LEAN Bronze e-learning for the applicant (C01a - C01d).
///
/// Bronze is not an assessment. The enterprise nominates up to five people, each
/// takes every course and one final exam on the LMS, and each earns their own
/// certificate — so one enterprise can hold several Bronze certificates. The
/// courses and the exam run on the LMS, not in this portal; what is held here is
/// the seat, the person and the progress the LMS reports back.
/// </summary>
[ApiController]
[Route("api/msme/bronze")]
[Authorize]
public sealed class MsmeBronzeController(
    MclsDbContext db,
    ICurrentUser currentUser) : ControllerBase
{
    /// <summary>How many people one enterprise may nominate.</summary>
    private const int Seats = 5;

    private async Task<int?> EnterpriseIdAsync(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return null;

        return await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => (int?)e.EnterpriseId)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>Everything the Bronze screen draws: the LMS, seats, participants and the course list.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var enterpriseId = await EnterpriseIdAsync(ct);
        if (enterpriseId is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var lmsUrl = await db.SystemSettings.AsNoTracking()
            .Where(s => s.Key == "Bronze.LmsUrl")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct) ?? "https://msme-leanlms.in";

        var courses = await db.BronzeCourses.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .Select(c => new { no = c.SortOrder, title = c.Title })
            .ToListAsync(ct);

        var people = await db.BronzeParticipants.AsNoTracking()
            .Where(p => p.EnterpriseId == enterpriseId && p.IsActive)
            .OrderBy(p => p.BronzeParticipantId)
            .Select(p => new
            {
                id = p.BronzeParticipantId,
                name = p.FullName,
                p.Designation,
                p.Email,
                p.CoursesDone,
                p.Status,
                p.CertifiedOnUtc,
                p.CertificateNo,
            })
            .ToListAsync(ct);

        var total = courses.Count;

        var participants = people.Select(p => new
        {
            p.id,
            p.name,
            designation = p.Designation,
            email = p.Email,
            initials = Initials(p.name),
            coursesDone = (int)p.CoursesDone,
            coursesTotal = total,
            status = p.Status,
            certifiedOn = p.CertifiedOnUtc,
            certificateNo = p.CertificateNo,
        }).ToList();

        return Ok(new
        {
            lmsUrl,
            lmsName = "MCLS LEAN LMS",
            seats = new
            {
                total = Seats,
                used = participants.Count,
                left = Math.Max(0, Seats - participants.Count),
                certified = participants.Count(p => p.status == "Certified"),
                learning = participants.Count(p => p.status is "Learning" or "NotStarted"),
                examDue = participants.Count(p => p.status == "ExamDue"),
            },
            courses,
            courseCount = total,
            participants,
        });
    }

    /// <summary>Nominates a person for a Bronze seat (C01c).</summary>
    [HttpPost("participants")]
    public async Task<IActionResult> AddParticipant(
        [FromBody] AddBronzeParticipantRequest request, CancellationToken ct)
    {
        var enterpriseId = await EnterpriseIdAsync(ct);
        if (enterpriseId is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var email = request.Email.Trim();

        var used = await db.BronzeParticipants
            .CountAsync(p => p.EnterpriseId == enterpriseId && p.IsActive, ct);

        if (used >= Seats)
        {
            return BadRequest(new { message = $"All {Seats} seats are taken. Withdraw a participant before adding another." });
        }

        var duplicate = await db.BronzeParticipants
            .AnyAsync(p => p.EnterpriseId == enterpriseId && p.IsActive && p.Email == email, ct);

        if (duplicate)
        {
            return BadRequest(new { message = "That email already holds a seat for this enterprise." });
        }

        var participant = new BronzeParticipant
        {
            EnterpriseId = enterpriseId.Value,
            FullName = request.FullName.Trim(),
            Designation = string.IsNullOrWhiteSpace(request.Designation) ? null : request.Designation.Trim(),
            Email = email,
            Mobile = string.IsNullOrWhiteSpace(request.Mobile) ? null : request.Mobile.Trim(),
            Status = "NotStarted",
            CoursesDone = 0,
            IsActive = true,
            CreatedOnUtc = DateTime.UtcNow,
            CreatedByUserId = currentUser.UserId,
        };

        db.BronzeParticipants.Add(participant);
        await db.SaveChangesAsync(ct);

        return Ok(new { participant.BronzeParticipantId, seatsLeft = Seats - used - 1 });
    }

    private static string Initials(string name)
    {
        var parts = name.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return "?";
        return parts.Length == 1
            ? parts[0][..1].ToUpperInvariant()
            : (parts[0][..1] + parts[^1][..1]).ToUpperInvariant();
    }
}

public sealed class AddBronzeParticipantRequest
{
    [Required, StringLength(150)] public string FullName { get; set; } = string.Empty;
    [StringLength(100)] public string? Designation { get; set; }
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = string.Empty;
    [StringLength(15)] public string? Mobile { get; set; }
}

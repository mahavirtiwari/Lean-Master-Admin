using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Cryptography;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Msme;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
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
    ICurrentUser currentUser,
    IEmailQueue emailQueue) : ControllerBase
{
    /// <summary>How many people one enterprise may nominate.</summary>
    private const int Seats = 5;

    /// <summary>Exam attempts allowed per participant, as the scheme sets it.</summary>
    private const byte MaxAttempts = 3;

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
                p.LmsLoginId,
                p.ExamAttempts,
                p.MaxAttempts,
                p.AccountState,
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
            leanId = p.LmsLoginId,
            attemptsUsed = (int)p.ExamAttempts,
            attemptsAllowed = (int)p.MaxAttempts,
            attemptsLeft = Math.Max(0, p.MaxAttempts - p.ExamAttempts),
            accountState = p.AccountState,
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

        // The enterprise this seat belongs to, for the LEAN ID and the e-mail.
        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.EnterpriseId == enterpriseId)
            .Select(e => new { e.Name, e.LeanId })
            .FirstAsync(ct);

        var lmsUrl = await db.SystemSettings.AsNoTracking()
            .Where(x => x.Key == "Bronze.LmsUrl")
            .Select(x => x.Value)
            .FirstOrDefaultAsync(ct) ?? "https://msme-leanlms.in";

        var courseCount = await db.BronzeCourses.CountAsync(c => c.IsActive, ct);

        var participant = new BronzeParticipant
        {
            EnterpriseId = enterpriseId.Value,
            FullName = request.FullName.Trim(),
            Designation = string.IsNullOrWhiteSpace(request.Designation) ? null : request.Designation.Trim(),
            Email = email,
            Mobile = string.IsNullOrWhiteSpace(request.Mobile) ? null : request.Mobile.Trim(),
            Status = "NotStarted",
            CoursesDone = 0,
            MaxAttempts = MaxAttempts,
            AccountState = "Active",
            IsActive = true,
            CreatedOnUtc = DateTime.UtcNow,
            CreatedByUserId = currentUser.UserId,
        };

        db.BronzeParticipants.Add(participant);
        await db.SaveChangesAsync(ct);

        // The LEAN ID hangs off the enterprise's own, so a participant's id says
        // which enterprise seated them; the suffix is their row, already unique.
        var loginId = (enterprise.LeanId ?? "LEAN") + "-B" + participant.BronzeParticipantId.ToString("D3", CultureInfo.InvariantCulture);
        var password = GeneratePassword();

        // Only the hash is kept. The plaintext lives in the e-mail below and
        // nowhere else, so a participant's password cannot be read back out.
        participant.LmsLoginId = loginId;
        participant.PasswordHash = new PasswordHasher<BronzeParticipant>().HashPassword(participant, password);
        await db.SaveChangesAsync(ct);

        await emailQueue.QueueTemplatedAsync("BRONZE_PARTICIPANT_ACCOUNT", participant.Email, null,
            new Dictionary<string, string>
            {
                ["participant_name"] = participant.FullName,
                ["enterprise_name"] = enterprise.Name,
                ["lean_id"] = loginId,
                ["password"] = password,
                ["lms_url"] = lmsUrl,
                ["course_count"] = courseCount.ToString(CultureInfo.InvariantCulture),
                ["max_attempts"] = MaxAttempts.ToString(CultureInfo.InvariantCulture),
            }, ct);

        return Ok(new
        {
            participant.BronzeParticipantId,
            leanId = loginId,
            seatsLeft = Seats - used - 1,
            message = "The participant has been e-mailed their LEAN ID, password and the LMS link.",
        });
    }

    /// <summary>
    /// Records an examination attempt, as the LMS reports it.
    ///
    /// Passing issues the certificate, e-mails it and closes the account.
    /// Failing spends an attempt; when the last of the three is spent the
    /// account is locked. Either way the account stops working, which is what
    /// makes it temporary.
    /// </summary>
    [HttpPost("participants/{id:int}/exam")]
    public async Task<IActionResult> RecordExam(
        int id, [FromBody] BronzeExamResultRequest request, CancellationToken ct)
    {
        var enterpriseId = await EnterpriseIdAsync(ct);
        if (enterpriseId is null) return NotFound(new { message = "No enterprise is linked to this account." });

        // AsTracking on purpose: the context is NoTracking by default, so an
        // untracked entity would take these changes and quietly save nothing.
        var participant = await db.BronzeParticipants.AsTracking()
            .FirstOrDefaultAsync(p => p.BronzeParticipantId == id && p.EnterpriseId == enterpriseId, ct);

        if (participant is null) return NotFound(new { message = "That participant is not on this enterprise." });

        if (participant.AccountState != "Active")
        {
            return BadRequest(new
            {
                message = participant.AccountState == "Completed"
                    ? "That participant has already passed; their account is closed."
                    : "That participant has used all their attempts; their account is locked.",
            });
        }

        participant.ExamAttempts = (byte)(participant.ExamAttempts + 1);
        participant.LastAttemptOnUtc = DateTime.UtcNow;

        if (request.Passed)
        {
            var enterprise = await db.Enterprises.AsNoTracking()
                .Where(e => e.EnterpriseId == enterpriseId)
                .Select(e => new { e.Name })
                .FirstAsync(ct);

            var lmsUrl = await db.SystemSettings.AsNoTracking()
                .Where(x => x.Key == "Bronze.LmsUrl")
                .Select(x => x.Value)
                .FirstOrDefaultAsync(ct) ?? "https://msme-leanlms.in";

            participant.Status = "Certified";
            participant.CertifiedOnUtc = DateTime.UtcNow;
            participant.CertificateNo = "MCLS-BRZ-" + participant.BronzeParticipantId.ToString("D6", CultureInfo.InvariantCulture);
            participant.CoursesDone = (byte)await db.BronzeCourses.CountAsync(c => c.IsActive, ct);

            // Passing ends the account: earning the certificate is the point of it.
            participant.AccountState = "Completed";
            participant.DeactivatedOnUtc = DateTime.UtcNow;

            await db.SaveChangesAsync(ct);

            await emailQueue.QueueTemplatedAsync("BRONZE_PARTICIPANT_CERTIFICATE", participant.Email, null,
                new Dictionary<string, string>
                {
                    ["participant_name"] = participant.FullName,
                    ["enterprise_name"] = enterprise.Name,
                    ["certificate_no"] = participant.CertificateNo,
                    ["issued_on"] = DateTime.UtcNow.ToLocalTime().ToString("d MMMM yyyy", CultureInfo.InvariantCulture),
                    ["certificate_url"] = lmsUrl,
                }, ct);

            return Ok(new
            {
                passed = true,
                participant.CertificateNo,
                accountState = participant.AccountState,
                message = "Passed. The certificate has been e-mailed and the account closed.",
            });
        }

        var left = participant.MaxAttempts - participant.ExamAttempts;

        if (left <= 0)
        {
            participant.AccountState = "Locked";
            participant.DeactivatedOnUtc = DateTime.UtcNow;
        }
        else
        {
            participant.Status = "ExamDue";
        }

        await db.SaveChangesAsync(ct);

        return Ok(new
        {
            passed = false,
            attemptsUsed = (int)participant.ExamAttempts,
            attemptsLeft = Math.Max(0, left),
            accountState = participant.AccountState,
            message = left <= 0
                ? "All attempts are used. The account is locked."
                : "Attempt recorded.",
        });
    }

    /// <summary>
    /// Issues (or re-issues) a participant's LMS credential and e-mails it.
    ///
    /// Covers the two cases that come up in practice: a participant seated
    /// before credentials were issued at all, and one who has lost their
    /// password. A new password is generated either way — the old one cannot be
    /// read back, only replaced.
    /// </summary>
    [HttpPost("participants/{id:int}/credentials")]
    public async Task<IActionResult> IssueCredentials(int id, CancellationToken ct)
    {
        var enterpriseId = await EnterpriseIdAsync(ct);
        if (enterpriseId is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var participant = await db.BronzeParticipants.AsTracking()
            .FirstOrDefaultAsync(p => p.BronzeParticipantId == id && p.EnterpriseId == enterpriseId && p.IsActive, ct);

        if (participant is null) return NotFound(new { message = "That participant is not on this enterprise." });

        if (participant.AccountState != "Active")
        {
            return BadRequest(new
            {
                message = participant.AccountState == "Completed"
                    ? "That participant has already passed; their account is closed."
                    : "That participant has used all their attempts; their account is locked.",
            });
        }

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.EnterpriseId == enterpriseId)
            .Select(e => new { e.Name, e.LeanId })
            .FirstAsync(ct);

        var lmsUrl = await db.SystemSettings.AsNoTracking()
            .Where(x => x.Key == "Bronze.LmsUrl")
            .Select(x => x.Value)
            .FirstOrDefaultAsync(ct) ?? "https://msme-leanlms.in";

        var courseCount = await db.BronzeCourses.CountAsync(c => c.IsActive, ct);

        // Keep an id that was already issued: it may be in use on the LMS.
        participant.LmsLoginId ??= (enterprise.LeanId ?? "LEAN") + "-B"
            + participant.BronzeParticipantId.ToString("D3", CultureInfo.InvariantCulture);

        var password = GeneratePassword();
        participant.PasswordHash = new PasswordHasher<BronzeParticipant>().HashPassword(participant, password);

        await db.SaveChangesAsync(ct);

        await emailQueue.QueueTemplatedAsync("BRONZE_PARTICIPANT_ACCOUNT", participant.Email, null,
            new Dictionary<string, string>
            {
                ["participant_name"] = participant.FullName,
                ["enterprise_name"] = enterprise.Name,
                ["lean_id"] = participant.LmsLoginId,
                ["password"] = password,
                ["lms_url"] = lmsUrl,
                ["course_count"] = courseCount.ToString(CultureInfo.InvariantCulture),
                ["max_attempts"] = participant.MaxAttempts.ToString(CultureInfo.InvariantCulture),
            }, ct);

        return Ok(new
        {
            leanId = participant.LmsLoginId,
            message = "The LEAN ID, a new password and the LMS link have been e-mailed to the participant.",
        });
    }

    /// <summary>
    /// A readable one-time password: no ambiguous characters, and one of each
    /// class so it satisfies whatever policy the LMS applies.
    /// </summary>
    private static string GeneratePassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string digits = "23456789";
        const string symbols = "@#$%&*";
        const string all = upper + lower + digits + symbols;

        var chars = new List<char>
        {
            upper[RandomNumberGenerator.GetInt32(upper.Length)],
            lower[RandomNumberGenerator.GetInt32(lower.Length)],
            digits[RandomNumberGenerator.GetInt32(digits.Length)],
            symbols[RandomNumberGenerator.GetInt32(symbols.Length)],
        };

        while (chars.Count < 12) chars.Add(all[RandomNumberGenerator.GetInt32(all.Length)]);

        // Shuffle, so the guaranteed classes do not always sit in the same places.
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string(chars.ToArray());
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

public sealed class BronzeExamResultRequest
{
    /// <summary>Whether this attempt passed, as the LMS reports it.</summary>
    public bool Passed { get; set; }
}

public sealed class AddBronzeParticipantRequest
{
    [Required, StringLength(150)] public string FullName { get; set; } = string.Empty;
    [StringLength(100)] public string? Designation { get; set; }
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = string.Empty;
    [StringLength(15)] public string? Mobile { get; set; }
}

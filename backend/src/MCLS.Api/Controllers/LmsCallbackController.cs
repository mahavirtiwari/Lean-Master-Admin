using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using MCLS.Application.Common.Interfaces;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// What the LMS reports back about LEAN Bronze.
///
/// The courses and the examination are run by the LMS, so it is the only system
/// that knows how far a participant has got and whether they passed. These are
/// machine-to-machine calls — there is no applicant signed in behind them — so
/// they carry the shared key from Settings rather than a token, and they address
/// a participant by the LEAN ID the portal issued rather than by an internal id.
/// </summary>
[ApiController]
[Route("api/lms/bronze")]
[AllowAnonymous]
[EnableRateLimiting("auth")]
public sealed class LmsCallbackController(
    MclsDbContext db,
    IEmailQueue emailQueue) : ControllerBase
{
    /// <summary>Records how many courses a participant has completed.</summary>
    [HttpPost("progress")]
    public async Task<IActionResult> Progress([FromBody] LmsProgressRequest request, CancellationToken ct)
    {
        if (!await KeyIsGoodAsync(ct)) return Unauthorized(new { message = "Invalid LMS key." });

        var participant = await db.BronzeParticipants.AsTracking()
            .FirstOrDefaultAsync(p => p.LmsLoginId == request.LeanId && p.IsActive, ct);

        if (participant is null) return NotFound(new { message = "No participant holds that LEAN ID." });

        if (participant.AccountState != "Active")
        {
            return BadRequest(new { message = "That participant's account is closed." });
        }

        var total = (byte)await db.BronzeCourses.CountAsync(c => c.IsActive, ct);
        var done = (byte)Math.Clamp(request.CoursesDone, 0, total);

        participant.CoursesDone = done;

        // The status follows the count: all the courses done means the exam is
        // what is left, which is what the participant card says.
        participant.Status = done == 0 ? "NotStarted" : done >= total ? "ExamDue" : "Learning";

        await db.SaveChangesAsync(ct);

        return Ok(new { participant.CoursesDone, coursesTotal = total, status = participant.Status });
    }

    /// <summary>
    /// Records an examination attempt. Passing issues the certificate, e-mails
    /// it and closes the account; the third failure locks it.
    /// </summary>
    [HttpPost("exam-result")]
    public async Task<IActionResult> ExamResult([FromBody] LmsExamResultRequest request, CancellationToken ct)
    {
        if (!await KeyIsGoodAsync(ct)) return Unauthorized(new { message = "Invalid LMS key." });

        var participant = await db.BronzeParticipants.AsTracking()
            .FirstOrDefaultAsync(p => p.LmsLoginId == request.LeanId && p.IsActive, ct);

        if (participant is null) return NotFound(new { message = "No participant holds that LEAN ID." });

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

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.EnterpriseId == participant.EnterpriseId)
            .Select(e => new { e.Name })
            .FirstAsync(ct);

        if (request.Passed)
        {
            var lmsUrl = await db.SystemSettings.AsNoTracking()
                .Where(x => x.Key == "Bronze.LmsUrl")
                .Select(x => x.Value)
                .FirstOrDefaultAsync(ct) ?? "https://msme-leanlms.in";

            participant.Status = "Certified";
            participant.CertifiedOnUtc = DateTime.UtcNow;
            participant.CertificateNo = "MCLS-BRZ-" + participant.BronzeParticipantId.ToString("D6", CultureInfo.InvariantCulture);
            participant.CoursesDone = (byte)await db.BronzeCourses.CountAsync(c => c.IsActive, ct);
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
        });
    }

    /// <summary>
    /// Compares the X-LMS-Key header against the configured secret in constant
    /// time, so a wrong key cannot be discovered a character at a time.
    /// </summary>
    private async Task<bool> KeyIsGoodAsync(CancellationToken ct)
    {
        var configured = await db.SystemSettings.AsNoTracking()
            .Where(s => s.Key == "Bronze.LmsApiKey")
            .Select(s => s.Value)
            .FirstOrDefaultAsync(ct);

        // No key configured means the callback is shut, not open to everyone.
        if (string.IsNullOrWhiteSpace(configured)) return false;

        if (!Request.Headers.TryGetValue("X-LMS-Key", out var sent)) return false;

        var a = Encoding.UTF8.GetBytes(sent.ToString());
        var b = Encoding.UTF8.GetBytes(configured);

        return a.Length == b.Length && CryptographicOperations.FixedTimeEquals(a, b);
    }
}

public sealed class LmsProgressRequest
{
    [Required, StringLength(50)] public string LeanId { get; set; } = string.Empty;
    [Range(0, 255)] public int CoursesDone { get; set; }
}

public sealed class LmsExamResultRequest
{
    [Required, StringLength(50)] public string LeanId { get; set; } = string.Empty;
    public bool Passed { get; set; }
}

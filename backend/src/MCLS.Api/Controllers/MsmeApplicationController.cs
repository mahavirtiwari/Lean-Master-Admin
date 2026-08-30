using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Msme;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The applicant's LEAN Silver application, on the mobile app.
///
/// The admin menus (ESG Checklist, Basic Info &amp; Documents) define what the
/// application asks; this returns that checklist to the applicant and stores
/// their answers. One submission per enterprise per level — a draft while it is
/// being filled, submitted when they confirm.
/// </summary>
[ApiController]
[Route("api/msme/application")]
[Authorize]
public sealed class MsmeApplicationController(MclsDbContext db, ICurrentUser currentUser) : ControllerBase
{
    private const byte Silver = 2;

    private async Task<int?> EnterpriseIdAsync(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return null;
        return await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => (int?)e.EnterpriseId)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// The active checklist the Silver application asks for — the basic-info
    /// items, the ESG sections and their questions (with each conditional
    /// question's parent and trigger, so the app can show it at the right time),
    /// and the documents to upload.
    /// </summary>
    [HttpGet("config")]
    public async Task<IActionResult> GetConfig(CancellationToken ct)
    {
        var basicInfo = await db.BasicInfoItems.AsNoTracking()
            .Where(i => i.IsActive)
            .OrderBy(i => i.SortOrder).ThenBy(i => i.Code)
            .Select(i => new { i.BasicInfoItemId, i.GroupName, i.Label, i.HelpText, i.InputType, i.IsRequired })
            .ToListAsync(ct);

        var sections = await db.EsgSections.AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.SortOrder).ThenBy(s => s.Code)
            .Select(s => new
            {
                s.EsgSectionId,
                s.Name,
                Questions = s.Questions
                    .Where(q => q.IsActive)
                    .OrderBy(q => q.SortOrder)
                    .Select(q => new
                    {
                        q.EsgQuestionId,
                        q.Text,
                        q.HelpText,
                        q.ParentQuestionId,
                        q.ShowWhenAnswer,
                    })
                    .ToList(),
            })
            .ToListAsync(ct);

        var documents = await db.DocumentRequirements.AsNoTracking()
            .Where(d => d.IsActive && (d.CertificationLevelId == null || d.CertificationLevelId == Silver))
            .OrderBy(d => d.SortOrder).ThenBy(d => d.Code)
            .Select(d => new { d.DocumentRequirementId, d.Name, d.HelpText, d.AcceptedTypes, d.IsMandatory })
            .ToListAsync(ct);

        return Ok(new { basicInfo, esgSections = sections, documents });
    }

    /// <summary>The applicant's current Silver submission and its answers, if any.</summary>
    [HttpGet("silver")]
    public async Task<IActionResult> GetSilver(CancellationToken ct)
    {
        var enterpriseId = await EnterpriseIdAsync(ct);
        if (enterpriseId is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var submission = await db.ApplicationSubmissions.AsNoTracking()
            .Where(s => s.EnterpriseId == enterpriseId && s.CertificationLevelId == Silver)
            .Select(s => new
            {
                s.SubmissionId,
                s.Status,
                s.SubmittedOnUtc,
                s.PaymentStatus,
                s.PaidAmount,
                s.PaidOnUtc,
                s.PaymentMethod,
                s.PaymentReference,
                BasicInfo = s.BasicInfo.Select(b => new { b.BasicInfoItemId, b.ValueText }),
                Esg = s.EsgAnswers.Select(e => new { e.EsgQuestionId, e.Answer }),
                Documents = s.Documents.Select(d => new { d.DocumentRequirementId, d.OriginalFileName, d.UploadedOnUtc }),
            })
            .FirstOrDefaultAsync(ct);

        return Ok(submission);
    }

    /// <summary>
    /// Saves the Silver application — a draft, or submitted when
    /// <see cref="SilverSubmitRequest.Submit"/> is true. Replaces the answer
    /// set each time, so the client sends the whole form.
    /// </summary>
    [HttpPost("silver")]
    public async Task<IActionResult> SaveSilver([FromBody] SilverSubmitRequest request, CancellationToken ct)
    {
        var enterpriseId = await EnterpriseIdAsync(ct);
        if (enterpriseId is null) return NotFound(new { message = "No enterprise is linked to this account." });

        if (request.Submit)
        {
            var missing = await ValidateMandatoryAsync(request, ct);
            // A plain message, not a ValidationProblem: the mobile client shows
            // the reason to the applicant, and there is one reason at a time.
            if (missing is not null) return BadRequest(new { message = missing });
        }

        // AsTracking: the context is NoTracking by default, so an existing
        // submission came back detached and every edit below — the status, the
        // submitted date, all three answer sets — was written to a graph
        // SaveChanges does not look at. A new draft saved (it is Added); an
        // existing one silently did nothing.
        var submission = await db.ApplicationSubmissions.AsTracking()
            .Include(s => s.BasicInfo)
            .Include(s => s.EsgAnswers)
            .Include(s => s.Documents)
            .SingleOrDefaultAsync(s => s.EnterpriseId == enterpriseId && s.CertificationLevelId == Silver, ct);

        if (submission is null)
        {
            submission = new ApplicationSubmission
            {
                EnterpriseId = enterpriseId.Value,
                CertificationLevelId = Silver,
                CreatedOnUtc = DateTime.UtcNow,
            };
            db.ApplicationSubmissions.Add(submission);
        }
        else
        {
            // A submitted application is not edited from here again.
            if (submission.Status == "Submitted")
                return Conflict(new { message = "This application has already been submitted." });

            submission.ModifiedOnUtc = DateTime.UtcNow;
        }

        submission.Status = request.Submit ? "Submitted" : "Draft";
        submission.SubmittedOnUtc = request.Submit ? DateTime.UtcNow : null;

        // Answers are updated where they already exist, not cleared and
        // re-added. Each of these three is keyed on (submission, item), so
        // re-adding an answer to a question that was already answered collides
        // in the change tracker with the Deleted row of the same key and EF
        // throws before anything is written — which is every save after the
        // first, since a draft is saved repeatedly as it is filled in.
        var basicGiven = request.BasicInfo ?? [];
        var basicKeep = basicGiven.Select(b => b.BasicInfoItemId).ToHashSet();

        foreach (var gone in submission.BasicInfo.Where(x => !basicKeep.Contains(x.BasicInfoItemId)).ToList())
        {
            db.SubmissionBasicInfo.Remove(gone);
        }

        foreach (var b in basicGiven)
        {
            var row = submission.BasicInfo.FirstOrDefault(x => x.BasicInfoItemId == b.BasicInfoItemId);

            if (row is null)
            {
                submission.BasicInfo.Add(new SubmissionBasicInfo
                {
                    BasicInfoItemId = b.BasicInfoItemId,
                    ValueText = b.Value,
                });
            }
            else
            {
                row.ValueText = b.Value;
            }
        }

        var esgGiven = (request.Esg ?? []).Where(e => e.Answer is "Yes" or "No" or "NA").ToList();
        var esgKeep = esgGiven.Select(e => e.EsgQuestionId).ToHashSet();

        foreach (var gone in submission.EsgAnswers.Where(x => !esgKeep.Contains(x.EsgQuestionId)).ToList())
        {
            db.SubmissionEsgAnswers.Remove(gone);
        }

        foreach (var e in esgGiven)
        {
            var row = submission.EsgAnswers.FirstOrDefault(x => x.EsgQuestionId == e.EsgQuestionId);

            if (row is null)
            {
                submission.EsgAnswers.Add(new SubmissionEsgAnswer
                {
                    EsgQuestionId = e.EsgQuestionId,
                    Answer = e.Answer,
                });
            }
            else
            {
                row.Answer = e.Answer;
            }
        }

        var docsGiven = request.Documents ?? [];
        var docsKeep = docsGiven.Select(d => d.DocumentRequirementId).ToHashSet();

        foreach (var gone in submission.Documents.Where(x => !docsKeep.Contains(x.DocumentRequirementId)).ToList())
        {
            db.SubmissionDocuments.Remove(gone);
        }

        foreach (var d in docsGiven)
        {
            var row = submission.Documents.FirstOrDefault(x => x.DocumentRequirementId == d.DocumentRequirementId);

            if (row is null)
            {
                submission.Documents.Add(new SubmissionDocument
                {
                    DocumentRequirementId = d.DocumentRequirementId,
                    OriginalFileName = d.OriginalFileName,
                    UploadedOnUtc = DateTime.UtcNow,
                });
            }
            else if (row.OriginalFileName != d.OriginalFileName)
            {
                // Only a replaced file is re-stamped; re-saving the form around
                // an untouched upload should not move its date.
                row.OriginalFileName = d.OriginalFileName;
                row.UploadedOnUtc = DateTime.UtcNow;
            }
        }

        await db.SaveChangesAsync(ct);
        return Ok(new { submission.SubmissionId, submission.Status });
    }

    // ------------------------------------------------------------- payment ---

    /// <summary>
    /// The fee the applicant pays for Silver: the scheme's fee less the
    /// government subsidy. Base subsidy is 90%, a further 5% for the priority
    /// categories — read from the fee master, not hard-coded.
    /// </summary>
    [HttpGet("silver/fee")]
    public async Task<IActionResult> GetSilverFee(CancellationToken ct)
    {
        var fee = await db.FeeRates.AsNoTracking()
            .Where(f => f.CertificationLevelId == Silver && f.EffectiveTo == null)
            .OrderByDescending(f => f.EffectiveFrom)
            .Select(f => new { f.AmountInclusiveGst, f.GstPercent })
            .FirstOrDefaultAsync(ct);

        if (fee is null) return NotFound(new { message = "No current Silver fee is configured." });

        // Base subsidy for everyone; the enterprise's category could raise it,
        // but that lookup belongs with the invoice — here the base is shown.
        var subsidyPercent = await db.SubsidyCategories.AsNoTracking()
            .Where(s => s.Code == "GEN")
            .Select(s => (decimal?)s.BaseSubsidyPercent)
            .FirstOrDefaultAsync(ct) ?? 90m;

        var gross = fee.AmountInclusiveGst;
        var subsidyAmount = Math.Round(gross * subsidyPercent / 100m, 2);
        var payable = gross - subsidyAmount;

        return Ok(new
        {
            gross,
            gstPercent = fee.GstPercent,
            subsidyPercent,
            subsidyAmount,
            payable,
            currency = "INR",
        });
    }

    /// <summary>
    /// Records payment of the Silver fee. A simulated payment for now — it takes
    /// the chosen method, marks the submission paid and returns a receipt; no
    /// money moves and no card details are handled. A real gateway later fills
    /// the same fields with its own reference.
    /// </summary>
    [HttpPost("silver/pay")]
    public async Task<IActionResult> PaySilver([FromBody] PayRequest request, CancellationToken ct)
    {
        var enterpriseId = await EnterpriseIdAsync(ct);
        if (enterpriseId is null) return NotFound(new { message = "No enterprise is linked to this account." });

        // AsTracking: the context is NoTracking by default, so without it the
        // payment below would be written to a detached object and SaveChanges
        // would quietly do nothing — the applicant would be told the fee was
        // paid while the record still read Unpaid.
        var submission = await db.ApplicationSubmissions.AsTracking()
            .SingleOrDefaultAsync(s => s.EnterpriseId == enterpriseId && s.CertificationLevelId == Silver, ct);

        if (submission is null || submission.Status != "Submitted")
            return BadRequest(new { message = "Submit the application before paying the fee." });
        if (submission.PaymentStatus == "Paid")
            return Conflict(new { message = "This fee has already been paid." });

        // The applicant can walk the failure path in the prototype; honour it so
        // the failure screen is reachable without breaking anything.
        if (request.SimulateFailure)
            return StatusCode(402, new { message = "The payment was declined. No amount has been charged." });

        var fee = await db.FeeRates.AsNoTracking()
            .Where(f => f.CertificationLevelId == Silver && f.EffectiveTo == null)
            .Select(f => f.AmountInclusiveGst)
            .FirstOrDefaultAsync(ct);
        var subsidy = await db.SubsidyCategories.AsNoTracking()
            .Where(s => s.Code == "GEN").Select(s => s.BaseSubsidyPercent).FirstOrDefaultAsync(ct);
        var payable = fee - Math.Round(fee * subsidy / 100m, 2);

        submission.PaymentStatus = "Paid";
        submission.PaidAmount = payable;
        submission.PaidOnUtc = DateTime.UtcNow;
        submission.PaymentMethod = request.Method;
        submission.PaymentReference = "PAY-" + Guid.NewGuid().ToString("N")[..12].ToUpperInvariant();
        submission.ModifiedOnUtc = DateTime.UtcNow;

        await db.SaveChangesAsync(ct);

        return Ok(new
        {
            reference = submission.PaymentReference,
            amount = submission.PaidAmount,
            method = submission.PaymentMethod,
            paidOn = submission.PaidOnUtc,
        });
    }

    /// <summary>Confirms every mandatory item, ESG question and document is answered.</summary>
    private async Task<string?> ValidateMandatoryAsync(SilverSubmitRequest request, CancellationToken ct)
    {
        var basicGiven = (request.BasicInfo ?? [])
            .Where(b => !string.IsNullOrWhiteSpace(b.Value))
            .Select(b => b.BasicInfoItemId).ToHashSet();
        var requiredBasic = await db.BasicInfoItems.AsNoTracking()
            .Where(i => i.IsActive && i.IsRequired).Select(i => i.BasicInfoItemId).ToListAsync(ct);
        if (requiredBasic.Any(id => !basicGiven.Contains(id)))
            return "Answer every required basic-information item before submitting.";

        // Only the questions that were actually shown need an answer, so this
        // checks the answered set against the questions whose condition the
        // answers themselves satisfy — a top-level question, or a child whose
        // parent was answered its trigger.
        var esgGiven = (request.Esg ?? []).ToDictionary(e => e.EsgQuestionId, e => e.Answer);
        var questions = await db.EsgQuestions.AsNoTracking()
            .Where(q => q.IsActive)
            .Select(q => new { q.EsgQuestionId, q.ParentQuestionId, q.ShowWhenAnswer })
            .ToListAsync(ct);
        foreach (var q in questions)
        {
            var shown = q.ParentQuestionId is null
                || (esgGiven.TryGetValue(q.ParentQuestionId.Value, out var pa) && pa == q.ShowWhenAnswer);
            if (shown && !esgGiven.ContainsKey(q.EsgQuestionId))
                return "Answer every ESG question that applies before submitting.";
        }

        var docsGiven = (request.Documents ?? [])
            .Where(d => !string.IsNullOrWhiteSpace(d.OriginalFileName))
            .Select(d => d.DocumentRequirementId).ToHashSet();
        var requiredDocs = await db.DocumentRequirements.AsNoTracking()
            .Where(d => d.IsActive && d.IsMandatory && (d.CertificationLevelId == null || d.CertificationLevelId == Silver))
            .Select(d => d.DocumentRequirementId).ToListAsync(ct);
        if (requiredDocs.Any(id => !docsGiven.Contains(id)))
            return "Upload every mandatory document before submitting.";

        return null;
    }
}

public sealed class SilverSubmitRequest
{
    public bool Submit { get; init; }
    public List<BasicInfoAnswer>? BasicInfo { get; init; }
    public List<EsgAnswer>? Esg { get; init; }
    public List<DocumentAnswer>? Documents { get; init; }
}

public sealed class BasicInfoAnswer
{
    public short BasicInfoItemId { get; init; }
    public string? Value { get; init; }
}

public sealed class EsgAnswer
{
    public int EsgQuestionId { get; init; }
    public string Answer { get; init; } = string.Empty;
}

public sealed class DocumentAnswer
{
    public short DocumentRequirementId { get; init; }
    public string? OriginalFileName { get; init; }
}

public sealed class PayRequest
{
    /// <summary>UPI, Card, NetBanking or NEFT — recorded, not acted on.</summary>
    public string Method { get; init; } = "UPI";

    /// <summary>Walks the prototype's failure path without charging anything.</summary>
    public bool SimulateFailure { get; init; }
}

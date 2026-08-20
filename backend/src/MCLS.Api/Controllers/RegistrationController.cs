using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Entities.Msme;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using MCLS.Infrastructure.Udyam;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The MSME applicant's registration wizard (R1-R9).
///
/// Every endpoint here is UNAUTHENTICATED — the applicant has no account until
/// the wizard finishes. That shapes the whole controller:
///
///  * Steps are addressed by an opaque <c>SessionToken</c> (a GUID), never by
///    the row id. A sequential id would let anyone enumerate other people's
///    drafts, which hold names, addresses and e-mail addresses.
///  * Everything is rate-limited on the "auth" policy. Udyam verification takes
///    a registration number plus a mobile and says whether they match, which is
///    an enumeration oracle if left open.
///  * The OTP is stored hashed with the token as salt, expires, and is
///    attempt-limited. A plaintext OTP column would let anyone with read access
///    to the table complete somebody else's registration.
///  * Errors are deliberately uninformative about whether a Udyam number
///    exists, for the same reason.
/// </summary>
[ApiController]
[Route("api/registration")]
[EnableRateLimiting("auth")]
// The API fails closed — Program.cs sets a fallback policy requiring an
// authenticated user — so the wizard has to opt out explicitly. It must: the
// applicant has no account until step 8 creates one.
[AllowAnonymous]
public sealed class RegistrationController(
    MclsDbContext db,
    IFileStorage files,
    IUdyamRegistry udyam,
    ISequenceService sequences,
    IDateTimeProvider clock,
    IEmailQueue email,
    UserManager<ApplicationUser> userManager,
    ILogger<RegistrationController> logger) : ControllerBase
{
    private const int OtpValidMinutes = 10;
    private const int MaxOtpAttempts = 5;

    // ------------------------------------------------------------ reference ---

    /// <summary>
    /// The guides an applicant is offered on R1 — whatever Documents holds for
    /// the MSME Enterprise audience. Maintained in the admin module's upload
    /// screen rather than hard-coded here, so the manual can be replaced
    /// without a deployment.
    /// </summary>
    [HttpGet("applicant-documents")]
    public async Task<IActionResult> GetApplicantDocuments(CancellationToken ct)
    {
        const byte msmeEnterprise = 10;

        // Only the registration guide, not everything published to applicants:
        // R1 is about getting registered, and the training and subsidy manuals
        // belong on the dashboard once they are in. Matched on the title so an
        // administrator controls it by what they name the upload.
        var rows = await db.Documents.AsNoTracking()
            .Where(d => d.IsActive && !d.IsDeleted
                        && d.CurrentVersionId != null
                        && d.Audiences.Any(a => a.AccountTypeId == msmeEnterprise)
                        && EF.Functions.Like(d.Title, "%registration%"))
            .OrderBy(d => d.Title)
            .Select(d => new
            {
                d.DocumentId,
                d.Title,
                d.Description,
                VersionId = d.CurrentVersionId!.Value,
                ContentType = d.CurrentVersion!.ContentType,
                FileName = d.CurrentVersion.OriginalFileName,
            })
            .ToListAsync(ct);

        // Split by media type so R1 can label one "manual" and one "video"
        // without the wording depending on how the file was named.
        return Ok(rows.Select(r => new
        {
            r.DocumentId,
            r.Title,
            r.Description,
            r.VersionId,
            r.FileName,
            Kind = r.ContentType.StartsWith("video/", StringComparison.OrdinalIgnoreCase)
                ? "video"
                : "document",
            Url = $"/api/registration/applicant-documents/{r.DocumentId}/{r.VersionId}",
        }));
    }

    /// <summary>Streams one of those documents. Anonymous, like the rest of R1.</summary>
    [HttpGet("applicant-documents/{id:int}/{versionId:int}")]
    public async Task<IActionResult> DownloadApplicantDocument(int id, int versionId, CancellationToken ct)
    {
        const byte msmeEnterprise = 10;

        // Re-checked here, not just in the listing: the id is in the URL and a
        // caller could put any number in it.
        var allowed = await db.Documents.AsNoTracking()
            .AnyAsync(d => d.DocumentId == id && d.IsActive && !d.IsDeleted
                           && d.Audiences.Any(a => a.AccountTypeId == msmeEnterprise), ct);

        if (!allowed) return NotFound();

        var version = await db.DocumentVersions.AsNoTracking()
            .SingleOrDefaultAsync(v => v.DocumentVersionId == versionId && v.DocumentId == id, ct);

        if (version is null) return NotFound();

        var stream = await files.OpenReadAsync(version.RelativePath, version.StoredFileName, ct);
        return File(stream, version.ContentType, version.OriginalFileName);
    }

    /// <summary>The programmes behind R5's "Select program".</summary>
    [HttpGet("awareness-programs")]
    public async Task<IActionResult> GetAwarenessPrograms(CancellationToken ct)
        => Ok(await db.AwarenessPrograms.AsNoTracking()
            .Where(p => p.IsActive)
            .OrderByDescending(p => p.HeldOn)
            .Select(p => new
            {
                p.AwarenessProgramId,
                // The readable code the applicant sees on their attendance
                // record; the surrogate key means nothing to them.
                p.ProgramCode,
                p.Name,
                p.HeldOn,
                p.Venue,
            })
            .ToListAsync(ct));

    // ------------------------------------------------ R2: Udyam validation ---

    /// <summary>
    /// Verifies a Udyam number against the registry and opens (or resumes) a
    /// draft. No OTP at this step — matching the mobile against Udyam records
    /// IS the check, which is what the artboard states.
    /// </summary>
    [HttpPost("verify-udyam")]
    public async Task<IActionResult> VerifyUdyam(
        [FromBody] VerifyUdyamRequest request, CancellationToken ct)
    {
        var udyamNo = request.UdyamRegistrationNo.Trim().ToUpperInvariant();
        var mobile = OnlyDigits(request.Mobile);

        // Already a registered enterprise? Then this is a sign-in, not a
        // registration, and saying so is safe: they hold the number already.
        var existing = await db.Enterprises.AsNoTracking()
            .Where(e => e.UdyamRegistrationNo == udyamNo)
            .Select(e => new { e.LeanId })
            .SingleOrDefaultAsync(ct);

        // An enterprise may hold several plants and register each of them, so a
        // Udyam number that is already on the scheme is not turned away here.
        // The plant is what may not be registered twice, and that is checked
        // at R4 where the plant is actually chosen.
        if (existing is not null)
        {
            logger.LogInformation(
                "Udyam {Udyam} is already registered as {LeanId}; continuing for another plant.",
                udyamNo, existing.LeanId);
        }

        var record = await udyam.GetAsync(udyamNo, mobile, ct);

        if (record is null)
        {
            // One message for "no such number" and "wrong mobile" on purpose:
            // distinguishing them turns this into a lookup service for whether
            // a given Udyam number exists.
            return BadRequest(new
            {
                message = "We could not verify that Udyam number with the mobile provided. " +
                          "Check both against your Udyam certificate and try again.",
            });
        }

        // Resume rather than fork: a second attempt on the same number picks up
        // where the applicant left off.
        var draft = await db.Registrations.AsTracking()
            .SingleOrDefaultAsync(r => r.UdyamRegistrationNo == udyamNo && r.Status == "Draft", ct);

        if (draft is null)
        {
            draft = new Registration
            {
                SessionToken = Guid.NewGuid(),
                UdyamRegistrationNo = udyamNo,
                UdyamMobile = mobile,
                StartedOnUtc = clock.UtcNow,
                CurrentStep = 3,
            };
            db.Registrations.Add(draft);
        }
        else
        {
            draft.UdyamMobile = mobile;
            if (draft.CurrentStep < 3) draft.CurrentStep = 3;
        }

        draft.UdyamPayload = record.RawXml;
        await db.SaveChangesAsync(ct);

        return Ok(new
        {
            sessionToken = draft.SessionToken,
            currentStep = draft.CurrentStep,
            enterprise = Describe(record),
            plants = await DescribePlants(record, ct),
            activities = await DescribeActivities(record, ct),
        });
    }

    // --------------------------------------------------------- resume a draft ---

    [HttpGet("{token:guid}")]
    public async Task<IActionResult> Resume(Guid token, CancellationToken ct)
    {
        var draft = await Load(token, ct);
        if (draft is null) return NotFound();

        var record = ParsePayload(draft);

        return Ok(new
        {
            sessionToken = draft.SessionToken,
            currentStep = draft.CurrentStep,
            udyamRegistrationNo = draft.UdyamRegistrationNo,
            enterprise = record is null ? null : Describe(record),
            plants = record is null ? null : await DescribePlants(record, ct),
            activities = record is null ? null : await DescribeActivities(record, ct),
            selectedUnitIdNo = draft.SelectedUnitIdNo,
            selectedNicFiveDigit = draft.SelectedNicFiveDigit,
            spoc = new
            {
                name = draft.SpocName,
                designation = draft.SpocDesignation,
                mobile = draft.SpocMobile,
                email = draft.SpocEmail,
            },
            attendedAwareness = draft.AttendedAwareness,
            awarenessProgramId = draft.AwarenessProgramId,
            emailVerified = draft.EmailVerifiedOnUtc is not null,
            pledgeAccepted = draft.PledgeAcceptedOnUtc is not null,
        });
    }

    // ------------------------------------------------- R4: unit and activity ---

    [HttpPut("{token:guid}/unit")]
    public async Task<IActionResult> SaveUnit(
        Guid token, [FromBody] SaveUnitRequest request, CancellationToken ct)
    {
        var draft = await Load(token, ct);
        if (draft is null) return NotFound();

        var record = ParsePayload(draft);

        // Both choices are validated against the Udyam payload rather than
        // trusted: the browser must not be able to register a plant or an
        // activity the registry never reported.
        if (record is not null)
        {
            var chosen = record.Plants.FirstOrDefault(p => p.UnitIdNo == request.UnitIdNo);

            if (chosen is null)
            {
                return BadRequest(new { message = "That unit is not on the Udyam record." });
            }

            // One plant, one registration. The enterprise may come back for a
            // different plant, which is why R2 lets a known Udyam number
            // through, but the same plant may not be registered twice.
            var takenBy = await RegisteredPlantOwnerAsync(chosen.PlantIdNo, chosen.UnitIdNo, ct);

            if (takenBy is not null)
            {
                return Conflict(new
                {
                    code = "PLANT_ALREADY_REGISTERED",
                    message = $"{chosen.UnitName ?? "That plant"} is already registered under " +
                              $"{takenBy}. Choose another plant, or sign in with that LEAN ID.",
                    leanId = takenBy,
                });
            }

            var activity = record.Activities.FirstOrDefault(a => a.NicFiveDigit == request.NicFiveDigit);

            if (activity is null)
            {
                return BadRequest(new { message = "That activity is not on the Udyam record." });
            }

            // Checked here as well as on the screen: the eligibility flag the
            // browser was sent is a convenience, not a control, and a request
            // can be made without ever loading the page.
            var covered = activity.NicTwoDigit is not null
                && await db.Sectors.AsNoTracking()
                    .AnyAsync(sec => sec.IsActive && sec.NicCode == activity.NicTwoDigit, ct);

            if (!covered)
            {
                return Conflict(new
                {
                    code = "SECTOR_NOT_ELIGIBLE",
                    message = $"NIC {activity.NicTwoDigit} — {activity.NicTwoDigitName} is not " +
                              "currently covered by the LEAN Scheme. Choose an activity in a " +
                              "covered sector, or contact the helpline.",
                });
            }
        }

        draft.SelectedUnitIdNo = request.UnitIdNo;
        draft.SelectedNicFiveDigit = request.NicFiveDigit;
        draft.CurrentStep = Math.Max(draft.CurrentStep, (byte)5);

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ------------------------------------------------ R5: SPOC and awareness ---

    [HttpPut("{token:guid}/spoc")]
    public async Task<IActionResult> SaveSpoc(
        Guid token, [FromBody] SaveSpocRequest request, CancellationToken ct)
    {
        var draft = await Load(token, ct);
        if (draft is null) return NotFound();

        if (request.AttendedAwareness && request.AwarenessProgramId is null)
        {
            return BadRequest(new { message = "Select which awareness programme was attended." });
        }

        var email = request.Email.Trim().ToLowerInvariant();

        // One address may stand behind at most three registrations. A
        // consultant registering for a few clients is ordinary; one address
        // behind dozens is not.
        //
        // Note this is a cap, not a bar: an address that already has a portal
        // account is fine, because the plants it registers are attached to
        // that same account rather than to a second one.
        // An address belonging to a portal account — Ministry, IA, consultant,
        // assessor — is not an applicant's to use. Only applicant accounts
        // (account type 10) may share an address with a registration, and that
        // is how a SPOC registers a second plant.
        var staffAccount = await db.Users.AsNoTracking()
            .AnyAsync(u => u.Email == email && u.AccountTypeId != 10 && !u.IsDeleted, ct);

        if (staffAccount)
        {
            return Conflict(new
            {
                code = "SPOC_EMAIL_IS_PORTAL_USER",
                message = $"{request.Email.Trim()} belongs to a portal user account and cannot be " +
                          "used as an applicant's SPOC address. Use the enterprise's own address.",
            });
        }

        var used = await SpocEmailUseCountAsync(email, ct);

        if (used >= MaxRegistrationsPerSpocEmail)
        {
            return Conflict(new
            {
                code = "SPOC_EMAIL_LIMIT",
                message = $"{request.Email.Trim()} has already been used for " +
                          $"{MaxRegistrationsPerSpocEmail} registrations, which is the limit. " +
                          "Use a different SPOC e-mail address.",
            });
        }

        // Changing the address invalidates any OTP already sent to the old one.
        if (!string.Equals(draft.SpocEmail, email, StringComparison.OrdinalIgnoreCase))
        {
            draft.OtpHash = null;
            draft.OtpSentOnUtc = null;
            draft.OtpAttempts = 0;
            draft.EmailVerifiedOnUtc = null;
        }

        draft.SpocName = request.FullName.Trim();
        draft.SpocDesignation = request.Designation.Trim();
        draft.SpocMobile = OnlyDigits(request.Mobile);
        draft.SpocEmail = email;
        draft.AttendedAwareness = request.AttendedAwareness;
        draft.AwarenessProgramId = request.AttendedAwareness ? request.AwarenessProgramId : null;
        draft.CurrentStep = Math.Max(draft.CurrentStep, (byte)6);

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    // ---------------------------------------------------------- R6: e-mail OTP ---

    [HttpPost("{token:guid}/otp")]
    public async Task<IActionResult> SendOtp(Guid token, CancellationToken ct)
    {
        var draft = await Load(token, ct);
        if (draft is null) return NotFound();

        if (string.IsNullOrWhiteSpace(draft.SpocEmail))
        {
            return BadRequest(new { message = "Enter the SPOC details first." });
        }

        // Six digits, from a cryptographic source rather than Random: the OTP is
        // the only thing standing between a stranger and a completed
        // registration against somebody else's Udyam number.
        // Invariant: a locale-dependent format can emit non-ASCII digits,
        // which would then never match what the applicant types back.
        var otp = RandomNumberGenerator.GetInt32(0, 1_000_000)
            .ToString("D6", CultureInfo.InvariantCulture);

        draft.OtpHash = HashOtp(otp, draft.SessionToken);
        draft.OtpSentOnUtc = clock.UtcNow;
        draft.OtpAttempts = 0;

        await db.SaveChangesAsync(ct);

        // Through the template, so the wording is maintained from
        // Emailer > Transactional rather than compiled into this method.
        await email.QueueTemplatedAsync("REG_OTP", draft.SpocEmail!, null,
            new Dictionary<string, string>
            {
                ["otp"] = otp,
                ["valid_minutes"] = OtpValidMinutes.ToString(CultureInfo.InvariantCulture),
            }, ct);

        logger.LogInformation("Registration OTP queued for {Registration}.", draft.RegistrationId);

        return Ok(new
        {
            sentTo = Mask(draft.SpocEmail!),
            validForMinutes = OtpValidMinutes,
        });
    }

    [HttpPost("{token:guid}/otp/verify")]
    public async Task<IActionResult> VerifyOtp(
        Guid token, [FromBody] VerifyOtpRequest request, CancellationToken ct)
    {
        var draft = await Load(token, ct);
        if (draft is null) return NotFound();

        if (draft.OtpHash is null || draft.OtpSentOnUtc is null)
        {
            return BadRequest(new { message = "Request an OTP first." });
        }

        if (draft.OtpAttempts >= MaxOtpAttempts)
        {
            return BadRequest(new
            {
                message = "Too many incorrect attempts. Request a new OTP.",
            });
        }

        if (clock.UtcNow > draft.OtpSentOnUtc.Value.AddMinutes(OtpValidMinutes))
        {
            return BadRequest(new { message = "That OTP has expired. Request a new one." });
        }

        var supplied = HashOtp(OnlyDigits(request.Otp), draft.SessionToken);

        // Fixed-time comparison: a plain != leaks how much of the OTP matched
        // through timing.
        if (!CryptographicOperations.FixedTimeEquals(supplied, draft.OtpHash))
        {
            draft.OtpAttempts++;
            await db.SaveChangesAsync(ct);

            return BadRequest(new
            {
                message = "That OTP is not correct.",
                attemptsLeft = MaxOtpAttempts - draft.OtpAttempts,
            });
        }

        draft.EmailVerifiedOnUtc = clock.UtcNow;
        draft.OtpHash = null;
        draft.CurrentStep = Math.Max(draft.CurrentStep, (byte)7);

        await db.SaveChangesAsync(ct);
        return Ok(new { verified = true });
    }

    // ------------------------------------------------ R8/R9: pledge, complete ---

    /// <summary>
    /// Accepts the pledge and creates the enterprise. This is the only place an
    /// Enterprise row is created from a registration, and it happens in one
    /// transaction: a half-created enterprise with no user, or a user with no
    /// enterprise, would both be worse than a failed registration.
    /// </summary>
    [HttpPost("{token:guid}/complete")]
    public async Task<IActionResult> Complete(
        Guid token, [FromBody] CompleteRequest request, CancellationToken ct)
    {
        var draft = await Load(token, ct);
        if (draft is null) return NotFound();

        if (draft.EmailVerifiedOnUtc is null)
        {
            return BadRequest(new { message = "Verify the SPOC e-mail address first." });
        }

        if (!request.AcceptPledge)
        {
            return BadRequest(new { message = "The LEAN Pledge must be accepted to continue." });
        }

        if (string.IsNullOrWhiteSpace(draft.SpocEmail) || string.IsNullOrWhiteSpace(draft.SpocName))
        {
            return BadRequest(new { message = "The SPOC details are incomplete." });
        }

        var record = ParsePayload(draft);
        if (record is null)
        {
            return BadRequest(new
            {
                message = "The Udyam details for this registration are no longer available. " +
                          "Please start again.",
            });
        }

        var state = record.StateCode is null
            ? null
            : await db.States.AsNoTracking()
                .SingleOrDefaultAsync(s => s.Code == record.StateCode, ct);

        var district = (state is null || record.DistrictCode is null)
            ? null
            : await db.Districts.AsNoTracking()
                .SingleOrDefaultAsync(d => d.StateId == state.StateId && d.Code == record.DistrictCode, ct);

        // The sector follows the activity the applicant CHOSE at R4, not the
        // record's primary one.
        //
        // A Udyam record lists several activities and its enterprise-level NIC
        // is simply the first of them. An enterprise whose first line is, say,
        // 06 (crude petroleum) but which registered its covered line 12
        // (tobacco products) passed the eligibility check at R4 and was then
        // refused here, because this looked up 06 and the scheme does not
        // cover it. The two must agree, and the chosen one is the one the
        // questionnaire and the assessment are built on.
        var chosenActivity = draft.SelectedNicFiveDigit is null
            ? null
            : record.Activities.FirstOrDefault(a => a.NicFiveDigit == draft.SelectedNicFiveDigit);

        var nicTwoDigit = chosenActivity?.NicTwoDigit ?? record.NicTwoDigit;

        var sector = nicTwoDigit is null
            ? null
            : await db.Sectors.AsNoTracking()
                .SingleOrDefaultAsync(s => s.NicCode == nicTwoDigit, ct);

        // StateId and SectorId are NOT NULL on Enterprise, and both are
        // reporting dimensions — the dashboard's map and the sector mix are
        // built on them. Guessing a default here would put the enterprise in
        // the wrong state or the wrong sector permanently, so an unresolvable
        // Udyam code stops the registration instead.
        if (state is null || sector is null)
        {
            logger.LogWarning(
                "Registration {Registration}: unresolved masters (state {StateCode}={StateOk}, NIC {Nic}={SectorOk}).",
                draft.RegistrationId, record.StateCode, state is not null,
                nicTwoDigit, sector is not null);

            return Problem(
                title: "We could not match your Udyam details to the scheme's records.",
                detail: "The state or activity code on your Udyam registration is not one the " +
                        "portal recognises yet. Please contact the helpline quoting your Udyam number.",
                statusCode: StatusCodes.Status409Conflict);
        }

        // The subsidy category decides the GoI / MSME split on every invoice, so
        // it is derived from the Udyam record rather than defaulted: an
        // enterprise put in the wrong band is billed the wrong amount for the
        // life of its application. Order matters — the additional 5% is not
        // cumulative, so the first qualifying band wins and General is the
        // fallback when none applies.
        var subsidyCode =
            state.IsNorthEastern ? "NER"
            : string.Equals(record.SocialCategory, "SC", StringComparison.OrdinalIgnoreCase) ? "SC"
            : string.Equals(record.SocialCategory, "ST", StringComparison.OrdinalIgnoreCase) ? "ST"
            : string.Equals(record.Gender, "Female", StringComparison.OrdinalIgnoreCase) ? "WOM"
            : "GEN";

        var subsidyCategoryId = await db.SubsidyCategories.AsNoTracking()
            .Where(c => c.Code == subsidyCode)
            .Select(c => (byte?)c.SubsidyCategoryId)
            .SingleOrDefaultAsync(ct);

        subsidyCategoryId ??= await db.SubsidyCategories.AsNoTracking()
            .Where(c => c.Code == "GEN")
            .Select(c => (byte?)c.SubsidyCategoryId)
            .SingleAsync(ct);

        var serial = await sequences.NextAsync("LeanId", null, ct);

        // The two-letter state comes from the Udyam number itself
        // (UDYAM-MH-26-0014582 -> MH). master.State.Code holds the LGD numeric
        // code, which would render LEAN-27-... instead of the LEAN-MH-... the
        // design specifies.
        var stateLetters = draft.UdyamRegistrationNo.Split('-') is [_, var letters, ..]
            ? letters
            : "IN";

        var leanId = $"LEAN-{stateLetters}-{clock.UtcNow:yyyy}-{serial}";

        // The context is configured with connection resiliency, and a retrying
        // execution strategy refuses a hand-rolled transaction: on a retry it
        // could re-run half of one. The whole write has to go through the
        // strategy so a transient failure replays it as one unit.
        var strategy = db.Database.CreateExecutionStrategy();

        // Declared out here so the response can read the id the transaction
        // assigned.
        Enterprise enterprise = null!;

        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync(ct);

        enterprise = new Enterprise
        {
            LeanId = leanId,
            UdyamRegistrationNo = draft.UdyamRegistrationNo,
            Name = record.EnterpriseName ?? draft.UdyamRegistrationNo,
            SectorId = sector.SectorId,
            SubsidyCategoryId = subsidyCategoryId!.Value,
            EnterpriseSize = record.EnterpriseType ?? "Unspecified",
            AddressLine = record.Address,
            StateId = state.StateId,
            DistrictId = district?.DistrictId,
            Pincode = record.Pincode,
            ContactPersonName = draft.SpocName,
            ContactDesignation = draft.SpocDesignation,
            ContactEmail = draft.SpocEmail,
            ContactMobile = draft.SpocMobile,
            Pan = record.Pan,
            UdyamApplicationId = record.ApplicationId,
            OwnerName = record.OwnerName,
            OrganisationType = record.OrganisationType,
            Gender = record.Gender,
            SocialCategory = record.SocialCategory,
            IsPhysicallyHandicapped = record.IsPhysicallyHandicapped,
            MajorActivity = record.MajorActivity,
            // The chosen activity, for the same reason as the sector above: it
            // decides the questionnaire set and it is what the certificate
            // will name.
            NicTwoDigit = chosenActivity?.NicTwoDigit ?? record.NicTwoDigit,
            NicFourDigit = chosenActivity?.NicFourDigit ?? record.NicFourDigit,
            NicFiveDigit = chosenActivity?.NicFiveDigit ?? record.NicFiveDigit,
            NicDescription = chosenActivity?.NicFiveDigitName ?? record.NicDescription,
            TotalEmployees = record.TotalEmployees,
            IncorporationDate = record.IncorporationDate,
            CommencementDate = record.CommencementDate,
            UdyamFetchedOnUtc = clock.UtcNow,
            LgStateCode = record.StateCode,
            LgDistrictCode = record.DistrictCode,
            StateNameRaw = record.StateName,
            DistrictNameRaw = record.DistrictName,
            WhetherProductionCommenced = record.WhetherProductionCommenced,
            DicName = record.DicName,
            UdyamAppliedDate = record.AppliedDate,
            UdyamRawResponse = record.RawXml,
            IsActive = true,
            RegisteredOnUtc = clock.UtcNow,
        };

        db.Enterprises.Add(enterprise);
        await db.SaveChangesAsync(ct);

        // Plants and activities, then the two the applicant chose.
        foreach (var plant in record.Plants)
        {
            db.EnterprisePlants.Add(new EnterprisePlant
            {
                EnterpriseId = enterprise.EnterpriseId,
                UdyamApplicationId = plant.ApplicationId,
                UnitIdNo = plant.UnitIdNo,
                UnitName = plant.UnitName,
                UamNo = plant.UamNo,
                PlantIdNo = plant.PlantIdNo,
                AddressLine = plant.Address,
                Pincode = plant.Pincode,
                LgDistrictCode = plant.DistrictCode,
                StateNameRaw = plant.StateName,
                DistrictNameRaw = plant.DistrictName,
                CreatedOnUtc = clock.UtcNow,
            });
        }

        foreach (var activity in record.Activities)
        {
            db.EnterpriseActivities.Add(new EnterpriseActivity
            {
                EnterpriseId = enterprise.EnterpriseId,
                UdyamApplicationId = activity.ApplicationId,
                Activity = activity.Activity,
                NicTwoDigit = activity.NicTwoDigit,
                NicTwoDigitName = activity.NicTwoDigitName,
                NicFourDigit = activity.NicFourDigit,
                NicFourDigitName = activity.NicFourDigitName,
                NicFiveDigit = activity.NicFiveDigit,
                NicFiveDigitName = activity.NicFiveDigitName,
                IsPrimary = activity.NicFiveDigit == draft.SelectedNicFiveDigit,
                CreatedOnUtc = clock.UtcNow,
            });
        }

        await db.SaveChangesAsync(ct);

        var selectedPlant = await db.EnterprisePlants
            .Where(p => p.EnterpriseId == enterprise.EnterpriseId && p.UnitIdNo == draft.SelectedUnitIdNo)
            .Select(p => new { p.EnterprisePlantId, p.PlantIdNo })
            .FirstOrDefaultAsync(ct);

        enterprise.SelectedPlantId = selectedPlant?.EnterprisePlantId;

        // Recorded on the enterprise so the "one registration per plant" rule
        // is a unique index rather than a query over every unit it owns.
        enterprise.RegisteredPlantIdNo = selectedPlant?.PlantIdNo;

        enterprise.SelectedActivityId = await db.EnterpriseActivities
            .Where(a => a.EnterpriseId == enterprise.EnterpriseId && a.NicFiveDigit == draft.SelectedNicFiveDigit)
            .Select(a => (int?)a.EnterpriseActivityId).FirstOrDefaultAsync(ct);

        draft.Status = "Completed";
        draft.EnterpriseId = enterprise.EnterpriseId;
        draft.CompletedOnUtc = clock.UtcNow;
        draft.PledgeAcceptedOnUtc = clock.UtcNow;
        draft.PledgeAcceptedBy = draft.SpocName;
        draft.PledgeAcceptedIp = HttpContext.Connection.RemoteIpAddress?.ToString();
        draft.CurrentStep = 8;

            await db.SaveChangesAsync(ct);
            await tx.CommitAsync(ct);
        });

        // The account is issued after the transaction commits: UserManager runs
        // its own SaveChanges, which cannot join the execution strategy's
        // transaction. A failure here leaves the enterprise registered and is
        // logged — recoverable by re-issuing the account — where rolling the
        // whole registration back over a mail problem would not be.
        await IssueApplicantAccountAsync(enterprise, draft, leanId, ct);

        return Ok(new
        {
            leanId,
            enterpriseId = enterprise.EnterpriseId,
            enterpriseName = enterprise.Name,
            spocEmail = Mask(draft.SpocEmail!),
            message = "Registration complete. The LEAN ID and password have been sent to the " +
                      "verified SPOC e-mail address.",
        });
    }

    /// <summary>
    /// Creates the enterprise's own sign-in account and mails the LEAN ID and
    /// password to the verified SPOC address.
    ///
    /// The LEAN ID is the user code, so the applicant signs in with the same
    /// identifier they quote in correspondence. The password is generated, not
    /// chosen: nothing in the wizard collects one, and MustChangePassword
    /// forces it to be replaced at first sign-in.
    /// </summary>
    private async Task IssueApplicantAccountAsync(
        Enterprise enterprise, Registration draft, string leanId, CancellationToken ct)
    {
        try
        {
            var roleId = await db.Roles
                .Where(r => r.Code == "ENTERPRISE_USER")
                .Select(r => (int?)r.Id)
                .SingleOrDefaultAsync(ct);

            if (roleId is null)
            {
                logger.LogError("The ENTERPRISE_USER role is missing; no account issued for {LeanId}.", leanId);
                return;
            }

            var password = GenerateApplicantPassword();

            var user = new ApplicationUser
            {
                UserName = leanId,
                UserCode = leanId,
                Email = draft.SpocEmail,
                FullName = draft.SpocName ?? enterprise.Name,
                Designation = draft.SpocDesignation,
                PhoneNumber = draft.SpocMobile,
                AccountTypeId = 10,          // MSME Enterprise
                RoleId = roleId.Value,
                StateId = enterprise.StateId,
                DistrictId = enterprise.DistrictId,
                StatusId = (byte)UserStatusId.Active,
                MustChangePassword = true,
                EmailConfirmed = true,       // the OTP at R6 proved the address
                CreatedOnUtc = clock.UtcNow,
            };

            var created = await userManager.CreateAsync(user, password);

            if (!created.Succeeded)
            {
                logger.LogError("Could not issue an account for {LeanId}: {Errors}.",
                    leanId, string.Join("; ", created.Errors.Select(e => e.Description)));
                return;
            }

            // The enterprise points at the account that speaks for it.
            enterprise.PrimaryUserId = user.Id;
            await db.SaveChangesAsync(ct);

            var origin = Request.Headers.Origin.ToString();

            await email.QueueTemplatedAsync("APPLICANT_CREDENTIALS", draft.SpocEmail!, user.Id,
                new Dictionary<string, string>
                {
                    ["unit_name"] = enterprise.Name,
                    ["lean_id"] = leanId,
                    ["password"] = password,
                    ["login_url"] = $"{origin}/msme/login",
                    ["support_email"] = "consultancy.zed@qcin.org",
                }, ct);

            logger.LogInformation("Applicant account issued for {LeanId}.", leanId);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Issuing the applicant account for {LeanId} failed.", leanId);
        }
    }

    /// <summary>
    /// A readable password that satisfies the policy: upper, lower, digit and
    /// symbol. Ambiguous glyphs are left out because this is transcribed from
    /// an e-mail by hand.
    /// </summary>
    private static string GenerateApplicantPassword()
    {
        const string upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string lower = "abcdefghijkmnopqrstuvwxyz";
        const string digits = "23456789";
        const string symbols = "@#$%&*";

        char Pick(string set) => set[RandomNumberGenerator.GetInt32(set.Length)];

        // Fourteen characters: the policy floor is twelve, and the extra two
        // absorb a future tightening without this silently failing again.
        var chars = new List<char>
        {
            Pick(upper), Pick(upper), Pick(upper),
            Pick(lower), Pick(lower), Pick(lower), Pick(lower), Pick(lower), Pick(lower),
            Pick(digits), Pick(digits), Pick(digits),
            Pick(symbols), Pick(symbols),
        };

        // Shuffle, so the classes do not always land in the same positions.
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string([.. chars]);
    }

    /// <summary>How many completed registrations one SPOC address may hold.</summary>
    private const int MaxRegistrationsPerSpocEmail = 3;

    /// <summary>
    /// The LEAN ID of the enterprise already registered against this plant, or
    /// null when it is free.
    ///
    /// PlantIdNo is the registry's own identifier for a plant and is what the
    /// check keys on. UnitIdNo is the fallback for older records that carry no
    /// plant id; it is not used on its own because the registry repeats it
    /// across the units of one enterprise.
    /// </summary>
    private async Task<string?> RegisteredPlantOwnerAsync(
        string? plantIdNo, string? unitIdNo, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(plantIdNo) && string.IsNullOrWhiteSpace(unitIdNo))
        {
            return null;
        }

        // Enterprise.RegisteredPlantIdNo, not the plant table: an enterprise
        // holds a row for every unit on its Udyam record, and all but one of
        // them are simply units it owns rather than the plant it registered.
        if (!string.IsNullOrWhiteSpace(plantIdNo))
        {
            return await db.Enterprises.AsNoTracking()
                .Where(e => e.RegisteredPlantIdNo == plantIdNo)
                .Select(e => e.LeanId)
                .FirstOrDefaultAsync(ct);
        }

        // Older records carry no plant id, so fall back to the selected plant's
        // unit id — matched through SelectedPlantId so the other units on the
        // same record are not caught by it.
        return await db.Enterprises.AsNoTracking()
            .Where(e => e.SelectedPlantId != null)
            .Join(
                db.EnterprisePlants.AsNoTracking(),
                e => e.SelectedPlantId,
                p => p.EnterprisePlantId,
                (e, p) => new { e.LeanId, p.UnitIdNo, p.PlantIdNo })
            .Where(x => x.PlantIdNo == null && x.UnitIdNo == unitIdNo)
            .Select(x => x.LeanId)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>
    /// How many enterprises already name this address as their SPOC.
    ///
    /// A consultant registering on behalf of a handful of clients is normal;
    /// one address behind dozens of registrations is not, so the scheme caps
    /// it at <see cref="MaxRegistrationsPerSpocEmail"/>.
    /// </summary>
    private Task<int> SpocEmailUseCountAsync(string email, CancellationToken ct)
        => db.Enterprises.AsNoTracking()
            .CountAsync(e => e.ContactEmail == email, ct);

    // ----------------------------------------------------------------- helpers ---

    private Task<Registration?> Load(Guid token, CancellationToken ct)
        => db.Registrations.AsTracking()
            .SingleOrDefaultAsync(r => r.SessionToken == token && r.Status == "Draft", ct);

    private UdyamRecord? ParsePayload(Registration draft)
        => string.IsNullOrWhiteSpace(draft.UdyamPayload)
            ? null
            : UdyamRegistryClient.Parse(draft.UdyamRegistrationNo, draft.UdyamPayload, logger);

    /// <summary>
    /// Plants, indexed. Udyam can report several units sharing a UnitIdNo — or
    /// none at all — so the index is what the browser selects by. Selecting by
    /// UnitIdNo made every unit with the same value light up at once.
    /// </summary>
    private async Task<List<RegistrationPlantDto>> DescribePlants(UdyamRecord r, CancellationToken ct)
    {
        var plants = new List<RegistrationPlantDto>(r.Plants.Count);

        for (var i = 0; i < r.Plants.Count; i++)
        {
            var p = r.Plants[i];
            var owner = await RegisteredPlantOwnerAsync(p.PlantIdNo, p.UnitIdNo, ct);

            plants.Add(new RegistrationPlantDto(
                i, p.UnitIdNo, p.UnitName, p.Address, p.Pincode, p.StateName, p.DistrictName,
                owner is not null, owner));
        }

        return plants;
    }

    /// <summary>
    /// Activities, each marked with whether the scheme actually covers it.
    ///
    /// master.Sector is the list of NIC divisions the Ministry has opened the
    /// scheme to, and an administrator can deactivate one. An enterprise whose
    /// only activity sits outside that list cannot be assessed — there is no
    /// questionnaire for it — so the screen says so at the point of choosing
    /// rather than failing at the end of the wizard.
    /// </summary>
    private async Task<List<RegistrationActivityDto>> DescribeActivities(
        UdyamRecord r, CancellationToken ct)
    {
        var codes = r.Activities
            .Where(a => a.NicTwoDigit != null)
            .Select(a => a.NicTwoDigit!)
            .Distinct()
            .ToList();

        var eligible = await db.Sectors.AsNoTracking()
            .Where(s => s.IsActive && codes.Contains(s.NicCode))
            .Select(s => new { s.NicCode, s.Name })
            .ToListAsync(ct);

        return r.Activities.Select((a, i) =>
        {
            var sector = eligible.FirstOrDefault(s => s.NicCode == a.NicTwoDigit);

            return new RegistrationActivityDto(
                i, a.Activity,
                a.NicTwoDigit, a.NicTwoDigitName,
                a.NicFourDigit, a.NicFourDigitName,
                a.NicFiveDigit, a.NicFiveDigitName,
                sector is not null, sector?.Name);
        }).ToList();
    }

    private static object Describe(UdyamRecord r) => new
    {
        udyamNumber = r.UdyamNumber,
        enterpriseName = r.EnterpriseName,
        ownerName = r.OwnerName,
        organisationType = r.OrganisationType,
        gender = r.Gender,
        socialCategory = r.SocialCategory,
        address = r.Address,
        pincode = r.Pincode,
        stateName = r.StateName,
        districtName = r.DistrictName,
        enterpriseType = r.EnterpriseType,
        majorActivity = r.MajorActivity,
        totalEmployees = r.TotalEmployees,
        incorporationDate = r.IncorporationDate,
        commencementDate = r.CommencementDate,
        appliedDate = r.AppliedDate,
        pan = r.Pan,
    };

    /// <summary>
    /// Salted with the session token so the same OTP under two registrations
    /// hashes differently, and a stolen hash cannot be replayed elsewhere.
    /// </summary>
    private static byte[] HashOtp(string otp, Guid token)
        => SHA256.HashData(Encoding.UTF8.GetBytes($"{token:N}:{otp}"));

    private static string OnlyDigits(string value)
        => new(value.Where(char.IsDigit).ToArray());

    /// <summary>r***h@sharmaauto.in — enough to recognise, not enough to harvest.</summary>
    private static string Mask(string email)
    {
        var at = email.IndexOf('@');
        if (at <= 1) return email;

        var name = email[..at];
        var shown = name.Length <= 2 ? name[..1] : $"{name[0]}***{name[^1]}";
        return shown + email[at..];
    }
}

// ------------------------------------------------------------------ responses ---

public sealed record RegistrationPlantDto(
    int Index,
    string? UnitIdNo,
    string? UnitName,
    string? Address,
    string? Pincode,
    string? State,
    string? District,
    // Set when this plant is already on the scheme, so R4 can show it as
    // unavailable instead of failing when the applicant presses Continue.
    bool IsRegistered,
    string? RegisteredLeanId);

public sealed record RegistrationActivityDto(
    int Index,
    string? Activity,
    string? NicTwoDigit,
    string? NicTwoDigitName,
    string? NicFourDigit,
    string? NicFourDigitName,
    string? NicFiveDigit,
    string? NicFiveDigitName,
    // True when master.Sector covers this NIC division and it is active.
    bool IsEligible,
    string? SectorName);

// ------------------------------------------------------------------ requests ---

public sealed class VerifyUdyamRequest
{
    [Required, RegularExpression(@"^(?i)UDYAM-[A-Z]{2}-\d{2}-\d{7}$",
        ErrorMessage = "Enter a Udyam number in the form UDYAM-XX-00-0000000.")]
    public string UdyamRegistrationNo { get; init; } = string.Empty;

    [Required, StringLength(20)]
    public string Mobile { get; init; } = string.Empty;

    /// <summary>The "I am authorised to register this enterprise" tick on R2.</summary>
    public bool Authorised { get; init; }
}

public sealed class SaveUnitRequest
{
    [Required, StringLength(60)]
    public string UnitIdNo { get; init; } = string.Empty;

    [Required, StringLength(10)]
    public string NicFiveDigit { get; init; } = string.Empty;
}

public sealed class SaveSpocRequest
{
    [Required, StringLength(200)]
    public string FullName { get; init; } = string.Empty;

    [Required, StringLength(150)]
    public string Designation { get; init; } = string.Empty;

    [Required, RegularExpression(@"^(\+91[\s-]?)?[6-9]\d{9}$",
        ErrorMessage = "Enter a 10-digit Indian mobile number.")]
    public string Mobile { get; init; } = string.Empty;

    [Required, EmailAddress, StringLength(256)]
    public string Email { get; init; } = string.Empty;

    public bool AttendedAwareness { get; init; }
    public int? AwarenessProgramId { get; init; }
}

public sealed class VerifyOtpRequest
{
    [Required, StringLength(10)]
    public string Otp { get; init; } = string.Empty;
}

public sealed class CompleteRequest
{
    public bool AcceptPledge { get; init; }
}

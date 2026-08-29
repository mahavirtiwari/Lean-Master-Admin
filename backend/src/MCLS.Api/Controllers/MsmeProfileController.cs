using System.ComponentModel.DataAnnotations;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Msme;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The applicant's own profile (P01), and the parts of it they may change.
///
/// Most of it is Udyam's record and is shown read-only. What the applicant owns
/// is the SPOC who receives the scheme's mail, the associations they belong to,
/// and which of the activities on their Udyam record this registration is
/// against. Every one of those edits is written to the change log, because each
/// is the kind of thing somebody has to be able to explain months later.
/// </summary>
[ApiController]
[Route("api/msme/profile")]
[Authorize]
public sealed class MsmeProfileController(
    MclsDbContext db,
    ICurrentUser currentUser) : ControllerBase
{
    private async Task<Enterprise?> MineAsync(bool tracked, CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return null;

        var q = tracked ? db.Enterprises.AsTracking() : db.Enterprises.AsNoTracking();
        return await q.FirstOrDefaultAsync(e => e.PrimaryUserId == userId, ct);
    }

    /// <summary>Everything the profile screen draws.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var e = await MineAsync(false, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var spocName = await db.Users.AsNoTracking()
            .Where(u => u.Id == e.PrimaryUserId)
            .Select(u => new { u.FullName, u.Designation })
            .FirstOrDefaultAsync(ct);

        var plant = await db.EnterprisePlants.AsNoTracking()
            .Where(p => p.EnterprisePlantId == e.SelectedPlantId)
            .Select(p => new
            {
                p.UnitName,
                address = p.AddressLine,
                p.Pincode,
                state = p.State != null ? p.State.Name : null,
                district = p.District != null ? p.District.Name : null,
            })
            .FirstOrDefaultAsync(ct);

        var activity = await db.EnterpriseActivities.AsNoTracking()
            .Where(a => a.EnterpriseActivityId == e.SelectedActivityId)
            .Select(a => new
            {
                a.EnterpriseActivityId,
                a.Activity,
                a.NicTwoDigit, a.NicTwoDigitName,
                a.NicFourDigit, a.NicFourDigitName,
                a.NicFiveDigit, a.NicFiveDigitName,
            })
            .FirstOrDefaultAsync(ct);

        // The awareness programme was chosen during registration, so it is read
        // from the draft that created this enterprise.
        var awareness = await db.Registrations.AsNoTracking()
            .Where(r => r.UdyamRegistrationNo == e.UdyamRegistrationNo && r.AwarenessProgramId != null)
            .OrderByDescending(r => r.RegistrationId)
            .Select(r => new
            {
                attended = r.AttendedAwareness,
                programCode = r.AwarenessProgram != null ? r.AwarenessProgram.ProgramCode : null,
                venue = r.AwarenessProgram != null ? r.AwarenessProgram.Venue : null,
                heldOn = r.AwarenessProgram != null ? r.AwarenessProgram.HeldOn : null,
            })
            .FirstOrDefaultAsync(ct);

        return Ok(new
        {
            enterprise = new
            {
                e.Name,
                e.LeanId,
                e.UdyamRegistrationNo,
                e.OwnerName,
                e.Gender,
                e.SocialCategory,
                e.AddressLine,
                e.Pan,
                registeredOn = e.RegisteredOnUtc,
                e.EnterpriseSize,
                e.OrganisationType,
                activity = e.NicDescription,
                e.TotalEmployees,
                udyamSyncedOn = e.UdyamFetchedOnUtc,
            },
            spoc = new
            {
                name = spocName?.FullName,
                designation = spocName?.Designation,
                email = e.ContactEmail,
                mobile = e.ContactMobile,
            },
            awareness = new
            {
                attended = awareness?.attended ?? (e.AwarenessAgency != null),
                agency = e.AwarenessAgency,
                programCode = awareness?.programCode,
                venue = awareness?.venue,
                heldOn = awareness?.heldOn,
            },
            associations = new
            {
                implementingAgency = e.ImplementingAgency ?? e.AwarenessAgency,
                e.IndustryAssociation,
                e.AssociationMemberId,
                e.OemPsuName,
                e.VendorId,
            },
            plant,
            selectedActivity = activity,
        });
    }

    /// <summary>The SPOC contact — who the scheme writes to.</summary>
    [HttpPut("spoc")]
    public async Task<IActionResult> UpdateSpoc([FromBody] SpocRequest request, CancellationToken ct)
    {
        var e = await MineAsync(true, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var email = request.Email.Trim();
        var mobile = request.Mobile?.Trim();

        Track(e.EnterpriseId, "Spoc", "Email", e.ContactEmail, email);
        Track(e.EnterpriseId, "Spoc", "Mobile", e.ContactMobile, mobile);

        e.ContactEmail = email;
        e.ContactMobile = mobile;

        var user = await db.Users.AsTracking().FirstOrDefaultAsync(u => u.Id == e.PrimaryUserId, ct);
        if (user is not null)
        {
            Track(e.EnterpriseId, "Spoc", "Name", user.FullName, request.Name.Trim());
            Track(e.EnterpriseId, "Spoc", "Designation", user.Designation, request.Designation?.Trim());

            user.FullName = request.Name.Trim();
            user.Designation = request.Designation?.Trim();
        }

        await db.SaveChangesAsync(ct);
        return Ok(new { message = "SPOC contact updated." });
    }

    /// <summary>The associations the applicant maintains themselves.</summary>
    [HttpPut("associations")]
    public async Task<IActionResult> UpdateAssociations(
        [FromBody] AssociationsRequest request, CancellationToken ct)
    {
        var e = await MineAsync(true, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        Track(e.EnterpriseId, "Associations", "Industry association", e.IndustryAssociation, request.IndustryAssociation);
        Track(e.EnterpriseId, "Associations", "Member ID", e.AssociationMemberId, request.AssociationMemberId);
        Track(e.EnterpriseId, "Associations", "OEM / PSU", e.OemPsuName, request.OemPsuName);
        Track(e.EnterpriseId, "Associations", "Vendor ID", e.VendorId, request.VendorId);

        e.IndustryAssociation = Clean(request.IndustryAssociation);
        e.AssociationMemberId = Clean(request.AssociationMemberId);
        e.OemPsuName = Clean(request.OemPsuName);
        e.VendorId = Clean(request.VendorId);

        await db.SaveChangesAsync(ct);
        return Ok(new { message = "Scheme associations updated." });
    }

    /// <summary>
    /// The activities on this enterprise's Udyam record, for the sector and NIC
    /// screen. Sector and NIC belong to Udyam — the applicant does not type
    /// them, they choose which of the recorded activities this registration is
    /// against, exactly as they did at registration.
    /// </summary>
    [HttpGet("activities")]
    public async Task<IActionResult> Activities(CancellationToken ct)
    {
        var e = await MineAsync(false, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var options = await db.EnterpriseActivities.AsNoTracking()
            .Where(a => a.EnterpriseId == e.EnterpriseId)
            .OrderBy(a => a.EnterpriseActivityId)
            .Select(a => new
            {
                id = a.EnterpriseActivityId,
                a.Activity,
                a.NicTwoDigit, a.NicTwoDigitName,
                a.NicFourDigit, a.NicFourDigitName,
                a.NicFiveDigit, a.NicFiveDigitName,
                selected = a.EnterpriseActivityId == e.SelectedActivityId,
            })
            .ToListAsync(ct);

        return Ok(new
        {
            udyamNumber = e.UdyamRegistrationNo,
            lastSyncedOn = e.UdyamFetchedOnUtc,
            selectedActivityId = e.SelectedActivityId,
            activities = options,
        });
    }

    /// <summary>Chooses which recorded activity this registration is against.</summary>
    [HttpPost("activity")]
    public async Task<IActionResult> SetActivity([FromBody] SetActivityRequest request, CancellationToken ct)
    {
        var e = await MineAsync(true, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var chosen = await db.EnterpriseActivities.AsNoTracking()
            .FirstOrDefaultAsync(a => a.EnterpriseActivityId == request.ActivityId
                                   && a.EnterpriseId == e.EnterpriseId, ct);

        if (chosen is null)
        {
            return BadRequest(new { message = "That activity is not on this enterprise's Udyam record." });
        }

        if (e.SelectedActivityId == chosen.EnterpriseActivityId)
        {
            return Ok(new { message = "That activity is already selected.", changed = false });
        }

        var previous = await db.EnterpriseActivities.AsNoTracking()
            .FirstOrDefaultAsync(a => a.EnterpriseActivityId == e.SelectedActivityId, ct);

        Track(e.EnterpriseId, "Activity", "NIC 2-digit", Pair(previous?.NicTwoDigit, previous?.NicTwoDigitName), Pair(chosen.NicTwoDigit, chosen.NicTwoDigitName));
        Track(e.EnterpriseId, "Activity", "NIC 4-digit", Pair(previous?.NicFourDigit, previous?.NicFourDigitName), Pair(chosen.NicFourDigit, chosen.NicFourDigitName));
        Track(e.EnterpriseId, "Activity", "NIC 5-digit", Pair(previous?.NicFiveDigit, previous?.NicFiveDigitName), Pair(chosen.NicFiveDigit, chosen.NicFiveDigitName));
        Track(e.EnterpriseId, "Activity", "Major activity", previous?.Activity, chosen.Activity);

        // The enterprise carries a copy of the chosen codes, because the
        // dashboard and every report read them from there.
        e.SelectedActivityId = chosen.EnterpriseActivityId;
        e.NicTwoDigit = chosen.NicTwoDigit;
        e.NicFourDigit = chosen.NicFourDigit;
        e.NicFiveDigit = chosen.NicFiveDigit;
        e.NicDescription = chosen.NicFiveDigitName ?? chosen.NicFourDigitName ?? chosen.NicTwoDigitName;
        e.MajorActivity = chosen.Activity;

        await db.SaveChangesAsync(ct);

        return Ok(new { message = "Sector and NIC updated.", changed = true });
    }

    /// <summary>What has been changed on this profile, newest first.</summary>
    [HttpGet("history")]
    public async Task<IActionResult> History(CancellationToken ct)
    {
        var e = await MineAsync(false, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var rows = await db.EnterpriseChangeLogs.AsNoTracking()
            .Where(h => h.EnterpriseId == e.EnterpriseId)
            .OrderByDescending(h => h.ChangedOnUtc)
            .ThenByDescending(h => h.EnterpriseChangeLogId)
            .Take(100)
            .Select(h => new
            {
                h.Section,
                h.FieldName,
                h.OldValue,
                h.NewValue,
                h.ChangedOnUtc,
                changedBy = db.Users.Where(u => u.Id == h.ChangedByUserId).Select(u => u.FullName).FirstOrDefault(),
            })
            .ToListAsync(ct);

        return Ok(rows);
    }

    /// <summary>
    /// Queues one change for the log, and only when it is actually a change —
    /// a log full of "unchanged" rows is a log nobody reads.
    /// </summary>
    private void Track(int enterpriseId, string section, string field, string? oldValue, string? newValue)
    {
        var before = Clean(oldValue);
        var after = Clean(newValue);

        if (string.Equals(before, after, StringComparison.Ordinal)) return;

        db.EnterpriseChangeLogs.Add(new EnterpriseChangeLog
        {
            EnterpriseId = enterpriseId,
            Section = section,
            FieldName = field,
            OldValue = before,
            NewValue = after,
            ChangedByUserId = currentUser.UserId,
            ChangedOnUtc = DateTime.UtcNow,
        });
    }

    private static string? Clean(string? v) => string.IsNullOrWhiteSpace(v) ? null : v.Trim();

    private static string? Pair(string? code, string? name)
        => code is null ? null : string.IsNullOrWhiteSpace(name) ? code : $"{code} - {name}";
}

public sealed class SpocRequest
{
    [Required, StringLength(150)] public string Name { get; set; } = string.Empty;
    [StringLength(100)] public string? Designation { get; set; }
    [Required, EmailAddress, StringLength(256)] public string Email { get; set; } = string.Empty;
    [StringLength(15)] public string? Mobile { get; set; }
}

public sealed class AssociationsRequest
{
    [StringLength(150)] public string? IndustryAssociation { get; set; }
    [StringLength(60)] public string? AssociationMemberId { get; set; }
    [StringLength(150)] public string? OemPsuName { get; set; }
    [StringLength(60)] public string? VendorId { get; set; }
}

public sealed class SetActivityRequest
{
    [Range(1, int.MaxValue)] public int ActivityId { get; set; }
}

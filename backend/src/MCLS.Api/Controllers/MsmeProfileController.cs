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

        var rows = await db.EnterpriseActivities.AsNoTracking()
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

        // Which sectors the scheme actually covers is Sectors master data, kept
        // by the Super Admin. An activity whose NIC 2-digit is not an active
        // sector cannot be chosen here, exactly as it could not at registration.
        var covered = await CoveredSectorsAsync(rows.Select(r => r.NicTwoDigit), ct);

        var options = rows.Select(a => new
        {
            a.id,
            a.Activity,
            a.NicTwoDigit, a.NicTwoDigitName,
            a.NicFourDigit, a.NicFourDigitName,
            a.NicFiveDigit, a.NicFiveDigitName,
            a.selected,
            eligible = a.NicTwoDigit != null && covered.ContainsKey(a.NicTwoDigit),
            sectorName = a.NicTwoDigit != null && covered.TryGetValue(a.NicTwoDigit, out var n) ? n : null,
        }).ToList();

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

        var allowed = await CoveredSectorsAsync([chosen.NicTwoDigit], ct);

        if (chosen.NicTwoDigit is null || !allowed.ContainsKey(chosen.NicTwoDigit))
        {
            return BadRequest(new
            {
                message = $"NIC {chosen.NicTwoDigit} — {chosen.NicTwoDigitName} is not a sector the " +
                          "LEAN Scheme currently covers, so it cannot be selected.",
            });
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

    /// <summary>
    /// What has been changed on this profile, newest first.
    ///
    /// One line per edit rather than per field: changing the activity moves four
    /// columns at once, and four rows saying so reads as four separate edits.
    /// The field-level detail — every old and new value — stays in
    /// msme.EnterpriseChangeLog, which is where it is wanted if a change is ever
    /// questioned.
    /// </summary>
    [HttpGet("history")]
    public async Task<IActionResult> History(CancellationToken ct)
    {
        var e = await MineAsync(false, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var rows = await db.EnterpriseChangeLogs.AsNoTracking()
            .Where(h => h.EnterpriseId == e.EnterpriseId)
            .OrderByDescending(h => h.ChangedOnUtc)
            .Take(400)
            .Select(h => new
            {
                h.Section,
                h.ChangedOnUtc,
                changedBy = db.Users.Where(u => u.Id == h.ChangedByUserId).Select(u => u.FullName).FirstOrDefault(),
            })
            .ToListAsync(ct);

        // Everything written by one save shares a timestamp to the second, so
        // that is what groups an edit back together.
        var events = rows
            .GroupBy(h => new { h.Section, Stamp = new DateTime(h.ChangedOnUtc.Ticks / TimeSpan.TicksPerSecond * TimeSpan.TicksPerSecond, h.ChangedOnUtc.Kind) })
            .OrderByDescending(g => g.Key.Stamp)
            .Take(50)
            .Select(g => new
            {
                section = g.Key.Section,
                label = Label(g.Key.Section),
                // SQL Server hands these back with an unspecified kind, which
                // serialises without a Z and is then read as local time — the
                // clock the applicant sees would be wrong by the offset.
                changedOnUtc = DateTime.SpecifyKind(g.Key.Stamp, DateTimeKind.Utc),
                changedBy = g.Select(x => x.changedBy).FirstOrDefault(x => x != null),
                fields = g.Count(),
            })
            .ToList();

        return Ok(events);
    }

    private static string Label(string section) => section switch
    {
        "Activity" => "NIC sector updated",
        "Spoc" => "SPOC details changed",
        "Associations" => "Association details changed",
        _ => section + " updated",
    };

    /// <summary>
    /// The sectors the scheme covers, out of the NIC 2-digit codes asked about —
    /// the Super Admin's Sectors master, which is the only place that decides it.
    /// </summary>
    private async Task<Dictionary<string, string>> CoveredSectorsAsync(
        IEnumerable<string?> nicTwoDigits, CancellationToken ct)
    {
        var codes = nicTwoDigits.Where(c => c is not null).Select(c => c!).Distinct().ToList();

        if (codes.Count == 0) return [];

        return await db.Sectors.AsNoTracking()
            .Where(x => x.IsActive && codes.Contains(x.NicCode))
            .ToDictionaryAsync(x => x.NicCode, x => x.Name, ct);
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

public sealed class SetActivityRequest
{
    [Range(1, int.MaxValue)] public int ActivityId { get; set; }
}

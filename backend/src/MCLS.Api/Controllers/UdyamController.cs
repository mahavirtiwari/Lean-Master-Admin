using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using MCLS.Infrastructure.Udyam;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// Udyam registry lookup, used when an MSME registers.
///
/// The applicant gives a Udyam number and the mobile on that registration; the
/// portal fetches the particulars rather than asking them to retype what the
/// Ministry already holds. Contact person, e-mail, designation and mobile are
/// still captured on the form — the registry does not carry them.
///
/// Rate-limited on the "auth" policy: the endpoint takes a Udyam number plus a
/// mobile and reports whether they match, which is exactly the shape of an
/// enumeration oracle if left open.
/// </summary>
[ApiController]
[Route("api/udyam")]
public sealed class UdyamController(
    IUdyamRegistry registry,
    MclsDbContext db,
    ILogger<UdyamController> logger) : ControllerBase
{
    /// <summary>
    /// Fetches a Udyam record and resolves its address and activity against the
    /// portal's own masters.
    /// </summary>
    [HttpPost("lookup")]
    [HasPermission(Permissions.Handholding, Permissions.Create)]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Lookup([FromBody] UdyamLookupRequest request, CancellationToken ct)
    {
        var udyamNumber = request.UdyamNumber.Trim().ToUpperInvariant();

        // Already registered here? Then this is a duplicate, not a new applicant.
        var existing = await db.Enterprises.AsNoTracking()
            .Where(e => e.UdyamRegistrationNo == udyamNumber)
            .Select(e => new { e.EnterpriseId, e.Name })
            .SingleOrDefaultAsync(ct);

        if (existing is not null)
        {
            return Conflict(new
            {
                message = $"{udyamNumber} is already registered on the portal as {existing.Name}.",
                enterpriseId = existing.EnterpriseId,
            });
        }

        var record = await registry.GetAsync(udyamNumber, request.Mobile.Trim(), ct);

        if (record is null)
        {
            return NotFound(new
            {
                message = "No Udyam record matched that number and mobile. " +
                          "Check both, or continue with manual entry.",
            });
        }

        // The registry's LGD codes are the join key — matching on the spelling
        // of a district name is not reliable across sources.
        var state = record.StateCode is null
            ? null
            : await db.States.AsNoTracking()
                .Where(s => s.Code == record.StateCode)
                .Select(s => new { s.StateId, s.Name })
                .SingleOrDefaultAsync(ct);

        var district = (state is null || record.DistrictCode is null)
            ? null
            : await db.Districts.AsNoTracking()
                .Where(d => d.StateId == state.StateId && d.Code == record.DistrictCode)
                .Select(d => new { d.DistrictId, d.Name })
                .SingleOrDefaultAsync(ct);

        // Two_DigitActivity is the NIC 2008 division, which is what
        // master.Sector is keyed on.
        var sector = record.NicTwoDigit is null
            ? null
            : await db.Sectors.AsNoTracking()
                .Where(s => s.NicCode == record.NicTwoDigit)
                .Select(s => new { s.SectorId, s.Name })
                .SingleOrDefaultAsync(ct);

        if (state is null || district is null || sector is null)
        {
            // Worth a log line: it means the masters have drifted from the
            // registry, which a later migration needs to fix.
            logger.LogWarning(
                "Udyam {Udyam}: unresolved masters (state {StateCode}={StateOk}, " +
                "district {DistrictCode}={DistrictOk}, NIC {Nic}={SectorOk}).",
                udyamNumber, record.StateCode, state is not null,
                record.DistrictCode, district is not null,
                record.NicTwoDigit, sector is not null);
        }

        // A plant can sit in a different district from the registered office,
        // so each is resolved on its own LG code.
        var plantDistrictCodes = record.Plants
            .Where(p => p.DistrictCode is not null)
            .Select(p => p.DistrictCode!)
            .Distinct()
            .ToList();

        var plantDistricts = plantDistrictCodes.Count == 0
            ? []
            : await db.Districts.AsNoTracking()
                .Where(d => plantDistrictCodes.Contains(d.Code!))
                .Select(d => new { d.DistrictId, d.Code })
                .ToListAsync(ct);

        var plants = record.Plants.Select(pl => new UdyamPlantDto(
            pl.UnitIdNo, pl.UnitName, pl.UamNo, pl.PlantIdNo,
            pl.Address, pl.Pincode, pl.StateName, pl.DistrictName, pl.DistrictCode,
            plantDistricts.FirstOrDefault(d => d.Code == pl.DistrictCode)?.DistrictId)).ToList();

        return Ok(new UdyamLookupResponse(
            record.UdyamNumber,
            record.ApplicationId,
            record.EnterpriseName,
            record.OwnerName,
            record.OrganisationType,
            record.Gender,
            record.SocialCategory,
            record.IsPhysicallyHandicapped,
            record.Pan,
            record.Address,
            record.Pincode,
            record.MajorActivity,
            record.EnterpriseType,
            record.TotalEmployees,
            record.IncorporationDate,
            record.CommencementDate,
            state?.StateId,
            state?.Name ?? record.StateName,
            record.StateCode,
            district?.DistrictId,
            district?.Name ?? record.DistrictName,
            record.DistrictCode,
            sector?.SectorId,
            sector?.Name,
            record.NicTwoDigit,
            record.NicFourDigit,
            record.NicFiveDigit,
            record.NicDescription,
            record.WhetherProductionCommenced,
            record.DicName,
            record.AppliedDate,
            record.Activities,
            plants,
            state is not null && district is not null && sector is not null));
    }
}

public sealed class UdyamLookupRequest
{
    /// <summary>e.g. UDYAM-UP-29-0003915</summary>
    [Required, StringLength(30, MinimumLength = 10)]
    [RegularExpression(@"^(?i)UDYAM-[A-Z]{2}-\d{2}-\d{7}$",
        ErrorMessage = "Enter a Udyam number in the form UDYAM-XX-00-0000000.")]
    public string UdyamNumber { get; init; } = string.Empty;

    /// <summary>The mobile registered against that Udyam number.</summary>
    [Required, RegularExpression(@"^[6-9]\d{9}$",
        ErrorMessage = "Enter the 10-digit mobile number on the Udyam registration.")]
    public string Mobile { get; init; } = string.Empty;
}

public sealed record UdyamLookupResponse(
    string UdyamNumber,
    string? ApplicationId,
    string? EnterpriseName,
    string? OwnerName,
    string? OrganisationType,
    string? Gender,
    string? SocialCategory,
    bool? IsPhysicallyHandicapped,
    string? Pan,
    string? Address,
    string? Pincode,
    string? MajorActivity,
    string? EnterpriseType,
    int? TotalEmployees,
    DateOnly? IncorporationDate,
    DateOnly? CommencementDate,
    short? StateId,
    string? StateName,
    string? StateCode,
    int? DistrictId,
    string? DistrictName,
    string? DistrictCode,
    short? SectorId,
    string? SectorName,
    string? NicTwoDigit,
    string? NicFourDigit,
    string? NicFiveDigit,
    string? NicDescription,
    bool? WhetherProductionCommenced,
    string? DicName,
    DateOnly? AppliedDate,
    IReadOnlyList<UdyamActivity> Activities,
    IReadOnlyList<UdyamPlantDto> Plants,
    // False when a master could not be resolved, so the form must fall back to
    // manual selection for state, district or sector.
    bool MastersResolved);

/// <summary>
/// A plant as returned to the client, with its district resolved where the
/// registry's code matched.
/// </summary>
public sealed record UdyamPlantDto(
    string? UnitIdNo,
    string? UnitName,
    string? UamNo,
    string? PlantIdNo,
    string? Address,
    string? Pincode,
    string? StateName,
    string? DistrictName,
    string? DistrictCode,
    int? DistrictId);

using MCLS.Api.Services;
using MCLS.Infrastructure.Persistence;
using MCLS.Infrastructure.Udyam;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// Pledge verification — what the QR on a certificate leads to.
///
/// Anonymous by design: a certificate is shown to customers, buyers and
/// auditors, and a code that only the holder can scan verifies nothing. The
/// page behind it repeats what is already printed on the paper in front of the
/// person scanning it and adds nothing further, so it discloses nothing they
/// cannot already read.
/// </summary>
[ApiController]
[Route("api/pledge")]
[AllowAnonymous]
public sealed class PledgeController(MclsDbContext db, ILogger<PledgeController> logger) : ControllerBase
{
    /// <summary>
    /// The details behind one certificate reference.
    ///
    /// The reference carries the date and the record it belongs to, so nothing
    /// has to be stored when a certificate is issued — the lookup reads the
    /// reference and checks that the record it names really does carry that
    /// pledge date. A reference that names a real record but the wrong date is
    /// treated as unknown rather than corrected.
    /// </summary>
    [HttpGet("{reference}")]
    public async Task<IActionResult> Verify(string reference, CancellationToken ct)
    {
        var parsed = PledgeCertificate.ParseReference(reference);

        if (parsed is null) return NotFound(new { message = "That is not a LEAN pledge certificate number." });

        return parsed.IsDraft
            ? await VerifyDraftAsync(parsed, ct)
            : await VerifyEnterpriseAsync(parsed, ct);
    }

    private async Task<IActionResult> VerifyEnterpriseAsync(
        PledgeCertificate.PledgeReference parsed,
        CancellationToken ct)
    {
        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.EnterpriseId == parsed.Id)
            .Select(e => new
            {
                e.EnterpriseId,
                e.LeanId,
                e.Name,
                e.UdyamRegistrationNo,
                e.RegisteredOnUtc,
                e.IsActive,
                Plant = db.EnterprisePlants
                    .Where(p => p.EnterprisePlantId == e.SelectedPlantId)
                    .Select(p => new { p.UnitName, p.AddressLine })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (enterprise is null) return Unknown();

        var pledgedOn = DateOnly.FromDateTime(enterprise.RegisteredOnUtc.ToLocalTime());

        if (pledgedOn != parsed.PledgedOn) return Unknown();

        return Ok(new
        {
            certificateNo = PledgeCertificate.BuildReference(pledgedOn, enterprise.EnterpriseId),
            unitName = enterprise.Plant?.UnitName ?? enterprise.Name,
            enterpriseName = enterprise.Name,
            udyamNumber = enterprise.UdyamRegistrationNo,
            address = enterprise.Plant?.AddressLine ?? string.Empty,
            pledgedOn,
            leanId = enterprise.LeanId,
            status = enterprise.IsActive ? "Registered" : "Inactive",
        });
    }

    /// <summary>
    /// A certificate taken from the pledge screen before the registration was
    /// completed. It is a real pledge, but no LEAN ID has been issued for it,
    /// and saying so is more use to whoever scanned it than a blank page.
    /// </summary>
    private async Task<IActionResult> VerifyDraftAsync(
        PledgeCertificate.PledgeReference parsed,
        CancellationToken ct)
    {
        var draft = await db.Registrations.AsNoTracking()
            .FirstOrDefaultAsync(r => r.RegistrationId == parsed.Id, ct);

        if (draft is null) return Unknown();

        // A registration that has since completed has a permanent certificate
        // of its own; point the scan at that rather than at the preview.
        if (draft.EnterpriseId is int enterpriseId)
        {
            return await VerifyEnterpriseAsync(
                parsed with { Id = enterpriseId, IsDraft = false },
                ct) is OkObjectResult ok
                ? ok
                : Unknown();
        }

        var pledgedOn = DateOnly.FromDateTime(
            (draft.PledgeAcceptedOnUtc ?? draft.StartedOnUtc).ToLocalTime());

        if (pledgedOn != parsed.PledgedOn) return Unknown();

        var record = string.IsNullOrWhiteSpace(draft.UdyamPayload)
            ? null
            : UdyamRegistryClient.Parse(draft.UdyamRegistrationNo, draft.UdyamPayload, logger);

        var plant = record?.Plants.FirstOrDefault(p => p.PlantIdNo == draft.SelectedPlantIdNo)
            ?? record?.Plants.FirstOrDefault(p => p.UnitIdNo == draft.SelectedUnitIdNo);

        return Ok(new
        {
            certificateNo = PledgeCertificate.BuildDraftReference(pledgedOn, draft.RegistrationId),
            unitName = plant?.UnitName ?? record?.EnterpriseName ?? draft.UdyamRegistrationNo,
            enterpriseName = record?.EnterpriseName ?? string.Empty,
            udyamNumber = draft.UdyamRegistrationNo,
            address = plant?.Address ?? record?.Address ?? string.Empty,
            pledgedOn,
            leanId = (string?)null,
            status = "Registration in progress",
        });
    }

    private NotFoundObjectResult Unknown()
        => NotFound(new { message = "No pledge certificate was issued with that number." });
}

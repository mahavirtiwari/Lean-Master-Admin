using MCLS.Api.Services;
using MCLS.Application.Common.Interfaces;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The applicant's own view of the scheme (D1).
///
/// Separate from the admin controllers on purpose: an applicant sees exactly
/// one enterprise — their own — and reaches it through the account issued at
/// registration, never by passing an id. Nothing here takes an enterprise
/// identifier for that reason.
/// </summary>
[ApiController]
[Route("api/msme")]
[Authorize]
public sealed class MsmeController(
    MclsDbContext db,
    ICurrentUser currentUser,
    IConfiguration configuration) : ControllerBase
{
    /// <summary>
    /// The applicant's pledge certificate, generated and streamed.
    ///
    /// Same document as the one offered during registration, reachable from the
    /// dashboard afterwards. Nothing is stored — see PledgeCertificate.
    /// </summary>
    [HttpGet("pledge")]
    public async Task<IActionResult> DownloadPledge(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return Unauthorized();

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => new
            {
                e.EnterpriseId,
                e.Name,
                e.UdyamRegistrationNo,
                e.RegisteredOnUtc,
                Address = db.EnterprisePlants
                    .Where(p => p.EnterprisePlantId == e.SelectedPlantId)
                    .Select(p => p.AddressLine)
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        if (enterprise is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var template = PledgeCertificate.TemplatePath;

        if (!System.IO.File.Exists(template))
        {
            return Problem(
                title: "The pledge certificate could not be produced.",
                detail: "The certificate template is not installed on the server.",
                statusCode: StatusCodes.Status500InternalServerError);
        }

        var pledgedOn = DateOnly.FromDateTime(enterprise.RegisteredOnUtc.ToLocalTime());

        var reference = PledgeCertificate.BuildReference(pledgedOn, enterprise.EnterpriseId);

        var details = new PledgeDetails(
            enterprise.Name,
            enterprise.Address ?? string.Empty,
            enterprise.UdyamRegistrationNo,
            pledgedOn,
            reference,
            PortalLinks.VerifyPledgeUrl(Request, configuration, reference));

        var pdf = PledgeCertificate.Render(details, template);

        return File(pdf, "application/pdf", $"pledge_certificate_{details.Reference}.pdf");
    }

    /// <summary>Everything the applicant dashboard draws.</summary>
    [HttpGet("dashboard")]
    public async Task<IActionResult> GetDashboard(CancellationToken ct)
    {
        var userId = currentUser.UserId;

        if (userId is null) return Unauthorized();

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.PrimaryUserId == userId)
            .Select(e => new
            {
                e.EnterpriseId,
                e.LeanId,
                e.Name,
                e.UdyamRegistrationNo,
                e.OwnerName,
                e.EnterpriseSize,
                e.RegisteredOnUtc,
                e.IsActive,
                e.NicTwoDigit,
                e.NicFourDigit,
                e.NicFiveDigit,
                e.NicDescription,
                Plant = db.EnterprisePlants
                    .Where(p => p.EnterprisePlantId == e.SelectedPlantId)
                    .Select(p => new
                    {
                        p.UnitName,
                        p.AddressLine,
                        p.Pincode,
                        State = p.State != null ? p.State.Name : null,
                        District = p.District != null ? p.District.Name : null,
                    })
                    .FirstOrDefault(),
            })
            .FirstOrDefaultAsync(ct);

        // An account with no enterprise is a staff account that wandered here,
        // or an applicant whose registration did not finish. Either way there
        // is nothing to draw, and 404 says so without guessing.
        if (enterprise is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var levels = await db.CertificationLevels.AsNoTracking()
            .OrderBy(l => l.SortOrder)
            .Select(l => new { l.CertificationLevelId, l.Code, l.Name, l.RequiresAssessment, l.SortOrder })
            .ToListAsync(ct);

        var applications = await db.Applications.AsNoTracking()
            .Where(a => a.EnterpriseId == enterprise.EnterpriseId)
            .Select(a => new
            {
                a.ApplicationId,
                a.ApplicationNo,
                a.CertificationLevelId,
                Status = a.Status.Name,
                a.RegisteredOnUtc,
                a.CertifiedOnUtc,
            })
            .ToListAsync(ct);

        // The lowest level is open from the start. A higher one opens when the
        // level below it has been certified — which is the rule the artboard
        // draws as "Requires Intermediate certificate" on the top card.
        var certified = applications
            .Where(a => a.CertifiedOnUtc != null)
            .Select(a => a.CertificationLevelId)
            .ToHashSet();

        var levelCards = levels.Select((l, index) =>
        {
            var application = applications.FirstOrDefault(a => a.CertificationLevelId == l.CertificationLevelId);
            var previous = index == 0 ? null : levels[index - 1];
            var open = index == 0 || (previous is not null && certified.Contains(previous.CertificationLevelId));

            return new
            {
                l.Code,
                l.Name,
                l.SortOrder,
                Delivery = l.RequiresAssessment ? "Onsite + Remote" : "E-Learning",
                Cost = l.RequiresAssessment ? "PAID" : "FREE",
                State = application is not null
                    ? (application.CertifiedOnUtc != null ? "Certified" : "In progress")
                    : open ? "Open" : "Locked",
                RequiresBefore = open ? null : previous?.Name,
                application?.ApplicationNo,
                ApplicationStatus = application?.Status,
            };
        }).ToList();

        // Incentives unlock on an assessed certificate, so they are all locked
        // until one of the assessed levels is certified.
        var assessedLevelIds = levels.Where(l => l.RequiresAssessment)
            .Select(l => l.CertificationLevelId).ToHashSet();

        var incentivesUnlocked = certified.Any(id => assessedLevelIds.Contains(id));

        var incentiveGroups = await db.Incentives.AsNoTracking()
            .GroupBy(i => i.AdministeringBody ?? "Others")
            .Select(g => new { Name = g.Key, Count = g.Count() })
            .OrderBy(g => g.Name)
            .ToListAsync(ct);

        return Ok(new
        {
            enterprise = new
            {
                enterprise.LeanId,
                enterprise.Name,
                udyamNumber = enterprise.UdyamRegistrationNo,
                entrepreneur = enterprise.OwnerName,
                size = enterprise.EnterpriseSize,
                registeredOn = enterprise.RegisteredOnUtc,
                isActive = enterprise.IsActive,
                nicTwoDigit = enterprise.NicTwoDigit,
                nicFourDigit = enterprise.NicFourDigit,
                nicFiveDigit = enterprise.NicFiveDigit,
                activity = enterprise.NicDescription,
                unit = enterprise.Plant is null ? null : new
                {
                    enterprise.Plant.UnitName,
                    address = enterprise.Plant.AddressLine,
                    enterprise.Plant.Pincode,
                    enterprise.Plant.State,
                    enterprise.Plant.District,
                },
            },
            levels = levelCards,
            incentives = new
            {
                unlocked = incentivesUnlocked,
                groups = incentiveGroups,
            },
        });
    }
}

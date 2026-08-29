using System.ComponentModel.DataAnnotations;

using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Msme;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The three questions asked before a LEAN Silver application is accepted
/// (C02a-C02c), and where the answers stand afterwards (C02d/C02e).
///
/// The applicant names the Implementing Agency that will run the handholding,
/// and optionally an Industry Association and an OEM/PSU. The last two carry a
/// Member ID and a Vendor ID, and those claims are put to the bodies named
/// rather than taken on trust.
///
/// Either approval opens payment. An enterprise that named two bodies is not
/// held up because one is slow, and one that named neither is not held up at
/// all — the questions are about routing, not eligibility.
/// </summary>
[ApiController]
[Route("api/msme/application/silver/intake")]
[Authorize]
public sealed class SilverIntakeController(
    MclsDbContext db,
    ICurrentUser currentUser,
    IEmailQueue emailQueue) : ControllerBase
{
    private const byte Silver = 2;

    // auth.AccountType: 1 Implementing Agency, 4 OEMs, 11 PSUs, 12 Industry Associations.
    private const byte ImplementingAgencyType = 1;
    private const byte OemType = 4;
    private const byte PsuType = 11;
    private const byte AssociationType = 12;

    private async Task<Enterprise?> MineAsync(bool tracking, CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return null;

        var query = tracking ? db.Enterprises.AsTracking() : db.Enterprises.AsNoTracking();
        return await query.FirstOrDefaultAsync(e => e.PrimaryUserId == userId, ct);
    }

    /// <summary>
    /// The bodies an applicant may name. Only approved ones: an association an
    /// agency has raised but no State Office has confirmed is not yet something
    /// the scheme recognises.
    /// </summary>
    [HttpGet("options")]
    public async Task<IActionResult> Options([FromQuery] string? search, CancellationToken ct)
    {
        var query = db.Organisations.AsNoTracking()
            .Where(o => o.IsActive && o.ApprovalStatus == "Approved");

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(o => o.Name.Contains(term) || o.OrganisationCode.Contains(term));
        }

        var all = await query
            .OrderBy(o => o.DisplayOrder).ThenBy(o => o.Name)
            .Select(o => new
            {
                o.OrganisationId,
                o.Name,
                o.OrganisationCode,
                o.AccountTypeId,
                scope = o.JurisdictionScope,
            })
            .ToListAsync(ct);

        static object Row(dynamic o) => new
        {
            id = o.OrganisationId,
            name = o.Name,
            code = o.OrganisationCode,
            scope = o.scope,
        };

        return Ok(new
        {
            implementingAgencies = all.Where(o => o.AccountTypeId == ImplementingAgencyType).Select(Row),
            associations = all.Where(o => o.AccountTypeId == AssociationType).Select(Row),
            // The question asks about an OEM *or* a PSU, so the picker is one
            // list — the applicant does not have to know which of the two the
            // scheme classed their customer as.
            oemPsus = all.Where(o => o.AccountTypeId is OemType or PsuType).Select(Row),
        });
    }

    /// <summary>What was answered, and where each named body has got to.</summary>
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        var e = await MineAsync(false, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var claims = await db.PartnerVerifications.AsNoTracking()
            .Where(v => v.EnterpriseId == e.EnterpriseId && v.CertificationLevelId == Silver)
            .Select(v => new
            {
                kind = v.PartnerKind,
                organisationId = v.OrganisationId,
                partnerName = v.Organisation.Name,
                v.ReferenceNo,
                v.Status,
                v.DecidedOnUtc,
                v.DecisionRemark,
            })
            .ToListAsync(ct);

        // Either approval is enough, and an applicant who named nobody has
        // nothing to wait for.
        var canProceed = claims.Count == 0 || claims.Exists(c => c.Status == "Approved");

        return Ok(new
        {
            answered = e.SilverIntakeOnUtc != null,
            answeredOnUtc = e.SilverIntakeOnUtc,
            implementingAgencyOrgId = e.ImplementingAgencyOrgId,
            implementingAgency = e.ImplementingAgency,
            claims,
            canProceed,
        });
    }

    /// <summary>
    /// Records the three answers and asks the named bodies to confirm.
    ///
    /// Re-answering replaces the claims rather than stacking more beside them,
    /// so a body is asked once. A claim already decided is left alone — a
    /// confirmation is not withdrawn because the applicant reopened the form.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Submit([FromBody] SilverIntakeRequest request, CancellationToken ct)
    {
        var e = await MineAsync(true, ct);
        if (e is null) return NotFound(new { message = "No enterprise is linked to this account." });

        var agency = await db.Organisations.AsNoTracking()
            .FirstOrDefaultAsync(o => o.OrganisationId == request.ImplementingAgencyOrgId
                                   && o.AccountTypeId == ImplementingAgencyType
                                   && o.IsActive && o.ApprovalStatus == "Approved", ct);

        if (agency is null)
        {
            return BadRequest(new { message = "Choose an implementing agency from the list." });
        }

        if (request.HasAssociation && request.AssociationOrgId is null)
        {
            return BadRequest(new { message = "Name the industry association, or answer No." });
        }

        if (request.HasAssociation && string.IsNullOrWhiteSpace(request.MemberId))
        {
            return BadRequest(new { message = "Enter your member ID for the association." });
        }

        if (request.HasOemPsu && request.OemPsuOrgId is null)
        {
            return BadRequest(new { message = "Name the OEM or PSU, or answer No." });
        }

        if (request.HasOemPsu && string.IsNullOrWhiteSpace(request.VendorId))
        {
            return BadRequest(new { message = "Enter your vendor ID for the OEM or PSU." });
        }

        e.ImplementingAgencyOrgId = agency.OrganisationId;
        e.ImplementingAgency = agency.Name;
        e.IndustryAssociationOrgId = request.HasAssociation ? request.AssociationOrgId : null;
        e.OemPsuOrgId = request.HasOemPsu ? request.OemPsuOrgId : null;
        e.AssociationMemberId = request.HasAssociation ? request.MemberId?.Trim() : null;
        e.VendorId = request.HasOemPsu ? request.VendorId?.Trim() : null;
        e.SilverIntakeOnUtc = DateTime.UtcNow;

        var wanted = new List<(string Kind, int? OrgId, string? Reference)>
        {
            ("Association", request.HasAssociation ? request.AssociationOrgId : null, request.MemberId?.Trim()),
            ("OemPsu", request.HasOemPsu ? request.OemPsuOrgId : null, request.VendorId?.Trim()),
        };

        var existing = await db.PartnerVerifications.AsTracking()
            .Where(v => v.EnterpriseId == e.EnterpriseId && v.CertificationLevelId == Silver)
            .ToListAsync(ct);

        var toAsk = new List<PartnerVerification>();

        foreach (var (kind, orgId, reference) in wanted)
        {
            var current = existing.Find(v => v.PartnerKind == kind);

            if (orgId is null)
            {
                // The answer changed to No: an undecided request is withdrawn,
                // a decided one is kept as the record of what was asked.
                if (current is { Status: "Pending" }) db.PartnerVerifications.Remove(current);
                continue;
            }

            if (current is null)
            {
                var fresh = new PartnerVerification
                {
                    EnterpriseId = e.EnterpriseId,
                    CertificationLevelId = Silver,
                    PartnerKind = kind,
                    OrganisationId = orgId.Value,
                    ReferenceNo = reference,
                    Status = "Pending",
                    CreatedOnUtc = DateTime.UtcNow,
                };
                db.PartnerVerifications.Add(fresh);
                toAsk.Add(fresh);
                continue;
            }

            // A decided claim is only reopened when the applicant actually
            // changed who they named or what they claimed.
            if (current.OrganisationId != orgId.Value || current.ReferenceNo != reference)
            {
                current.OrganisationId = orgId.Value;
                current.ReferenceNo = reference;
                current.Status = "Pending";
                current.DecidedByUserId = null;
                current.DecidedOnUtc = null;
                current.DecisionRemark = null;
                current.CreatedOnUtc = DateTime.UtcNow;
                toAsk.Add(current);
            }
        }

        await db.SaveChangesAsync(ct);
        await AskPartnersAsync(e, toAsk, ct);

        return Ok(new { asked = toAsk.Count });
    }

    /// <summary>Tells each named body that an enterprise has claimed them.</summary>
    private async Task AskPartnersAsync(
        Enterprise enterprise, List<PartnerVerification> claims, CancellationToken ct)
    {
        if (claims.Count == 0) return;

        var orgIds = claims.ConvertAll(c => c.OrganisationId);
        var partners = await db.Organisations.AsNoTracking()
            .Where(o => orgIds.Contains(o.OrganisationId))
            .Select(o => new { o.OrganisationId, o.Name, o.ContactEmail })
            .ToListAsync(ct);

        foreach (var claim in claims)
        {
            var partner = partners.Find(p => p.OrganisationId == claim.OrganisationId);

            // No contact address on file means the body works its queue on the
            // portal instead; the request is still raised either way.
            if (partner is null || string.IsNullOrWhiteSpace(partner.ContactEmail)) continue;

            var isAssociation = claim.PartnerKind == "Association";

            await emailQueue.QueueTemplatedAsync(
                "PARTNER_VERIFICATION_REQUEST",
                partner.ContactEmail!,
                null,
                new Dictionary<string, string>
                {
                    ["partner_name"] = partner.Name,
                    ["enterprise_name"] = enterprise.Name,
                    ["lean_id"] = enterprise.LeanId ?? string.Empty,
                    ["claim_kind"] = isAssociation ? "a member of your association" : "one of your vendors",
                    ["reference_label"] = isAssociation ? "Member ID" : "Vendor ID",
                    ["reference_no"] = claim.ReferenceNo ?? "-",
                },
                ct);
        }
    }
}

public sealed class SilverIntakeRequest
{
    public int ImplementingAgencyOrgId { get; init; }

    public bool HasAssociation { get; init; }
    public int? AssociationOrgId { get; init; }
    [StringLength(80)] public string? MemberId { get; init; }

    public bool HasOemPsu { get; init; }
    public int? OemPsuOrgId { get; init; }
    [StringLength(80)] public string? VendorId { get; init; }
}

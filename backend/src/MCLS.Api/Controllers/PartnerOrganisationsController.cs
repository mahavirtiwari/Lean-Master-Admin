using System.ComponentModel.DataAnnotations;

using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// Industry Associations, OEMs and PSUs — raised by an Implementing Agency,
/// approved by a State Office.
///
/// Implementing Agencies themselves are not managed here: the Super Admin
/// creates those and they are live at once, because there is nobody above the
/// Super Admin to approve them.
///
/// The screens live under User Management > OEMs, PSUs and IAs — those
/// sub-menus are about exactly these bodies — so the rights are User
/// Management's rather than a module of their own.
///
/// Routing is by the body's own state, so an association operating in Gujarat
/// is decided by the Gujarat office. A pan-India body has no state to route to
/// and falls to the national queue, which Super Admin, Operations Admin and
/// Ministry Reviewer work.
/// </summary>
[ApiController]
[Route("api/partner-organisations")]
[Authorize]
public sealed class PartnerOrganisationsController(
    MclsDbContext db,
    ICurrentUser currentUser,
    IEmailQueue emailQueue) : ControllerBase
{
    // auth.AccountType: 4 OEMs, 11 PSUs, 12 Industry Associations.
    private static readonly byte[] PartnerTypes = [4, 11, 12];

    private static string KindOf(byte accountTypeId) => accountTypeId switch
    {
        4 => "OEM",
        11 => "PSU",
        _ => "Association",
    };

    private static byte TypeOf(string kind) => kind switch
    {
        "OEM" => 4,
        "PSU" => 11,
        _ => 12,
    };

    /// <summary>
    /// The bodies this user is responsible for.
    ///
    /// An Implementing Agency sees what it has raised; anyone else sees the
    /// whole list, narrowed by the filters. A State Office reads its queue by
    /// asking for status=Pending and its own state.
    /// </summary>
    [HttpGet]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<IActionResult> Get(
        [FromQuery] string? kind,
        [FromQuery] string? status,
        [FromQuery] string? search,
        [FromQuery] bool mineOnly = false,
        CancellationToken ct = default)
    {
        var query = db.Organisations.AsNoTracking()
            .Where(o => PartnerTypes.Contains(o.AccountTypeId));

        if (!string.IsNullOrWhiteSpace(kind)) query = query.Where(o => o.AccountTypeId == TypeOf(kind));
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(o => o.ApprovalStatus == status);

        if (mineOnly)
        {
            var myOrg = await MyOrganisationIdAsync(ct);
            query = query.Where(o => o.RaisedByOrganisationId == myOrg);
        }

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(o => o.Name.Contains(term) || o.OrganisationCode.Contains(term));
        }

        var rows = await query
            .OrderByDescending(o => o.ApprovalStatus == "Pending")
            .ThenByDescending(o => o.CreatedOnUtc)
            .Take(300)
            .Select(o => new
            {
                o.OrganisationId,
                o.OrganisationCode,
                o.Name,
                o.AccountTypeId,
                o.ApprovalStatus,
                o.JurisdictionScope,
                o.ContactEmail,
                o.ContactPhone,
                o.StateId,
                stateName = db.States.Where(s => s.StateId == o.StateId).Select(s => s.Name).FirstOrDefault(),
                raisedBy = db.Organisations.Where(r => r.OrganisationId == o.RaisedByOrganisationId)
                    .Select(r => r.Name).FirstOrDefault(),
                o.DecidedOnUtc,
                o.DecisionRemark,
                o.IsActive,
                // The accounts held under this body. One table lists the bodies,
                // and this is the way through to the people under each.
                userCount = db.Users.Count(u => u.OrganisationId == o.OrganisationId && !u.IsDeleted),
            })
            .ToListAsync(ct);

        return Ok(new
        {
            rows = rows.ConvertAll(o => new
            {
                o.OrganisationId,
                o.OrganisationCode,
                o.Name,
                kind = KindOf(o.AccountTypeId),
                o.ApprovalStatus,
                o.JurisdictionScope,
                o.ContactEmail,
                o.ContactPhone,
                o.stateName,
                o.raisedBy,
                o.DecidedOnUtc,
                o.DecisionRemark,
                o.IsActive,
                o.userCount,
            }),
        });
    }

    /// <summary>
    /// Raises a body for approval. Created Pending: an Implementing Agency
    /// proposes, a State Office decides.
    /// </summary>
    [HttpPost]
    [HasPermission(Permissions.UserManagement, Permissions.Create)]
    public async Task<IActionResult> Create([FromBody] PartnerSaveRequest request, CancellationToken ct)
    {
        var name = request.Name.Trim();

        if (await db.Organisations.AnyAsync(o => o.Name == name && PartnerTypes.Contains(o.AccountTypeId), ct))
        {
            return Conflict(new { message = "A body with that name is already on the list." });
        }

        var accountTypeId = TypeOf(request.Kind);
        var prefix = request.Kind switch { "OEM" => "OEM", "PSU" => "PSU", _ => "INA" };

        var organisation = new Organisation
        {
            OrganisationCode = await NextCodeAsync(prefix, ct),
            Name = name,
            AccountTypeId = accountTypeId,
            JurisdictionScope = string.IsNullOrWhiteSpace(request.JurisdictionScope)
                ? null : request.JurisdictionScope.Trim(),
            StateId = request.StateId,
            ContactEmail = string.IsNullOrWhiteSpace(request.ContactEmail) ? null : request.ContactEmail.Trim(),
            ContactPhone = string.IsNullOrWhiteSpace(request.ContactPhone) ? null : request.ContactPhone.Trim(),
            RaisedByOrganisationId = await MyOrganisationIdAsync(ct),
            ApprovalStatus = "Pending",
            IsActive = true,
            CreatedOnUtc = DateTime.UtcNow,
            CreatedByUserId = currentUser.UserId,
        };

        db.Organisations.Add(organisation);
        await db.SaveChangesAsync(ct);

        return Ok(new { organisation.OrganisationId, organisation.OrganisationCode });
    }

    /// <summary>
    /// The State Office's decision.
    ///
    /// Approving puts the body in front of every applicant in the country, so
    /// it is the one action here that changes what applicants can do. A
    /// rejection carries its reason, so the agency can fix and resubmit.
    /// </summary>
    [HttpPost("{id:int}/decision")]
    [HasPermission(Permissions.UserManagement, Permissions.Edit)]
    public async Task<IActionResult> Decide(int id, [FromBody] PartnerDecisionRequest request, CancellationToken ct)
    {
        if (request.Approve is false && string.IsNullOrWhiteSpace(request.Remark))
        {
            return BadRequest(new { message = "Give a reason when rejecting, so the agency can correct it." });
        }

        // AsTracking: the context is NoTracking by default, so without it the
        // decision below would be written to a detached object and SaveChanges
        // would report success having changed nothing.
        var organisation = await db.Organisations.AsTracking()
            .FirstOrDefaultAsync(o => o.OrganisationId == id && PartnerTypes.Contains(o.AccountTypeId), ct);

        if (organisation is null) return NotFound(new { message = "That organisation does not exist." });

        if (!await MayDecideAsync(organisation, ct))
        {
            return StatusCode(403, new
            {
                message = organisation.StateId is null
                    ? "This body operates nationally, so it is decided centrally rather than by a State Office."
                    : "This body operates in another state, so its own State Office decides it.",
            });
        }

        if (organisation.ApprovalStatus == "Approved" && request.Approve)
        {
            return Conflict(new { message = "That organisation is already approved." });
        }

        organisation.ApprovalStatus = request.Approve ? "Approved" : "Rejected";
        organisation.DecidedByUserId = currentUser.UserId;
        organisation.DecidedOnUtc = DateTime.UtcNow;
        organisation.DecisionRemark = request.Remark?.Trim();
        organisation.ModifiedOnUtc = DateTime.UtcNow;
        organisation.ModifiedByUserId = currentUser.UserId;

        await db.SaveChangesAsync(ct);

        return Ok(new { organisation.OrganisationId, organisation.ApprovalStatus });
    }

    // ------------------------------------------------- the partner's queue ---

    /// <summary>
    /// Membership and vendor claims waiting on this organisation — what an
    /// association or OEM sees when an applicant has named them.
    /// </summary>
    [HttpGet("verifications")]
    public async Task<IActionResult> Verifications([FromQuery] string? status, CancellationToken ct)
    {
        var myOrg = await MyOrganisationIdAsync(ct);
        if (myOrg is null) return Ok(new { rows = Array.Empty<object>() });

        var query = db.PartnerVerifications.AsNoTracking().Where(v => v.OrganisationId == myOrg);
        if (!string.IsNullOrWhiteSpace(status)) query = query.Where(v => v.Status == status);

        var rows = await query
            .OrderByDescending(v => v.Status == "Pending").ThenByDescending(v => v.CreatedOnUtc)
            .Take(300)
            .Select(v => new
            {
                v.PartnerVerificationId,
                v.PartnerKind,
                v.ReferenceNo,
                v.Status,
                v.CreatedOnUtc,
                v.DecidedOnUtc,
                v.DecisionRemark,
                enterprise = db.Enterprises.Where(e => e.EnterpriseId == v.EnterpriseId)
                    .Select(e => new { e.Name, e.LeanId, e.UdyamRegistrationNo }).FirstOrDefault(),
            })
            .ToListAsync(ct);

        return Ok(new { rows });
    }

    /// <summary>
    /// The named body confirms or disputes the claim, and the applicant is told.
    /// </summary>
    [HttpPost("verifications/{id:int}/decision")]
    public async Task<IActionResult> DecideVerification(
        int id, [FromBody] PartnerDecisionRequest request, CancellationToken ct)
    {
        var myOrg = await MyOrganisationIdAsync(ct);
        if (myOrg is null) return Forbid();

        if (request.Approve is false && string.IsNullOrWhiteSpace(request.Remark))
        {
            return BadRequest(new { message = "Give a reason when disputing a claim." });
        }

        var claim = await db.PartnerVerifications.AsTracking()
            .FirstOrDefaultAsync(v => v.PartnerVerificationId == id && v.OrganisationId == myOrg, ct);

        if (claim is null) return NotFound(new { message = "That request is not on your queue." });

        if (claim.Status != "Pending")
        {
            return Conflict(new { message = "That request has already been answered." });
        }

        claim.Status = request.Approve ? "Approved" : "Disputed";
        claim.DecidedByUserId = currentUser.UserId;
        claim.DecidedOnUtc = DateTime.UtcNow;
        claim.DecisionRemark = request.Remark?.Trim();

        await db.SaveChangesAsync(ct);

        var enterprise = await db.Enterprises.AsNoTracking()
            .Where(e => e.EnterpriseId == claim.EnterpriseId)
            .Select(e => new { e.Name, e.LeanId, e.ContactEmail, e.ContactPersonName })
            .FirstOrDefaultAsync(ct);

        var partnerName = await db.Organisations.AsNoTracking()
            .Where(o => o.OrganisationId == myOrg).Select(o => o.Name).FirstOrDefaultAsync(ct);

        if (enterprise is not null && !string.IsNullOrWhiteSpace(enterprise.ContactEmail))
        {
            await emailQueue.QueueTemplatedAsync(
                "PARTNER_VERIFICATION_RESULT",
                enterprise.ContactEmail!,
                null,
                new Dictionary<string, string>
                {
                    ["applicant_name"] = enterprise.ContactPersonName ?? enterprise.Name,
                    ["partner_name"] = partnerName ?? "The organisation you named",
                    ["outcome"] = request.Approve ? "Confirmed" : "Disputed",
                    ["remark"] = claim.DecisionRemark ?? "-",
                    ["lean_id"] = enterprise.LeanId ?? string.Empty,
                },
                ct);
        }

        return Ok(new { claim.PartnerVerificationId, claim.Status });
    }

    // ------------------------------------------------------------- helpers ---

    /// <summary>
    /// Whether this user may decide this body.
    ///
    /// Routing is by the body's own state, so the Gujarat office decides a
    /// Gujarat association and cannot decide a Maharashtra one. A body with no
    /// state operates nationally and has no State Office to route to, so it
    /// falls to the central roles. Without this the filters would only be a
    /// suggestion — any State Office could approve anything.
    /// </summary>
    private async Task<bool> MayDecideAsync(Organisation organisation, CancellationToken ct)
    {
        var roleCode = await db.Users.AsNoTracking()
            .Where(u => u.Id == currentUser.UserId)
            .Select(u => u.Role!.Code)
            .FirstOrDefaultAsync(ct);

        // The central roles decide anything, including the national bodies no
        // State Office owns.
        if (roleCode is "SUPER_ADMIN" or "OPERATIONS_ADMIN" or "MINISTRY_REVIEWER") return true;

        // Anyone else is a State Office, and only for their own state.
        return organisation.StateId is not null && organisation.StateId == currentUser.StateId;
    }

    private async Task<int?> MyOrganisationIdAsync(CancellationToken ct)
    {
        var userId = currentUser.UserId;
        if (userId is null) return null;

        return await db.Users.AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => u.OrganisationId)
            .FirstOrDefaultAsync(ct);
    }

    /// <summary>ORG-INA-007 and so on, continuing the seeded numbering.</summary>
    private async Task<string> NextCodeAsync(string prefix, CancellationToken ct)
    {
        var like = $"ORG-{prefix}-%";

        var highest = await db.Organisations.AsNoTracking()
            .Where(o => EF.Functions.Like(o.OrganisationCode, like))
            .Select(o => o.OrganisationCode)
            .ToListAsync(ct);

        var next = 1;
        foreach (var code in highest)
        {
            if (int.TryParse(code[^3..], out var n) && n >= next) next = n + 1;
        }

        return $"ORG-{prefix}-{next:D3}";
    }
}

public sealed class PartnerSaveRequest
{
    /// <summary>Association | OEM | PSU.</summary>
    [Required] public string Kind { get; init; } = "Association";

    [Required, StringLength(250, MinimumLength = 3)]
    public string Name { get; init; } = string.Empty;

    [StringLength(120)] public string? JurisdictionScope { get; init; }
    public short? StateId { get; init; }
    [StringLength(256), EmailAddress] public string? ContactEmail { get; init; }
    [StringLength(20)] public string? ContactPhone { get; init; }
}

public sealed class PartnerDecisionRequest
{
    public bool Approve { get; init; }
    [StringLength(500)] public string? Remark { get; init; }
}

using System.ComponentModel.DataAnnotations;
using System.Data;
using System.Globalization;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// User Management — the nine account-type screens, create/view/edit, the
/// enable/disable flows and the permission editor.
/// </summary>
[ApiController]
[Route("api/users")]
public sealed class UsersController(
    MclsDbContext db,
    UserManager<ApplicationUser> userManager,
    ICurrentUser currentUser,
    ISequenceService sequences,
    ITokenService tokens,
    IEmailQueue email,
    IDateTimeProvider clock) : ControllerBase
{
    /// <summary>The nine account-type cards with live counts.</summary>
    [HttpGet("account-types")]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<IActionResult> GetAccountTypes(CancellationToken ct)
    {
        var rows = await db.Database
            .SqlQuery<AccountTypeSummaryDto>($@"
                SELECT AccountTypeId, Code, Name, ShortName, IconKey, Description,
                       CanCreateDirectly, SortOrder, TotalUsers, ActiveUsers, InactiveUsers
                FROM auth.vw_AccountTypeSummary
                WHERE AccountTypeId IN (SELECT AccountTypeId FROM auth.AccountType WHERE IsUserManaged = 1)
                ORDER BY SortOrder")
            .ToListAsync(ct);

        // A role only administers the account types in its scope, so the cards
        // it cannot act on are not shown at all.
        var scope = currentUser.ManageableAccountTypes;
        var visible = scope.Count == 0 ? rows : rows.Where(r => scope.Contains(r.AccountTypeId)).ToList();

        return Ok(visible);
    }

    /// <summary>A paged, filtered user list — the grid behind every type screen.</summary>
    [HttpGet]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<ActionResult<PagedResult<UserListDto>>> GetUsers(
        [FromQuery] UserListQuery query, CancellationToken ct)
    {
        var q = db.Database
            .SqlQuery<UserListDto>($"SELECT * FROM auth.vw_UserList")
            .AsQueryable();

        // Scope first: a caller must never see an account type their role does
        // not administer, whatever they pass in the query string.
        var scope = currentUser.ManageableAccountTypes;
        if (scope.Count > 0)
        {
            q = q.Where(u => scope.Contains(u.AccountTypeId));
        }

        // Then ownership. The account type says what a caller may administer;
        // this says whose. An Implementing Agency sees the firms it created and
        // the people inside them, a Consultant Organisation sees its own — and
        // neither sees the other's.
        var owned = await OwnedOrganisationIdsAsync(ct);

        if (owned is not null)
        {
            q = q.Where(u => u.OrganisationId != null && owned.Contains(u.OrganisationId.Value));
        }

        if (query.AccountTypeId is { } typeId)
        {
            if (scope.Count > 0 && !scope.Contains(typeId))
            {
                return Forbid();
            }
            q = q.Where(u => u.AccountTypeId == typeId);
        }

        if (query.RoleId is { } roleId) q = q.Where(u => u.RoleId == roleId);
        if (query.StatusId is { } statusId) q = q.Where(u => u.StatusId == statusId);
        if (query.StateId is { } stateId) q = q.Where(u => u.StateId == stateId);
        if (query.OrganisationId is { } orgId) q = q.Where(u => u.OrganisationId == orgId);

        if (!string.IsNullOrWhiteSpace(query.Search))
        {
            var term = query.Search.Trim();
            q = q.Where(u =>
                u.FullName.Contains(term) ||
                u.Email.Contains(term) ||
                u.UserCode.Contains(term) ||
                (u.OrganisationName != null && u.OrganisationName.Contains(term)));
        }

        var total = await q.CountAsync(ct);

        // Sorting by a caller-supplied column name is an injection risk if it
        // reaches SQL as text, so it is mapped through a closed set here.
        q = (query.SortBy?.ToLowerInvariant(), query.SortDescending) switch
        {
            ("email", false) => q.OrderBy(u => u.Email),
            ("email", true) => q.OrderByDescending(u => u.Email),
            ("lastlogin", false) => q.OrderBy(u => u.LastLoginOnUtc),
            ("lastlogin", true) => q.OrderByDescending(u => u.LastLoginOnUtc),
            ("created", false) => q.OrderBy(u => u.CreatedOnUtc),
            ("created", true) => q.OrderByDescending(u => u.CreatedOnUtc),
            (_, true) => q.OrderByDescending(u => u.FullName),
            _ => q.OrderBy(u => u.FullName),
        };

        var items = await q
            .Skip((query.PageNumber - 1) * query.PageSize)
            .Take(query.PageSize)
            .ToListAsync(ct);

        return Ok(PagedResult<UserListDto>.Create(items, total, query.PageNumber, query.PageSize));
    }

    /// <summary>One user, with their effective permissions.</summary>
    /// <summary>
    /// The Role &amp; Permission Matrix on the User Management landing screen:
    /// which of the 15 modules each account type may open.
    ///
    /// Rows are account types rather than roles because that is how the screen
    /// reads, but the grant actually lives on the role. Where an account type
    /// has several roles the union is reported — the matrix answers "can this
    /// kind of account reach this module at all", not "can every one of them".
    /// Super Admin is listed separately for the same reason it is elsewhere: it
    /// is a role inside Ministry of MSME, not a tenth account type.
    /// </summary>
    [HttpGet("permission-matrix")]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<IActionResult> GetPermissionMatrix(CancellationToken ct)
    {
        var modules = await db.Set<Module>().AsNoTracking()
            .OrderBy(m => m.SortOrder)
            .Select(m => new PermissionMatrixModuleDto(m.ModuleId, m.Code, m.Name, m.SortOrder))
            .ToListAsync(ct);

        // Every (role, module) pair the role holds any right on.
        var grants = await db.RolePermissions.AsNoTracking()
            .Select(rp => new
            {
                rp.RoleId,
                rp.Role.Name,
                rp.Role.AccountTypeId,
                AccountTypeName = rp.Role.AccountType.Name,
                rp.Permission.ModuleId,
            })
            .ToListAsync(ct);

        var superAdminRow = grants
            .Where(g => g.Name == "Super Admin")
            .Select(g => g.ModuleId)
            .ToHashSet();

        var rows = new List<PermissionMatrixRowDto>
        {
            new(null, "Super Admin", true, modules
                .Select(m => superAdminRow.Contains(m.ModuleId))
                .ToList()),
        };

        var byAccountType = grants
            .Where(g => g.Name != "Super Admin")
            .GroupBy(g => new { g.AccountTypeId, g.AccountTypeName })
            .OrderBy(g => g.Key.AccountTypeId);

        foreach (var group in byAccountType)
        {
            var open = group.Select(g => g.ModuleId).ToHashSet();

            rows.Add(new PermissionMatrixRowDto(
                group.Key.AccountTypeId,
                group.Key.AccountTypeName,
                false,
                modules.Select(m => open.Contains(m.ModuleId)).ToList()));
        }

        return Ok(new { modules, rows });
    }


    [HttpGet("{id:int}")]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<IActionResult> GetUser(int id, CancellationToken ct)
    {
        var user = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == id)
            .Select(u => new UserDetailDto
            {
                UserId = u.Id,
                UserCode = u.UserCode,
                FullName = u.FullName,
                Initials = u.Initials,
                Email = u.Email!,
                Mobile = u.PhoneNumber,
                Designation = u.Designation,
                AccountTypeId = u.AccountTypeId,
                AccountTypeName = u.AccountType.Name,
                RoleId = u.RoleId,
                RoleName = u.Role.Name!,
                OrganisationId = u.OrganisationId,
                OrganisationName = u.Organisation != null ? u.Organisation.Name : null,
                StateId = u.StateId,
                Jurisdiction = u.Jurisdiction,
                StatusId = u.StatusId,
                StatusName = u.Status.Name,
                LastLoginOnUtc = u.LastLoginOnUtc,
                CreatedOnUtc = u.CreatedOnUtc,
            })
            .SingleOrDefaultAsync(ct);

        if (user is null) return NotFound();
        if (!IsInScope(user.AccountTypeId)) return Forbid();

        user.Permissions = await db.Database
            .SqlQuery<string>($@"
                SELECT PermissionKey FROM auth.vw_EffectivePermission WHERE UserId = {id}")
            .ToListAsync(ct);

        return Ok(user);
    }

    /// <summary>Creates an account and e-mails the holder a welcome message.</summary>
    [HttpPost]
    [HasPermission(Permissions.UserManagement, Permissions.Create)]
    public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request, CancellationToken ct)
    {
        if (!IsInScope(request.AccountTypeId))
        {
            return Forbid();
        }

        // Who may create what. Each account type has exactly one kind of
        // creator, because each belongs to exactly one body: an Operation Admin
        // to its Implementing Agency, a consultant to its firm, an assessor to
        // its agency. The scope check above says which types a role may
        // administer at all; this says which it may bring into being.
        var creatorFault = CreatorFault(request.AccountTypeId, request.Organisation is not null);

        if (creatorFault is not null) return StatusCode(403, new { message = creatorFault });

        // No role asked for means the account type's default — stored rather
        // than inferred, because Ministry of MSME carries both Ministry
        // Reviewer and Super Admin and guessing there mints administrators.
        var roleId = request.RoleId ?? await db.Roles.AsNoTracking()
            .Where(r => r.AccountTypeId == request.AccountTypeId && r.IsActive && r.IsDefaultForType)
            .Select(r => (int?)r.Id)
            .FirstOrDefaultAsync(ct);

        if (roleId is null)
        {
            return BadRequest(new
            {
                message = "No default role is configured for that account type.",
            });
        }

        // The role must belong to the account type, or a caller could hand an
        // Assessor account the Super Admin role.
        var roleAccountType = await db.Roles
            .Where(r => r.Id == roleId && r.IsActive)
            .Select(r => (byte?)r.AccountTypeId)
            .SingleOrDefaultAsync(ct);

        if (roleAccountType is null)
        {
            return BadRequest(new { message = "The selected role does not exist." });
        }

        if (roleAccountType != request.AccountTypeId)
        {
            return BadRequest(new
            {
                message = "The selected role does not belong to the selected account type.",
            });
        }

        // The organisation is either picked or created, never both, and one of
        // the two is required for every account type that has one.
        if (request.OrganisationId is not null && request.Organisation is not null)
        {
            return BadRequest(new
            {
                message = "Supply either an existing organisation or details for a new one, not both.",
            });
        }

        // Compare against the column Identity already normalised, rather than
        // normalising in the predicate: same result, and it stays sargable.
        var normalisedEmail = request.Email.ToUpperInvariant();

        if (await db.Users.IgnoreQueryFilters()
                .AnyAsync(u => u.NormalizedEmail == normalisedEmail && !u.IsDeleted, ct))
        {
            return Conflict(new { message = "An account already exists with that e-mail address." });
        }

        // Created before the user so its key can be assigned below. Both rows
        // are written by the single SaveChanges at the end, so a failure part
        // way through leaves neither behind.
        Organisation? newOrganisation = null;

        if (request.Organisation is { } details)
        {
            var orgCode = await sequences.NextAsync("Organisation", null, ct);

            newOrganisation = new Organisation
            {
                OrganisationCode = $"ORG-{orgCode}",
                Name = details.Name.Trim(),
                AccountTypeId = request.AccountTypeId,
                RegistrationNo = details.RegistrationNo?.Trim(),
                CategoryLookupId = details.CategoryLookupId,
                AddressLine = details.AddressLine.Trim(),
                StateId = details.StateId,
                DistrictId = details.DistrictId,
                Pincode = details.Pincode.Trim(),
                ContactEmail = request.Email,
                ContactPhone = request.Mobile,
                JurisdictionScope = request.Jurisdiction,
                IsActive = true,

                // The creator owns it, and that is what every later visibility
                // and edit check reads — a consultant's Implementing Agency is
                // the agency that raised the consultant's firm.
                RaisedByOrganisationId = currentUser.OrganisationId,
            };

            db.Organisations.Add(newOrganisation);
        }

        var prefix = (await db.AccountTypes
            .Where(a => a.AccountTypeId == request.AccountTypeId)
            .Select(a => a.UserCodePrefix)
            .SingleAsync(ct))
            // Trimmed defensively: the column is varchar now, but a database
            // created before that fix still stores 'IA ' and the space would
            // otherwise show up in the user code.
            .Trim();

        // A State Specific account is identified by its state, not by the type:
        // the format is MCLS-<STATE>-001, so Uttar Pradesh's first officer is
        // MCLS-UP-001 and Maharashtra's is MCLS-MH-001. Each state therefore
        // numbers its own people, and a state whose code cannot be resolved
        // falls back to the type's own segment rather than issuing a code that
        // says nothing.
        if (prefix == "STA")
        {
            // The same state the account itself is given below, which may come
            // from the organisation rather than the request.
            var stateId = request.StateId ?? request.Organisation?.StateId;

            var stateAlpha = stateId is null
                ? null
                : await db.States.AsNoTracking()
                    .Where(x => x.StateId == stateId)
                    .Select(x => x.AlphaCode)
                    .SingleOrDefaultAsync(ct);

            if (!string.IsNullOrWhiteSpace(stateAlpha)) prefix = stateAlpha;
        }

        var userCode = await sequences.NextAsync($"User-{prefix}", null, ct);

        var user = new ApplicationUser
        {
            UserName = request.Email,
            Email = request.Email,
            EmailConfirmed = true,
            PhoneNumber = request.Mobile,
            UserCode = $"MCLS-{prefix}-{userCode}",
            FullName = request.FullName,
            Initials = BuildInitials(request.FullName),
            Designation = request.Designation,
            AccountTypeId = request.AccountTypeId,
            RoleId = roleId.Value,
            OrganisationId = request.OrganisationId,
            // Set through the navigation when the organisation is new: its key
            // does not exist until SaveChanges, and EF fixes the FK up for us.
            Organisation = newOrganisation,
            // A new organisation carries the address, so the user inherits its
            // state and district unless the caller set them explicitly.
            StateId = request.StateId ?? request.Organisation?.StateId,
            DistrictId = request.DistrictId ?? request.Organisation?.DistrictId,
            Jurisdiction = request.Jurisdiction,
            StatusId = (byte)UserStatusId.Active,
            MustChangePassword = true,
            CreatedByUserId = currentUser.UserId,
            CreatedOnUtc = clock.UtcNow,
        };

        // A generated password that satisfies the policy. It is mailed to the
        // holder and never shown to the creator, and MustChangePassword above
        // forces it to be replaced at first sign-in.
        var temporary = GenerateTemporaryPassword();
        var result = await userManager.CreateAsync(user, temporary);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "The account could not be created.",
                errors = result.Errors.Select(e => e.Description),
            });
        }

        var resetToken = await userManager.GeneratePasswordResetTokenAsync(user);

        await email.QueueTemplatedAsync("USER_WELCOME", user.Email!, user.Id,
            new Dictionary<string, string>
            {
                ["user_name"] = user.FullName,
                ["user_code"] = user.UserCode,
                ["role_name"] = (await db.Roles.Where(r => r.Id == user.RoleId)
                                    .Select(r => r.Name).SingleAsync(ct)) ?? string.Empty,
                ["password"] = temporary,
                ["portal_url"] = $"{Request.Headers.Origin}/login",
            }, ct);

        // A firm creating a colleague says which modules they get, and gets no
        // say over anything it does not hold itself — the same rule the
        // permissions screen applies, applied at the moment of creation so a
        // sub-user is never briefly given the firm's whole access.
        await SaveJurisdictionsAsync(user.Id, request.Jurisdictions, ct);

        var permissionFault = await GrantOnCreateAsync(user.Id, request.Permissions, ct);

        if (permissionFault is not null)
        {
            return BadRequest(new { message = permissionFault });
        }

        return CreatedAtAction(nameof(GetUser), new { id = user.Id }, new
        {
            userId = user.Id,
            userCode = user.UserCode,
            message = "Account created. A welcome e-mail has been sent.",
            // Surfaced so an administrator can pass it on out of band if the
            // holder's mailbox is not yet working. Never logged.
            passwordResetToken = resetToken,
        });
    }

    /// <summary>Updates an account's editable details.</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.UserManagement, Permissions.Edit)]
    public async Task<IActionResult> UpdateUser(
        int id, [FromBody] UpdateUserRequest request, CancellationToken ct)
    {
        var user = await db.Users.AsTracking().SingleOrDefaultAsync(u => u.Id == id, ct);
        if (user is null) return NotFound();
        if (!IsInScope(user.AccountTypeId)) return Forbid();

        if (!await OwnsAsync(user.OrganisationId, ct))
        {
            return StatusCode(403, new
            {
                message = "This account belongs to another organisation.",
            });
        }

        // A Super Admin edits only the three account types the scheme itself
        // issues. The rest belong to the body that empanelled them — an
        // Operation Admin to its Implementing Agency, a consultant to its firm
        // — and that body edits them. Enforced here as well as hidden on the
        // screen: a hidden button is not a rule.
        if (currentUser.RoleId is { } roleId && await IsSuperAdminAsync(roleId, ct)
            && user.AccountTypeId is not ((byte)AccountTypeId.ImplementingAgency
                                          or (byte)AccountTypeId.MinistryOfMsme
                                          or (byte)AccountTypeId.StateSpecific))
        {
            return StatusCode(403, new
            {
                message = "This account is edited by the organisation that empanelled it.",
            });
        }

        // What the holder is told changed. Captured before the writes below,
        // because afterwards there is nothing left to compare against.
        var changes = new List<string>();

        void Moved(string label, string? before, string? after)
        {
            if (!string.Equals(before?.Trim(), after?.Trim(), StringComparison.Ordinal))
            {
                changes.Add(label);
            }
        }

        Moved("Name", user.FullName, request.FullName);
        Moved("Mobile", user.PhoneNumber, request.Mobile);
        Moved("Designation", user.Designation, request.Designation);
        Moved("Jurisdiction", user.Jurisdiction, request.Jurisdiction);

        if (user.OrganisationId != request.OrganisationId) changes.Add("Organisation");
        if (user.StateId != request.StateId) changes.Add("State");
        if (user.DistrictId != request.DistrictId) changes.Add("District");
        if (user.RoleId != request.RoleId) changes.Add("Role");

        user.FullName = request.FullName;
        user.Initials = BuildInitials(request.FullName);
        user.PhoneNumber = request.Mobile;
        user.Designation = request.Designation;
        user.OrganisationId = request.OrganisationId;
        user.StateId = request.StateId;
        user.DistrictId = request.DistrictId;
        user.Jurisdiction = request.Jurisdiction;

        if (request.RoleId != user.RoleId)
        {
            var roleAccountType = await db.Roles
                .Where(r => r.Id == request.RoleId && r.IsActive)
                .Select(r => (byte?)r.AccountTypeId)
                .SingleOrDefaultAsync(ct);

            if (roleAccountType != user.AccountTypeId)
            {
                return BadRequest(new
                {
                    message = "The selected role does not belong to this account type.",
                });
            }

            user.RoleId = request.RoleId;

            // The permission claims are baked into the token, so a role change
            // only takes effect once the user gets a new one.
            await tokens.RevokeAllForUserAsync(id, ct);
        }

        await db.SaveChangesAsync(ct);
        await SaveJurisdictionsAsync(id, request.Jurisdictions, ct);

        // Only when something actually moved. An administrator who opens the
        // form, changes their mind and saves anyway has not told the holder
        // anything, and a mail saying so would be noise.
        if (changes.Count > 0 && !string.IsNullOrWhiteSpace(user.Email))
        {
            await email.QueueTemplatedAsync("USER_UPDATED", user.Email!, user.Id,
                new Dictionary<string, string>
                {
                    ["user_name"] = user.FullName,
                    ["user_code"] = user.UserCode,
                    ["action_date"] = DateTime.UtcNow.ToString("dd MMM yyyy", CultureInfo.InvariantCulture),
                    ["changes"] = string.Join(", ", changes),
                    ["portal_url"] = $"{Request.Headers.Origin}/login",
                }, ct);
        }

        return NoContent();
    }

    /// <summary>
    /// Enables or disables an account. The reason is mandatory and is recorded
    /// against the account — the portal asks for it before it will commit.
    /// </summary>
    [HttpPost("{id:int}/status")]
    [HasPermission(Permissions.UserManagement, Permissions.Edit)]
    public async Task<IActionResult> SetStatus(
        int id, [FromBody] SetUserStatusRequest request, CancellationToken ct)
    {
        var target = await db.Users
            .Where(u => u.Id == id)
            .Select(u => new { u.AccountTypeId, u.StatusId, u.FullName, u.UserCode, u.Email, u.OrganisationId })
            .SingleOrDefaultAsync(ct);

        if (target is null) return NotFound();
        if (!IsInScope(target.AccountTypeId)) return Forbid();

        if (id == currentUser.UserId)
        {
            return BadRequest(new { message = "You cannot change the status of your own account." });
        }

        if (!await OwnsAsync(target.OrganisationId, ct))
        {
            return StatusCode(403, new
            {
                message = "This account belongs to another organisation.",
            });
        }

        // The procedure writes the status, the history row and the session
        // revocation in one transaction — they cannot end up out of step.
        await db.Database.ExecuteSqlRawAsync(
            "EXEC auth.usp_User_SetStatus @UserId, @ToStatusId, @Reason, @ChangedByUserId",
            [
                new SqlParameter("@UserId", id),
                new SqlParameter("@ToStatusId", request.StatusId),
                new SqlParameter("@Reason", request.Reason),
                new SqlParameter("@ChangedByUserId", currentUser.UserId ?? 0),
            ],
            ct);

        // The person whose access changed is told. Without this the status was
        // written and they found out by failing to sign in — or, on the way
        // back, never found out at all.
        await NotifyStatusChangeAsync(
            request.StatusId, target.FullName, target.UserCode, target.Email, request.Reason, ct);

        return NoContent();
    }

    /// <summary>
    /// Mails the user their account was disabled or enabled again.
    ///
    /// Queued, never awaited against SMTP, and a failure here does not undo the
    /// status change: the change is the decision, the mail is the courtesy.
    /// Only the two states a person can act on are worth a mail — a move to
    /// Locked or PendingActivation is the system's own bookkeeping.
    /// </summary>
    private async Task NotifyStatusChangeAsync(
        byte statusId, string fullName, string userCode, string? address, string? reason, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(address)) return;

        var templateCode = statusId switch
        {
            (byte)UserStatusId.Inactive => "USER_DISABLED",
            (byte)UserStatusId.Active => "USER_ENABLED",
            _ => null,
        };

        if (templateCode is null) return;

        var values = new Dictionary<string, string>
        {
            ["user_name"] = fullName,
            ["user_code"] = userCode,
            ["action_date"] = DateTime.UtcNow.ToString("dd MMM yyyy", CultureInfo.InvariantCulture),
            ["reason"] = string.IsNullOrWhiteSpace(reason) ? "Not stated" : reason,
            ["portal_url"] = $"{Request.Headers.Origin}/login",
        };

        await email.QueueTemplatedAsync(templateCode, address!, null, values, ct);
    }

    /// <summary>The permission grid: every module/right, with the user's current state.</summary>
    [HttpGet("{id:int}/permissions")]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<IActionResult> GetPermissionMatrix(int id, CancellationToken ct)
    {
        var accountTypeId = await db.Users
            .Where(u => u.Id == id)
            .Select(u => (byte?)u.AccountTypeId)
            .SingleOrDefaultAsync(ct);

        if (accountTypeId is null) return NotFound();
        if (!IsInScope(accountTypeId.Value)) return Forbid();

        var rows = await db.Database
            .SqlQuery<PermissionMatrixRow>($@"
                SELECT  p.PermissionId,
                        p.PermissionKey,
                        m.ModuleId,
                        m.Code  AS ModuleCode,
                        m.Name  AS ModuleName,
                        m.SortOrder,
                        rt.Code AS RightCode,
                        CAST(CASE WHEN rp.PermissionId IS NOT NULL THEN 1 ELSE 0 END AS bit) AS FromRole,
                        CAST(CASE WHEN ov.PermissionId IS NOT NULL THEN 1 ELSE 0 END AS bit) AS HasOverride,
                        CAST(ISNULL(ov.IsGranted,
                             CASE WHEN rp.PermissionId IS NOT NULL THEN 1 ELSE 0 END) AS bit) AS IsGranted
                FROM auth.Permission p
                JOIN auth.Module     m  ON m.ModuleId     = p.ModuleId
                JOIN auth.RightType  rt ON rt.RightTypeId = p.RightTypeId
                JOIN auth.[User]     u  ON u.Id = {id}
                LEFT JOIN auth.RolePermission rp
                       ON rp.RoleId = u.RoleId AND rp.PermissionId = p.PermissionId
                LEFT JOIN auth.UserPermissionOverride ov
                       ON ov.UserId = u.Id AND ov.PermissionId = p.PermissionId
                WHERE m.IsActive = 1
                ORDER BY m.SortOrder, rt.SortOrder")
            .ToListAsync(ct);

        return Ok(rows);
    }

    /// <summary>
    /// Replaces the user's permission overrides with the posted grid.
    ///
    /// The whole grid is sent rather than a diff: the procedure works out
    /// which entries differ from the role and stores only those, so a user is
    /// never frozen against a later role change.
    /// </summary>
    [HttpPut("{id:int}/permissions")]
    [HasPermission(Permissions.UserManagement, Permissions.Edit)]
    public async Task<IActionResult> ReplacePermissions(
        int id, [FromBody] ReplacePermissionsRequest request, CancellationToken ct)
    {
        var accountTypeId = await db.Users
            .Where(u => u.Id == id)
            .Select(u => (byte?)u.AccountTypeId)
            .SingleOrDefaultAsync(ct);

        if (accountTypeId is null) return NotFound();
        if (!IsInScope(accountTypeId.Value)) return Forbid();

        if (id == currentUser.UserId)
        {
            return BadRequest(new
            {
                message = "You cannot change your own permissions. Ask another administrator.",
            });
        }

        // A caller cannot grant a right they do not themselves hold.
        var callerPermissions = currentUser.Permissions;
        var requestedKeys = await db.Permissions
            .Where(p => request.Permissions.Select(x => x.PermissionId).Contains(p.PermissionId))
            .Select(p => new { p.PermissionId, p.PermissionKey })
            .ToListAsync(ct);

        var escalation = request.Permissions
            .Where(p => p.IsGranted)
            .Join(requestedKeys, p => p.PermissionId, k => k.PermissionId, (_, k) => k.PermissionKey)
            .Where(key => !callerPermissions.Contains(key))
            .ToList();

        if (escalation.Count > 0)
        {
            return BadRequest(new
            {
                message = "You cannot grant a permission you do not hold yourself.",
                permissions = escalation,
            });
        }

        var table = new DataTable();
        table.Columns.Add("PermissionId", typeof(short));
        table.Columns.Add("IsGranted", typeof(bool));

        foreach (var item in request.Permissions)
        {
            table.Rows.Add(item.PermissionId, item.IsGranted);
        }

        var tvp = new SqlParameter("@Permissions", SqlDbType.Structured)
        {
            TypeName = "auth.PermissionGrantList",
            Value = table,
        };

        await db.Database.ExecuteSqlRawAsync(
            "EXEC auth.usp_User_ReplacePermissions @UserId, @Permissions, @SetByUserId, @Reason",
            [
                new SqlParameter("@UserId", id),
                tvp,
                new SqlParameter("@SetByUserId", currentUser.UserId ?? 0),
                new SqlParameter("@Reason", (object?)request.Reason ?? DBNull.Value),
            ],
            ct);

        // The new grants only reach the user once they get a fresh token.
        await tokens.RevokeAllForUserAsync(id, ct);

        return NoContent();
    }

    // ------------------------------------------------------------- helpers --

    /// <summary>
    /// Whether the caller's role administers this account type. An empty scope
    /// means unrestricted (Super Admin).
    /// </summary>
    /// <summary>
    /// Why this caller may not create that account type, or null if they may.
    ///
    /// A Consultant Organisation is created by an Implementing Agency, with a
    /// new organisation of its own. The same account type without a new
    /// organisation is a sub-user inside a firm that already exists, and that
    /// is the firm's own to create — so the two are told apart by whether an
    /// organisation is being raised alongside the account.
    /// </summary>
    private string? CreatorFault(byte accountTypeId, bool raisingOrganisation)
    {
        var caller = currentUser.AccountTypeId;

        // The Super Admin issues the three the scheme itself runs on.
        if (accountTypeId is (byte)AccountTypeId.ImplementingAgency
                          or (byte)AccountTypeId.MinistryOfMsme
                          or (byte)AccountTypeId.StateSpecific)
        {
            return null;
        }

        return accountTypeId switch
        {
            (byte)AccountTypeId.OperationAdmin when caller != (byte)AccountTypeId.ImplementingAgency =>
                "An Operation Admin account is created by an Implementing Agency.",

            (byte)AccountTypeId.ConsultantOrganisation or (byte)AccountTypeId.AssessmentAgency
                when raisingOrganisation && caller != (byte)AccountTypeId.ImplementingAgency =>
                "A Consultant Organisation or Assessment Agency is created by an Implementing Agency.",

            // A sub-user inside a firm belongs to that firm.
            (byte)AccountTypeId.ConsultantOrganisation when !raisingOrganisation
                && caller != (byte)AccountTypeId.ConsultantOrganisation =>
                "A sub-user is created by the Consultant Organisation itself.",

            (byte)AccountTypeId.AssessmentAgency when !raisingOrganisation
                && caller != (byte)AccountTypeId.AssessmentAgency =>
                "A sub-user is created by the Assessment Agency itself.",

            (byte)AccountTypeId.Consultants when caller != (byte)AccountTypeId.ConsultantOrganisation =>
                "A consultant is created by their Consultant Organisation.",

            (byte)AccountTypeId.Assessors when caller != (byte)AccountTypeId.AssessmentAgency =>
                "An assessor is created by their Assessment Agency.",

            _ => null,
        };
    }

    /// <summary>
    /// The organisations whose people this caller may see, or null for a caller
    /// who sees everyone.
    ///
    /// An Implementing Agency sees its own organisation, every firm it raised,
    /// and — because a consultant belongs to a firm rather than to the agency —
    /// the people inside those firms. A firm sees only itself. Anyone else with
    /// the module and no organisation of their own (Super Admin, Ministry
    /// Reviewer) sees everything, which is what null means here.
    /// </summary>
    private async Task<HashSet<int>?> OwnedOrganisationIdsAsync(CancellationToken ct)
    {
        var mine = currentUser.OrganisationId;
        if (mine is null) return null;

        return currentUser.AccountTypeId switch
        {
            (byte)AccountTypeId.ImplementingAgency =>
                (await db.Organisations.AsNoTracking()
                    .Where(o => o.OrganisationId == mine || o.RaisedByOrganisationId == mine)
                    .Select(o => o.OrganisationId)
                    .ToListAsync(ct))
                .ToHashSet(),

            (byte)AccountTypeId.ConsultantOrganisation or (byte)AccountTypeId.AssessmentAgency =>
                [mine.Value],

            _ => null,
        };
    }

    /// <summary>
    /// Grants a new account the modules it was created with, or says why not.
    ///
    /// Nothing to do when none were asked for: the account then holds whatever
    /// its role carries, which is the normal case. When some were asked for,
    /// the caller may only pass on what they hold themselves — a Consultant
    /// Organisation cannot hand a colleague a module it cannot reach.
    /// </summary>
    private async Task<string?> GrantOnCreateAsync(
        int userId, List<short>? permissionIds, CancellationToken ct)
    {
        if (permissionIds is null || permissionIds.Count == 0) return null;

        var wanted = permissionIds.Distinct().ToList();

        var keys = await db.Permissions.AsNoTracking()
            .Where(p => wanted.Contains(p.PermissionId))
            .Select(p => new { p.PermissionId, p.PermissionKey })
            .ToListAsync(ct);

        var held = currentUser.Permissions;
        var escalation = keys.Where(k => !held.Contains(k.PermissionKey)).Select(k => k.PermissionKey).ToList();

        if (escalation.Count > 0)
        {
            return $"You cannot grant a permission you do not hold yourself: {string.Join(", ", escalation)}.";
        }

        var table = new DataTable();
        table.Columns.Add("PermissionId", typeof(short));
        table.Columns.Add("IsGranted", typeof(bool));

        foreach (var id in wanted) table.Rows.Add(id, true);

        await db.Database.ExecuteSqlRawAsync(
            "EXEC auth.usp_User_ReplacePermissions @UserId, @Permissions, @SetByUserId, @Reason",
            [
                new SqlParameter("@UserId", userId),
                new SqlParameter("@Permissions", SqlDbType.Structured)
                {
                    TypeName = "auth.PermissionGrantList",
                    Value = table,
                },
                new SqlParameter("@SetByUserId", currentUser.UserId ?? 0),
                new SqlParameter("@Reason", "Granted when the account was created."),
            ],
            ct);

        return null;
    }

    /// <summary>
    /// The modules this caller may pass on, for the sub-user form.
    ///
    /// A firm grants out of its own access and no further, so the form offers
    /// exactly what the caller holds rather than the whole matrix with most of
    /// it refused on save.
    /// </summary>
    [HttpGet("grantable-permissions")]
    [HasPermission(Permissions.UserManagement, Permissions.Create)]
    public async Task<IActionResult> GrantablePermissions(CancellationToken ct)
    {
        var held = currentUser.Permissions;

        var rows = await db.Permissions.AsNoTracking()
            .Select(p => new
            {
                p.PermissionId,
                p.PermissionKey,
                p.ModuleId,
                moduleName = p.Module.Name,
                moduleSort = p.Module.SortOrder,
                right = p.RightType.Code,
            })
            .ToListAsync(ct);

        var mine = rows.Where(r => held.Contains(r.PermissionKey)).ToList();

        var modules = mine
            .GroupBy(r => new { r.ModuleId, r.moduleName, r.moduleSort })
            .OrderBy(g => g.Key.moduleSort)
            .Select(g => new
            {
                g.Key.ModuleId,
                name = g.Key.moduleName,
                rights = g.OrderBy(r => r.right).Select(r => new { r.PermissionId, r.right }),
            });

        return Ok(new { modules });
    }

    /// <summary>
    /// Replaces the states and districts an officer covers.
    ///
    /// Replaced rather than merged: the form sends the whole selection, and a
    /// merge would leave a state granted that the administrator had just
    /// unticked. A state with no districts named is stored as one row with a
    /// null district, which is the whole state.
    /// </summary>
    private async Task SaveJurisdictionsAsync(
        int userId, List<JurisdictionSelection>? selection, CancellationToken ct)
    {
        if (selection is null) return;

        var existing = await db.UserJurisdictions.AsTracking()
            .Where(j => j.UserId == userId)
            .ToListAsync(ct);

        db.UserJurisdictions.RemoveRange(existing);

        foreach (var state in selection)
        {
            var districts = state.DistrictIds ?? [];

            if (districts.Count == 0)
            {
                db.UserJurisdictions.Add(new UserJurisdiction
                {
                    UserId = userId,
                    StateId = state.StateId,
                    DistrictId = null,
                });
                continue;
            }

            foreach (var districtId in districts.Distinct())
            {
                db.UserJurisdictions.Add(new UserJurisdiction
                {
                    UserId = userId,
                    StateId = state.StateId,
                    DistrictId = districtId,
                });
            }
        }

        await db.SaveChangesAsync(ct);
    }

    /// <summary>Whether this caller owns the organisation an account sits in.</summary>
    private async Task<bool> OwnsAsync(int? organisationId, CancellationToken ct)
    {
        var owned = await OwnedOrganisationIdsAsync(ct);

        if (owned is null) return true;

        return organisationId is { } id && owned.Contains(id);
    }

    private async Task<bool> IsSuperAdminAsync(int roleId, CancellationToken ct) =>
        await db.Roles.AsNoTracking().AnyAsync(r => r.Id == roleId && r.Code == "SUPER_ADMIN", ct);

    private bool IsInScope(byte accountTypeId)
    {
        var scope = currentUser.ManageableAccountTypes;
        return scope.Count == 0 || scope.Contains(accountTypeId);
    }

    private static string BuildInitials(string fullName)
    {
        var parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Where(p => p is not ("Shri" or "Smt." or "Smt" or "Dr." or "Dr" or "Col." or "Col" or "Mr." or "Ms."))
            .ToArray();

        return parts.Length switch
        {
            0 => "??",
            1 => parts[0][..Math.Min(2, parts[0].Length)].ToUpperInvariant(),
            _ => $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[^1][0])}",
        };
    }

    /// <summary>
    /// A random password meeting the configured policy. Never returned or
    /// logged — the holder sets their own through the reset link.
    /// </summary>
    private static string GenerateTemporaryPassword()
    {
        const string Upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        const string Lower = "abcdefghijkmnopqrstuvwxyz";
        const string Digits = "23456789";
        const string Symbols = "!@#$%^&*";

        var chars = new List<char>();
        for (var i = 0; i < 4; i++)
        {
            chars.Add(Upper[System.Security.Cryptography.RandomNumberGenerator.GetInt32(Upper.Length)]);
            chars.Add(Lower[System.Security.Cryptography.RandomNumberGenerator.GetInt32(Lower.Length)]);
            chars.Add(Digits[System.Security.Cryptography.RandomNumberGenerator.GetInt32(Digits.Length)]);
            chars.Add(Symbols[System.Security.Cryptography.RandomNumberGenerator.GetInt32(Symbols.Length)]);
        }

        // Shuffle so the character classes are not in a predictable order.
        for (var i = chars.Count - 1; i > 0; i--)
        {
            var j = System.Security.Cryptography.RandomNumberGenerator.GetInt32(i + 1);
            (chars[i], chars[j]) = (chars[j], chars[i]);
        }

        return new string([.. chars]);
    }
}

// ------------------------------------------------------------- contracts ----

public sealed class UserListQuery : PagedQuery
{
    public byte? AccountTypeId { get; set; }
    public int? RoleId { get; set; }
    public byte? StatusId { get; set; }
    public short? StateId { get; set; }
    public int? OrganisationId { get; set; }
}

public sealed record AccountTypeSummaryDto(
    byte AccountTypeId, string Code, string Name, string ShortName, string? IconKey,
    string? Description, bool CanCreateDirectly, byte SortOrder,
    int TotalUsers, int ActiveUsers, int InactiveUsers);

public sealed class UserListDto
{
    public int UserId { get; init; }
    public string UserCode { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string? Initials { get; init; }
    public string Email { get; init; } = string.Empty;
    public string? Mobile { get; init; }
    public string? Designation { get; init; }
    public byte AccountTypeId { get; init; }
    public string AccountTypeName { get; init; } = string.Empty;
    public string AccountTypeShortName { get; init; } = string.Empty;
    public int RoleId { get; init; }
    public string RoleName { get; init; } = string.Empty;
    public int? OrganisationId { get; init; }
    public string? OrganisationName { get; init; }
    public short? StateId { get; init; }
    public string? StateName { get; init; }
    public string? Jurisdiction { get; init; }
    public byte StatusId { get; init; }
    public string StatusName { get; init; } = string.Empty;
    public string? StatusColour { get; init; }
    public DateTime? LastLoginOnUtc { get; init; }
    public DateTime CreatedOnUtc { get; init; }
    public string? CreatedByName { get; init; }
}

public sealed class UserDetailDto
{
    public int UserId { get; init; }
    public string UserCode { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string? Initials { get; init; }
    public string Email { get; init; } = string.Empty;
    public string? Mobile { get; init; }
    public string? Designation { get; init; }
    public byte AccountTypeId { get; init; }
    public string AccountTypeName { get; init; } = string.Empty;
    public int RoleId { get; init; }
    public string RoleName { get; init; } = string.Empty;
    public int? OrganisationId { get; init; }
    public string? OrganisationName { get; init; }
    public short? StateId { get; init; }
    public string? Jurisdiction { get; init; }
    public byte StatusId { get; init; }
    public string StatusName { get; init; } = string.Empty;
    public DateTime? LastLoginOnUtc { get; init; }
    public DateTime CreatedOnUtc { get; init; }
    public IReadOnlyList<string> Permissions { get; set; } = [];
}

public sealed class CreateUserRequest
{
    /// <summary>
    /// Permission ids to grant the new account, for a firm creating a sub-user
    /// with less access than itself. Empty means the account holds whatever its
    /// role carries, which is the normal case.
    /// </summary>
    public List<short>? Permissions { get; set; }

    /// <summary>
    /// The states and districts a State Specific officer covers. An entry with
    /// no districts means the whole state.
    /// </summary>
    public List<JurisdictionSelection>? Jurisdictions { get; set; }

    [Required, MaxLength(200)] public string FullName { get; set; } = string.Empty;
    [Required, EmailAddress, MaxLength(256)] public string Email { get; set; } = string.Empty;
    [Phone, MaxLength(30)] public string? Mobile { get; set; }
    [MaxLength(150)] public string? Designation { get; set; }
    [Required] public byte AccountTypeId { get; set; }
    /// <summary>
    /// Optional. The create form does not ask for a role, so an account starts
    /// on its account type's default (auth.Role.IsDefaultForType) — never
    /// Super Admin. A role is still chosen deliberately on the edit screen.
    /// </summary>
    public int? RoleId { get; set; }
    /// <summary>
    /// An existing organisation. Leave null and supply <see cref="Organisation"/>
    /// instead to create one as part of the same request, which is what the
    /// Create New User screens do.
    /// </summary>
    public int? OrganisationId { get; set; }

    public OrganisationDetailsRequest? Organisation { get; set; }

    public short? StateId { get; set; }
    public int? DistrictId { get; set; }
    [MaxLength(120)] public string? Jurisdiction { get; set; }
}

/// <summary>
/// The "{Account type} Details" section of Create New User.
///
/// The screens capture the organisation rather than picking one: an
/// Implementing Agency is registered at the same moment its first nodal contact
/// is, and until then there is nothing to pick from. Labels differ per account
/// type (Organisation Name / Department Name / State Department) but they are
/// the same field underneath, so one shape serves all three.
/// </summary>
/// <summary>One state, and the districts of it that are covered.</summary>
public sealed class JurisdictionSelection
{
    public short StateId { get; set; }

    /// <summary>Empty or absent means the whole state.</summary>
    public List<int>? DistrictIds { get; set; }
}

public sealed class OrganisationDetailsRequest
{
    [Required, MaxLength(500)] public string Name { get; set; } = string.Empty;

    /// <summary>Registration or CIN number. Implementing Agencies only, optional.</summary>
    [MaxLength(50)] public string? RegistrationNo { get; set; }

    /// <summary>A master.LookupValue of type AGENCY_CATEGORY.</summary>
    public int? CategoryLookupId { get; set; }

    [Required, MaxLength(1000)] public string AddressLine { get; set; } = string.Empty;
    [Required] public short StateId { get; set; }
    public int? DistrictId { get; set; }

    [Required, RegularExpression(@"^\d{6}$", ErrorMessage = "Enter a 6-digit pincode.")]
    public string Pincode { get; set; } = string.Empty;
}

public sealed class UpdateUserRequest
{
    /// <summary>The states and districts a State Specific officer covers.</summary>
    public List<JurisdictionSelection>? Jurisdictions { get; set; }

    [Required, MaxLength(200)] public string FullName { get; set; } = string.Empty;
    [Phone, MaxLength(30)] public string? Mobile { get; set; }
    [MaxLength(150)] public string? Designation { get; set; }
    [Required] public int RoleId { get; set; }
    public int? OrganisationId { get; set; }
    public short? StateId { get; set; }
    public int? DistrictId { get; set; }
    [MaxLength(120)] public string? Jurisdiction { get; set; }
}

public sealed class SetUserStatusRequest
{
    [Required] public byte StatusId { get; set; }

    /// <summary>Mandatory: the portal captures it before the change commits.</summary>
    [Required, MinLength(5), MaxLength(1000)]
    public string Reason { get; set; } = string.Empty;
}

public sealed record PermissionMatrixRow(
    short PermissionId, string PermissionKey, byte ModuleId, string ModuleCode,
    string ModuleName, byte SortOrder, string RightCode,
    bool FromRole, bool HasOverride, bool IsGranted);

public sealed class ReplacePermissionsRequest
{
    [Required] public List<PermissionGrant> Permissions { get; set; } = [];
    [MaxLength(400)] public string? Reason { get; set; }
}

public sealed record PermissionGrant(short PermissionId, bool IsGranted);

public sealed record PermissionMatrixModuleDto(byte ModuleId, string Code, string Name, byte SortOrder);

public sealed record PermissionMatrixRowDto(
    byte? AccountTypeId,
    string Label,
    bool IsSuperAdmin,
    IReadOnlyList<bool> Access);

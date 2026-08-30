using MCLS.Api.Authorization;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// Edit Role &amp; Permissions — what a kind of account may reach.
///
/// Rows are account types rather than roles because that is how the screen
/// reads, but the grant lives on the role, so a change is applied to every role
/// of that account type. Super Admin is listed on its own for the same reason
/// it is elsewhere: it is a role inside Ministry of MSME, not a tenth account
/// type — and it is read-only, because an administrator who can revoke their
/// own access can lock the scheme out of its own portal.
///
/// This is the role-wise grid. One person's exceptions are a different thing
/// and live on the user (auth.UserPermissionOverride), edited from that user's
/// own screen; changing a role here moves everybody on it who has no override.
/// </summary>
[ApiController]
[Route("api/role-permissions")]
[Authorize]
public sealed class RolePermissionsController(MclsDbContext db) : ControllerBase
{
    private const string SuperAdmin = "SUPER_ADMIN";

    /// <summary>The left-hand list: Super Admin, then every account type.</summary>
    [HttpGet]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<IActionResult> GetAccounts(CancellationToken ct)
    {
        var moduleTotal = await db.Modules.CountAsync(m => m.IsActive, ct);

        var grants = await db.RolePermissions.AsNoTracking()
            .Select(rp => new { rp.Role.Code, rp.Role.AccountTypeId, rp.Permission.ModuleId })
            .ToListAsync(ct);

        var accountTypes = await db.Set<AccountType>().AsNoTracking()
            .Where(a => a.IsActive && a.Code != "MSME_ENTERPRISE")
            .OrderBy(a => a.SortOrder)
            .Select(a => new { a.AccountTypeId, a.Name })
            .ToListAsync(ct);

        var rows = new List<object>
        {
            new
            {
                accountTypeId = (byte?)null,
                name = "Super Admin",
                locked = true,
                modules = grants.Where(g => g.Code == SuperAdmin).Select(g => g.ModuleId).Distinct().Count(),
                moduleTotal,
            },
        };

        foreach (var type in accountTypes)
        {
            rows.Add(new
            {
                accountTypeId = (byte?)type.AccountTypeId,
                name = type.Name,
                locked = false,
                modules = grants
                    .Where(g => g.Code != SuperAdmin && g.AccountTypeId == type.AccountTypeId)
                    .Select(g => g.ModuleId).Distinct().Count(),
                moduleTotal,
            });
        }

        return Ok(new { rows });
    }

    /// <summary>
    /// One account type's grid: every module with its five rights, and every
    /// menu item underneath it.
    ///
    /// Only the User Management children carry a grant of their own — which
    /// account types this one may administer, in auth.UserManagementScope. The
    /// rest are navigation inside a single module, so they are shown as they
    /// appear in the sidebar and follow the module above them.
    /// </summary>
    [HttpGet("{accountTypeId:int}")]
    [HasPermission(Permissions.UserManagement, Permissions.View)]
    public async Task<IActionResult> GetGrid(int accountTypeId, CancellationToken ct)
    {
        var roleIds = await RoleIdsAsync(accountTypeId, ct);
        if (roleIds.Count == 0) return NotFound(new { message = "No role belongs to that account type." });

        var modules = await db.Modules.AsNoTracking()
            .Where(m => m.IsActive)
            .OrderBy(m => m.SortOrder)
            .Select(m => new { m.ModuleId, m.Code, m.Name })
            .ToListAsync(ct);

        var held = await db.RolePermissions.AsNoTracking()
            .Where(rp => roleIds.Contains(rp.RoleId))
            .Select(rp => new { rp.Permission.ModuleId, Right = rp.Permission.RightType.Code })
            .ToListAsync(ct);

        // The sidebar's own children, so the grid reads like the menu it governs.
        var children = await db.Database
            .SqlQuery<MenuChildRow>($@"
                SELECT c.ModuleId, c.Label, c.SortOrder, c.AccountTypeId AS ManagedAccountTypeId
                FROM auth.MenuItem c
                WHERE c.IsActive = 1 AND c.ParentMenuItemId IS NOT NULL
                ORDER BY c.SortOrder")
            .ToListAsync(ct);

        var scope = await db.UserManagementScopes.AsNoTracking()
            .Where(s => roleIds.Contains(s.RoleId))
            .Select(s => s.ManagedAccountTypeId)
            .ToListAsync(ct);

        var scopeSet = scope.ToHashSet();

        var rows = new List<object>();

        foreach (var module in modules)
        {
            var rights = held.Where(h => h.ModuleId == module.ModuleId).Select(h => h.Right).ToHashSet();

            rows.Add(new
            {
                kind = "module",
                module.ModuleId,
                module.Code,
                module.Name,
                access = rights.Count > 0,
                view = rights.Contains("view"),
                create = rights.Contains("create"),
                edit = rights.Contains("edit"),
                delete = rights.Contains("delete"),
                export = rights.Contains("export"),
            });

            foreach (var child in children.Where(c => c.ModuleId == module.ModuleId))
            {
                // A User Management child names the account type it administers,
                // and that is a grant. Every other child is navigation.
                var managed = child.ManagedAccountTypeId;

                rows.Add(new
                {
                    kind = "child",
                    parentModuleId = module.ModuleId,
                    name = child.Label,
                    managedAccountTypeId = managed,
                    grantable = managed != null,
                    access = managed != null ? scopeSet.Contains(managed.Value) : rights.Count > 0,
                    view = managed != null ? scopeSet.Contains(managed.Value) : rights.Contains("view"),
                    create = managed != null ? scopeSet.Contains(managed.Value) : rights.Contains("create"),
                    edit = managed != null ? scopeSet.Contains(managed.Value) : rights.Contains("edit"),
                    delete = managed != null ? scopeSet.Contains(managed.Value) : rights.Contains("delete"),
                    export = managed != null ? scopeSet.Contains(managed.Value) : rights.Contains("export"),
                });
            }
        }

        var name = await db.Set<AccountType>().AsNoTracking()
            .Where(a => a.AccountTypeId == accountTypeId).Select(a => a.Name).FirstOrDefaultAsync(ct);

        var scopeTotal = await db.Set<AccountType>()
            .CountAsync(a => a.IsActive && a.Code != "MSME_ENTERPRISE", ct);

        return Ok(new
        {
            accountTypeId,
            name,
            rows,
            moduleCount = held.Select(h => h.ModuleId).Distinct().Count(),
            moduleTotal = modules.Count,
            scopeCount = scopeSet.Count,
            scopeTotal,
        });
    }

    /// <summary>
    /// Saves the grid.
    ///
    /// Replaces the account type's grants outright rather than diffing: the
    /// screen sends the whole grid, and a diff would leave a right behind when
    /// two administrators save at once.
    /// </summary>
    [HttpPut("{accountTypeId:int}")]
    [HasPermission(Permissions.UserManagement, Permissions.Edit)]
    public async Task<IActionResult> Save(
        int accountTypeId, [FromBody] RoleGridRequest request, CancellationToken ct)
    {
        var roleIds = await RoleIdsAsync(accountTypeId, ct);
        if (roleIds.Count == 0) return NotFound(new { message = "No role belongs to that account type." });

        var permissions = await db.Permissions.AsNoTracking()
            .Select(p => new { p.PermissionId, p.ModuleId, Right = p.RightType.Code })
            .ToListAsync(ct);

        var wanted = new HashSet<short>();

        foreach (var row in request.Modules ?? [])
        {
            if (!row.Access) continue;

            foreach (var right in Rights(row))
            {
                var match = permissions.Find(p => p.ModuleId == row.ModuleId && p.Right == right);
                if (match is not null) wanted.Add(match.PermissionId);
            }
        }

        // Only what changed. Clearing the lot and re-adding it looks simpler and
        // does not work: RolePermission is keyed on (RoleId, PermissionId), so
        // re-adding a grant that is still wanted collides in the change tracker
        // with the Deleted row of the same key, and EF throws before anything
        // reaches the database. Every realistic save keeps at least one grant,
        // so every realistic save failed.
        var existing = await db.RolePermissions.AsTracking()
            .Where(rp => roleIds.Contains(rp.RoleId))
            .ToListAsync(ct);

        foreach (var row in existing.Where(rp => !wanted.Contains(rp.PermissionId)))
        {
            db.RolePermissions.Remove(row);
        }

        foreach (var roleId in roleIds)
        {
            var held = existing
                .Where(rp => rp.RoleId == roleId)
                .Select(rp => rp.PermissionId)
                .ToHashSet();

            foreach (var permissionId in wanted.Where(id => !held.Contains(id)))
            {
                db.RolePermissions.Add(new RolePermission
                {
                    RoleId = roleId,
                    PermissionId = permissionId,
                    GrantedOnUtc = DateTime.UtcNow,
                });
            }
        }

        // Which account types this one may administer — the User Management
        // children on the grid. Keyed on (RoleId, ManagedAccountTypeId), so the
        // same rule applies.
        var wantedScopes = (request.ManagedAccountTypeIds ?? []).Distinct().ToHashSet();

        var scopes = await db.UserManagementScopes.AsTracking()
            .Where(s => roleIds.Contains(s.RoleId))
            .ToListAsync(ct);

        foreach (var row in scopes.Where(s => !wantedScopes.Contains(s.ManagedAccountTypeId)))
        {
            db.UserManagementScopes.Remove(row);
        }

        foreach (var roleId in roleIds)
        {
            var held = scopes
                .Where(s => s.RoleId == roleId)
                .Select(s => s.ManagedAccountTypeId)
                .ToHashSet();

            foreach (var managed in wantedScopes.Where(id => !held.Contains(id)))
            {
                db.UserManagementScopes.Add(new UserManagementScope
                {
                    RoleId = roleId,
                    ManagedAccountTypeId = managed,
                });
            }
        }

        await db.SaveChangesAsync(ct);

        return Ok(new { modules = request.Modules?.Count(m => m.Access) ?? 0 });
    }

    private static IEnumerable<string> Rights(ModuleGrantDto row)
    {
        if (row.View) yield return "view";
        if (row.Create) yield return "create";
        if (row.Edit) yield return "edit";
        if (row.Delete) yield return "delete";
        if (row.Export) yield return "export";
    }

    /// <summary>
    /// The roles a change here applies to. Super Admin is excluded even from
    /// its own account type: it is edited nowhere, so that the portal cannot be
    /// locked out of itself.
    /// </summary>
    private async Task<List<int>> RoleIdsAsync(int accountTypeId, CancellationToken ct) =>
        await db.Roles.AsNoTracking()
            .Where(r => r.AccountTypeId == accountTypeId && r.IsActive && r.Code != SuperAdmin)
            .Select(r => r.Id)
            .ToListAsync(ct);
}

public sealed class MenuChildRow
{
    public byte? ModuleId { get; set; }
    public string Label { get; set; } = string.Empty;
    public short SortOrder { get; set; }
    public byte? ManagedAccountTypeId { get; set; }
}

public sealed class RoleGridRequest
{
    public List<ModuleGrantDto>? Modules { get; init; }
    public List<byte>? ManagedAccountTypeIds { get; init; }
}

public sealed class ModuleGrantDto
{
    public byte ModuleId { get; init; }
    public bool Access { get; init; }
    public bool View { get; init; }
    public bool Create { get; init; }
    public bool Edit { get; init; }
    public bool Delete { get; init; }
    public bool Export { get; init; }
}

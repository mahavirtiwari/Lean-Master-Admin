using Microsoft.AspNetCore.Authorization;
using MCLS.Infrastructure.Identity;

namespace MCLS.Api.Authorization;

/// <summary>
/// Requires one <c>MODULE.right</c> permission, e.g. <c>USER_MGMT.edit</c>.
/// </summary>
public sealed class PermissionRequirement(string permissionKey) : IAuthorizationRequirement
{
    public string PermissionKey { get; } = permissionKey;
}

/// <summary>
/// Checks the requirement against the permission claims the token carries.
///
/// The claims are minted at sign-in from <c>auth.vw_EffectivePermission</c>,
/// so this is a pure in-memory check — no database round trip per request. The
/// cost is that a permission change does not take effect until the user's next
/// access token, which is why the access-token lifetime is short and changing
/// a user's permissions revokes their refresh tokens.
/// </summary>
public sealed class PermissionAuthorizationHandler : AuthorizationHandler<PermissionRequirement>
{
    protected override Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PermissionRequirement requirement)
    {
        var hasPermission = context.User.Claims.Any(c =>
            c.Type == JwtTokenService.PermissionClaimType &&
            string.Equals(c.Value, requirement.PermissionKey, StringComparison.Ordinal));

        if (hasPermission)
        {
            context.Succeed(requirement);
        }

        return Task.CompletedTask;
    }
}

/// <summary>
/// Builds a <see cref="PermissionRequirement"/> for any policy named
/// <c>perm:MODULE.right</c>, so controllers can require a permission without
/// every combination being registered up front.
/// </summary>
public sealed class PermissionPolicyProvider(
    Microsoft.Extensions.Options.IOptions<AuthorizationOptions> options)
    : Microsoft.AspNetCore.Authorization.DefaultAuthorizationPolicyProvider(options)
{
    public const string Prefix = "perm:";

    public override async Task<AuthorizationPolicy?> GetPolicyAsync(string policyName)
    {
        // Anything registered explicitly wins.
        var existing = await base.GetPolicyAsync(policyName);
        if (existing is not null) return existing;

        if (!policyName.StartsWith(Prefix, StringComparison.Ordinal)) return null;

        var key = policyName[Prefix.Length..];
        if (string.IsNullOrWhiteSpace(key)) return null;

        return new AuthorizationPolicyBuilder()
            .RequireAuthenticatedUser()
            .AddRequirements(new PermissionRequirement(key))
            .Build();
    }
}

/// <summary>
/// Declares the permission an endpoint needs:
/// <c>[HasPermission(Permissions.UserManagement, Permissions.Edit)]</c>.
///
/// Taking module and right as separate constants means a typo is a compile
/// error rather than a policy that silently never matches.
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class HasPermissionAttribute : AuthorizeAttribute
{
    public HasPermissionAttribute(string module, string right)
        : base($"{PermissionPolicyProvider.Prefix}{module}.{right}")
    {
        Module = module;
        Right = right;
    }

    public string Module { get; }
    public string Right { get; }
}

using System.Security.Claims;
using MCLS.Application.Common.Interfaces;
using MCLS.Infrastructure.Identity;

namespace MCLS.Api.Middleware;

/// <summary>
/// Reads the caller out of the current request's claims. Registered scoped and
/// injected wherever the Application or Infrastructure layer needs to know who
/// is acting, so those layers never touch <c>HttpContext</c> themselves.
/// </summary>
public sealed class CurrentUserService(IHttpContextAccessor accessor) : ICurrentUser
{
    private ClaimsPrincipal? User => accessor.HttpContext?.User;

    public ClaimsPrincipal? Principal => User;

    public bool IsAuthenticated => User?.Identity?.IsAuthenticated == true;

    public int? UserId => TryParseInt(User?.FindFirstValue(ClaimTypes.NameIdentifier)
                                      ?? User?.FindFirstValue("sub"));

    public string? UserCode => User?.FindFirstValue(JwtTokenService.UserCodeClaimType);

    public string? FullName => User?.FindFirstValue(ClaimTypes.Name);

    public string? Email => User?.FindFirstValue(ClaimTypes.Email)
                            ?? User?.FindFirstValue("email");

    public byte? AccountTypeId =>
        byte.TryParse(User?.FindFirstValue(JwtTokenService.AccountTypeClaimType), out var v) ? v : null;

    public int? RoleId => null;   // not carried in the token; look up when needed

    public int? OrganisationId => TryParseInt(User?.FindFirstValue(JwtTokenService.OrganisationClaimType));

    public short? StateId =>
        short.TryParse(User?.FindFirstValue(JwtTokenService.StateClaimType), out var v) ? v : null;

    private IReadOnlySet<string>? _permissions;

    public IReadOnlySet<string> Permissions =>
        _permissions ??= User?.Claims
            .Where(c => c.Type == JwtTokenService.PermissionClaimType)
            .Select(c => c.Value)
            .ToHashSet(StringComparer.Ordinal)
        ?? new HashSet<string>(StringComparer.Ordinal);

    private IReadOnlySet<byte>? _manageableTypes;

    public IReadOnlySet<byte> ManageableAccountTypes =>
        _manageableTypes ??= User?.Claims
            .Where(c => c.Type == JwtTokenService.ManageableTypeClaimType)
            .Select(c => byte.TryParse(c.Value, out var v) ? v : (byte)0)
            .Where(v => v != 0)
            .ToHashSet()
        ?? new HashSet<byte>();

    public string? IpAddress
    {
        get
        {
            var ctx = accessor.HttpContext;
            if (ctx is null) return null;

            // Behind IIS with ARR or a load balancer the socket address is the
            // proxy. ForwardedHeaders middleware rewrites RemoteIpAddress when
            // the proxy is in KnownProxies, so this reads the real client.
            return ctx.Connection.RemoteIpAddress?.ToString();
        }
    }

    public string? UserAgent
    {
        get
        {
            var value = accessor.HttpContext?.Request.Headers.UserAgent.ToString();
            return string.IsNullOrWhiteSpace(value)
                ? null
                : value.Length > 400 ? value[..400] : value;
        }
    }

    public bool HasPermission(string permissionKey) => Permissions.Contains(permissionKey);

    public bool HasPermission(string module, string right) => Permissions.Contains($"{module}.{right}");

    private static int? TryParseInt(string? value)
        => int.TryParse(value, out var v) ? v : null;
}

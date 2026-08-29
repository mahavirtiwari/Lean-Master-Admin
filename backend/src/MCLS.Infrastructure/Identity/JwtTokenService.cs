using System.Globalization;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Identity;
using MCLS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace MCLS.Infrastructure.Identity;

/// <summary>Signing and lifetime settings, bound from the <c>Jwt</c> configuration section.</summary>
public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    public string Issuer { get; set; } = "MCLS.Api";
    public string Audience { get; set; } = "MCLS.Portal";

    /// <summary>
    /// HMAC signing key. Must be at least 32 bytes. Supplied from user secrets
    /// in development and from the environment or a machine credential in
    /// production — never from appsettings.json.
    /// </summary>
    public string SigningKey { get; set; } = string.Empty;

    public int AccessTokenMinutes { get; set; } = 30;
    public int RefreshTokenDays { get; set; } = 7;
}

/// <summary>
/// Issues access tokens carrying the user's effective permissions, and manages
/// rotating refresh tokens.
/// </summary>
public sealed class JwtTokenService(
    MclsDbContext db,
    IOptions<JwtOptions> options,
    IDateTimeProvider clock) : ITokenService
{
    private readonly JwtOptions _options = options.Value;

    /// <summary>Claim type carrying one permission key, e.g. <c>USER_MGMT.edit</c>.</summary>
    public const string PermissionClaimType = "mcls:perm";

    /// <summary>Claim type carrying an account type this user may administer.</summary>
    public const string ManageableTypeClaimType = "mcls:manages";

    public const string UserCodeClaimType = "mcls:code";
    public const string AccountTypeClaimType = "mcls:account_type";
    public const string OrganisationClaimType = "mcls:org";
    public const string StateClaimType = "mcls:state";

    public async Task<(string AccessToken, DateTime ExpiresOnUtc)> CreateAccessTokenAsync(
        int userId, CancellationToken ct = default)
    {
        var user = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new
            {
                u.Id, u.UserCode, u.FullName, u.Email, u.AccountTypeId,
                u.RoleId, u.OrganisationId, u.StateId, u.SecurityStamp,
                RoleName = u.Role.Name,
            })
            .SingleOrDefaultAsync(ct)
            ?? throw new InvalidOperationException($"User {userId} was not found.");

        // The effective set — role grants, minus revokes, plus explicit grants.
        // Read from the view so there is exactly one definition of "may they?".
        var permissions = await db.Database
            .SqlQuery<string>($@"
                SELECT PermissionKey
                FROM auth.vw_EffectivePermission
                WHERE UserId = {userId}")
            .ToListAsync(ct);

        var manageable = await db.UserManagementScopes
            .AsNoTracking()
            .Where(s => s.RoleId == user.RoleId)
            .Select(s => s.ManagedAccountTypeId)
            .ToListAsync(ct);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString(CultureInfo.InvariantCulture)),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString("N")),
            new(JwtRegisteredClaimNames.Email, user.Email ?? string.Empty),
            new(ClaimTypes.Name, user.FullName),
            new(ClaimTypes.Role, user.RoleName ?? string.Empty),
            new(UserCodeClaimType, user.UserCode),
            new(AccountTypeClaimType, user.AccountTypeId.ToString(CultureInfo.InvariantCulture)),

            // Lets a token be invalidated when the user's security stamp
            // changes — a password reset or a forced sign-out.
            new("mcls:stamp", user.SecurityStamp ?? string.Empty),
        };

        if (user.OrganisationId is { } orgId) claims.Add(new Claim(OrganisationClaimType, orgId.ToString(CultureInfo.InvariantCulture)));
        if (user.StateId is { } stateId) claims.Add(new Claim(StateClaimType, stateId.ToString(CultureInfo.InvariantCulture)));

        claims.AddRange(permissions.Select(p => new Claim(PermissionClaimType, p)));
        claims.AddRange(manageable.Select(t => new Claim(ManageableTypeClaimType, t.ToString(CultureInfo.InvariantCulture))));

        var expires = clock.UtcNow.AddMinutes(_options.AccessTokenMinutes);

        var token = new JwtSecurityToken(
            issuer: _options.Issuer,
            audience: _options.Audience,
            claims: claims,
            notBefore: clock.UtcNow,
            expires: expires,
            signingCredentials: new SigningCredentials(GetSigningKey(), SecurityAlgorithms.HmacSha256));

        return (new JwtSecurityTokenHandler().WriteToken(token), expires);
    }

    public async Task<(string RefreshToken, DateTime ExpiresOnUtc)> CreateRefreshTokenAsync(
        int userId, string? ipAddress, string? userAgent, CancellationToken ct = default)
    {
        // 256 bits from a cryptographic RNG. Base64url so it survives being put
        // in a header or a cookie without escaping.
        var bytes = RandomNumberGenerator.GetBytes(32);
        var clear = Base64UrlEncoder.Encode(bytes);
        var expires = clock.UtcNow.AddDays(_options.RefreshTokenDays);

        db.RefreshTokens.Add(new RefreshToken
        {
            UserId = userId,
            TokenHash = SHA256.HashData(Encoding.UTF8.GetBytes(clear)),
            ExpiresOnUtc = expires,
            CreatedOnUtc = clock.UtcNow,
            CreatedByIp = ipAddress,
            UserAgent = Truncate(userAgent, 400),
        });

        await db.SaveChangesAsync(ct);
        return (clear, expires);
    }

    public async Task<RefreshResult?> ValidateAndRotateRefreshTokenAsync(
        string refreshToken, string? ipAddress, string? userAgent, CancellationToken ct = default)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken));

        // AsTracking: this row is revoked and back-linked below, and the context
        // is NoTracking by default. Untracked, the revocation was silently lost —
        // which meant refresh tokens never actually rotated out and the replay
        // check below could never fire, because nothing was ever marked revoked.
        var existing = await db.RefreshTokens.AsTracking()
            .SingleOrDefaultAsync(t => t.TokenHash == hash, ct);

        if (existing is null) return null;

        // A token presented after it was revoked means it leaked and is being
        // replayed. Revoke the whole chain for that user rather than just
        // refusing this one request.
        if (existing.RevokedOnUtc is not null)
        {
            await RevokeAllForUserAsync(existing.UserId, ct);
            return null;
        }

        if (clock.UtcNow >= existing.ExpiresOnUtc) return null;

        // The account may have been disabled since the token was issued.
        var isActive = await db.Users
            .AnyAsync(u => u.Id == existing.UserId
                        && !u.IsDeleted
                        && u.StatusId == (byte)Domain.Enums.UserStatusId.Active, ct);

        if (!isActive) return null;

        // Mint the replacement, keeping the clear value to hand back: only its
        // hash is stored, so this is the one and only chance to return it.
        var clear = Base64UrlEncoder.Encode(RandomNumberGenerator.GetBytes(32));
        var expires = clock.UtcNow.AddDays(_options.RefreshTokenDays);

        var replacement = new RefreshToken
        {
            UserId = existing.UserId,
            TokenHash = SHA256.HashData(Encoding.UTF8.GetBytes(clear)),
            ExpiresOnUtc = expires,
            CreatedOnUtc = clock.UtcNow,
            CreatedByIp = ipAddress,
            UserAgent = Truncate(userAgent, 400),
        };

        existing.RevokedOnUtc = clock.UtcNow;
        existing.RevokedByIp = ipAddress;

        db.RefreshTokens.Add(replacement);
        await db.SaveChangesAsync(ct);

        // The replacement's key only exists after the insert, so the back-link
        // is a second write.
        existing.ReplacedByTokenId = replacement.RefreshTokenId;
        await db.SaveChangesAsync(ct);

        return new RefreshResult(existing.UserId, clear, expires);
    }

    public async Task RevokeRefreshTokenAsync(string refreshToken, string? ipAddress, CancellationToken ct = default)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(refreshToken));

        await db.RefreshTokens
            .Where(t => t.TokenHash == hash && t.RevokedOnUtc == null)
            .ExecuteUpdateAsync(s => s
                .SetProperty(t => t.RevokedOnUtc, clock.UtcNow)
                .SetProperty(t => t.RevokedByIp, ipAddress), ct);
    }

    public async Task RevokeAllForUserAsync(int userId, CancellationToken ct = default)
    {
        await db.RefreshTokens
            .Where(t => t.UserId == userId && t.RevokedOnUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedOnUtc, clock.UtcNow), ct);
    }

    private SymmetricSecurityKey GetSigningKey()
    {
        if (string.IsNullOrWhiteSpace(_options.SigningKey))
        {
            throw new InvalidOperationException(
                "Jwt:SigningKey is not configured. Set it in user secrets for development " +
                "or as an environment variable in production.");
        }

        var bytes = Encoding.UTF8.GetBytes(_options.SigningKey);
        if (bytes.Length < 32)
        {
            throw new InvalidOperationException(
                "Jwt:SigningKey must be at least 32 bytes for HMAC-SHA256.");
        }

        return new SymmetricSecurityKey(bytes);
    }

    private static string? Truncate(string? value, int max)
        => value is null || value.Length <= max ? value : value[..max];
}

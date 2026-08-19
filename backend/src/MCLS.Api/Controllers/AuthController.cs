using System.ComponentModel.DataAnnotations;
using System.Globalization;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

[ApiController]
[Route("api/auth")]
public sealed class AuthController(
    UserManager<ApplicationUser> userManager,
    MclsDbContext db,
    ITokenService tokens,
    ICurrentUser currentUser,
    IEmailQueue email,
    IDateTimeProvider clock,
    ILogger<AuthController> logger) : ControllerBase
{
    /// <summary>
    /// Signs in and returns an access token plus a refresh token.
    /// </summary>
    /// <remarks>
    /// Every failure returns the same message. Telling a caller that the
    /// e-mail exists but the password is wrong turns the sign-in form into an
    /// account enumeration oracle, which for a portal listing named government
    /// officials is a real disclosure.
    /// </remarks>
    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    [ProducesResponseType<LoginResponse>(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status401Unauthorized)]
    public async Task<IActionResult> Login([FromBody] LoginRequest request, CancellationToken ct)
    {
        const string GenericFailure = "The user ID or password is incorrect.";

        // The sign-in screen asks for a User ID (MCLS-MIN-000001), not an
        // e-mail. Both are accepted: the design's field is the User ID, but
        // existing accounts and the bootstrap admin are addressed by e-mail,
        // and refusing that would lock out the very first sign-in.
        var identifier = request.UserId.Trim();

        var user = identifier.Contains('@', StringComparison.Ordinal)
            ? await userManager.FindByEmailAsync(identifier)
            : await db.Users.AsTracking()
                .SingleOrDefaultAsync(u => u.UserCode == identifier && !u.IsDeleted, ct);

        if (user is null || user.IsDeleted)
        {
            await RecordLoginAsync(null, identifier, false, "Unknown user ID", ct);
            return Unauthorized(new { message = GenericFailure });
        }

        if (await userManager.IsLockedOutAsync(user))
        {
            await RecordLoginAsync(user.Id, identifier, false, "Locked out", ct);
            return Unauthorized(new
            {
                message = "The account is temporarily locked after repeated failed attempts. " +
                          "Try again in a few minutes.",
            });
        }

        if (!await userManager.CheckPasswordAsync(user, request.Password))
        {
            // Counts towards lockout.
            await userManager.AccessFailedAsync(user);
            await RecordLoginAsync(user.Id, identifier, false, "Bad password", ct);
            return Unauthorized(new { message = GenericFailure });
        }

        if (user.StatusId != (byte)UserStatusId.Active)
        {
            await RecordLoginAsync(user.Id, identifier, false, $"Status {user.StatusId}", ct);
            return Unauthorized(new
            {
                message = "This account is not active. Contact your administrator.",
            });
        }

        await userManager.ResetAccessFailedCountAsync(user);

        var (accessToken, expiresOn) = await tokens.CreateAccessTokenAsync(user.Id, ct);
        var (refreshToken, refreshExpires) = await tokens.CreateRefreshTokenAsync(
            user.Id, currentUser.IpAddress, currentUser.UserAgent, ct);

        await db.Users
            .Where(u => u.Id == user.Id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.LastLoginOnUtc, clock.UtcNow)
                .SetProperty(u => u.LastActivityOnUtc, clock.UtcNow), ct);

        await RecordLoginAsync(user.Id, identifier, true, null, ct);

        logger.LogInformation("User {UserCode} signed in.", user.UserCode);

        return Ok(await BuildLoginResponseAsync(
            user.Id, accessToken, expiresOn, refreshToken, refreshExpires, ct));
    }

    /// <summary>Exchanges a refresh token for a new pair. The old token is revoked.</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest request, CancellationToken ct)
    {
        var rotated = await tokens.ValidateAndRotateRefreshTokenAsync(
            request.RefreshToken, currentUser.IpAddress, currentUser.UserAgent, ct);

        if (rotated is not { } result)
        {
            return Unauthorized(new { message = "The session has expired. Please sign in again." });
        }

        var (accessToken, expiresOn) = await tokens.CreateAccessTokenAsync(result.UserId, ct);

        return Ok(await BuildLoginResponseAsync(
            result.UserId, accessToken, expiresOn, result.RefreshToken, result.ExpiresOnUtc, ct));
    }

    /// <summary>Revokes the presented refresh token.</summary>
    [HttpPost("logout")]
    public async Task<IActionResult> Logout([FromBody] RefreshRequest request, CancellationToken ct)
    {
        await tokens.RevokeRefreshTokenAsync(request.RefreshToken, currentUser.IpAddress, ct);
        return NoContent();
    }

    /// <summary>The signed-in user, their permissions and the menu they may see.</summary>
    [HttpGet("me")]
    [ProducesResponseType<CurrentUserResponse>(StatusCodes.Status200OK)]
    public async Task<IActionResult> Me(CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Unauthorized();

        var profile = await LoadProfileAsync(userId, ct);
        return profile is null ? Unauthorized() : Ok(profile);
    }

    /// <summary>
    /// Changes the caller's own password. Every other session is signed out:
    /// if the change was prompted by a suspected compromise, leaving the other
    /// sessions alive would defeat the point.
    /// </summary>
    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordRequest request, CancellationToken ct)
    {
        if (currentUser.UserId is not { } userId) return Unauthorized();

        var user = await userManager.FindByIdAsync(userId.ToString(CultureInfo.InvariantCulture));
        if (user is null) return Unauthorized();

        var result = await userManager.ChangePasswordAsync(
            user, request.CurrentPassword, request.NewPassword);

        if (!result.Succeeded)
        {
            return BadRequest(new
            {
                message = "The password could not be changed.",
                errors = result.Errors.Select(e => e.Description),
            });
        }

        await db.Users
            .Where(u => u.Id == userId)
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.MustChangePassword, false)
                .SetProperty(u => u.PasswordChangedOnUtc, clock.UtcNow), ct);

        await tokens.RevokeAllForUserAsync(userId, ct);

        logger.LogInformation("User {UserId} changed their password; all sessions revoked.", userId);

        return Ok(new { message = "Password changed. Please sign in again." });
    }

    /// <summary>
    /// Starts a password reset. Always returns 200, whether or not the address
    /// is known — the response must not reveal which accounts exist.
    /// </summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordRequest request,
        [FromServices] IConfiguration configuration,
        CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(request.Email);

        if (user is not null && !user.IsDeleted && user.StatusId == (byte)UserStatusId.Active)
        {
            var token = await userManager.GeneratePasswordResetTokenAsync(user);
            var portalUrl = configuration["Portal:BaseUrl"]?.TrimEnd('/') ?? string.Empty;
            var resetUrl = $"{portalUrl}/reset-password?email={Uri.EscapeDataString(user.Email!)}" +
                           $"&token={Uri.EscapeDataString(token)}";

            await email.QueueTemplatedAsync("USER_PASSWORD_RESET", user.Email!, user.Id,
                new Dictionary<string, string>
                {
                    ["user_name"] = user.FullName,
                    ["reset_url"] = resetUrl,
                    ["expiry_minutes"] = "60",
                }, ct);
        }

        return Ok(new
        {
            message = "If that address belongs to an account, a reset link has been sent to it.",
        });
    }

    /// <summary>Completes a password reset using the e-mailed token.</summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    [EnableRateLimiting("auth")]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordRequest request, CancellationToken ct)
    {
        var user = await userManager.FindByEmailAsync(request.Email);

        // Same generic answer whether the address or the token was wrong.
        const string Generic = "The reset link is invalid or has expired. Request a new one.";

        if (user is null || user.IsDeleted)
        {
            return BadRequest(new { message = Generic });
        }

        var result = await userManager.ResetPasswordAsync(user, request.Token, request.NewPassword);

        if (!result.Succeeded)
        {
            return BadRequest(new { message = Generic, errors = result.Errors.Select(e => e.Description) });
        }

        await db.Users
            .Where(u => u.Id == user.Id)
            .ExecuteUpdateAsync(s => s
                .SetProperty(u => u.MustChangePassword, false)
                .SetProperty(u => u.PasswordChangedOnUtc, clock.UtcNow), ct);

        await tokens.RevokeAllForUserAsync(user.Id, ct);

        return Ok(new { message = "Password reset. Please sign in." });
    }

    // ------------------------------------------------------------- helpers --

    private async Task<LoginResponse> BuildLoginResponseAsync(
        int userId, string accessToken, DateTime expiresOn,
        string refreshToken, DateTime refreshExpires, CancellationToken ct)
        => new()
        {
            AccessToken = accessToken,
            ExpiresOnUtc = expiresOn,
            RefreshToken = refreshToken,
            RefreshTokenExpiresOnUtc = refreshExpires,
            User = await LoadProfileAsync(userId, ct)
                   ?? throw new InvalidOperationException("Profile could not be loaded after sign-in."),
        };

    private async Task<CurrentUserResponse?> LoadProfileAsync(int userId, CancellationToken ct)
    {
        var profile = await db.Users
            .AsNoTracking()
            .Where(u => u.Id == userId)
            .Select(u => new
            {
                u.Id, u.UserCode, u.FullName, u.Initials, u.Email, u.Designation,
                u.AccountTypeId, u.Jurisdiction, u.MustChangePassword,
                AccountTypeName = u.AccountType.Name,
                RoleName = u.Role.Name,
                RoleCode = u.Role.Code,
                OrganisationName = u.Organisation != null ? u.Organisation.Name : null,
            })
            .SingleOrDefaultAsync(ct);

        if (profile is null) return null;

        // The effective set, from the same view the token is built from.
        var permissions = await db.Database
            .SqlQuery<EffectivePermissionRow>($@"
                SELECT PermissionKey, ModuleCode, ModuleName, RoutePath, RightCode
                FROM auth.vw_EffectivePermission
                WHERE UserId = {userId}")
            .ToListAsync(ct);

        // The sidebar, as a two-level tree. Comes from auth.vw_MenuForUser,
        // which already applies both gates: the module's view permission, and —
        // for User Management children — the account types this role may
        // administer. So nothing here has to re-derive visibility.
        var menuRows = await db.Database
            .SqlQuery<MenuRow>($@"
                SELECT MenuItemId, ParentMenuItemId, Code, Label, RoutePath, IconKey,
                       SortOrder, ModuleCode
                FROM auth.vw_MenuForUser
                WHERE UserId = {userId}
                ORDER BY SortOrder")
            .ToListAsync(ct);

        var childrenByParent = menuRows
            .Where(r => r.ParentMenuItemId is not null)
            .GroupBy(r => r.ParentMenuItemId!.Value)
            .ToDictionary(g => g.Key, g => g.OrderBy(r => r.SortOrder).ToList());

        var menu = menuRows
            .Where(r => r.ParentMenuItemId is null)
            .OrderBy(r => r.SortOrder)
            .Select(parent => new MenuItem(
                parent.Code,
                parent.ModuleCode,
                parent.Label,
                parent.RoutePath,
                parent.IconKey,
                childrenByParent.TryGetValue(parent.MenuItemId, out var kids)
                    ? kids.Select(c => new MenuItem(
                        c.Code, c.ModuleCode, c.Label, c.RoutePath, c.IconKey, [])).ToList()
                    : []))
            .ToList();

        return new CurrentUserResponse
        {
            UserId = profile.Id,
            UserCode = profile.UserCode,
            FullName = profile.FullName,
            Initials = profile.Initials,
            Email = profile.Email,
            Designation = profile.Designation,
            AccountTypeId = profile.AccountTypeId,
            AccountTypeName = profile.AccountTypeName,
            RoleName = profile.RoleName,
            RoleCode = profile.RoleCode,
            OrganisationName = profile.OrganisationName,
            Jurisdiction = profile.Jurisdiction,
            MustChangePassword = profile.MustChangePassword,
            Permissions = permissions.Select(p => p.PermissionKey).Distinct().ToList(),
            Menu = menu,
        };
    }

    private async Task RecordLoginAsync(
        int? userId, string emailAddress, bool success, string? reason, CancellationToken ct)
    {
        db.LoginAudits.Add(new LoginAudit
        {
            UserId = userId,
            AttemptedEmail = emailAddress,
            IsSuccess = success,
            FailureReason = reason,
            IpAddress = currentUser.IpAddress,
            UserAgent = currentUser.UserAgent,
            OccurredOnUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
    }

    private sealed record EffectivePermissionRow(
        string PermissionKey, string ModuleCode, string ModuleName, string? RoutePath, string RightCode);

    private sealed record MenuRow(
        short MenuItemId, short? ParentMenuItemId, string Code, string Label,
        string? RoutePath, string? IconKey, short SortOrder, string ModuleCode);
}

// ------------------------------------------------------------- contracts ----

public sealed class LoginRequest
{
    /// <summary>
    /// The portal User ID (e.g. <c>MCLS-MIN-000001</c>). An e-mail address is
    /// also accepted, which is how the bootstrap administrator signs in before
    /// any User ID has been circulated.
    /// </summary>
    [Required, MaxLength(256)]
    public string UserId { get; set; } = string.Empty;

    [Required, MaxLength(200)]
    public string Password { get; set; } = string.Empty;
}

public sealed class RefreshRequest
{
    [Required]
    public string RefreshToken { get; set; } = string.Empty;
}

public sealed class ChangePasswordRequest
{
    [Required] public string CurrentPassword { get; set; } = string.Empty;
    [Required, MinLength(12)] public string NewPassword { get; set; } = string.Empty;
}

public sealed class ForgotPasswordRequest
{
    [Required, EmailAddress] public string Email { get; set; } = string.Empty;
}

public sealed class ResetPasswordRequest
{
    [Required, EmailAddress] public string Email { get; set; } = string.Empty;
    [Required] public string Token { get; set; } = string.Empty;
    [Required, MinLength(12)] public string NewPassword { get; set; } = string.Empty;
}

public sealed class LoginResponse
{
    public string AccessToken { get; init; } = string.Empty;
    public DateTime ExpiresOnUtc { get; init; }
    public string RefreshToken { get; init; } = string.Empty;
    public DateTime RefreshTokenExpiresOnUtc { get; init; }
    public CurrentUserResponse User { get; init; } = null!;
}

public sealed class CurrentUserResponse
{
    public int UserId { get; init; }
    public string UserCode { get; init; } = string.Empty;
    public string FullName { get; init; } = string.Empty;
    public string? Initials { get; init; }
    public string? Email { get; init; }
    public string? Designation { get; init; }
    public byte AccountTypeId { get; init; }
    public string AccountTypeName { get; init; } = string.Empty;
    public string? RoleName { get; init; }
    public string? RoleCode { get; init; }
    public string? OrganisationName { get; init; }
    public string? Jurisdiction { get; init; }

    /// <summary>The client routes straight to the change-password screen when true.</summary>
    public bool MustChangePassword { get; init; }

    public IReadOnlyList<string> Permissions { get; init; } = [];
    public IReadOnlyList<MenuItem> Menu { get; init; } = [];
}

/// <summary>
/// One sidebar entry. <paramref name="Children"/> is empty for a leaf; the
/// design nests exactly one level, so no deeper recursion is modelled.
/// </summary>
public sealed record MenuItem(
    string Code,
    string ModuleCode,
    string Label,
    string? RoutePath,
    string? IconKey,
    IReadOnlyList<MenuItem> Children);

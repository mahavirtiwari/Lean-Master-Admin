using System.Security.Claims;

namespace MCLS.Application.Common.Interfaces;

/// <summary>
/// The caller behind the current request. Injected rather than reaching for
/// <c>HttpContext</c>, so handlers stay testable and the Application layer
/// keeps no dependency on ASP.NET Core.
/// </summary>
public interface ICurrentUser
{
    int? UserId { get; }
    string? UserCode { get; }
    string? FullName { get; }
    string? Email { get; }
    byte? AccountTypeId { get; }
    int? RoleId { get; }
    int? OrganisationId { get; }
    short? StateId { get; }
    bool IsAuthenticated { get; }

    /// <summary>Effective permission keys, e.g. <c>USER_MGMT.edit</c>.</summary>
    IReadOnlySet<string> Permissions { get; }

    /// <summary>Account types this user's role may administer.</summary>
    IReadOnlySet<byte> ManageableAccountTypes { get; }

    string? IpAddress { get; }
    string? UserAgent { get; }

    /// <summary>
    /// What the mobile app says it is, e.g. "android/1.0.0".
    ///
    /// A React Native app's user agent is whatever the platform's HTTP stack
    /// chose to send, which on Android reads like a browser. The app knows what
    /// it is running on; the agent string only guesses.
    /// </summary>
    string? ClientPlatform { get; }

    ClaimsPrincipal? Principal { get; }

    bool HasPermission(string permissionKey);
    bool HasPermission(string module, string right);
}

/// <summary>
/// Wall-clock access, injected so tests can freeze time rather than sleep.
/// </summary>
public interface IDateTimeProvider
{
    DateTime UtcNow { get; }
    DateOnly Today { get; }
}

/// <summary>Issues and validates the portal's JWTs.</summary>
public interface ITokenService
{
    /// <summary>
    /// Builds an access token carrying the user's identity and their effective
    /// permission claims.
    /// </summary>
    Task<(string AccessToken, DateTime ExpiresOnUtc)> CreateAccessTokenAsync(
        int userId, CancellationToken ct = default);

    /// <summary>
    /// Issues a refresh token, returning the clear value for the client. Only
    /// its SHA-256 hash is persisted.
    /// </summary>
    Task<(string RefreshToken, DateTime ExpiresOnUtc)> CreateRefreshTokenAsync(
        int userId, string? ipAddress, string? userAgent, CancellationToken ct = default);

    /// <summary>
    /// Validates a refresh token and rotates it, returning the user it belongs
    /// to along with the replacement token. Returns null when the token is
    /// unknown, expired, already revoked, or its account is no longer active.
    /// </summary>
    Task<RefreshResult?> ValidateAndRotateRefreshTokenAsync(
        string refreshToken, string? ipAddress, string? userAgent, CancellationToken ct = default);

    Task RevokeRefreshTokenAsync(string refreshToken, string? ipAddress, CancellationToken ct = default);
    Task RevokeAllForUserAsync(int userId, CancellationToken ct = default);
}

/// <summary>The outcome of a successful refresh-token rotation.</summary>
/// <param name="UserId">The account the presented token belonged to.</param>
/// <param name="RefreshToken">The replacement token, in clear, for the client.</param>
/// <param name="ExpiresOnUtc">When the replacement expires.</param>
public readonly record struct RefreshResult(int UserId, string RefreshToken, DateTime ExpiresOnUtc);

/// <summary>
/// Hands out the portal's human-readable identifiers, backed by
/// <c>audit.usp_NextSequence</c> so concurrent callers cannot collide.
/// </summary>
public interface ISequenceService
{
    Task<string> NextAsync(string sequenceName, string? periodKey = null, CancellationToken ct = default);
}

/// <summary>
/// Queues e-mail. Nothing is sent on the request thread: a hosted service
/// drains the outbox, so an SMTP outage never blocks a user action.
/// </summary>
public interface IEmailQueue
{
    Task QueueTemplatedAsync(
        string templateCode,
        string toAddress,
        int? toUserId,
        IReadOnlyDictionary<string, string> mergeValues,
        CancellationToken ct = default);

    Task QueueRawAsync(string toAddress, string subject, string bodyHtml,
        int? toUserId = null, CancellationToken ct = default);
}

/// <summary>
/// Reads and writes uploaded files. Implementations store outside the web root
/// so no upload is ever directly reachable over HTTP.
/// </summary>
public interface IFileStorage
{
    /// <summary>
    /// Saves a stream and returns the generated name plus its path relative to
    /// the storage root. The original name is never used on disk.
    /// </summary>
    Task<(string StoredFileName, string RelativePath, long SizeBytes, byte[] Sha256)> SaveAsync(
        Stream content, string originalFileName, string subFolder, CancellationToken ct = default);

    Task<Stream> OpenReadAsync(string relativePath, string storedFileName, CancellationToken ct = default);
    Task DeleteAsync(string relativePath, string storedFileName, CancellationToken ct = default);
    bool IsExtensionAllowed(string fileName);
}

/// <summary>Typed access to Settings &gt; System, cached and invalidated on write.</summary>
public interface ISystemSettings
{
    Task<string?> GetStringAsync(string key, CancellationToken ct = default);
    Task<int> GetIntAsync(string key, int fallback, CancellationToken ct = default);
    Task<bool> GetBoolAsync(string key, bool fallback, CancellationToken ct = default);
    Task SetAsync(string key, string? value, int modifiedByUserId, CancellationToken ct = default);
    void InvalidateCache();
}

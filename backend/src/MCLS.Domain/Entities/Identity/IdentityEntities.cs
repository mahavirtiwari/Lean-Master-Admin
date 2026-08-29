using Microsoft.AspNetCore.Identity;
using MCLS.Domain.Common;

namespace MCLS.Domain.Entities.Identity;

/// <summary>
/// A portal account. Extends ASP.NET Core Identity's user with the columns the
/// scheme needs: the MCLS user code, the account type, the owning organisation
/// and the jurisdiction the account is scoped to.
/// </summary>
public class ApplicationUser : IdentityUser<int>, ISoftDeletable, IConcurrencyAware
{
    /// <summary>Human-readable identifier, e.g. <c>MCLS-IA-000142</c>.</summary>
    public string UserCode { get; set; } = string.Empty;

    public string FullName { get; set; } = string.Empty;

    /// <summary>Two-letter avatar chip, e.g. "CR". Derived from the name when blank.</summary>
    public string? Initials { get; set; }

    public string? Designation { get; set; }

    public byte AccountTypeId { get; set; }
    public AccountType AccountType { get; set; } = null!;

    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;

    public int? OrganisationId { get; set; }
    public Organisation? Organisation { get; set; }

    public short? StateId { get; set; }
    public int? DistrictId { get; set; }

    /// <summary>Display scope: "National", "Maharashtra", "Silver &amp; Gold".</summary>
    public string? Jurisdiction { get; set; }

    public byte StatusId { get; set; } = (byte)Enums.UserStatusId.Active;
    public UserStatus Status { get; set; } = null!;

    /// <summary>
    /// Set on every account the portal creates. The sign-in flow redirects to
    /// the change-password screen while this is true.
    /// </summary>
    public bool MustChangePassword { get; set; } = true;

    public DateTime? PasswordChangedOnUtc { get; set; }
    public DateTime? LastLoginOnUtc { get; set; }
    public DateTime? LastActivityOnUtc { get; set; }

    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public bool IsDeleted { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<UserPermissionOverride> PermissionOverrides { get; set; } = [];
    public ICollection<UserStatusHistory> StatusHistory { get; set; } = [];
    public ICollection<RefreshToken> RefreshTokens { get; set; } = [];
}

/// <summary>One of the nine managed account types.</summary>
public class AccountType
{
    public byte AccountTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string ShortName { get; set; } = string.Empty;
    public string? IconKey { get; set; }

    /// <summary>Three-letter segment of the user code, e.g. "IA".</summary>
    public string UserCodePrefix { get; set; } = string.Empty;

    public string? Description { get; set; }

    /// <summary>
    /// Whether the type card offers "Create New User" directly. Only three of
    /// the nine do; the rest are created from within their own list screen.
    /// </summary>
    public bool CanCreateDirectly { get; set; }

    public bool RequiresOrganisation { get; set; }
    public byte SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    /// <summary>
    /// True for the nine account types User Management administers. MSME
    /// Enterprise is false: it is an audience documents are published to, not a
    /// portal account the Ministry issues.
    /// </summary>
    public bool IsUserManaged { get; set; } = true;

    public ICollection<Role> Roles { get; set; } = [];
}

/// <summary>A sidebar module. Data rather than an enum so Settings can reorder them.</summary>
public class Module
{
    public byte ModuleId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? RoutePath { get; set; }
    public string? IconKey { get; set; }
    public byte SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<Permission> Permissions { get; set; } = [];
}

public class RightType
{
    public byte RightTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public byte SortOrder { get; set; }
}

/// <summary>A (module, right) pair. <see cref="PermissionKey"/> is the JWT claim value.</summary>
public class Permission
{
    public short PermissionId { get; set; }
    public byte ModuleId { get; set; }
    public Module Module { get; set; } = null!;
    public byte RightTypeId { get; set; }
    public RightType RightType { get; set; } = null!;

    /// <summary>e.g. <c>USER_MGMT.edit</c>.</summary>
    public string PermissionKey { get; set; } = string.Empty;
}

public class Role : IdentityRole<int>, IConcurrencyAware
{
    public string Code { get; set; } = string.Empty;
    public byte AccountTypeId { get; set; }
    public AccountType AccountType { get; set; } = null!;
    public string? Description { get; set; }

    /// <summary>Seeded roles cannot be deleted or renamed by the portal.</summary>
    public bool IsSystemRole { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<RolePermission> RolePermissions { get; set; } = [];
    public ICollection<UserManagementScope> ManagedAccountTypes { get; set; } = [];
}

public class RolePermission
{
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public short PermissionId { get; set; }
    public Permission Permission { get; set; } = null!;
    public DateTime GrantedOnUtc { get; set; }
    public int? GrantedByUserId { get; set; }
}

/// <summary>
/// Which account types a role may administer. An Implementing Agency admin
/// manages delivery-side accounts only, never a government one.
/// </summary>
public class UserManagementScope
{
    public int RoleId { get; set; }
    public Role Role { get; set; } = null!;
    public byte ManagedAccountTypeId { get; set; }
    public AccountType ManagedAccountType { get; set; } = null!;
}

/// <summary>
/// A per-user tweak away from the role's grant, set on the Edit Permissions
/// screen. <c>IsGranted = false</c> revokes a right the role gives.
/// </summary>
public class UserPermissionOverride
{
    public int UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public short PermissionId { get; set; }
    public Permission Permission { get; set; } = null!;
    public bool IsGranted { get; set; }
    public string? Reason { get; set; }
    public int SetByUserId { get; set; }
    public DateTime SetOnUtc { get; set; }
}

public class UserStatus
{
    public byte StatusId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? BadgeColour { get; set; }
}

/// <summary>
/// Every enable/disable, with the reason the portal insists on before it will
/// commit the change.
/// </summary>
public class UserStatusHistory
{
    public long UserStatusHistoryId { get; set; }
    public int UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public byte? FromStatusId { get; set; }
    public byte ToStatusId { get; set; }
    public string Reason { get; set; } = string.Empty;
    public int ChangedByUserId { get; set; }
    public DateTime ChangedOnUtc { get; set; }
}

/// <summary>
/// The body an account belongs to: an implementing agency, a ministry
/// department, a state directorate, a consulting firm or an assessment agency.
/// </summary>
public class Organisation : IAuditable, IConcurrencyAware
{
    public int OrganisationId { get; set; }
    public string OrganisationCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public byte AccountTypeId { get; set; }
    public AccountType AccountType { get; set; } = null!;

    /// <summary>CIN or other registration number.</summary>
    public string? RegistrationNo { get; set; }

    public int? CategoryLookupId { get; set; }
    public string? AddressLine { get; set; }
    public short? StateId { get; set; }
    public int? DistrictId { get; set; }
    public string? Pincode { get; set; }
    public string? ContactEmail { get; set; }
    public string? ContactPhone { get; set; }
    public string? JurisdictionScope { get; set; }

    /// <summary>
    /// Where the organisation sits when several are listed together — which
    /// implementing agency leads the dashboard's cards, for instance. Held
    /// here so the scheme decides it, rather than the alphabet.
    /// </summary>
    public short DisplayOrder { get; set; } = 100;

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// Draft | Pending | Approved | Rejected.
    ///
    /// An Implementing Agency is created by the Super Admin and is Approved on
    /// the spot. An Industry Association, OEM or PSU is raised by an agency and
    /// stays out of the applicant's picker until a State Office approves it.
    /// </summary>
    public string ApprovalStatus { get; set; } = "Approved";

    /// <summary>The agency that raised it; null for anything the Super Admin created.</summary>
    public int? RaisedByOrganisationId { get; set; }

    public int? DecidedByUserId { get; set; }
    public DateTime? DecidedOnUtc { get; set; }

    /// <summary>Why it was rejected, so the agency can fix it and resubmit.</summary>
    public string? DecisionRemark { get; set; }

    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<ApplicationUser> Users { get; set; } = [];
}

/// <summary>
/// A rotating refresh token. Only the SHA-256 hash is persisted, so a database
/// disclosure yields nothing usable.
/// </summary>
public class RefreshToken
{
    public long RefreshTokenId { get; set; }
    public int UserId { get; set; }
    public ApplicationUser User { get; set; } = null!;
    public byte[] TokenHash { get; set; } = [];
    public DateTime ExpiresOnUtc { get; set; }
    public DateTime CreatedOnUtc { get; set; }
    public string? CreatedByIp { get; set; }
    public DateTime? RevokedOnUtc { get; set; }
    public string? RevokedByIp { get; set; }
    public long? ReplacedByTokenId { get; set; }
    public string? UserAgent { get; set; }

    public bool IsActive => RevokedOnUtc is null && DateTime.UtcNow < ExpiresOnUtc;
}

/// <summary>Sign-in attempts, successful and not.</summary>
public class LoginAudit
{
    public long LoginAuditId { get; set; }
    public int? UserId { get; set; }
    public string? AttemptedEmail { get; set; }
    public bool IsSuccess { get; set; }
    public string? FailureReason { get; set; }
    public string? IpAddress { get; set; }
    public string? UserAgent { get; set; }
    public DateTime OccurredOnUtc { get; set; }

    /// <summary>Desktop, Mobile, Tablet or Unknown, read from the agent.</summary>
    public string? DeviceType { get; set; }

    /// <summary>Windows, Android, iOS, macOS, Linux or Unknown.</summary>
    public string? OperatingSystem { get; set; }

    public string? Browser { get; set; }
}

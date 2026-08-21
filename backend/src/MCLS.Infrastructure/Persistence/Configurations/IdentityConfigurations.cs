using MCLS.Domain.Entities.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace MCLS.Infrastructure.Persistence.Configurations;

/// <summary>
/// Mappings for the identity schema. These mirror
/// <c>database/02-schema/01-auth.sql</c>; the SQL is the source of truth
/// and this configuration is written to match it.
/// </summary>
internal sealed class AccountTypeConfiguration : IEntityTypeConfiguration<AccountType>
{
    public void Configure(EntityTypeBuilder<AccountType> b)
    {
        b.ToTable("AccountType", "auth");
        b.HasKey(x => x.AccountTypeId);
        b.Property(x => x.AccountTypeId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(30).IsRequired();
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.Property(x => x.ShortName).HasMaxLength(50).IsRequired();
        b.Property(x => x.IconKey).HasMaxLength(30);
        b.Property(x => x.UserCodePrefix).HasMaxLength(3).IsRequired().IsUnicode(false);
        b.Property(x => x.Description).HasMaxLength(400);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class ModuleConfiguration : IEntityTypeConfiguration<Domain.Entities.Identity.Module>
{
    public void Configure(EntityTypeBuilder<Domain.Entities.Identity.Module> b)
    {
        b.ToTable("Module", "auth");
        b.HasKey(x => x.ModuleId);
        b.Property(x => x.ModuleId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(80).IsRequired();
        b.Property(x => x.RoutePath).HasMaxLength(120).IsUnicode(false);
        b.Property(x => x.IconKey).HasMaxLength(30).IsUnicode(false);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class RightTypeConfiguration : IEntityTypeConfiguration<RightType>
{
    public void Configure(EntityTypeBuilder<RightType> b)
    {
        b.ToTable("RightType", "auth");
        b.HasKey(x => x.RightTypeId);
        b.Property(x => x.RightTypeId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(40).IsRequired();
    }
}

internal sealed class PermissionConfiguration : IEntityTypeConfiguration<Permission>
{
    public void Configure(EntityTypeBuilder<Permission> b)
    {
        b.ToTable("Permission", "auth");
        b.HasKey(x => x.PermissionId);
        b.Property(x => x.PermissionKey).HasMaxLength(45).IsRequired().IsUnicode(false);
        b.HasIndex(x => x.PermissionKey).IsUnique();
        b.HasIndex(x => new { x.ModuleId, x.RightTypeId }).IsUnique();

        b.HasOne(x => x.Module).WithMany(m => m.Permissions)
            .HasForeignKey(x => x.ModuleId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.RightType).WithMany()
            .HasForeignKey(x => x.RightTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> b)
    {
        // IdentityRole<int> calls its key 'Id'; the table follows the schema's
        // own <Entity>Id convention. Mapped rather than renamed so every
        // foreign key that already references Role(RoleId) stays valid.
        b.Property(x => x.Id).HasColumnName("RoleId");

        b.Property(x => x.Name).HasMaxLength(120);
        b.Property(x => x.NormalizedName).HasMaxLength(256);

        b.Property(x => x.Code).HasMaxLength(50).IsRequired().IsUnicode(false);
        b.Property(x => x.Description).HasMaxLength(400);
        b.HasIndex(x => x.Code).IsUnique();

        b.HasOne(x => x.AccountType).WithMany(a => a.Roles)
            .HasForeignKey(x => x.AccountTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> b)
    {
        b.ToTable("RolePermission", "auth");
        b.HasKey(x => new { x.RoleId, x.PermissionId });

        // Deleting a role takes its grants with it — they have no meaning
        // without it. Matches ON DELETE CASCADE in the SQL script.
        b.HasOne(x => x.Role).WithMany(r => r.RolePermissions)
            .HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);

        // A permission is reference data and is never deleted.
        b.HasOne(x => x.Permission).WithMany()
            .HasForeignKey(x => x.PermissionId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class UserManagementScopeConfiguration : IEntityTypeConfiguration<UserManagementScope>
{
    public void Configure(EntityTypeBuilder<UserManagementScope> b)
    {
        b.ToTable("UserManagementScope", "auth");
        b.HasKey(x => new { x.RoleId, x.ManagedAccountTypeId });

        b.HasOne(x => x.Role).WithMany(r => r.ManagedAccountTypes)
            .HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.ManagedAccountType).WithMany()
            .HasForeignKey(x => x.ManagedAccountTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ApplicationUserConfiguration : IEntityTypeConfiguration<ApplicationUser>
{
    public void Configure(EntityTypeBuilder<ApplicationUser> b)
    {
        b.Property(x => x.UserCode).HasMaxLength(25).IsRequired().IsUnicode(false);
        b.Property(x => x.FullName).HasMaxLength(200).IsRequired();
        b.Property(x => x.Initials).HasMaxLength(4);
        b.Property(x => x.Designation).HasMaxLength(150);
        b.Property(x => x.Jurisdiction).HasMaxLength(120);
        b.Property(x => x.PhoneNumber).HasMaxLength(30);
        b.Property(x => x.Email).HasMaxLength(256).IsRequired();
        b.Property(x => x.NormalizedEmail).HasMaxLength(256);
        b.Property(x => x.UserName).HasMaxLength(256).IsRequired();
        b.Property(x => x.NormalizedUserName).HasMaxLength(256);

        // Filtered unique indexes: a soft-deleted account releases its e-mail
        // and user code for reuse.
        b.HasIndex(x => x.UserCode).IsUnique().HasFilter("[IsDeleted] = 0");
        b.HasIndex(x => x.NormalizedEmail).IsUnique().HasFilter("[IsDeleted] = 0");
        b.HasIndex(x => x.NormalizedUserName).IsUnique().HasFilter("[IsDeleted] = 0");

        b.HasOne(x => x.AccountType).WithMany()
            .HasForeignKey(x => x.AccountTypeId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Role).WithMany()
            .HasForeignKey(x => x.RoleId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Organisation).WithMany(o => o.Users)
            .HasForeignKey(x => x.OrganisationId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Status).WithMany()
            .HasForeignKey(x => x.StatusId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class UserStatusConfiguration : IEntityTypeConfiguration<UserStatus>
{
    public void Configure(EntityTypeBuilder<UserStatus> b)
    {
        b.ToTable("UserStatus", "auth");
        b.HasKey(x => x.StatusId);
        b.Property(x => x.StatusId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(40).IsRequired();
        b.Property(x => x.BadgeColour).HasMaxLength(9).IsUnicode(false);
    }
}

internal sealed class UserStatusHistoryConfiguration : IEntityTypeConfiguration<UserStatusHistory>
{
    public void Configure(EntityTypeBuilder<UserStatusHistory> b)
    {
        b.ToTable("UserStatusHistory", "auth");
        b.HasKey(x => x.UserStatusHistoryId);
        b.Property(x => x.Reason).HasMaxLength(1000).IsRequired();
        b.HasIndex(x => new { x.UserId, x.ChangedOnUtc });

        b.HasOne(x => x.User).WithMany(u => u.StatusHistory)
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class UserPermissionOverrideConfiguration : IEntityTypeConfiguration<UserPermissionOverride>
{
    public void Configure(EntityTypeBuilder<UserPermissionOverride> b)
    {
        b.ToTable("UserPermissionOverride", "auth");
        b.HasKey(x => new { x.UserId, x.PermissionId });
        b.Property(x => x.Reason).HasMaxLength(400);

        b.HasOne(x => x.User).WithMany(u => u.PermissionOverrides)
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Permission).WithMany()
            .HasForeignKey(x => x.PermissionId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class OrganisationConfiguration : IEntityTypeConfiguration<Organisation>
{
    public void Configure(EntityTypeBuilder<Organisation> b)
    {
        b.ToTable("Organisation", "auth");
        b.HasKey(x => x.OrganisationId);
        b.Property(x => x.OrganisationCode).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.RegistrationNo).HasMaxLength(50).IsUnicode(false);
        b.Property(x => x.AddressLine).HasMaxLength(500);
        b.Property(x => x.Pincode).HasMaxLength(6).IsUnicode(false);
        b.Property(x => x.ContactEmail).HasMaxLength(256);
        b.Property(x => x.ContactPhone).HasMaxLength(20).IsUnicode(false);
        b.Property(x => x.JurisdictionScope).HasMaxLength(120);
        b.HasIndex(x => x.OrganisationCode).IsUnique();

        b.HasOne(x => x.AccountType).WithMany()
            .HasForeignKey(x => x.AccountTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> b)
    {
        b.ToTable("RefreshToken", "auth");
        b.HasKey(x => x.RefreshTokenId);
        b.Property(x => x.TokenHash).HasColumnType("binary(32)").IsRequired();
        b.Property(x => x.CreatedByIp).HasMaxLength(45).IsUnicode(false);
        b.Property(x => x.RevokedByIp).HasMaxLength(45).IsUnicode(false);
        b.Property(x => x.UserAgent).HasMaxLength(400);
        b.HasIndex(x => x.TokenHash).IsUnique();

        // IsActive is a computed convenience on the entity, not a column.
        b.Ignore(x => x.IsActive);

        b.HasOne(x => x.User).WithMany(u => u.RefreshTokens)
            .HasForeignKey(x => x.UserId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class LoginAuditConfiguration : IEntityTypeConfiguration<LoginAudit>
{
    public void Configure(EntityTypeBuilder<LoginAudit> b)
    {
        b.ToTable("LoginAudit", "auth");
        b.HasKey(x => x.LoginAuditId);
        b.Property(x => x.AttemptedEmail).HasMaxLength(256);
        b.Property(x => x.FailureReason).HasMaxLength(200);
        b.Property(x => x.IpAddress).HasMaxLength(45).IsUnicode(false);
        b.Property(x => x.UserAgent).HasMaxLength(400);
        b.Property(x => x.DeviceType).HasMaxLength(12).IsUnicode(false);
        b.Property(x => x.OperatingSystem).HasMaxLength(16).IsUnicode(false);
        b.Property(x => x.Browser).HasMaxLength(24).IsUnicode(false);
        b.HasIndex(x => x.OccurredOnUtc);
    }
}

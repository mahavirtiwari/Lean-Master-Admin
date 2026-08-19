using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;

namespace MCLS.Infrastructure.Persistence;

/// <summary>
/// Creates the one account the SQL seed cannot: the bootstrap Super Admin.
///
/// Its password has to be hashed with ASP.NET Core Identity's
/// <see cref="IPasswordHasher{TUser}"/>, which is a .NET algorithm with a
/// versioned format — a T-SQL script cannot produce a hash Identity will
/// later accept. So the SQL seed creates the organisations and this creates
/// the account.
/// </summary>
public static class DbSeeder
{
    public static async Task EnsureBootstrapAdminAsync(IServiceProvider services, ILogger logger)
    {
        var db = services.GetRequiredService<MclsDbContext>();
        var userManager = services.GetRequiredService<UserManager<ApplicationUser>>();
        var configuration = services.GetRequiredService<IConfiguration>();

        // Any active Super Admin means the portal is already bootstrapped.
        var superAdminRoleId = await db.Roles
            .Where(r => r.Code == "SUPER_ADMIN")
            .Select(r => r.Id)
            .SingleOrDefaultAsync();

        if (superAdminRoleId == 0)
        {
            throw new InvalidOperationException(
                "The SUPER_ADMIN role is missing. Run database/04-seed/02-roles-and-permissions.sql.");
        }

        var alreadyExists = await db.Users
            .IgnoreQueryFilters()
            .AnyAsync(u => u.RoleId == superAdminRoleId && !u.IsDeleted);

        if (alreadyExists)
        {
            logger.LogDebug("A Super Admin account already exists; bootstrap skipped.");
            return;
        }

        var email = configuration["Bootstrap:AdminEmail"];
        var password = configuration["Bootstrap:AdminPassword"];
        var fullName = configuration["Bootstrap:AdminFullName"] ?? "MCLS Administrator";

        if (string.IsNullOrWhiteSpace(email) || string.IsNullOrWhiteSpace(password))
        {
            // Refusing to invent a default is deliberate: a well-known
            // bootstrap credential is exactly how portals get compromised.
            throw new InvalidOperationException(
                "No Super Admin exists and Bootstrap:AdminEmail / Bootstrap:AdminPassword are not " +
                "configured. Set both (user secrets in development, environment variables in " +
                "production), start once to create the account, then remove them.");
        }

        var ministryOrgId = await db.Organisations
            .Where(o => o.OrganisationCode == "ORG-MIN-001")
            .Select(o => (int?)o.OrganisationId)
            .SingleOrDefaultAsync();

        var user = new ApplicationUser
        {
            UserName = email,
            Email = email,
            EmailConfirmed = true,
            UserCode = "MCLS-MIN-000001",
            FullName = fullName,
            Initials = BuildInitials(fullName),
            Designation = "System Administrator",
            AccountTypeId = (byte)AccountTypeId.MinistryOfMsme,
            RoleId = superAdminRoleId,
            OrganisationId = ministryOrgId,
            Jurisdiction = "National",
            StatusId = (byte)UserStatusId.Active,

            // Forces a change at first sign-in, so the bootstrap password is
            // never the one in day-to-day use.
            MustChangePassword = true,
            CreatedOnUtc = DateTime.UtcNow,
        };

        var result = await userManager.CreateAsync(user, password);

        if (!result.Succeeded)
        {
            var errors = string.Join("; ", result.Errors.Select(e => $"{e.Code}: {e.Description}"));
            throw new InvalidOperationException($"Could not create the bootstrap Super Admin. {errors}");
        }

        logger.LogWarning(
            "Bootstrap Super Admin created for {Email}. Sign in, change the password, then remove " +
            "Bootstrap:AdminPassword from configuration.", email);
    }

    private static string BuildInitials(string fullName)
    {
        var parts = fullName.Split(' ', StringSplitOptions.RemoveEmptyEntries)
            // Skip honorifics, which would otherwise produce "SH" for
            // "Shri Rajesh Kumar" rather than "RK".
            .Where(p => p is not ("Shri" or "Smt." or "Smt" or "Dr." or "Dr" or "Col." or "Col" or "Mr." or "Ms."))
            .ToArray();

        return parts.Length switch
        {
            0 => "??",
            1 => parts[0][..Math.Min(2, parts[0].Length)].ToUpperInvariant(),
            _ => $"{char.ToUpperInvariant(parts[0][0])}{char.ToUpperInvariant(parts[^1][0])}",
        };
    }
}

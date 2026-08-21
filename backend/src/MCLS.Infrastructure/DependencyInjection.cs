using MCLS.Application.Common.Interfaces;
using MCLS.Infrastructure.Email;
using MCLS.Infrastructure.Files;
using MCLS.Infrastructure.Identity;
using MCLS.Infrastructure.Persistence;
using MCLS.Infrastructure.Persistence.Interceptors;
using MCLS.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using MCLS.Infrastructure.Awareness;
using MCLS.Infrastructure.Udyam;

namespace MCLS.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("MclsDatabase")
            ?? throw new InvalidOperationException("ConnectionStrings:MclsDatabase is not configured.");

        // The interceptor holds per-save state, so it must be scoped — a
        // singleton would leak audit entries between concurrent requests.
        services.AddScoped<AuditSaveChangesInterceptor>();

        services.AddDbContext<MclsDbContext>((sp, options) =>
        {
            options.UseSqlServer(connectionString, sql =>
            {
                sql.MigrationsHistoryTable("__EFMigrationsHistory", "dbo");

                // Transient faults (failover, brief network loss) are retried
                // rather than surfaced. Note this disables user-initiated
                // transactions unless they use the execution strategy —
                // see docs/database-and-ef.md.
                sql.EnableRetryOnFailure(
                    maxRetryCount: 5,
                    maxRetryDelay: TimeSpan.FromSeconds(10),
                    errorNumbersToAdd: null);

                sql.CommandTimeout(60);
            });

            options.AddInterceptors(sp.GetRequiredService<AuditSaveChangesInterceptor>());

            // Every query is read-only unless it is going to be saved; opting
            // in globally avoids the change tracker holding entities for the
            // large list screens.
            options.UseQueryTrackingBehavior(QueryTrackingBehavior.NoTracking);
        });

        services.AddScoped<ITokenService, JwtTokenService>();
        services.AddScoped<ISequenceService, SequenceService>();
        services.AddScoped<ISystemSettings, SystemSettingsService>();
        services.AddScoped<IEmailQueue, EmailQueueService>();
        services.AddSingleton<IDateTimeProvider, SystemDateTimeProvider>();

        services.Configure<FileStorageOptions>(configuration.GetSection(FileStorageOptions.SectionName));
        services.AddScoped<IFileStorage, LocalFileStorage>();

        services.Configure<SmtpOptions>(configuration.GetSection(SmtpOptions.SectionName));
        services.AddHostedService<EmailDispatchService>();

        // The Udyam registry, over a named HttpClient so the handler is pooled
        // and the timeout is one place rather than per call.
        services.Configure<UdyamOptions>(configuration.GetSection(UdyamOptions.SectionName));

        services.AddHttpClient<IUdyamRegistry, UdyamRegistryClient>((provider, client) =>
        {
            var udyam = provider.GetRequiredService<IOptions<UdyamOptions>>().Value;

            // The trailing slash matters: without it BaseAddress drops its last
            // segment when a relative path is appended.
            client.BaseAddress = new Uri(udyam.BaseUrl.TrimEnd('/') + "/");
            client.Timeout = TimeSpan.FromSeconds(udyam.TimeoutSeconds);
            client.DefaultRequestHeaders.Accept.ParseAdd("application/xml");
        });

        // The awareness programmes an applicant claims attendance at. They are
        // published by the scheme's programme service where one is configured;
        // where it is not, the master table an administrator maintains is the
        // source, and the caller cannot tell the difference.
        services.Configure<AwarenessProgramOptions>(
            configuration.GetSection(AwarenessProgramOptions.SectionName));

        var awareness = configuration.GetSection(AwarenessProgramOptions.SectionName)
            .Get<AwarenessProgramOptions>() ?? new AwarenessProgramOptions();

        if (awareness.Enabled && !string.IsNullOrWhiteSpace(awareness.BaseUrl))
        {
            services.AddHttpClient<IAwarenessProgramSource, AwarenessProgramClient>((provider, client) =>
            {
                var settings = provider.GetRequiredService<IOptions<AwarenessProgramOptions>>().Value;

                // The trailing slash matters: without it BaseAddress drops its
                // last segment when a relative path is appended.
                client.BaseAddress = new Uri(settings.BaseUrl.TrimEnd('/') + "/");
                client.Timeout = TimeSpan.FromSeconds(settings.TimeoutSeconds);
                client.DefaultRequestHeaders.Accept.ParseAdd("application/json");
            });
        }
        else
        {
            services.AddScoped<IAwarenessProgramSource, LocalAwarenessPrograms>();
        }

        return services;
    }

    /// <summary>
    /// Verifies at startup that the database is reachable and seeded, and
    /// creates the bootstrap Super Admin on a fresh install.
    ///
    /// Deliberately does NOT create or migrate schema: that belongs to the SQL
    /// scripts under <c>/database</c>, run by the deployment process under a
    /// login that has DDL rights. The API's own login does not.
    /// </summary>
    public static async Task RunStartupChecksAsync(this IServiceProvider services)
    {
        using var scope = services.CreateScope();
        var sp = scope.ServiceProvider;
        var logger = sp.GetRequiredService<Microsoft.Extensions.Logging.ILoggerFactory>()
            .CreateLogger("Startup");
        var db = sp.GetRequiredService<MclsDbContext>();

        if (!await db.Database.CanConnectAsync())
        {
            throw new InvalidOperationException(
                "Cannot connect to the MCLS database. Check ConnectionStrings:MclsDatabase " +
                "and that the application-pool identity has been granted the mcls_application role.");
        }

        // 15 modules x 5 rights. If this is wrong the seed did not run, and
        // every authorization check would silently fail closed.
        var permissionCount = await db.Permissions.CountAsync();
        if (permissionCount != 75)
        {
            throw new InvalidOperationException(
                $"Expected 75 permissions but found {permissionCount}. " +
                "Run database/04-seed before starting the API.");
        }

        await DbSeeder.EnsureBootstrapAdminAsync(sp, logger);
    }
}

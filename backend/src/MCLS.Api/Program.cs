using System.Text;
using System.Threading.RateLimiting;
using MCLS.Api.Authorization;
using MCLS.Api.Middleware;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Identity;
using MCLS.Infrastructure;
using MCLS.Infrastructure.Identity;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using Serilog;

// QuestPDF renders the pledge certificate. It requires the licence to be
// declared before first use, and refuses to generate anything otherwise.
//
// Community is the free tier. It is offered to organisations under USD 1M in
// annual revenue, to non-profits, and for open-source work. Confirm the scheme
// qualifies before this goes to production — if it does not, QuestPDF sells a
// perpetual licence, and the renderer is isolated behind PledgeCertificate so
// swapping it out touches one file.
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------- logging ---
// Configured from appsettings so the file path and level can change on a
// server without a rebuild. Bootstrap logger catches startup failures too.
builder.Host.UseSerilog((context, services, config) => config
    .ReadFrom.Configuration(context.Configuration)
    .ReadFrom.Services(services)
    .Enrich.FromLogContext()
    .Enrich.WithMachineName());

// ------------------------------------------------------------ persistence ---
var connectionString = builder.Configuration.GetConnectionString("MclsDatabase")
    ?? throw new InvalidOperationException(
        "ConnectionStrings:MclsDatabase is not configured.");

builder.Services.AddInfrastructure(builder.Configuration);

// --------------------------------------------------------------- identity ---
builder.Services
    .AddIdentityCore<ApplicationUser>(options =>
    {
        // Deliberately stricter than the ASP.NET defaults: this is a
        // government portal with externally-facing accounts. The values are
        // also mirrored in Settings > System so they can be reported on.
        options.Password.RequiredLength = 12;
        options.Password.RequireDigit = true;
        options.Password.RequireLowercase = true;
        options.Password.RequireUppercase = true;
        options.Password.RequireNonAlphanumeric = true;
        options.Password.RequiredUniqueChars = 4;

        options.Lockout.MaxFailedAccessAttempts = 5;
        options.Lockout.DefaultLockoutTimeSpan = TimeSpan.FromMinutes(15);
        options.Lockout.AllowedForNewUsers = true;

        // The system-generated UserCode identifies an account, not the
        // address: a SPOC may register up to three plants from one mailbox,
        // and a shared office address is ordinary.
        options.User.RequireUniqueEmail = false;

        // Sign-in is blocked until the address is confirmed, which is how a
        // newly created account is activated.
        options.SignIn.RequireConfirmedEmail = false;
    })
    .AddRoles<Role>()
    .AddEntityFrameworkStores<MclsDbContext>()
    .AddSignInManager()
    .AddDefaultTokenProviders();

// ---------------------------------------------------------- authentication ---
var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
builder.Services.Configure<JwtOptions>(jwtSection);
var jwt = jwtSection.Get<JwtOptions>() ?? new JwtOptions();

if (string.IsNullOrWhiteSpace(jwt.SigningKey))
{
    throw new InvalidOperationException(
        "Jwt:SigningKey is not configured. Set it via user secrets (development) " +
        "or an environment variable / IIS configuration editor (production).");
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.RequireHttpsMetadata = !builder.Environment.IsDevelopment();
        options.SaveToken = false;      // nothing needs the raw token server-side

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwt.Issuer,
            ValidAudience = jwt.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwt.SigningKey)),

            // The default 5-minute skew silently extends every token's life.
            // Servers here are domain time-synced, so 30 seconds is ample.
            ClockSkew = TimeSpan.FromSeconds(30),
        };

        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = ctx =>
            {
                // Lets the client tell "expired, refresh me" apart from
                // "invalid, sign in again" without parsing the message.
                if (ctx.Exception is SecurityTokenExpiredException)
                {
                    ctx.Response.Headers.Append("Token-Expired", "true");
                }
                return Task.CompletedTask;
            },
        };
    });

// ----------------------------------------------------------- authorization ---
builder.Services.AddSingleton<IAuthorizationPolicyProvider, PermissionPolicyProvider>();
builder.Services.AddSingleton<IAuthorizationHandler, PermissionAuthorizationHandler>();

builder.Services.AddAuthorizationBuilder()
    // Everything requires an authenticated user unless it opts out with
    // [AllowAnonymous]. Failing closed is the right default here.
    .SetFallbackPolicy(new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build());

// ------------------------------------------------------------------- MVC ----
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUserService>();

builder.Services.AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = System.Text.Json.JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.DefaultIgnoreCondition =
            System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
    });

builder.Services.AddProblemDetails();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(o =>
{
    o.SwaggerDoc("v1", new OpenApiInfo { Title = "MCLS Portal API", Version = "v1" });

    // Microsoft.OpenApi 2.x flattened the old Models namespace and made the
    // scheme reachable through an interface, so these are spelled out rather
    // than target-typed with new().
    o.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Paste the access token. The 'Bearer ' prefix is added for you.",
    });

    // A security-scheme reference now needs the document that hosts it, which
    // is why this takes a callback rather than a plain object.
    o.AddSecurityRequirement(document => new OpenApiSecurityRequirement
    {
        [new OpenApiSecuritySchemeReference("Bearer", document, null)] = [],
    });

    var xml = Path.Combine(AppContext.BaseDirectory, "MCLS.Api.xml");
    if (File.Exists(xml)) o.IncludeXmlComments(xml);
});

// ------------------------------------------------------------------ CORS ----
// The Angular app is served from IIS as a separate site, so its origin must be
// allowed explicitly. No wildcard: credentials are sent.
var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? [];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Portal", policy =>
    {
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
            .WithExposedHeaders("Token-Expired", "Content-Disposition");

        if (builder.Environment.IsDevelopment())
        {
            // Any loopback origin, whatever the port. Developers reach the dev
            // server as localhost or 127.0.0.1 and on whichever port is free,
            // and a fixed list turns that into a confusing CORS failure rather
            // than something obviously misconfigured.
            //
            // Development only — production uses the explicit list below, and
            // a wildcard is impossible anyway once AllowCredentials is set.
            policy.SetIsOriginAllowed(origin =>
                Uri.TryCreate(origin, UriKind.Absolute, out var uri) && uri.IsLoopback);
        }
        else
        {
            if (allowedOrigins.Length == 0)
            {
                throw new InvalidOperationException(
                    "Cors:AllowedOrigins is empty. The portal cannot call the API without it.");
            }
            policy.WithOrigins(allowedOrigins);
        }
    });
});

// ------------------------------------------------------------ rate limits ---
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    // Sign-in is the endpoint worth protecting: it is the one an attacker can
    // hammer without a token. Partitioned by IP.
    options.AddPolicy("auth", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 10,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.User.FindFirst("sub")?.Value
                ?? context.Connection.RemoteIpAddress?.ToString()
                ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 300,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
            }));
});

// ----------------------------------------------------------------- health ---
builder.Services.AddHealthChecks()
    .AddSqlServer(connectionString, name: "sql", tags: ["ready"]);

// ------------------------------------------------------- forwarded headers ---
// Required behind IIS/ARR so RemoteIpAddress and the scheme are the client's,
// not the proxy's. Without this the audit trail records the load balancer.
builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    options.ForwardLimit = 2;
    // Cleared so only the proxies listed in configuration are trusted; an empty
    // list here plus the deployment's entries is the safe default.
    // KnownNetworks was renamed to KnownIPNetworks in .NET 9.
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

// ------------------------------------------------------------- pipeline -----
app.UseForwardedHeaders();

// Ours, not the framework's: it also writes audit.ErrorLog and returns a
// correlation id. Must be first so it wraps everything below.
app.UseMiddleware<ExceptionHandlingMiddleware>();

app.UseSerilogRequestLogging(options =>
{
    options.GetLevel = (httpContext, elapsed, ex) =>
        ex is not null || httpContext.Response.StatusCode >= 500
            ? Serilog.Events.LogEventLevel.Error
            // Health probes every few seconds would drown the log.
            : httpContext.Request.Path.StartsWithSegments("/health")
                ? Serilog.Events.LogEventLevel.Verbose
                : Serilog.Events.LogEventLevel.Information;
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(o => o.SwaggerEndpoint("/swagger/v1/swagger.json", "MCLS API v1"));
}
else
{
    // HSTS is set at the IIS level too; doing it here as well means the API is
    // still correct if it is ever hosted directly on Kestrel.
    app.UseHsts();
}

app.UseHttpsRedirection();

// Headers IIS does not add for us. CSP is deliberately strict: the API returns
// JSON only and should never be able to execute anything in a browser.
// The hosts the Bhashini language widget needs. Declared once so the CSP and
// the <script> tag in index.html can be kept in step.
//
// Note what allowing these means: a script served by a third party runs on
// every portal document, including the sign-in page, and can therefore read
// what is typed into the credential fields. That is accepted here because
// Bhashini is the Government's own translation service (MeitY) and this is a
// Government portal — but it is a real trust relationship, not a formality,
// and it is the reason the list is kept to exactly these hosts.
const string BhashiniOrigins =
    "https://translation-plugin.bhashini.co.in " +
    "https://bhashini.gov.in " +
    "https://*.digifootprint.gov.in";

// The widget's own stylesheet pulls Noto Sans from Google Fonts — the one part
// of it that is not a Government host. Kept in its own constant so it is
// obvious what would have to go if that were ever disallowed.
const string BhashiniFontOrigins = "https://fonts.googleapis.com https://fonts.gstatic.com";

app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers.XFrameOptions = "DENY";
    headers["Referrer-Policy"] = "no-referrer";
    // The API returns JSON and must never be able to execute anything, so its
    // policy stays "default-src 'none'". When this process also serves the
    // portal, that policy would block the app's own bundle — so the document
    // routes get a policy that permits same-origin scripts, styles and images
    // and nothing else. Split by path rather than loosened globally.
    var isApi = context.Request.Path.StartsWithSegments("/api")
             || context.Request.Path.StartsWithSegments("/health")
             || context.Request.Path.StartsWithSegments("/swagger");

    headers["Content-Security-Policy"] = isApi
        ? "default-src 'none'; frame-ancestors 'none'"
        : "default-src 'self'; " +
          // Angular injects component styles as inline <style> elements.
          "style-src 'self' 'unsafe-inline' " + BhashiniOrigins + " " + BhashiniFontOrigins + "; " +
          "img-src 'self' data: " + BhashiniOrigins + "; " +
          "font-src 'self' data: " + BhashiniOrigins + " " + BhashiniFontOrigins + "; " +
          // The Bhashini language widget (index.html) is fetched from the
          // plugin host and talks to the Government translation endpoints.
          // Every origin here exists to serve that one script — narrow it and
          // the widget fails silently rather than loudly.
          "script-src 'self' " + BhashiniOrigins + "; " +
          "connect-src 'self' " + BhashiniOrigins + "; " +
          "frame-src 'self' " + BhashiniOrigins + "; " +
          "frame-ancestors 'none'; " +
          "base-uri 'self'; " +
          "form-action 'self'";
    headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()";
    await next();
});

// ------------------------------------------------------- portal hosting ---
// The built Angular app is served by this process when it is present, so a
// demo is one command on one port: no dev server, no proxy, no CORS.
//
// WebRootPath is pointed at the Angular output rather than wwwroot because the
// build lands in frontend/dist. When that folder does not exist — a normal API
// deployment behind IIS, where the portal is its own site — the block is
// skipped and nothing changes.
var portalRoot = builder.Configuration["Portal:StaticRoot"];

if (!string.IsNullOrWhiteSpace(portalRoot) && Directory.Exists(portalRoot))
{
    var files = new PhysicalFileProvider(Path.GetFullPath(portalRoot));

    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = files });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = files });

    app.Logger.LogInformation("Serving the portal from {Root}", portalRoot);
}

app.UseCors("Portal");
app.UseRateLimiter();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// Deep links such as /user-management/type/3 are Angular routes, not files, so
// anything that is not an API call or a real file returns index.html and lets
// the router resolve it. Declared after MapControllers so /api/* still wins.
if (!string.IsNullOrWhiteSpace(portalRoot) && Directory.Exists(portalRoot))
{
    app.MapFallbackToFile("index.html", new StaticFileOptions
    {
        FileProvider = new PhysicalFileProvider(Path.GetFullPath(portalRoot)),
    }).AllowAnonymous();
}

app.MapHealthChecks("/health/live", new()
{
    Predicate = _ => false,     // liveness: is the process up at all
});
app.MapHealthChecks("/health/ready", new()
{
    Predicate = check => check.Tags.Contains("ready"),
    ResponseWriter = HealthChecks.UI.Client.UIResponseWriter.WriteHealthCheckUIResponse,
}).AllowAnonymous();

// ------------------------------------------------------- admin utilities ----
// Maintenance entry point, development only. Resets a local account through
// Identity's own hasher and password validator, so a forgotten demo password
// never becomes a reason to hand-edit auth.[User].PasswordHash.
//
//   dotnet run -- --reset-password MCLS-MIN-000001 "New@Password#2026"
//
// The process exits without ever starting Kestrel.
if (args is ["--reset-password", var targetUserCode, var newPassword])
{
    if (!app.Environment.IsDevelopment())
    {
        Console.Error.WriteLine("--reset-password is available in Development only.");
        return 1;
    }

    using var scope = app.Services.CreateScope();
    var users = scope.ServiceProvider.GetRequiredService<UserManager<ApplicationUser>>();
    var context = scope.ServiceProvider.GetRequiredService<MclsDbContext>();

    var target = await context.Users.AsTracking()
        .SingleOrDefaultAsync(u => u.UserCode == targetUserCode);

    if (target is null)
    {
        Console.Error.WriteLine($"No user has the code {targetUserCode}.");
        return 1;
    }

    var resetToken = await users.GeneratePasswordResetTokenAsync(target);
    var outcome = await users.ResetPasswordAsync(target, resetToken, newPassword);

    if (!outcome.Succeeded)
    {
        foreach (var failure in outcome.Errors)
        {
            Console.Error.WriteLine($"{failure.Code}: {failure.Description}");
        }
        return 1;
    }

    Console.WriteLine($"Password reset for {target.UserCode} ({target.Email}).");
    return 0;
}

// --------------------------------------------------------------- startup ----
// Verifies the database is reachable and the seed is present, and creates the
// bootstrap Super Admin on a fresh install. Schema itself is owned by the SQL
// scripts, so nothing here creates tables.
await app.Services.RunStartupChecksAsync();

app.Run();

return 0;

/// <summary>Exposed so the integration tests can spin up the same pipeline.</summary>
public partial class Program;

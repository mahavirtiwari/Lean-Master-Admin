using MCLS.Domain.Common;
using MCLS.Domain.Entities.Assess;
using MCLS.Domain.Entities.Audit;
using MCLS.Domain.Entities.Comm;
using MCLS.Domain.Entities.Fee;
using MCLS.Domain.Entities.Identity;
using MCLS.Domain.Entities.Incentive;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Entities.Msme;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Infrastructure.Persistence;

/// <summary>
/// The portal's EF Core context.
///
/// Two things are worth knowing before changing it:
///
///  * The schema is owned by the SQL scripts in <c>/database</c>, not by EF
///    migrations. The model here is configured to match those scripts exactly.
///    <c>dotnet ef migrations</c> is used only to verify the two agree — see
///    <c>docs/database-and-ef.md</c>.
///  * The runtime login has no DELETE right on most tables. Soft-deletable
///    entities are filtered globally, so a plain query never returns them.
/// </summary>
public class MclsDbContext(DbContextOptions<MclsDbContext> options)
    : IdentityDbContext<ApplicationUser, Role, int,
        IdentityUserClaim<int>, IdentityUserRole<int>, IdentityUserLogin<int>,
        IdentityRoleClaim<int>, IdentityUserToken<int>>(options)
{
    // ---- identity ----------------------------------------------------------
    public DbSet<AccountType> AccountTypes => Set<AccountType>();
    public DbSet<Domain.Entities.Identity.Module> Modules => Set<Domain.Entities.Identity.Module>();
    public DbSet<RightType> RightTypes => Set<RightType>();
    public DbSet<Permission> Permissions => Set<Permission>();
    public DbSet<RolePermission> RolePermissions => Set<RolePermission>();
    public DbSet<UserManagementScope> UserManagementScopes => Set<UserManagementScope>();
    public DbSet<UserPermissionOverride> UserPermissionOverrides => Set<UserPermissionOverride>();
    public DbSet<UserStatus> UserStatuses => Set<UserStatus>();
    public DbSet<UserStatusHistory> UserStatusHistory => Set<UserStatusHistory>();
    public DbSet<Organisation> Organisations => Set<Organisation>();
    public DbSet<PartnerVerification> PartnerVerifications => Set<PartnerVerification>();
    public DbSet<RefreshToken> RefreshTokens => Set<RefreshToken>();
    public DbSet<LoginAudit> LoginAudits => Set<LoginAudit>();

    // ---- master ------------------------------------------------------------
    public DbSet<State> States => Set<State>();
    public DbSet<District> Districts => Set<District>();
    public DbSet<Sector> Sectors => Set<Sector>();
    public DbSet<Domain.Entities.Master.Parameter> Parameters => Set<Domain.Entities.Master.Parameter>();
    public DbSet<SectorParameter> SectorParameters => Set<SectorParameter>();
    public DbSet<TechnologyCategory> TechnologyCategories => Set<TechnologyCategory>();
    public DbSet<Technology> Technologies => Set<Technology>();
    public DbSet<EsgSection> EsgSections => Set<EsgSection>();
    public DbSet<EsgQuestion> EsgQuestions => Set<EsgQuestion>();
    public DbSet<BasicInfoItem> BasicInfoItems => Set<BasicInfoItem>();
    public DbSet<DocumentRequirement> DocumentRequirements => Set<DocumentRequirement>();
    public DbSet<LookupType> LookupTypes => Set<LookupType>();
    public DbSet<LookupValue> LookupValues => Set<LookupValue>();
    public DbSet<Document> Documents => Set<Document>();
    public DbSet<DocumentVersion> DocumentVersions => Set<DocumentVersion>();
    public DbSet<DocumentAudience> DocumentAudiences => Set<DocumentAudience>();

    // ---- msme --------------------------------------------------------------
    public DbSet<EnterpriseActivity> EnterpriseActivities => Set<EnterpriseActivity>();
    public DbSet<EnterprisePlant> EnterprisePlants => Set<EnterprisePlant>();
    public DbSet<Enterprise> Enterprises => Set<Enterprise>();
    public DbSet<Registration> Registrations => Set<Registration>();
    public DbSet<AwarenessProgram> AwarenessPrograms => Set<AwarenessProgram>();
    public DbSet<CertificationLevel> CertificationLevels => Set<CertificationLevel>();
    public DbSet<Domain.Entities.Msme.ApplicationStatus> ApplicationStatuses
        => Set<Domain.Entities.Msme.ApplicationStatus>();
    public DbSet<ApplicationStatusTransition> ApplicationStatusTransitions => Set<ApplicationStatusTransition>();
    public DbSet<Domain.Entities.Msme.Application> Applications => Set<Domain.Entities.Msme.Application>();
    public DbSet<ApplicationStatusHistory> ApplicationStatusHistory => Set<ApplicationStatusHistory>();
    public DbSet<HandholdingActivity> HandholdingActivities => Set<HandholdingActivity>();
    public DbSet<ApplicationSubmission> ApplicationSubmissions => Set<ApplicationSubmission>();
    public DbSet<BronzeCourse> BronzeCourses => Set<BronzeCourse>();
    public DbSet<BronzeParticipant> BronzeParticipants => Set<BronzeParticipant>();
    public DbSet<EnterpriseChangeLog> EnterpriseChangeLogs => Set<EnterpriseChangeLog>();
    public DbSet<SubmissionBasicInfo> SubmissionBasicInfo => Set<SubmissionBasicInfo>();
    public DbSet<SubmissionEsgAnswer> SubmissionEsgAnswers => Set<SubmissionEsgAnswer>();
    public DbSet<SubmissionDocument> SubmissionDocuments => Set<SubmissionDocument>();

    // ---- assess ------------------------------------------------------------
    public DbSet<Questionnaire> Questionnaires => Set<Questionnaire>();
    public DbSet<Requirement> Requirements => Set<Requirement>();
    public DbSet<Checkpoint> Checkpoints => Set<Checkpoint>();
    public DbSet<ExamConfig> ExamConfigs => Set<ExamConfig>();
    public DbSet<Assessment> Assessments => Set<Assessment>();
    public DbSet<AssessmentTeamMember> AssessmentTeam => Set<AssessmentTeamMember>();
    public DbSet<AssessmentResponse> AssessmentResponses => Set<AssessmentResponse>();
    public DbSet<ResponseEvidence> ResponseEvidence => Set<ResponseEvidence>();
    public DbSet<NonConformance> NonConformances => Set<NonConformance>();

    // ---- fee ---------------------------------------------------------------
    public DbSet<SubsidyCategory> SubsidyCategories => Set<SubsidyCategory>();
    public DbSet<FeeRate> FeeRates => Set<FeeRate>();
    public DbSet<TdsSection> TdsSections => Set<TdsSection>();
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<Payment> Payments => Set<Payment>();

    // ---- incentive ---------------------------------------------------------
    public DbSet<IncentiveProvider> IncentiveProviders => Set<IncentiveProvider>();
    public DbSet<StatusChangeLog> StatusChangeLogs => Set<StatusChangeLog>();
    public DbSet<Incentive> Incentives => Set<Incentive>();
    public DbSet<IncentiveCategory> IncentiveCategories => Set<IncentiveCategory>();
    public DbSet<IncentiveResource> IncentiveResources => Set<IncentiveResource>();
    public DbSet<IncentiveDisbursement> IncentiveDisbursements => Set<IncentiveDisbursement>();

    // ---- comm --------------------------------------------------------------
    public DbSet<EmailTemplate> EmailTemplates => Set<EmailTemplate>();
    public DbSet<EmailTemplateAudience> EmailTemplateAudiences => Set<EmailTemplateAudience>();
    public DbSet<EmailCampaign> EmailCampaigns => Set<EmailCampaign>();
    public DbSet<EmailCampaignAudience> EmailCampaignAudiences => Set<EmailCampaignAudience>();
    public DbSet<EmailMessage> EmailMessages => Set<EmailMessage>();

    // ---- audit -------------------------------------------------------------
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<ErrorLog> ErrorLogs => Set<ErrorLog>();
    public DbSet<ApiRegistry> ApiRegistry => Set<ApiRegistry>();
    public DbSet<SystemSetting> SystemSettings => Set<SystemSetting>();
    public DbSet<PaymentGateway> PaymentGateways => Set<PaymentGateway>();
    public DbSet<ApiKey> ApiKeys => Set<ApiKey>();
    public DbSet<ApiEndpoint> ApiEndpoints => Set<ApiEndpoint>();
    public DbSet<ApiRateLimit> ApiRateLimits => Set<ApiRateLimit>();
    public DbSet<Webhook> Webhooks => Set<Webhook>();

    protected override void OnModelCreating(ModelBuilder builder)
    {
        base.OnModelCreating(builder);

        // Identity's own tables live in the identity schema alongside ours,
        // with the names the SQL scripts create.
        builder.Entity<ApplicationUser>().ToTable("User", "auth");
        builder.Entity<Role>().ToTable("Role", "auth");
        builder.Entity<IdentityUserClaim<int>>().ToTable("UserClaim", "auth");
        builder.Entity<IdentityUserLogin<int>>().ToTable("UserLogin", "auth");
        builder.Entity<IdentityUserToken<int>>().ToTable("UserToken", "auth");
        builder.Entity<IdentityRoleClaim<int>>().ToTable("RoleClaim", "auth");

        // The portal gives a user exactly one role, held as a column on User.
        // Identity's many-to-many join table is therefore unused; it is mapped
        // so Identity's stores still work, but nothing writes to it.
        builder.Entity<IdentityUserRole<int>>().ToTable("UserRoleLink", "auth");

        builder.ApplyConfigurationsFromAssembly(typeof(MclsDbContext).Assembly);

        ApplyGlobalConventions(builder);
    }

    /// <summary>
    /// Conventions applied across every entity, so an individual configuration
    /// only has to state what is unusual about it.
    /// </summary>
    private static void ApplyGlobalConventions(ModelBuilder builder)
    {
        foreach (var entity in builder.Model.GetEntityTypes())
        {
            var clr = entity.ClrType;

            // Soft-deletable entities are filtered out of every query. A screen
            // that genuinely needs deleted rows calls IgnoreQueryFilters().
            if (typeof(ISoftDeletable).IsAssignableFrom(clr))
            {
                var param = System.Linq.Expressions.Expression.Parameter(clr, "e");
                var prop = System.Linq.Expressions.Expression.Property(param, nameof(ISoftDeletable.IsDeleted));
                var body = System.Linq.Expressions.Expression.Equal(
                    prop, System.Linq.Expressions.Expression.Constant(false));
                builder.Entity(clr).HasQueryFilter(
                    System.Linq.Expressions.Expression.Lambda(body, param));
            }

            // rowversion becomes the concurrency token wherever the entity
            // declares one.
            if (typeof(IConcurrencyAware).IsAssignableFrom(clr))
            {
                builder.Entity(clr)
                    .Property(nameof(IConcurrencyAware.RowVersion))
                    .IsRowVersion()
                    .IsConcurrencyToken();
            }

            // Money and percentages: pin the precision so SQL Server never
            // infers decimal(18,2) inconsistently across providers.
            foreach (var property in entity.GetProperties())
            {
                if (property.ClrType == typeof(decimal) || property.ClrType == typeof(decimal?))
                {
                    var name = property.Name;
                    property.SetColumnType(
                        name.EndsWith("Percent", StringComparison.Ordinal) ? "decimal(5,2)"
                        : name is "Weight" or "MaxScore" or "ScoreAwarded" or "TotalScore"
                                  or "MaxPossibleScore" or "LatestScore" or "DurationHours"
                            ? "decimal(6,2)"
                            : "decimal(18,2)");
                }
            }
        }

        // Delete behaviour is deliberately NOT set globally here. EF's default
        // for a required relationship is Cascade, which is wrong for the
        // reference-data foreign keys but right for the genuine parent-child
        // ones (a document's versions, a role's permissions). Each entity
        // configuration states its own, matching the ON DELETE clause in the
        // SQL scripts — a blanket override applied after
        // ApplyConfigurationsFromAssembly would silently undo those.
    }
}

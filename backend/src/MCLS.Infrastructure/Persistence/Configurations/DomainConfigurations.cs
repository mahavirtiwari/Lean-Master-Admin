using MCLS.Domain.Entities.Assess;
using MCLS.Domain.Entities.Audit;
using MCLS.Domain.Entities.Comm;
using MCLS.Domain.Entities.Fee;
using MCLS.Domain.Entities.Incentive;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Entities.Msme;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

// The scheme application entity, aliased because the bare name 'Application'
// resolves to the sibling MCLS.Application *namespace* from inside
// MCLS.Infrastructure, not to the type.
using MsmeApplication = MCLS.Domain.Entities.Msme.Application;

namespace MCLS.Infrastructure.Persistence.Configurations;

/*  Mappings for the master, msme, assess, fee, incentive, comm and audit
    schemas. Grouped by schema rather than split one file per entity: these are
    mostly table and key mapping, and keeping a schema together makes it easy
    to diff against the matching SQL script.                                  */

// ---------------------------------------------------------------- master ---

internal sealed class StateConfiguration : IEntityTypeConfiguration<State>
{
    public void Configure(EntityTypeBuilder<State> b)
    {
        b.ToTable("State", "master");
        b.HasKey(x => x.StateId);
        b.Property(x => x.Code).HasMaxLength(5).IsRequired().IsUnicode(false);
        b.Property(x => x.AlphaCode).HasMaxLength(3).IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(100).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
        b.HasIndex(x => x.Name).IsUnique();
    }
}

internal sealed class DistrictConfiguration : IEntityTypeConfiguration<District>
{
    public void Configure(EntityTypeBuilder<District> b)
    {
        b.ToTable("District", "master");
        b.HasKey(x => x.DistrictId);
        b.Property(x => x.Code).HasMaxLength(10).IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(120).IsRequired();
        b.HasIndex(x => new { x.StateId, x.Name }).IsUnique();
        b.HasOne(x => x.State).WithMany(s => s.Districts)
            .HasForeignKey(x => x.StateId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class SectorConfiguration : IEntityTypeConfiguration<Sector>
{
    public void Configure(EntityTypeBuilder<Sector> b)
    {
        b.ToTable("Sector", "master");
        b.HasKey(x => x.SectorId);
        b.Property(x => x.NicCode).HasMaxLength(5).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.HasIndex(x => x.NicCode).IsUnique();
    }
}

internal sealed class ParameterConfiguration : IEntityTypeConfiguration<Parameter>
{
    public void Configure(EntityTypeBuilder<Parameter> b)
    {
        b.ToTable("Parameter", "master");
        b.HasKey(x => x.ParameterId);
        b.Property(x => x.Code).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class SectorParameterConfiguration : IEntityTypeConfiguration<SectorParameter>
{
    public void Configure(EntityTypeBuilder<SectorParameter> b)
    {
        b.ToTable("SectorParameter", "master");
        b.HasKey(x => new { x.SectorId, x.ParameterId });
        b.HasOne(x => x.Sector).WithMany(s => s.SectorParameters)
            .HasForeignKey(x => x.SectorId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Parameter).WithMany()
            .HasForeignKey(x => x.ParameterId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class TechnologyCategoryConfiguration : IEntityTypeConfiguration<TechnologyCategory>
{
    public void Configure(EntityTypeBuilder<TechnologyCategory> b)
    {
        b.ToTable("TechnologyCategory", "master");
        b.HasKey(x => x.TechnologyCategoryId);
        b.Property(x => x.Code).HasMaxLength(20).IsUnicode(false).IsRequired();
        b.Property(x => x.Name).HasMaxLength(120).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
        b.HasIndex(x => x.Name).IsUnique();
    }
}

internal sealed class EsgSectionConfiguration : IEntityTypeConfiguration<EsgSection>
{
    public void Configure(EntityTypeBuilder<EsgSection> b)
    {
        b.ToTable("EsgSection", "master");
        b.HasKey(x => x.EsgSectionId);
        b.Property(x => x.Code).HasMaxLength(30).IsUnicode(false).IsRequired();
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(500);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class EsgQuestionConfiguration : IEntityTypeConfiguration<EsgQuestion>
{
    public void Configure(EntityTypeBuilder<EsgQuestion> b)
    {
        b.ToTable("EsgQuestion", "master");
        b.HasKey(x => x.EsgQuestionId);
        b.Property(x => x.Code).HasMaxLength(30).IsUnicode(false).IsRequired();
        b.Property(x => x.Text).HasMaxLength(1000).IsRequired();
        b.Property(x => x.HelpText).HasMaxLength(500);
        b.Property(x => x.ShowWhenAnswer).HasMaxLength(3).IsUnicode(false);
        b.HasIndex(x => x.Code).IsUnique();
        b.HasOne(x => x.Section).WithMany(s => s.Questions)
            .HasForeignKey(x => x.EsgSectionId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Parent).WithMany()
            .HasForeignKey(x => x.ParentQuestionId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class BasicInfoItemConfiguration : IEntityTypeConfiguration<BasicInfoItem>
{
    public void Configure(EntityTypeBuilder<BasicInfoItem> b)
    {
        b.ToTable("BasicInfoItem", "master");
        b.HasKey(x => x.BasicInfoItemId);
        b.Property(x => x.Code).HasMaxLength(30).IsUnicode(false).IsRequired();
        b.Property(x => x.GroupName).HasMaxLength(100).IsRequired();
        b.Property(x => x.Label).HasMaxLength(300).IsRequired();
        b.Property(x => x.HelpText).HasMaxLength(300);
        b.Property(x => x.InputType).HasMaxLength(20).IsUnicode(false).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class DocumentRequirementConfiguration : IEntityTypeConfiguration<DocumentRequirement>
{
    public void Configure(EntityTypeBuilder<DocumentRequirement> b)
    {
        b.ToTable("DocumentRequirement", "master");
        b.HasKey(x => x.DocumentRequirementId);
        b.Property(x => x.Code).HasMaxLength(30).IsUnicode(false).IsRequired();
        b.Property(x => x.Name).HasMaxLength(300).IsRequired();
        b.Property(x => x.HelpText).HasMaxLength(300);
        b.Property(x => x.AcceptedTypes).HasMaxLength(200).IsUnicode(false).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class TechnologyConfiguration : IEntityTypeConfiguration<Technology>
{
    public void Configure(EntityTypeBuilder<Technology> b)
    {
        b.ToTable("Technology", "master");
        b.HasKey(x => x.TechnologyId);
        b.Property(x => x.Code).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);
        b.HasIndex(x => x.Code).IsUnique();
        b.HasOne(x => x.TechnologyCategory).WithMany()
            .HasForeignKey(x => x.TechnologyCategoryId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Sector).WithMany()
            .HasForeignKey(x => x.SectorId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class LookupTypeConfiguration : IEntityTypeConfiguration<LookupType>
{
    public void Configure(EntityTypeBuilder<LookupType> b)
    {
        b.ToTable("LookupType", "master");
        b.HasKey(x => x.LookupTypeId);
        b.Property(x => x.Code).HasMaxLength(50).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(120).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class LookupValueConfiguration : IEntityTypeConfiguration<LookupValue>
{
    public void Configure(EntityTypeBuilder<LookupValue> b)
    {
        b.ToTable("LookupValue", "master");
        b.HasKey(x => x.LookupValueId);
        b.Property(x => x.Code).HasMaxLength(50).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.HasIndex(x => new { x.LookupTypeId, x.Code }).IsUnique();
        b.HasOne(x => x.LookupType).WithMany(t => t.Values)
            .HasForeignKey(x => x.LookupTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class DocumentConfiguration : IEntityTypeConfiguration<Document>
{
    public void Configure(EntityTypeBuilder<Document> b)
    {
        b.ToTable("Document", "master");
        b.HasKey(x => x.DocumentId);
        b.Property(x => x.VideoUrl).HasMaxLength(1000);
        b.Property(x => x.Title).HasMaxLength(250).IsRequired();
        b.Property(x => x.Description).HasMaxLength(1000);

        b.HasOne(x => x.Category).WithMany()
            .HasForeignKey(x => x.CategoryLookupId).OnDelete(DeleteBehavior.Restrict);

        // The live version pointer must not cascade: deleting a version would
        // otherwise take the whole document with it.
        b.HasOne(x => x.CurrentVersion).WithMany()
            .HasForeignKey(x => x.CurrentVersionId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class DocumentVersionConfiguration : IEntityTypeConfiguration<DocumentVersion>
{
    public void Configure(EntityTypeBuilder<DocumentVersion> b)
    {
        b.ToTable("DocumentVersion", "master");
        b.HasKey(x => x.DocumentVersionId);
        b.Property(x => x.VersionLabel).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.OriginalFileName).HasMaxLength(260).IsRequired();
        b.Property(x => x.StoredFileName).HasMaxLength(80).IsRequired().IsUnicode(false);
        b.Property(x => x.RelativePath).HasMaxLength(300).IsRequired().IsUnicode(false);
        b.Property(x => x.ContentType).HasMaxLength(150).IsRequired().IsUnicode(false);
        b.Property(x => x.Sha256Hash).HasColumnType("binary(32)");
        b.HasIndex(x => new { x.DocumentId, x.VersionLabel }).IsUnique();
        b.HasIndex(x => x.StoredFileName).IsUnique();

        // Exactly one live version per document.
        b.HasIndex(x => x.DocumentId).IsUnique().HasFilter("[IsLive] = 1")
            .HasDatabaseName("UX_DocumentVersion_Live");

        b.HasOne(x => x.Document).WithMany(d => d.Versions)
            .HasForeignKey(x => x.DocumentId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.UploadedBy).WithMany()
            .HasForeignKey(x => x.UploadedByUserId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class DocumentAudienceConfiguration : IEntityTypeConfiguration<DocumentAudience>
{
    public void Configure(EntityTypeBuilder<DocumentAudience> b)
    {
        b.ToTable("DocumentAudience", "master");
        b.HasKey(x => new { x.DocumentId, x.AccountTypeId });
        b.HasOne(x => x.Document).WithMany(d => d.Audiences)
            .HasForeignKey(x => x.DocumentId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.AccountType).WithMany()
            .HasForeignKey(x => x.AccountTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

// ------------------------------------------------------------------ msme ---

internal sealed class EnterpriseConfiguration : IEntityTypeConfiguration<Enterprise>
{
    public void Configure(EntityTypeBuilder<Enterprise> b)
    {
        b.ToTable("Enterprise", "msme");
        b.HasKey(x => x.EnterpriseId);
        b.Property(x => x.UdyamRegistrationNo).HasMaxLength(25).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.EnterpriseSize).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.AddressLine).HasMaxLength(500);
        b.Property(x => x.Pincode).HasMaxLength(6).IsUnicode(false);
        b.Property(x => x.ContactPersonName).HasMaxLength(200);
        b.Property(x => x.ContactEmail).HasMaxLength(256);
        b.Property(x => x.ContactMobile).HasMaxLength(20).IsUnicode(false);
        b.Property(x => x.Gstin).HasMaxLength(15).IsUnicode(false);
        b.Property(x => x.Pan).HasMaxLength(10).IsUnicode(false);
        b.Property(x => x.AwarenessAgency).HasMaxLength(4).IsUnicode(false);
        b.Property(x => x.LeanId).HasMaxLength(30).IsUnicode(false);
        b.HasIndex(x => x.UdyamRegistrationNo).IsUnique();

        // msme.Enterprise records its creation as RegisteredOnUtc; there is no
        // CreatedOnUtc column. The property only exists because the entity
        // implements IAuditable, so it is mapped away rather than left for EF
        // to infer — unmapped, every INSERT names a column the table lacks.
        b.Ignore(x => x.CreatedOnUtc);

        b.HasOne(x => x.Sector).WithMany().HasForeignKey(x => x.SectorId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.State).WithMany().HasForeignKey(x => x.StateId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.District).WithMany().HasForeignKey(x => x.DistrictId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CertificationLevelConfiguration : IEntityTypeConfiguration<CertificationLevel>
{
    public void Configure(EntityTypeBuilder<CertificationLevel> b)
    {
        b.ToTable("CertificationLevel", "msme");
        b.HasKey(x => x.CertificationLevelId);
        b.Property(x => x.CertificationLevelId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(40).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class ApplicationStatusConfiguration : IEntityTypeConfiguration<ApplicationStatus>
{
    public void Configure(EntityTypeBuilder<ApplicationStatus> b)
    {
        b.ToTable("ApplicationStatus", "msme");
        b.HasKey(x => x.ApplicationStatusId);
        b.Property(x => x.ApplicationStatusId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(60).IsRequired();
        b.Property(x => x.Stage).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.BadgeColour).HasMaxLength(9).IsUnicode(false);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class ApplicationStatusTransitionConfiguration
    : IEntityTypeConfiguration<ApplicationStatusTransition>
{
    public void Configure(EntityTypeBuilder<ApplicationStatusTransition> b)
    {
        b.ToTable("ApplicationStatusTransition", "msme");
        b.HasKey(x => new { x.FromStatusId, x.ToStatusId });
        b.HasOne(x => x.FromStatus).WithMany()
            .HasForeignKey(x => x.FromStatusId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.ToStatus).WithMany()
            .HasForeignKey(x => x.ToStatusId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ApplicationConfiguration : IEntityTypeConfiguration<MsmeApplication>
{
    public void Configure(EntityTypeBuilder<MsmeApplication> b)
    {
        b.ToTable("Application", "msme");
        b.HasKey(x => x.ApplicationId);
        b.Property(x => x.ApplicationNo).HasMaxLength(25).IsRequired().IsUnicode(false);
        b.Property(x => x.CertificateNo).HasMaxLength(40).IsUnicode(false);
        b.Property(x => x.RejectionReason).HasMaxLength(1000);
        b.Property(x => x.Remarks).HasMaxLength(2000);
        b.HasIndex(x => x.ApplicationNo).IsUnique();

        b.HasOne(x => x.Enterprise).WithMany(e => e.Applications)
            .HasForeignKey(x => x.EnterpriseId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.CertificationLevel).WithMany()
            .HasForeignKey(x => x.CertificationLevelId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Status).WithMany()
            .HasForeignKey(x => x.ApplicationStatusId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.ImplementingAgency).WithMany()
            .HasForeignKey(x => x.ImplementingAgencyId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.AssessmentAgency).WithMany()
            .HasForeignKey(x => x.AssessmentAgencyId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Consultant).WithMany()
            .HasForeignKey(x => x.ConsultantUserId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ApplicationSubmissionConfiguration : IEntityTypeConfiguration<ApplicationSubmission>
{
    public void Configure(EntityTypeBuilder<ApplicationSubmission> b)
    {
        b.ToTable("ApplicationSubmission", "msme");
        b.HasKey(x => x.SubmissionId);
        b.Property(x => x.Status).HasMaxLength(20).IsUnicode(false).IsRequired();
        b.Property(x => x.PaymentStatus).HasMaxLength(20).IsUnicode(false).IsRequired();
        b.Property(x => x.PaidAmount).HasColumnType("decimal(12,2)");
        b.Property(x => x.PaymentMethod).HasMaxLength(20).IsUnicode(false);
        b.Property(x => x.PaymentReference).HasMaxLength(40).IsUnicode(false);
        b.Property(x => x.RowVersion).IsRowVersion();
        b.HasIndex(x => new { x.EnterpriseId, x.CertificationLevelId }).IsUnique();

        b.HasMany(x => x.BasicInfo).WithOne().HasForeignKey(x => x.SubmissionId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.EsgAnswers).WithOne().HasForeignKey(x => x.SubmissionId).OnDelete(DeleteBehavior.Cascade);
        b.HasMany(x => x.Documents).WithOne().HasForeignKey(x => x.SubmissionId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class SubmissionBasicInfoConfiguration : IEntityTypeConfiguration<SubmissionBasicInfo>
{
    public void Configure(EntityTypeBuilder<SubmissionBasicInfo> b)
    {
        b.ToTable("SubmissionBasicInfo", "msme");
        b.HasKey(x => new { x.SubmissionId, x.BasicInfoItemId });
        b.Property(x => x.ValueText).HasMaxLength(1000);
    }
}

internal sealed class SubmissionEsgAnswerConfiguration : IEntityTypeConfiguration<SubmissionEsgAnswer>
{
    public void Configure(EntityTypeBuilder<SubmissionEsgAnswer> b)
    {
        b.ToTable("SubmissionEsgAnswer", "msme");
        b.HasKey(x => new { x.SubmissionId, x.EsgQuestionId });
        b.Property(x => x.Answer).HasMaxLength(3).IsUnicode(false).IsRequired();
    }
}

internal sealed class SubmissionDocumentConfiguration : IEntityTypeConfiguration<SubmissionDocument>
{
    public void Configure(EntityTypeBuilder<SubmissionDocument> b)
    {
        b.ToTable("SubmissionDocument", "msme");
        b.HasKey(x => new { x.SubmissionId, x.DocumentRequirementId });
        b.Property(x => x.OriginalFileName).HasMaxLength(300);
        b.Property(x => x.StoredFileName).HasMaxLength(300);
        b.Property(x => x.ContentType).HasMaxLength(100).IsUnicode(false);
    }
}

internal sealed class ApplicationStatusHistoryConfiguration : IEntityTypeConfiguration<ApplicationStatusHistory>
{
    public void Configure(EntityTypeBuilder<ApplicationStatusHistory> b)
    {
        b.ToTable("ApplicationStatusHistory", "msme");
        b.HasKey(x => x.ApplicationStatusHistoryId);
        b.Property(x => x.Remark).HasMaxLength(1000);
        b.HasIndex(x => new { x.ApplicationId, x.ChangedOnUtc });
        b.HasOne(x => x.Application).WithMany(a => a.StatusHistory)
            .HasForeignKey(x => x.ApplicationId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class HandholdingActivityConfiguration : IEntityTypeConfiguration<HandholdingActivity>
{
    public void Configure(EntityTypeBuilder<HandholdingActivity> b)
    {
        b.ToTable("HandholdingActivity", "msme");
        b.HasKey(x => x.HandholdingActivityId);
        b.Property(x => x.ActivityType).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Title).HasMaxLength(250).IsRequired();
        b.Property(x => x.Notes).HasMaxLength(2000);
        b.HasOne(x => x.Application).WithMany(a => a.HandholdingActivities)
            .HasForeignKey(x => x.ApplicationId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Parameter).WithMany()
            .HasForeignKey(x => x.ParameterId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Technology).WithMany()
            .HasForeignKey(x => x.TechnologyId).OnDelete(DeleteBehavior.Restrict);
    }
}

// ---------------------------------------------------------------- assess ---

internal sealed class QuestionnaireConfiguration : IEntityTypeConfiguration<Questionnaire>
{
    public void Configure(EntityTypeBuilder<Questionnaire> b)
    {
        b.ToTable("Questionnaire", "assess");
        b.HasKey(x => x.QuestionnaireId);
        b.Property(x => x.Code).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.HasIndex(x => new { x.Code, x.VersionNo }).IsUnique();
        b.HasOne(x => x.CertificationLevel).WithMany()
            .HasForeignKey(x => x.CertificationLevelId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Sector).WithMany()
            .HasForeignKey(x => x.SectorId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class RequirementConfiguration : IEntityTypeConfiguration<Requirement>
{
    public void Configure(EntityTypeBuilder<Requirement> b)
    {
        b.ToTable("Requirement", "assess");
        b.HasKey(x => x.RequirementId);
        b.Property(x => x.Title).HasMaxLength(300).IsRequired();
        b.Property(x => x.Narrative).HasMaxLength(2000);
        b.Property(x => x.Bullets).HasMaxLength(2000);
        b.Property(x => x.Purpose).HasMaxLength(1000);
        b.Property(x => x.Benefits).HasMaxLength(1000);
        b.Property(x => x.SuggestedAction).HasMaxLength(1000);
        b.HasIndex(x => new { x.QuestionnaireId, x.SequenceNo }).IsUnique();
        b.HasOne(x => x.Questionnaire).WithMany(q => q.Requirements)
            .HasForeignKey(x => x.QuestionnaireId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Parameter).WithMany()
            .HasForeignKey(x => x.ParameterId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class CheckpointConfiguration : IEntityTypeConfiguration<Checkpoint>
{
    public void Configure(EntityTypeBuilder<Checkpoint> b)
    {
        b.ToTable("Checkpoint", "assess");
        b.HasKey(x => x.CheckpointId);
        b.Property(x => x.CheckpointText).HasMaxLength(600).IsRequired();
        b.Property(x => x.Evidence).HasMaxLength(600);
        b.Property(x => x.Kpi).HasMaxLength(300);
        b.Property(x => x.Unit).HasMaxLength(20).IsUnicode(false);
        b.Property(x => x.Frequency).HasMaxLength(20).IsUnicode(false);
        b.Property(x => x.ExpectedResponse).HasMaxLength(10).IsUnicode(false);
        b.HasIndex(x => new { x.RequirementId, x.SequenceNo }).IsUnique();
        b.HasOne(x => x.Requirement).WithMany(r => r.Checkpoints)
            .HasForeignKey(x => x.RequirementId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class AssessmentConfiguration : IEntityTypeConfiguration<Assessment>
{
    public void Configure(EntityTypeBuilder<Assessment> b)
    {
        b.ToTable("Assessment", "assess");
        b.HasKey(x => x.AssessmentId);
        b.Property(x => x.AssessmentNo).HasMaxLength(25).IsRequired().IsUnicode(false);
        b.Property(x => x.AssessmentType).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.Status).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.Outcome).HasMaxLength(20).IsUnicode(false);
        b.Property(x => x.AssessorRemarks).HasMaxLength(2000);
        b.HasIndex(x => x.AssessmentNo).IsUnique();
        b.HasOne(x => x.Application).WithMany()
            .HasForeignKey(x => x.ApplicationId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Questionnaire).WithMany()
            .HasForeignKey(x => x.QuestionnaireId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.AssessmentAgency).WithMany()
            .HasForeignKey(x => x.AssessmentAgencyId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.LeadAssessor).WithMany()
            .HasForeignKey(x => x.LeadAssessorUserId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AssessmentTeamMemberConfiguration : IEntityTypeConfiguration<AssessmentTeamMember>
{
    public void Configure(EntityTypeBuilder<AssessmentTeamMember> b)
    {
        b.ToTable("AssessmentTeam", "assess");
        b.HasKey(x => new { x.AssessmentId, x.AssessorUserId });
        b.Property(x => x.TeamRole).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.HasOne(x => x.Assessment).WithMany(a => a.Team)
            .HasForeignKey(x => x.AssessmentId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Assessor).WithMany()
            .HasForeignKey(x => x.AssessorUserId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AssessmentResponseConfiguration : IEntityTypeConfiguration<AssessmentResponse>
{
    public void Configure(EntityTypeBuilder<AssessmentResponse> b)
    {
        b.ToTable("AssessmentResponse", "assess");
        b.HasKey(x => x.AssessmentResponseId);
        b.Property(x => x.Response).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.ObservedValue).HasMaxLength(200);
        b.Property(x => x.AssessorNote).HasMaxLength(1000);
        b.HasIndex(x => new { x.AssessmentId, x.CheckpointId }).IsUnique();
        b.HasOne(x => x.Assessment).WithMany(a => a.Responses)
            .HasForeignKey(x => x.AssessmentId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Checkpoint).WithMany()
            .HasForeignKey(x => x.CheckpointId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ResponseEvidenceConfiguration : IEntityTypeConfiguration<ResponseEvidence>
{
    public void Configure(EntityTypeBuilder<ResponseEvidence> b)
    {
        b.ToTable("ResponseEvidence", "assess");
        b.HasKey(x => x.ResponseEvidenceId);
        b.Property(x => x.OriginalFileName).HasMaxLength(260).IsRequired();
        b.Property(x => x.StoredFileName).HasMaxLength(80).IsRequired().IsUnicode(false);
        b.Property(x => x.RelativePath).HasMaxLength(300).IsRequired().IsUnicode(false);
        b.Property(x => x.ContentType).HasMaxLength(150).IsRequired().IsUnicode(false);
        b.HasIndex(x => x.StoredFileName).IsUnique();
        b.HasOne(x => x.AssessmentResponse).WithMany(r => r.Evidence)
            .HasForeignKey(x => x.AssessmentResponseId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class NonConformanceConfiguration : IEntityTypeConfiguration<NonConformance>
{
    public void Configure(EntityTypeBuilder<NonConformance> b)
    {
        b.ToTable("NonConformance", "assess");
        b.HasKey(x => x.NonConformanceId);
        b.Property(x => x.NcNo).HasMaxLength(25).IsRequired().IsUnicode(false);
        b.Property(x => x.Severity).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.Description).HasMaxLength(2000).IsRequired();
        b.Property(x => x.RootCause).HasMaxLength(2000);
        b.Property(x => x.CorrectiveAction).HasMaxLength(2000);
        b.Property(x => x.ClosureRemark).HasMaxLength(1000);
        b.HasIndex(x => x.NcNo).IsUnique();
        b.HasOne(x => x.Assessment).WithMany(a => a.NonConformances)
            .HasForeignKey(x => x.AssessmentId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.Checkpoint).WithMany()
            .HasForeignKey(x => x.CheckpointId).OnDelete(DeleteBehavior.Restrict);
    }
}

// ------------------------------------------------------------------- fee ---

internal sealed class SubsidyCategoryConfiguration : IEntityTypeConfiguration<SubsidyCategory>
{
    public void Configure(EntityTypeBuilder<SubsidyCategory> b)
    {
        b.ToTable("SubsidyCategory", "fee");
        b.HasKey(x => x.SubsidyCategoryId);
        b.Property(x => x.SubsidyCategoryId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(5).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(120).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();

        // Computed and persisted in SQL. Never written from here.
        b.Property(x => x.TotalSubsidyPercent)
            .HasComputedColumnSql("[BaseSubsidyPercent] + [AdditionalPercent]", stored: true);
    }
}

internal sealed class FeeRateConfiguration : IEntityTypeConfiguration<FeeRate>
{
    public void Configure(EntityTypeBuilder<FeeRate> b)
    {
        b.ToTable("FeeRate", "fee");
        b.HasKey(x => x.FeeRateId);
        b.Property(x => x.Notes).HasMaxLength(500);
        b.Ignore(x => x.IsCurrent);
        b.HasIndex(x => x.CertificationLevelId).IsUnique()
            .HasFilter("[EffectiveTo] IS NULL")
            .HasDatabaseName("UX_FeeRate_Current");
        b.HasOne(x => x.CertificationLevel).WithMany()
            .HasForeignKey(x => x.CertificationLevelId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class TdsSectionConfiguration : IEntityTypeConfiguration<TdsSection>
{
    public void Configure(EntityTypeBuilder<TdsSection> b)
    {
        b.ToTable("TdsSection", "fee");
        b.HasKey(x => x.TdsSectionId);
        b.Property(x => x.SectionCode).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.Description).HasMaxLength(300).IsRequired();
        b.Property(x => x.ApplicableTo).HasMaxLength(300).IsRequired();
    }
}

internal sealed class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> b)
    {
        b.ToTable("Invoice", "fee");
        b.HasKey(x => x.InvoiceId);
        b.Property(x => x.InvoiceNo).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.CancellationReason).HasMaxLength(500);
        b.HasIndex(x => x.InvoiceNo).IsUnique();
        b.HasOne(x => x.Application).WithMany()
            .HasForeignKey(x => x.ApplicationId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.SubsidyCategory).WithMany()
            .HasForeignKey(x => x.SubsidyCategoryId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class PaymentConfiguration : IEntityTypeConfiguration<Payment>
{
    public void Configure(EntityTypeBuilder<Payment> b)
    {
        b.ToTable("Payment", "fee");
        b.HasKey(x => x.PaymentId);
        b.Property(x => x.PaymentMode).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.TransactionRef).HasMaxLength(100).IsUnicode(false);
        b.Property(x => x.GatewayName).HasMaxLength(50).IsUnicode(false);
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.FailureReason).HasMaxLength(300);

        // A duplicated gateway callback cannot post the same receipt twice.
        b.HasIndex(x => x.TransactionRef).IsUnique()
            .HasFilter("[TransactionRef] IS NOT NULL");

        b.HasOne(x => x.Invoice).WithMany(i => i.Payments)
            .HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Restrict);
    }
}

// ------------------------------------------------------------- incentive ---

internal sealed class IncentiveProviderConfiguration : IEntityTypeConfiguration<IncentiveProvider>
{
    public void Configure(EntityTypeBuilder<IncentiveProvider> b)
    {
        b.ToTable("Provider", "incentive");
        b.HasKey(x => x.ProviderId);
        b.Property(x => x.ProviderId).ValueGeneratedNever();
        b.Property(x => x.Code).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(120).IsRequired();
        b.Property(x => x.Description).HasMaxLength(500);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class StatusChangeLogConfiguration : IEntityTypeConfiguration<StatusChangeLog>
{
    public void Configure(EntityTypeBuilder<StatusChangeLog> b)
    {
        b.ToTable("StatusChangeLog", "master");
        b.HasKey(x => x.StatusChangeLogId);
        b.Property(x => x.EntityName).HasMaxLength(40).IsUnicode(false).IsRequired();
        b.Property(x => x.EntityLabel).HasMaxLength(300);
        b.Property(x => x.Reason).HasMaxLength(500).IsRequired();
        b.HasIndex(x => new { x.EntityName, x.EntityId });
    }
}

internal sealed class IncentiveCategoryConfiguration : IEntityTypeConfiguration<IncentiveCategory>
{
    public void Configure(EntityTypeBuilder<IncentiveCategory> b)
    {
        b.ToTable("Category", "incentive");
        b.HasKey(x => x.CategoryId);
        b.Property(x => x.Code).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(500);
        b.Property(x => x.TypicalPartners).HasMaxLength(300);
        b.Property(x => x.AccentHex).HasMaxLength(7).IsFixedLength().IsUnicode(false).IsRequired();
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class IncentiveResourceConfiguration : IEntityTypeConfiguration<IncentiveResource>
{
    public void Configure(EntityTypeBuilder<IncentiveResource> b)
    {
        b.ToTable("IncentiveResource", "incentive");
        b.HasKey(x => x.ResourceId);
        b.Property(x => x.Kind).HasMaxLength(12).IsRequired().IsUnicode(false);
        b.Property(x => x.Title).HasMaxLength(300).IsRequired();
        b.Property(x => x.Url).HasMaxLength(1000);
        b.Property(x => x.StoragePath).HasMaxLength(400);
        b.Property(x => x.FileName).HasMaxLength(260);
        b.HasOne(x => x.Incentive).WithMany(i => i.Resources)
            .HasForeignKey(x => x.IncentiveId).OnDelete(DeleteBehavior.Cascade);
    }
}

internal sealed class IncentiveConfiguration : IEntityTypeConfiguration<Incentive>
{
    public void Configure(EntityTypeBuilder<Incentive> b)
    {
        b.ToTable("Incentive", "incentive");
        b.HasKey(x => x.IncentiveId);
        b.Property(x => x.Code).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.AdministeringBody).HasMaxLength(200);
        b.Property(x => x.Description).HasMaxLength(2000);
        b.Property(x => x.EligibilityCriteria).HasMaxLength(2000);
        b.Property(x => x.BenefitDescription).HasMaxLength(1000);
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.ExternalUrl).HasMaxLength(500);
        b.Property(x => x.VideoUrl).HasMaxLength(1000);
        b.Property(x => x.SchemeCode).HasMaxLength(40).IsUnicode(false);
        b.Property(x => x.ActivationLevel).HasMaxLength(10).IsUnicode(false);
        b.Property(x => x.BudgetHead).HasMaxLength(200);
        b.Property(x => x.GazetteNo).HasMaxLength(80).IsUnicode(false);
        b.Property(x => x.ProductType).HasMaxLength(120);
        b.Property(x => x.AgencyType).HasMaxLength(80);
        b.Property(x => x.ExternalSchemeId).HasMaxLength(80).IsUnicode(false);
        b.Property(x => x.ContactName).HasMaxLength(160);
        b.Property(x => x.ContactDesignation).HasMaxLength(160);
        b.Property(x => x.ContactMobile).HasMaxLength(15).IsUnicode(false);
        b.Property(x => x.ContactEmail).HasMaxLength(256);
        b.HasIndex(x => x.Code).IsUnique();
        b.HasOne(x => x.Category).WithMany(c => c.Incentives)
            .HasForeignKey(x => x.CategoryId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Provider).WithMany(p => p.Incentives)
            .HasForeignKey(x => x.ProviderId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.CertificationLevel).WithMany()
            .HasForeignKey(x => x.CertificationLevelId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.State).WithMany()
            .HasForeignKey(x => x.StateId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class IncentiveDisbursementConfiguration : IEntityTypeConfiguration<IncentiveDisbursement>
{
    public void Configure(EntityTypeBuilder<IncentiveDisbursement> b)
    {
        b.ToTable("IncentiveDisbursement", "incentive");
        b.HasKey(x => x.DisbursementId);
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.ReferenceNo).HasMaxLength(60).IsUnicode(false);
        b.Property(x => x.Remarks).HasMaxLength(1000);
        b.HasOne(x => x.Incentive).WithMany(i => i.Disbursements)
            .HasForeignKey(x => x.IncentiveId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Enterprise).WithMany()
            .HasForeignKey(x => x.EnterpriseId).OnDelete(DeleteBehavior.Restrict);
    }
}

// ------------------------------------------------------------------ comm ---

internal sealed class EmailTemplateConfiguration : IEntityTypeConfiguration<EmailTemplate>
{
    public void Configure(EntityTypeBuilder<EmailTemplate> b)
    {
        b.ToTable("EmailTemplate", "comm");
        b.HasKey(x => x.EmailTemplateId);
        b.Property(x => x.Code).HasMaxLength(60).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Subject).HasMaxLength(400).IsRequired();
        b.Property(x => x.AvailableTags).HasMaxLength(1000);
        b.Property(x => x.TriggerEvent).HasMaxLength(150);
        b.Property(x => x.ReplyToAddress).HasMaxLength(256);
        b.Property(x => x.CopyToAddress).HasMaxLength(256);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class EmailTemplateAudienceConfiguration : IEntityTypeConfiguration<EmailTemplateAudience>
{
    public void Configure(EntityTypeBuilder<EmailTemplateAudience> b)
    {
        b.ToTable("EmailTemplateAudience", "comm");
        b.HasKey(x => new { x.EmailTemplateId, x.AccountTypeId });
        b.HasOne(x => x.EmailTemplate).WithMany(t => t.Audiences)
            .HasForeignKey(x => x.EmailTemplateId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.AccountType).WithMany()
            .HasForeignKey(x => x.AccountTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class EmailCampaignConfiguration : IEntityTypeConfiguration<EmailCampaign>
{
    public void Configure(EntityTypeBuilder<EmailCampaign> b)
    {
        b.ToTable("EmailCampaign", "comm");
        b.HasKey(x => x.EmailCampaignId);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.Subject).HasMaxLength(400).IsRequired();
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.HasOne(x => x.EmailTemplate).WithMany()
            .HasForeignKey(x => x.EmailTemplateId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class EmailCampaignAudienceConfiguration : IEntityTypeConfiguration<EmailCampaignAudience>
{
    public void Configure(EntityTypeBuilder<EmailCampaignAudience> b)
    {
        b.ToTable("EmailCampaignAudience", "comm");
        b.HasKey(x => new { x.EmailCampaignId, x.AccountTypeId });
        b.HasOne(x => x.EmailCampaign).WithMany(c => c.Audiences)
            .HasForeignKey(x => x.EmailCampaignId).OnDelete(DeleteBehavior.Cascade);
        b.HasOne(x => x.AccountType).WithMany()
            .HasForeignKey(x => x.AccountTypeId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class EmailMessageConfiguration : IEntityTypeConfiguration<EmailMessage>
{
    public void Configure(EntityTypeBuilder<EmailMessage> b)
    {
        b.ToTable("EmailMessage", "comm");
        b.HasKey(x => x.EmailMessageId);
        b.Property(x => x.ToAddress).HasMaxLength(256).IsRequired();
        b.Property(x => x.Subject).HasMaxLength(400).IsRequired();
        b.Property(x => x.Status).HasMaxLength(12).IsRequired().IsUnicode(false);
        b.Property(x => x.ErrorMessage).HasMaxLength(1000);
        b.Property(x => x.ProviderMessageId).HasMaxLength(200).IsUnicode(false);

        // The dispatcher's claim query. Filtered so the index stays small no
        // matter how much send history accumulates.
        b.HasIndex(x => x.QueuedOnUtc)
            .HasFilter("[Status] IN ('Queued','Sending')")
            .HasDatabaseName("IX_EmailMessage_Pending");
    }
}

// ----------------------------------------------------------------- audit ---

internal sealed class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> b)
    {
        b.ToTable("AuditLog", "audit");
        b.HasKey(x => x.AuditLogId);
        b.Property(x => x.UserName).HasMaxLength(200);
        b.Property(x => x.Action).HasMaxLength(20).IsRequired().IsUnicode(false);
        b.Property(x => x.EntityName).HasMaxLength(150).IsRequired();
        b.Property(x => x.EntityKey).HasMaxLength(100);
        b.Property(x => x.AffectedColumns).HasMaxLength(1000);
        b.Property(x => x.IpAddress).HasMaxLength(45).IsUnicode(false);
        b.Property(x => x.UserAgent).HasMaxLength(400);
        b.Property(x => x.DeviceType).HasMaxLength(12).IsUnicode(false);
        b.Property(x => x.OperatingSystem).HasMaxLength(16).IsUnicode(false);
        b.Property(x => x.Browser).HasMaxLength(24).IsUnicode(false);
        b.HasIndex(x => x.OccurredOnUtc);
        b.HasIndex(x => new { x.EntityName, x.EntityKey });
    }
}

internal sealed class ErrorLogConfiguration : IEntityTypeConfiguration<ErrorLog>
{
    public void Configure(EntityTypeBuilder<ErrorLog> b)
    {
        b.ToTable("ErrorLog", "audit");
        b.HasKey(x => x.ErrorLogId);
        b.Property(x => x.Severity).HasMaxLength(12).IsRequired().IsUnicode(false);
        b.Property(x => x.Source).HasMaxLength(200);
        b.Property(x => x.ExceptionType).HasMaxLength(250);
        b.Property(x => x.Message).HasMaxLength(2000).IsRequired();
        b.Property(x => x.RequestMethod).HasMaxLength(10).IsUnicode(false);
        b.Property(x => x.RequestPath).HasMaxLength(500);
        b.Property(x => x.QueryString).HasMaxLength(1000);
        b.Property(x => x.IpAddress).HasMaxLength(45).IsUnicode(false);
        b.Property(x => x.MachineName).HasMaxLength(100);
        b.Property(x => x.ResolutionNote).HasMaxLength(1000);
        b.HasIndex(x => x.OccurredOnUtc);
    }
}

internal sealed class ApiRegistryConfiguration : IEntityTypeConfiguration<ApiRegistry>
{
    public void Configure(EntityTypeBuilder<ApiRegistry> b)
    {
        b.ToTable("ApiRegistry", "audit");
        b.HasKey(x => x.ApiRegistryId);
        b.Property(x => x.Code).HasMaxLength(50).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(500);
        b.Property(x => x.Direction).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.BaseUrl).HasMaxLength(500);
        b.Property(x => x.AuthType).HasMaxLength(30).IsUnicode(false);
        b.Property(x => x.SecretRef).HasMaxLength(200).IsUnicode(false);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class SystemSettingConfiguration : IEntityTypeConfiguration<SystemSetting>
{
    public void Configure(EntityTypeBuilder<SystemSetting> b)
    {
        b.ToTable("SystemSetting", "audit");
        b.HasKey(x => x.SystemSettingId);
        b.Property(x => x.Key).HasColumnName("Key").HasMaxLength(100).IsRequired().IsUnicode(false);
        b.Property(x => x.Value).HasMaxLength(2000);
        b.Property(x => x.DataType).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.Category).HasMaxLength(80).IsRequired();
        b.Property(x => x.DisplayName).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(500);
        b.Property(x => x.DefaultValue).HasMaxLength(4000);
        b.Property(x => x.IconKey).HasMaxLength(30).IsUnicode(false);
        b.HasIndex(x => x.Key).IsUnique();
    }
}

internal sealed class ExamConfigConfiguration : IEntityTypeConfiguration<ExamConfig>
{
    public void Configure(EntityTypeBuilder<ExamConfig> b)
    {
        b.ToTable("ExamConfig", "assess");
        b.HasKey(x => x.ExamConfigId);
        b.Property(x => x.PassMarkPercent).HasPrecision(5, 2);
        b.Property(x => x.NegativeMarkPerWrong).HasPrecision(4, 2);
        b.HasIndex(x => x.CertificationLevelId).IsUnique();
        b.HasOne(x => x.CertificationLevel)
            .WithMany()
            .HasForeignKey(x => x.CertificationLevelId)
            .OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> b)
    {
        b.ToTable("ApiKey", "audit");
        b.HasKey(x => x.ApiKeyId);
        b.Property(x => x.Name).HasMaxLength(150).IsRequired();
        b.Property(x => x.KeyPrefix).HasMaxLength(40).IsRequired();
        b.Property(x => x.Owner).HasMaxLength(150).IsRequired();
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.HasIndex(x => x.KeyPrefix).IsUnique();
    }
}

internal sealed class ApiEndpointConfiguration : IEntityTypeConfiguration<ApiEndpoint>
{
    public void Configure(EntityTypeBuilder<ApiEndpoint> b)
    {
        b.ToTable("ApiEndpoint", "audit");
        b.HasKey(x => x.ApiEndpointId);
        b.Property(x => x.Method).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.Route).HasMaxLength(200).IsRequired();
        b.Property(x => x.Description).HasMaxLength(300);
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.ErrorRate).HasPrecision(5, 2);
        b.HasIndex(x => new { x.Method, x.Route }).IsUnique();
    }
}

internal sealed class ApiRateLimitConfiguration : IEntityTypeConfiguration<ApiRateLimit>
{
    public void Configure(EntityTypeBuilder<ApiRateLimit> b)
    {
        b.ToTable("ApiRateLimit", "audit");
        b.HasKey(x => x.ApiRateLimitId);
        b.Property(x => x.TierName).HasMaxLength(100).IsRequired();
        b.HasIndex(x => x.TierName).IsUnique();
    }
}

internal sealed class WebhookConfiguration : IEntityTypeConfiguration<Webhook>
{
    public void Configure(EntityTypeBuilder<Webhook> b)
    {
        b.ToTable("Webhook", "audit");
        b.HasKey(x => x.WebhookId);
        b.Property(x => x.Event).HasMaxLength(120).IsRequired();
        b.Property(x => x.TargetUrl).HasMaxLength(400).IsRequired();
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.HasIndex(x => x.Event).IsUnique();
    }
}

internal sealed class PaymentGatewayConfiguration : IEntityTypeConfiguration<PaymentGateway>
{
    public void Configure(EntityTypeBuilder<PaymentGateway> b)
    {
        b.ToTable("PaymentGateway", "audit");
        b.HasKey(x => x.PaymentGatewayId);
        b.Property(x => x.Code).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.Name).HasMaxLength(120).IsRequired();
        b.Property(x => x.RoleLabel).HasMaxLength(30).IsRequired();
        b.Property(x => x.Mode).HasMaxLength(10).IsRequired().IsUnicode(false);
        b.Property(x => x.MerchantKeyMask).HasMaxLength(60);
        b.Property(x => x.SuccessRate).HasPrecision(5, 2);
        b.HasIndex(x => x.Code).IsUnique();
    }
}

internal sealed class RegistrationConfiguration : IEntityTypeConfiguration<Registration>
{
    public void Configure(EntityTypeBuilder<Registration> b)
    {
        b.ToTable("Registration", "msme");
        b.HasKey(x => x.RegistrationId);
        b.Property(x => x.UdyamRegistrationNo).HasMaxLength(30).IsRequired().IsUnicode(false);
        b.Property(x => x.UdyamMobile).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.SelectedUnitIdNo).HasMaxLength(60);
        b.Property(x => x.SelectedNicFiveDigit).HasMaxLength(10).IsUnicode(false);
        b.Property(x => x.SpocName).HasMaxLength(200);
        b.Property(x => x.SpocDesignation).HasMaxLength(150);
        b.Property(x => x.SpocMobile).HasMaxLength(15).IsUnicode(false);
        b.Property(x => x.SpocEmail).HasMaxLength(256);
        b.Property(x => x.Status).HasMaxLength(15).IsRequired().IsUnicode(false);
        b.Property(x => x.PledgeAcceptedBy).HasMaxLength(200);
        b.Property(x => x.PledgeAcceptedIp).HasMaxLength(45).IsUnicode(false);
        b.HasIndex(x => x.SessionToken).IsUnique();

        b.HasOne(x => x.AwarenessProgram).WithMany()
            .HasForeignKey(x => x.AwarenessProgramId).OnDelete(DeleteBehavior.Restrict);
        b.HasOne(x => x.Enterprise).WithMany()
            .HasForeignKey(x => x.EnterpriseId).OnDelete(DeleteBehavior.Restrict);
    }
}

internal sealed class AwarenessProgramConfiguration : IEntityTypeConfiguration<AwarenessProgram>
{
    public void Configure(EntityTypeBuilder<AwarenessProgram> b)
    {
        b.ToTable("AwarenessProgram", "master");
        b.HasKey(x => x.AwarenessProgramId);
        b.Property(x => x.Name).HasMaxLength(250).IsRequired();
        b.Property(x => x.Agency).HasMaxLength(4).IsUnicode(false);
        b.Property(x => x.Source).HasMaxLength(10).IsUnicode(false).IsRequired();
        b.Property(x => x.Venue).HasMaxLength(250);
    }
}

// EnterprisePlant and EnterpriseActivity had DbSets but no mapping, so EF fell
// back to pluralised names in the default schema and every insert failed on
// "Invalid object name". Nothing had written to them before the registration
// wizard: the demo data was loaded by SQL.
internal sealed class EnterprisePlantConfiguration : IEntityTypeConfiguration<EnterprisePlant>
{
    public void Configure(EntityTypeBuilder<EnterprisePlant> b)
    {
        b.ToTable("EnterprisePlant", "msme");
        b.HasKey(x => x.EnterprisePlantId);
        b.Property(x => x.UdyamApplicationId).HasMaxLength(50).IsUnicode(false);
        b.Property(x => x.UnitIdNo).HasMaxLength(60);
        b.Property(x => x.UnitName).HasMaxLength(250);
        b.Property(x => x.UamNo).HasMaxLength(50);
        b.Property(x => x.PlantIdNo).HasMaxLength(50);
        b.Property(x => x.AddressLine).HasMaxLength(500);
        b.Property(x => x.Pincode).HasMaxLength(6).IsUnicode(false);
        b.Property(x => x.LgDistrictCode).HasMaxLength(10).IsUnicode(false);
        b.Property(x => x.StateNameRaw).HasMaxLength(120);
        b.Property(x => x.DistrictNameRaw).HasMaxLength(120);
    }
}

internal sealed class EnterpriseActivityConfiguration : IEntityTypeConfiguration<EnterpriseActivity>
{
    public void Configure(EntityTypeBuilder<EnterpriseActivity> b)
    {
        b.ToTable("EnterpriseActivity", "msme");
        b.HasKey(x => x.EnterpriseActivityId);
        b.Property(x => x.UdyamApplicationId).HasMaxLength(50).IsUnicode(false);
        b.Property(x => x.Activity).HasMaxLength(120);
        b.Property(x => x.NicTwoDigit).HasMaxLength(5).IsUnicode(false);
        b.Property(x => x.NicFourDigit).HasMaxLength(5).IsUnicode(false);
        b.Property(x => x.NicFiveDigit).HasMaxLength(10).IsUnicode(false);
        b.Property(x => x.NicTwoDigitName).HasMaxLength(300);
        b.Property(x => x.NicFourDigitName).HasMaxLength(300);
        b.Property(x => x.NicFiveDigitName).HasMaxLength(300);
    }
}

internal sealed class BronzeCourseConfiguration : IEntityTypeConfiguration<BronzeCourse>
{
    public void Configure(EntityTypeBuilder<BronzeCourse> b)
    {
        b.ToTable("BronzeCourse", "msme");
        b.HasKey(x => x.BronzeCourseId);
        b.Property(x => x.Title).HasMaxLength(200).IsRequired();
    }
}

internal sealed class BronzeParticipantConfiguration : IEntityTypeConfiguration<BronzeParticipant>
{
    public void Configure(EntityTypeBuilder<BronzeParticipant> b)
    {
        b.ToTable("BronzeParticipant", "msme");
        b.HasKey(x => x.BronzeParticipantId);
        b.Property(x => x.FullName).HasMaxLength(150).IsRequired();
        b.Property(x => x.Email).HasMaxLength(256).IsRequired();
        b.Property(x => x.Mobile).HasMaxLength(15).IsUnicode(false);
        b.Property(x => x.PreferredLanguage).HasMaxLength(40);
        b.Property(x => x.Status).HasMaxLength(20).IsUnicode(false).IsRequired();
        b.Property(x => x.CertificateNo).HasMaxLength(40).IsUnicode(false);
        b.HasIndex(x => new { x.EnterpriseId, x.Email }).IsUnique().HasFilter("[IsActive] = 1");
    }
}

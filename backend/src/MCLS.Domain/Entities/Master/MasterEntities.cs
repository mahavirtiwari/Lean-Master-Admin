using MCLS.Domain.Common;
using MCLS.Domain.Entities.Identity;

namespace MCLS.Domain.Entities.Master;

public class State
{
    public short StateId { get; set; }

    /// <summary>The LGD/GST numeric code, e.g. 09 for Uttar Pradesh.</summary>
    public string Code { get; set; } = string.Empty;

    /// <summary>
    /// The two-letter code, e.g. UP. Printed in an applicant's LEAN ID, which
    /// is why it is master data and not derived from the name: the identifier
    /// is permanent and a rename must never change it.
    /// </summary>
    public string? AlphaCode { get; set; }

    public string Name { get; set; } = string.Empty;
    public bool IsUnionTerritory { get; set; }

    /// <summary>
    /// Drives the NER subsidy slab. A column rather than a hard-coded list, so
    /// a policy change is a data edit.
    /// </summary>
    public bool IsNorthEastern { get; set; }

    public bool IsActive { get; set; } = true;
    public ICollection<District> Districts { get; set; } = [];
}

public class District
{
    public int DistrictId { get; set; }
    public short StateId { get; set; }
    public State State { get; set; } = null!;
    public string? Code { get; set; }
    public string Name { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
}

/// <summary>An NIC-2008 two-digit manufacturing division.</summary>
public class Sector : IAuditable, IConcurrencyAware
{
    public short SectorId { get; set; }
    public string NicCode { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public bool IsActive { get; set; } = true;

    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<SectorParameter> SectorParameters { get; set; } = [];
}

/// <summary>A LEAN parameter, e.g. <c>LP-01 5S — Workplace Organisation</c>.</summary>
public class Parameter : IAuditable, IConcurrencyAware
{
    public short ParameterId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public short SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }
}

/// <summary>
/// Which parameters apply to a sector. A parameter with no rows here applies
/// to every sector.
/// </summary>
public class SectorParameter
{
    public short SectorId { get; set; }
    public Sector Sector { get; set; } = null!;
    public short ParameterId { get; set; }
    public Parameter Parameter { get; set; } = null!;
    public bool IsMandatory { get; set; } = true;
}

public class TechnologyCategory
{
    public short TechnologyCategoryId { get; set; }

    /// <summary>The short code an administrator files it under, e.g. TC-01.</summary>
    public string Code { get; set; } = string.Empty;

    public string Name { get; set; } = string.Empty;
    public short SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class Technology : IAuditable, IConcurrencyAware
{
    public short TechnologyId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public short TechnologyCategoryId { get; set; }
    public TechnologyCategory TechnologyCategory { get; set; } = null!;

    /// <summary>Null means "All Sectors".</summary>
    public short? SectorId { get; set; }
    public Sector? Sector { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }
}

public class LookupType
{
    public short LookupTypeId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public bool IsSystem { get; set; }
    public ICollection<LookupValue> Values { get; set; } = [];
}

public class LookupValue
{
    public int LookupValueId { get; set; }
    public short LookupTypeId { get; set; }
    public LookupType LookupType { get; set; } = null!;
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public short SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// A document in the shared library. Files live on disk; only metadata is held
/// here, which keeps the database small enough to restore quickly.
/// </summary>
public class Document : IAuditable, ISoftDeletable, IConcurrencyAware
{
    public int DocumentId { get; set; }
    public string Title { get; set; } = string.Empty;
    public string? Description { get; set; }
    public int? CategoryLookupId { get; set; }
    public LookupValue? Category { get; set; }

    public int? CurrentVersionId { get; set; }
    public DocumentVersion? CurrentVersion { get; set; }

    /// <summary>
    /// Set when the document is a hosted video rather than an uploaded file —
    /// a YouTube walkthrough, say. Such a document has no file version, which
    /// is why the version above has always been optional.
    /// </summary>
    public string? VideoUrl { get; set; }

    public bool IsActive { get; set; } = true;
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public bool IsDeleted { get; set; }
    public byte[]? RowVersion { get; set; }

    public ICollection<DocumentVersion> Versions { get; set; } = [];
    public ICollection<DocumentAudience> Audiences { get; set; } = [];
}

public class DocumentVersion
{
    public int DocumentVersionId { get; set; }
    public int DocumentId { get; set; }
    public Document Document { get; set; } = null!;
    public string VersionLabel { get; set; } = string.Empty;
    public string OriginalFileName { get; set; } = string.Empty;

    /// <summary>
    /// A GUID-based name. The uploaded name is never used on disk, so a
    /// crafted file name cannot escape the upload folder.
    /// </summary>
    public string StoredFileName { get; set; } = string.Empty;

    public string RelativePath { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public long FileSizeBytes { get; set; }
    public byte[]? Sha256Hash { get; set; }
    public bool IsLive { get; set; }
    public int UploadedByUserId { get; set; }
    public ApplicationUser UploadedBy { get; set; } = null!;
    public DateTime UploadedOnUtc { get; set; }
}

/// <summary>Which account types a document is visible to.</summary>
public class DocumentAudience
{
    public int DocumentId { get; set; }
    public Document Document { get; set; } = null!;
    public byte AccountTypeId { get; set; }
    public AccountType AccountType { get; set; } = null!;
}

/// <summary>
/// A section of the ESG checklist — Environmental, Social or Governance — that
/// groups the questions an applicant answers on the LEAN Silver application.
/// </summary>
public class EsgSection
{
    public short EsgSectionId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public short SortOrder { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<EsgQuestion> Questions { get; set; } = [];
}

/// <summary>
/// One ESG question. Its options are always Yes / No / Not Applicable, so they
/// are not stored — the answer set is a constant.
///
/// A conditional question sets <see cref="ParentQuestionId"/> and
/// <see cref="ShowWhenAnswer"/>: it appears only when the parent was answered
/// that way. A null parent is the ordinary, always-shown question.
/// </summary>
public class EsgQuestion
{
    public int EsgQuestionId { get; set; }
    public short EsgSectionId { get; set; }
    public EsgSection Section { get; set; } = null!;

    public string Code { get; set; } = string.Empty;
    public string Text { get; set; } = string.Empty;
    public string? HelpText { get; set; }
    public short SortOrder { get; set; }

    public int? ParentQuestionId { get; set; }
    public EsgQuestion? Parent { get; set; }

    /// <summary>"Yes" or "No" — the parent answer that reveals this question.</summary>
    public string? ShowWhenAnswer { get; set; }

    public bool IsActive { get; set; } = true;
}

/// <summary>
/// A configurable item on the application's Basic Information step — a site
/// photograph, a Yes/No declaration, a text field or a tick list. Held as data
/// so the form can change without a release.
/// </summary>
public class BasicInfoItem
{
    public short BasicInfoItemId { get; set; }
    public string Code { get; set; } = string.Empty;

    /// <summary>The screen group it sits under, e.g. Photographs, Process &amp; Energy.</summary>
    public string GroupName { get; set; } = string.Empty;
    public string Label { get; set; } = string.Empty;
    public string? HelpText { get; set; }

    /// <summary>photo | yesno | text | number | checklist.</summary>
    public string InputType { get; set; } = "text";

    public bool IsRequired { get; set; } = true;
    public short SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// One required document on the application's document-upload step — the
/// pictures and certificates the desk assessor works from.
/// </summary>
public class DocumentRequirement
{
    public short DocumentRequirementId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? HelpText { get; set; }

    /// <summary>Null applies the requirement to every level.</summary>
    public byte? CertificationLevelId { get; set; }

    /// <summary>MIME allow-list the picker enforces, e.g. "image/*,application/pdf".</summary>
    public string AcceptedTypes { get; set; } = "image/*,application/pdf";

    public bool IsMandatory { get; set; } = true;
    public short SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

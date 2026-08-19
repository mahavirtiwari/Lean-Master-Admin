using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Application.Common.Models;
using MCLS.Domain.Entities.Master;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The Upload Documents module: scheme guidelines, circulars and forms
/// published to one or more account types.
///
/// A document is a container and its file is a version, so replacing a
/// guideline keeps the old PDF retrievable — which matters when an assessment
/// was carried out against the earlier revision. Downloads are streamed by this
/// controller rather than served from the web root, so the audience check
/// actually applies.
/// </summary>
[ApiController]
[Route("api/documents")]
public sealed class DocumentsController(
    MclsDbContext db,
    IFileStorage files,
    ICurrentUser currentUser,
    IDateTimeProvider clock) : ControllerBase
{
    /// <summary>The document list, with search and category filter.</summary>
    [HttpGet]
    [HasPermission(Permissions.Documents, Permissions.View)]
    public async Task<IActionResult> GetDocuments(
        [FromQuery] string? search,
        [FromQuery] int? categoryId,
        [FromQuery] byte? accountTypeId,
        [FromQuery] bool? isActive,
        [FromQuery] int pageNumber = 1,
        [FromQuery] int pageSize = 25,
        CancellationToken ct = default)
    {
        var query = db.Documents.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(d => d.Title.Contains(term));
        }

        if (categoryId is { } category) query = query.Where(d => d.CategoryLookupId == category);
        if (accountTypeId is { } audience) query = query.Where(d => d.Audiences.Any(a => a.AccountTypeId == audience));
        if (isActive is { } active) query = query.Where(d => d.IsActive == active);

        var total = await query.CountAsync(ct);

        var items = await query
            .OrderByDescending(d => d.CreatedOnUtc)
            .Skip((pageNumber - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new DocumentDto(
                d.DocumentId,
                d.Title,
                d.Description,
                d.CategoryLookupId,
                d.Category != null ? d.Category.Name : null,
                d.IsActive,
                d.CreatedOnUtc,
                d.CurrentVersion != null ? d.CurrentVersion.VersionLabel : null,
                d.CurrentVersion != null ? d.CurrentVersion.OriginalFileName : null,
                d.CurrentVersion != null ? d.CurrentVersion.FileSizeBytes : null,
                d.CurrentVersion != null ? d.CurrentVersion.UploadedOnUtc : null,
                d.Versions.Count,
                d.CurrentVersion != null ? d.CurrentVersion.UploadedBy.FullName : null,
                d.Audiences.Select(a => a.AccountTypeId).ToList()))
            .ToListAsync(ct);

        return Ok(PagedResult<DocumentDto>.Create(items, total, pageNumber, pageSize));
    }

    /// <summary>
    /// The audiences a document can be published to — the ten columns of the
    /// role matrix.
    ///
    /// This is deliberately not <c>/api/users/account-types</c>: that one is
    /// filtered to the nine User Management administers, and MSME Enterprise
    /// has to appear here.
    /// </summary>
    [HttpGet("audiences")]
    [HasPermission(Permissions.Documents, Permissions.View)]
    public async Task<IActionResult> GetAudiences(CancellationToken ct)
        => Ok(await db.AccountTypes.AsNoTracking()
            .Where(a => a.IsActive)
            .OrderBy(a => a.SortOrder)
            .Select(a => new DocumentAudienceDto(a.AccountTypeId, a.Code, a.Name, a.ShortName))
            .ToListAsync(ct));

    /// <summary>The counters above the list.</summary>
    [HttpGet("summary")]
    [HasPermission(Permissions.Documents, Permissions.View)]
    public async Task<IActionResult> GetSummary(CancellationToken ct)
        => Ok(new
        {
            total = await db.Documents.CountAsync(ct),
            active = await db.Documents.CountAsync(d => d.IsActive, ct),
            versions = await db.DocumentVersions.CountAsync(ct),
            categories = await db.Documents
                .Where(d => d.CategoryLookupId != null)
                .Select(d => d.CategoryLookupId).Distinct().CountAsync(ct),
        });

    /// <summary>One document with its version history, for the View Document screen.</summary>
    [HttpGet("{id:int}")]
    [HasPermission(Permissions.Documents, Permissions.View)]
    public async Task<IActionResult> GetDocument(int id, CancellationToken ct)
    {
        var document = await db.Documents.AsNoTracking()
            .Where(d => d.DocumentId == id)
            .Select(d => new DocumentDetailDto(
                d.DocumentId,
                d.Title,
                d.Description,
                d.CategoryLookupId,
                d.Category != null ? d.Category.Name : null,
                d.IsActive,
                d.CreatedOnUtc,
                d.Audiences.Select(a => a.AccountTypeId).ToList(),
                d.Versions
                    .OrderByDescending(v => v.UploadedOnUtc)
                    .Select(v => new DocumentVersionDto(
                        v.DocumentVersionId, v.VersionLabel, v.OriginalFileName,
                        v.ContentType, v.FileSizeBytes, v.IsLive,
                        v.UploadedOnUtc, v.UploadedBy.FullName))
                    .ToList()))
            .SingleOrDefaultAsync(ct);

        return document is null ? NotFound() : Ok(document);
    }

    /// <summary>
    /// Uploads a document and its first version. Multipart rather than JSON
    /// because the file travels with the metadata in one request.
    /// </summary>
    [HttpPost]
    [HasPermission(Permissions.Documents, Permissions.Create)]
    [RequestSizeLimit(26_214_400)]
    public async Task<IActionResult> CreateDocument([FromForm] DocumentUploadRequest request, CancellationToken ct)
    {
        if (request.File is null || request.File.Length == 0)
        {
            ModelState.AddModelError(nameof(request.File), "Choose a file to upload.");
            return ValidationProblem(ModelState);
        }

        if (!files.IsExtensionAllowed(request.File.FileName))
        {
            ModelState.AddModelError(nameof(request.File), "That file type is not accepted.");
            return ValidationProblem(ModelState);
        }

        await using var upload = request.File.OpenReadStream();
        var stored = await files.SaveAsync(upload, request.File.FileName, "documents", ct);

        var document = new Document
        {
            Title = request.Title.Trim(),
            Description = request.Description?.Trim(),
            CategoryLookupId = request.CategoryLookupId,
            IsActive = true,
        };

        foreach (var accountTypeId in request.AccountTypeIds.Distinct())
        {
            document.Audiences.Add(new DocumentAudience { AccountTypeId = accountTypeId });
        }

        var version = new DocumentVersion
        {
            VersionLabel = string.IsNullOrWhiteSpace(request.VersionLabel) ? "v1.0" : request.VersionLabel.Trim(),
            OriginalFileName = request.File.FileName,
            StoredFileName = stored.StoredFileName,
            RelativePath = stored.RelativePath,
            ContentType = request.File.ContentType,
            FileSizeBytes = stored.SizeBytes,
            Sha256Hash = stored.Sha256,
            IsLive = true,
            UploadedByUserId = currentUser.UserId ?? 0,
            UploadedOnUtc = clock.UtcNow,
        };

        document.Versions.Add(version);

        db.Documents.Add(document);
        await db.SaveChangesAsync(ct);

        // Set only after the insert, because the version's key does not exist
        // until it has been written.
        document.CurrentVersionId = version.DocumentVersionId;
        await db.SaveChangesAsync(ct);

        return CreatedAtAction(nameof(GetDocument), new { id = document.DocumentId }, null);
    }

    /// <summary>The Edit Document screen. Metadata only; a new file is a new version.</summary>
    [HttpPut("{id:int}")]
    [HasPermission(Permissions.Documents, Permissions.Edit)]
    public async Task<IActionResult> UpdateDocument(int id, [FromBody] DocumentSaveRequest request, CancellationToken ct)
    {
        var document = await db.Documents
            .AsTracking()
            .Include(d => d.Audiences)
            .SingleOrDefaultAsync(d => d.DocumentId == id, ct);

        if (document is null) return NotFound();

        document.Title = request.Title.Trim();
        document.Description = request.Description?.Trim();
        document.CategoryLookupId = request.CategoryLookupId;
        document.IsActive = request.IsActive;

        document.Audiences.Clear();
        foreach (var accountTypeId in request.AccountTypeIds.Distinct())
        {
            document.Audiences.Add(new DocumentAudience { AccountTypeId = accountTypeId });
        }

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// The Delete Document dialog. Soft delete: the row is hidden by the global
    /// query filter, and the stored files stay put so anything already
    /// referencing a version keeps resolving.
    /// </summary>
    [HttpDelete("{id:int}")]
    [HasPermission(Permissions.Documents, Permissions.Delete)]
    public async Task<IActionResult> DeleteDocument(int id, CancellationToken ct)
    {
        var document = await db.Documents.AsTracking().SingleOrDefaultAsync(d => d.DocumentId == id, ct);
        if (document is null) return NotFound();

        document.IsDeleted = true;
        document.IsActive = false;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>Streams a version's file.</summary>
    [HttpGet("{id:int}/versions/{versionId:int}/download")]
    [HasPermission(Permissions.Documents, Permissions.View)]
    public async Task<IActionResult> Download(int id, int versionId, CancellationToken ct)
    {
        var version = await db.DocumentVersions.AsNoTracking()
            .SingleOrDefaultAsync(v => v.DocumentVersionId == versionId && v.DocumentId == id, ct);

        if (version is null) return NotFound();

        var stream = await files.OpenReadAsync(version.RelativePath, version.StoredFileName, ct);

        return File(stream, version.ContentType, version.OriginalFileName);
    }
}

public sealed record DocumentDto(
    int DocumentId,
    string Title,
    string? Description,
    int? CategoryLookupId,
    string? CategoryName,
    bool IsActive,
    DateTime CreatedOnUtc,
    string? CurrentVersionLabel,
    string? CurrentFileName,
    long? CurrentFileSizeBytes,
    DateTime? CurrentUploadedOnUtc,
    int VersionCount,
    string? UploadedByName,
    IReadOnlyList<byte> AccountTypeIds);

public sealed record DocumentDetailDto(
    int DocumentId,
    string Title,
    string? Description,
    int? CategoryLookupId,
    string? CategoryName,
    bool IsActive,
    DateTime CreatedOnUtc,
    IReadOnlyList<byte> AccountTypeIds,
    IReadOnlyList<DocumentVersionDto> Versions);

public sealed record DocumentVersionDto(
    int DocumentVersionId,
    string VersionLabel,
    string OriginalFileName,
    string ContentType,
    long FileSizeBytes,
    bool IsLive,
    DateTime UploadedOnUtc,
    string UploadedByName);

public sealed class DocumentUploadRequest
{
    [Required, StringLength(250)]
    public string Title { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; init; }

    public int? CategoryLookupId { get; init; }

    [StringLength(20)]
    public string? VersionLabel { get; init; }

    public List<byte> AccountTypeIds { get; init; } = [];

    public IFormFile? File { get; init; }
}

public sealed class DocumentSaveRequest
{
    [Required, StringLength(250)]
    public string Title { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; init; }

    public int? CategoryLookupId { get; init; }

    public bool IsActive { get; init; } = true;

    public List<byte> AccountTypeIds { get; init; } = [];
}

public sealed record DocumentAudienceDto(byte AccountTypeId, string Code, string Name, string ShortName);

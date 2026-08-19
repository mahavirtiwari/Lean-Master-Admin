using System.Globalization;
using System.Security.Cryptography;
using MCLS.Application.Common.Interfaces;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MCLS.Infrastructure.Files;

public sealed class FileStorageOptions
{
    public const string SectionName = "FileStorage";

    /// <summary>
    /// Absolute path to the upload root. Must sit OUTSIDE the site's wwwroot
    /// so no upload is directly reachable over HTTP — every download goes
    /// through an authorised controller action.
    /// </summary>
    public string RootPath { get; set; } = @"D:\MCLS\Uploads";

    public long MaxFileSizeBytes { get; set; } = 25 * 1024 * 1024;

    public string[] AllowedExtensions { get; set; } =
        [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".png", ".jpg", ".jpeg"];
}

/// <summary>
/// Stores uploads on the server's file system (a local disk, or a UNC share
/// when the API is load balanced).
///
/// The uploaded file name is never used on disk: a GUID name is generated and
/// the original is kept only as metadata. That removes path traversal,
/// overwriting and reserved-name problems in one step rather than trying to
/// sanitise the supplied name.
/// </summary>
public sealed class LocalFileStorage(
    IOptions<FileStorageOptions> options,
    ILogger<LocalFileStorage> logger) : IFileStorage
{
    private readonly FileStorageOptions _options = options.Value;

    public bool IsExtensionAllowed(string fileName)
    {
        var ext = Path.GetExtension(fileName);
        return !string.IsNullOrEmpty(ext)
            && _options.AllowedExtensions.Contains(ext, StringComparer.OrdinalIgnoreCase);
    }

    public async Task<(string StoredFileName, string RelativePath, long SizeBytes, byte[] Sha256)> SaveAsync(
        Stream content, string originalFileName, string subFolder, CancellationToken ct = default)
    {
        if (!IsExtensionAllowed(originalFileName))
        {
            throw new InvalidOperationException(
                $"'{Path.GetExtension(originalFileName)}' is not a permitted file type.");
        }

        // Date-partitioned so no single directory accumulates enough entries to
        // slow down NTFS enumeration.
        var relativePath = Path.Combine(
            SanitiseSegment(subFolder),
            DateTime.UtcNow.ToString("yyyy", CultureInfo.InvariantCulture),
            DateTime.UtcNow.ToString("MM", CultureInfo.InvariantCulture));

        var absoluteDir = Path.Combine(_options.RootPath, relativePath);
        Directory.CreateDirectory(absoluteDir);

        var storedName = $"{Guid.NewGuid():N}{Path.GetExtension(originalFileName).ToLowerInvariant()}";
        var absolutePath = Path.Combine(absoluteDir, storedName);

        long size;
        byte[] hash;

        await using (var file = new FileStream(
            absolutePath, FileMode.CreateNew, FileAccess.Write, FileShare.None,
            bufferSize: 81920, useAsync: true))
        {
            // Hash while writing rather than re-reading the file afterwards.
            using var sha = SHA256.Create();
            await using var crypto = new CryptoStream(file, sha, CryptoStreamMode.Write, leaveOpen: true);

            await content.CopyToAsync(crypto, ct);
            await crypto.FlushFinalBlockAsync(ct);

            size = file.Length;
            hash = sha.Hash ?? [];
        }

        if (size > _options.MaxFileSizeBytes)
        {
            // Enforced after the write because the length is only known then
            // for a chunked upload. Remove what was written.
            File.Delete(absolutePath);
            throw new InvalidOperationException(
                $"The file exceeds the {_options.MaxFileSizeBytes / (1024 * 1024)} MB limit.");
        }

        logger.LogInformation("Stored upload {StoredName} ({Size} bytes) under {Path}",
            storedName, size, relativePath);

        return (storedName, relativePath, size, hash);
    }

    public Task<Stream> OpenReadAsync(string relativePath, string storedFileName, CancellationToken ct = default)
    {
        var absolutePath = ResolveWithinRoot(relativePath, storedFileName);

        if (!File.Exists(absolutePath))
        {
            throw new FileNotFoundException("The stored file is missing.", storedFileName);
        }

        Stream stream = new FileStream(
            absolutePath, FileMode.Open, FileAccess.Read, FileShare.Read,
            bufferSize: 81920, useAsync: true);

        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string relativePath, string storedFileName, CancellationToken ct = default)
    {
        var absolutePath = ResolveWithinRoot(relativePath, storedFileName);

        if (File.Exists(absolutePath))
        {
            File.Delete(absolutePath);
        }

        return Task.CompletedTask;
    }

    /// <summary>
    /// Resolves a stored path and proves it is inside the configured root.
    /// Even though stored names are generated, this guards against a corrupted
    /// or tampered database row pointing somewhere it should not.
    /// </summary>
    private string ResolveWithinRoot(string relativePath, string storedFileName)
    {
        var root = Path.GetFullPath(_options.RootPath);
        var candidate = Path.GetFullPath(Path.Combine(root, relativePath, storedFileName));

        if (!candidate.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase))
        {
            throw new UnauthorizedAccessException("The resolved path escapes the storage root.");
        }

        return candidate;
    }

    private static string SanitiseSegment(string segment)
    {
        var cleaned = new string(segment
            .Where(c => char.IsLetterOrDigit(c) || c is '-' or '_')
            .ToArray());

        return string.IsNullOrEmpty(cleaned) ? "misc" : cleaned;
    }
}

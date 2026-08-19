namespace MCLS.Application.Common.Models;

/// <summary>
/// A page of rows plus the count the grid needs for its pager.
/// </summary>
public sealed class PagedResult<T>
{
    public IReadOnlyList<T> Items { get; init; } = [];
    public int TotalCount { get; init; }
    public int PageNumber { get; init; }
    public int PageSize { get; init; }

    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasPrevious => PageNumber > 1;
    public bool HasNext => PageNumber < TotalPages;

    public static PagedResult<T> Create(IReadOnlyList<T> items, int totalCount, int pageNumber, int pageSize)
        => new() { Items = items, TotalCount = totalCount, PageNumber = pageNumber, PageSize = pageSize };
}

/// <summary>
/// Query parameters shared by every list screen. Clamped in the setters rather
/// than at each call site, so a caller cannot ask for a million rows.
/// </summary>
public class PagedQuery
{
    private const int MaxPageSize = 200;

    private int _pageNumber = 1;
    private int _pageSize = 25;

    public int PageNumber
    {
        get => _pageNumber;
        set => _pageNumber = value < 1 ? 1 : value;
    }

    public int PageSize
    {
        get => _pageSize;
        set => _pageSize = value switch
        {
            < 1 => 25,
            > MaxPageSize => MaxPageSize,
            _ => value,
        };
    }

    /// <summary>Free-text search across the columns the screen searches.</summary>
    public string? Search { get; set; }

    /// <summary>Column to sort by. Validated against an allow-list per query.</summary>
    public string? SortBy { get; set; }

    public bool SortDescending { get; set; }
}

/// <summary>
/// The outcome of an operation that can fail for an expected reason.
/// Exceptions stay for the unexpected; this covers "the user asked for
/// something that is not allowed", which is not exceptional.
/// </summary>
public readonly record struct Result
{
    private Result(bool succeeded, string? error, ResultErrorKind kind)
    {
        Succeeded = succeeded;
        Error = error;
        Kind = kind;
    }

    public bool Succeeded { get; }
    public string? Error { get; }
    public ResultErrorKind Kind { get; }

    public static Result Success() => new(true, null, ResultErrorKind.None);
    public static Result Failure(string error) => new(false, error, ResultErrorKind.Validation);
    public static Result NotFound(string error) => new(false, error, ResultErrorKind.NotFound);
    public static Result Forbidden(string error) => new(false, error, ResultErrorKind.Forbidden);
    public static Result Conflict(string error) => new(false, error, ResultErrorKind.Conflict);
}

/// <inheritdoc cref="Result"/>
public readonly record struct Result<T>
{
    private Result(bool succeeded, T? value, string? error, ResultErrorKind kind)
    {
        Succeeded = succeeded;
        Value = value;
        Error = error;
        Kind = kind;
    }

    public bool Succeeded { get; }
    public T? Value { get; }
    public string? Error { get; }
    public ResultErrorKind Kind { get; }

    public static Result<T> Success(T value) => new(true, value, null, ResultErrorKind.None);
    public static Result<T> Failure(string error) => new(false, default, error, ResultErrorKind.Validation);
    public static Result<T> NotFound(string error) => new(false, default, error, ResultErrorKind.NotFound);
    public static Result<T> Forbidden(string error) => new(false, default, error, ResultErrorKind.Forbidden);
    public static Result<T> Conflict(string error) => new(false, default, error, ResultErrorKind.Conflict);
}

/// <summary>
/// Why a <see cref="Result"/> failed. The API maps these onto status codes in
/// one place, so a handler never picks an HTTP code itself.
/// </summary>
public enum ResultErrorKind
{
    None = 0,
    Validation,
    NotFound,
    Forbidden,
    Conflict,
}

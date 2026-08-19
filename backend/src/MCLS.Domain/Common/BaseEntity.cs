namespace MCLS.Domain.Common;

/// <summary>
/// Marks an entity whose creation and modification are tracked. The audit
/// interceptor fills these in on <c>SaveChanges</c>, so no handler has to
/// remember to set them.
/// </summary>
public interface IAuditable
{
    DateTime CreatedOnUtc { get; set; }
    int? CreatedByUserId { get; set; }
    DateTime? ModifiedOnUtc { get; set; }
    int? ModifiedByUserId { get; set; }
}

/// <summary>
/// Marks an entity that is hidden rather than removed. Queries filter these
/// out through a global query filter configured in <c>MclsDbContext</c>.
/// </summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; set; }
}

/// <summary>
/// Marks an entity carrying a SQL Server <c>rowversion</c>. EF Core turns this
/// into an optimistic-concurrency token: a stale update throws
/// <see cref="Microsoft.EntityFrameworkCore.DbUpdateConcurrencyException"/>
/// rather than silently overwriting another user's edit.
/// </summary>
public interface IConcurrencyAware
{
    byte[]? RowVersion { get; set; }
}

/// <summary>
/// Base for entities with an <see cref="int"/> surrogate key.
/// </summary>
public abstract class BaseEntity
{
    public int Id { get; set; }
}

/// <summary>
/// Base for the common case: integer key, audit columns and a concurrency
/// token.
/// </summary>
public abstract class AuditableEntity : BaseEntity, IAuditable, IConcurrencyAware
{
    public DateTime CreatedOnUtc { get; set; }
    public int? CreatedByUserId { get; set; }
    public DateTime? ModifiedOnUtc { get; set; }
    public int? ModifiedByUserId { get; set; }
    public byte[]? RowVersion { get; set; }
}

namespace MCLS.Domain.Entities.Master;

/// <summary>
/// Why a master record was switched on or off.
///
/// One log for sectors, parameters and technologies: the question is the same
/// everywhere, and a shared history can be read in one place. The label is kept
/// beside the id because the name on the row may have been edited by the time
/// anybody reads this back.
/// </summary>
public class StatusChangeLog
{
    public long StatusChangeLogId { get; set; }

    /// <summary>Sector, Parameter or Technology.</summary>
    public string EntityName { get; set; } = string.Empty;
    public int EntityId { get; set; }
    public string? EntityLabel { get; set; }

    public bool FromActive { get; set; }
    public bool ToActive { get; set; }
    public string Reason { get; set; } = string.Empty;

    public int? ChangedByUserId { get; set; }
    public DateTime ChangedOnUtc { get; set; }
}

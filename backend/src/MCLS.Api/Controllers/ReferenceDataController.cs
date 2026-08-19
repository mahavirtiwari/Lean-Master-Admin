using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// The dropdown lists every form needs: geography, roles, organisations,
/// lookups, sectors and the fee reference tables.
///
/// One controller rather than a lookup endpoint bolted onto each feature: these
/// are read-only reference data, they change rarely, and a form typically needs
/// three or four of them at once.
///
/// Authorisation is <c>[Authorize]</c> only, not a module permission. Requiring
/// e.g. <c>SECTORS.view</c> to populate a sector dropdown would mean a
/// consultant filling in an enterprise form needed rights to the Sectors admin
/// screen. The data here is non-sensitive reference material; the sensitive
/// part is what you can *do* with it, which the feature endpoints still gate.
/// </summary>
[ApiController]
[Route("api/reference")]
public sealed class ReferenceDataController(
    MclsDbContext db,
    ICurrentUser currentUser) : ControllerBase
{
    /// <summary>States and union territories.</summary>
    [HttpGet("states")]
    public async Task<IActionResult> GetStates(CancellationToken ct)
    {
        var states = await db.States
            .AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.Name)
            .Select(s => new StateDto(s.StateId, s.Code, s.Name, s.IsUnionTerritory, s.IsNorthEastern))
            .ToListAsync(ct);

        return Ok(states);
    }

    /// <summary>
    /// Districts, optionally narrowed to one state. Without the filter this is
    /// the whole list, which the client can cache and filter itself.
    /// </summary>
    [HttpGet("districts")]
    public async Task<IActionResult> GetDistricts([FromQuery] short? stateId, CancellationToken ct)
    {
        var query = db.Districts.AsNoTracking().Where(d => d.IsActive);

        if (stateId is { } id)
        {
            query = query.Where(d => d.StateId == id);
        }

        var districts = await query
            .OrderBy(d => d.Name)
            .Select(d => new DistrictDto(d.DistrictId, d.StateId, d.Name))
            .ToListAsync(ct);

        return Ok(districts);
    }

    /// <summary>
    /// Roles for one account type.
    ///
    /// Scoped to the account types the caller may administer: without that, the
    /// create-user form would happily offer Super Admin to anyone who could
    /// reach it, and the only thing stopping the escalation would be the check
    /// in <c>UsersController.CreateUser</c>. Defence in depth.
    /// </summary>
    [HttpGet("roles")]
    public async Task<IActionResult> GetRoles([FromQuery] byte? accountTypeId, CancellationToken ct)
    {
        var scope = currentUser.ManageableAccountTypes;

        var query = db.Roles.AsNoTracking().Where(r => r.IsActive);

        if (accountTypeId is { } typeId)
        {
            if (scope.Count > 0 && !scope.Contains(typeId))
            {
                return Forbid();
            }
            query = query.Where(r => r.AccountTypeId == typeId);
        }
        else if (scope.Count > 0)
        {
            query = query.Where(r => scope.Contains(r.AccountTypeId));
        }

        var roles = await query
            .OrderBy(r => r.Name)
            .Select(r => new RoleDto(r.Id, r.Code, r.Name!, r.AccountTypeId, r.Description))
            .ToListAsync(ct);

        return Ok(roles);
    }

    /// <summary>The nine account types.</summary>
    [HttpGet("account-types")]
    public async Task<IActionResult> GetAccountTypes(CancellationToken ct)
    {
        var types = await db.AccountTypes
            .AsNoTracking()
            // MSME Enterprise is a document audience, not a selectable account type
            // on the user forms this feeds.
            .Where(a => a.IsUserManaged)
            .Where(a => a.IsActive)
            .OrderBy(a => a.SortOrder)
            .Select(a => new AccountTypeDto(
                a.AccountTypeId, a.Code, a.Name, a.ShortName, a.Description,
                a.CanCreateDirectly, a.RequiresOrganisation))
            .ToListAsync(ct);

        return Ok(types);
    }

    /// <summary>Organisations, optionally of one account type.</summary>
    [HttpGet("organisations")]
    public async Task<IActionResult> GetOrganisations(
        [FromQuery] byte? accountTypeId, CancellationToken ct)
    {
        var query = db.Organisations.AsNoTracking().Where(o => o.IsActive);

        if (accountTypeId is { } typeId)
        {
            query = query.Where(o => o.AccountTypeId == typeId);
        }

        var organisations = await query
            .OrderBy(o => o.Name)
            .Select(o => new OrganisationDto(
                o.OrganisationId, o.OrganisationCode, o.Name, o.AccountTypeId,
                o.StateId, o.JurisdictionScope))
            .ToListAsync(ct);

        return Ok(organisations);
    }

    /// <summary>
    /// Values from one admin-editable lookup list, by its type code — e.g.
    /// <c>AGENCY_CATEGORY</c>, <c>DOCUMENT_CATEGORY</c>, <c>KPI_UNIT</c>.
    /// </summary>
    [HttpGet("lookups/{typeCode}")]
    public async Task<IActionResult> GetLookup(string typeCode, CancellationToken ct)
    {
        var values = await db.LookupValues
            .AsNoTracking()
            .Where(v => v.IsActive && v.LookupType.Code == typeCode)
            .OrderBy(v => v.SortOrder)
            .Select(v => new LookupDto(v.LookupValueId, v.Code, v.Name))
            .ToListAsync(ct);

        // An unknown type code is a client bug, not an empty list — say so
        // rather than silently rendering an empty dropdown.
        if (values.Count == 0 &&
            !await db.LookupTypes.AnyAsync(t => t.Code == typeCode, ct))
        {
            return NotFound(new { message = $"No lookup list named '{typeCode}'." });
        }

        return Ok(values);
    }

    /// <summary>NIC sectors.</summary>
    [HttpGet("sectors")]
    public async Task<IActionResult> GetSectors([FromQuery] bool includeInactive, CancellationToken ct)
    {
        var query = db.Sectors.AsNoTracking();
        if (!includeInactive) query = query.Where(s => s.IsActive);

        var sectors = await query
            .OrderBy(s => s.NicCode)
            .Select(s => new SectorDto(s.SectorId, s.NicCode, s.Name, s.IsActive))
            .ToListAsync(ct);

        return Ok(sectors);
    }

    /// <summary>LEAN parameters (LP-01 .. LP-10).</summary>
    [HttpGet("parameters")]
    public async Task<IActionResult> GetParameters([FromQuery] bool includeInactive, CancellationToken ct)
    {
        var query = db.Parameters.AsNoTracking();
        if (!includeInactive) query = query.Where(p => p.IsActive);

        var parameters = await query
            .OrderBy(p => p.SortOrder)
            .Select(p => new ParameterDto(p.ParameterId, p.Code, p.Name, p.Description, p.IsActive))
            .ToListAsync(ct);

        return Ok(parameters);
    }

    /// <summary>Bronze / Silver / Gold.</summary>
    [HttpGet("certification-levels")]
    public async Task<IActionResult> GetCertificationLevels(CancellationToken ct)
    {
        var levels = await db.CertificationLevels
            .AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .Select(c => new CertificationLevelDto(
                c.CertificationLevelId, c.Code, c.Name, c.RequiresAssessment))
            .ToListAsync(ct);

        return Ok(levels);
    }

    /// <summary>Subsidy categories with their combined percentage.</summary>
    [HttpGet("subsidy-categories")]
    public async Task<IActionResult> GetSubsidyCategories(CancellationToken ct)
    {
        var categories = await db.SubsidyCategories
            .AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .Select(c => new SubsidyCategoryDto(
                c.SubsidyCategoryId, c.Code, c.Name,
                c.BaseSubsidyPercent, c.AdditionalPercent, c.TotalSubsidyPercent))
            .ToListAsync(ct);

        return Ok(categories);
    }

    /// <summary>The application statuses, for filter dropdowns.</summary>
    [HttpGet("application-statuses")]
    public async Task<IActionResult> GetApplicationStatuses(
        [FromQuery] string? stage, CancellationToken ct)
    {
        var query = db.ApplicationStatuses.AsNoTracking();

        if (!string.IsNullOrWhiteSpace(stage))
        {
            query = query.Where(s => s.Stage == stage);
        }

        var statuses = await query
            .OrderBy(s => s.SortOrder)
            .Select(s => new ApplicationStatusDto(
                s.ApplicationStatusId, s.Code, s.Name, s.Stage, s.BadgeColour))
            .ToListAsync(ct);

        return Ok(statuses);
    }

    /// <summary>
    /// Everything the Create New User form needs, in one call.
    ///
    /// The form opens with four dropdowns to populate; four round trips on a
    /// government network is a visible delay, and they are always needed
    /// together.
    /// </summary>
    [HttpGet("user-form")]
    [HasPermission(Permissions.UserManagement, Permissions.Create)]
    public async Task<IActionResult> GetUserFormReferenceData(CancellationToken ct)
    {
        var scope = currentUser.ManageableAccountTypes;

        var accountTypes = await db.AccountTypes
            .AsNoTracking()
            .Where(a => a.IsActive && (scope.Count == 0 || scope.Contains(a.AccountTypeId)))
            .OrderBy(a => a.SortOrder)
            .Select(a => new AccountTypeDto(
                a.AccountTypeId, a.Code, a.Name, a.ShortName, a.Description,
                a.CanCreateDirectly, a.RequiresOrganisation))
            .ToListAsync(ct);

        var visibleTypeIds = accountTypes.Select(a => a.AccountTypeId).ToList();

        var roles = await db.Roles
            .AsNoTracking()
            .Where(r => r.IsActive && visibleTypeIds.Contains(r.AccountTypeId))
            .OrderBy(r => r.Name)
            .Select(r => new RoleDto(r.Id, r.Code, r.Name!, r.AccountTypeId, r.Description))
            .ToListAsync(ct);

        var states = await db.States
            .AsNoTracking()
            .Where(s => s.IsActive)
            .OrderBy(s => s.Name)
            .Select(s => new StateDto(s.StateId, s.Code, s.Name, s.IsUnionTerritory, s.IsNorthEastern))
            .ToListAsync(ct);

        var districts = await db.Districts
            .AsNoTracking()
            .Where(d => d.IsActive)
            .OrderBy(d => d.Name)
            .Select(d => new DistrictDto(d.DistrictId, d.StateId, d.Name))
            .ToListAsync(ct);

        var agencyCategories = await db.LookupValues
            .AsNoTracking()
            .Where(v => v.IsActive && v.LookupType.Code == "AGENCY_CATEGORY")
            .OrderBy(v => v.SortOrder)
            .Select(v => new LookupDto(v.LookupValueId, v.Code, v.Name))
            .ToListAsync(ct);

        var organisations = await db.Organisations
            .AsNoTracking()
            .Where(o => o.IsActive && visibleTypeIds.Contains(o.AccountTypeId))
            .OrderBy(o => o.Name)
            .Select(o => new OrganisationDto(
                o.OrganisationId, o.OrganisationCode, o.Name, o.AccountTypeId,
                o.StateId, o.JurisdictionScope))
            .ToListAsync(ct);

        return Ok(new UserFormReferenceData(
            accountTypes, roles, states, districts, agencyCategories, organisations));
    }
}

// ------------------------------------------------------------- contracts ----

public sealed record StateDto(
    short StateId, string Code, string Name, bool IsUnionTerritory, bool IsNorthEastern);

public sealed record DistrictDto(int DistrictId, short StateId, string Name);

public sealed record RoleDto(
    int RoleId, string Code, string Name, byte AccountTypeId, string? Description);

public sealed record AccountTypeDto(
    byte AccountTypeId, string Code, string Name, string ShortName,
    string? Description, bool CanCreateDirectly, bool RequiresOrganisation);

public sealed record OrganisationDto(
    int OrganisationId, string OrganisationCode, string Name, byte AccountTypeId,
    short? StateId, string? JurisdictionScope);

public sealed record LookupDto(int LookupValueId, string Code, string Name);

public sealed record SectorDto(short SectorId, string NicCode, string Name, bool IsActive);

public sealed record ParameterDto(
    short ParameterId, string Code, string Name, string? Description, bool IsActive);

public sealed record CertificationLevelDto(
    byte CertificationLevelId, string Code, string Name, bool RequiresAssessment);

public sealed record SubsidyCategoryDto(
    byte SubsidyCategoryId, string Code, string Name,
    decimal BaseSubsidyPercent, decimal AdditionalPercent, decimal TotalSubsidyPercent);

public sealed record ApplicationStatusDto(
    byte ApplicationStatusId, string Code, string Name, string Stage, string? BadgeColour);

/// <summary>Everything the Create New User form needs, in one payload.</summary>
public sealed record UserFormReferenceData(
    IReadOnlyList<AccountTypeDto> AccountTypes,
    IReadOnlyList<RoleDto> Roles,
    IReadOnlyList<StateDto> States,
    IReadOnlyList<DistrictDto> Districts,
    IReadOnlyList<LookupDto> AgencyCategories,
    IReadOnlyList<OrganisationDto> Organisations);

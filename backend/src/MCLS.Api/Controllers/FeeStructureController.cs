using System.ComponentModel.DataAnnotations;
using MCLS.Api.Authorization;
using MCLS.Domain.Entities.Fee;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// Certification fees, the GoI subsidy categories that split them, and the TDS
/// rates applied to the MSME share.
///
/// The split is the part worth stating once, because the screen shows the
/// result rather than the rule: the fee is divided by subsidy category first,
/// and GST and TDS then apply to the MSME share only — the Government share
/// carries neither. The stored fee is GST-inclusive, so the taxable value is
/// the MSME share divided by (1 + GST%), not multiplied by it.
/// </summary>
[ApiController]
[Route("api/fee-structure")]
public sealed class FeeStructureController(MclsDbContext db) : ControllerBase
{
    /// <summary>
    /// The "Certification Fee by Level" table. <paramref name="subsidyCategoryCode"/>
    /// selects the share percentage; the design's default is the General rate.
    /// </summary>
    [HttpGet]
    [HasPermission(Permissions.FeeStructure, Permissions.View)]
    public async Task<IActionResult> GetFeeStructure(
        [FromQuery] string subsidyCategoryCode = "GENERAL",
        CancellationToken ct = default)
    {
        var category = await db.SubsidyCategories.AsNoTracking()
            .SingleOrDefaultAsync(c => c.Code == subsidyCategoryCode && c.IsActive, ct)
            ?? await db.SubsidyCategories.AsNoTracking()
                .OrderBy(c => c.SortOrder).FirstAsync(ct);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        // Only the rate in force today: a level accumulates historical rows as
        // fees are revised, and the screen shows the current one.
        var rates = await db.FeeRates.AsNoTracking()
            .Where(r => r.EffectiveFrom <= today && (r.EffectiveTo == null || r.EffectiveTo >= today))
            .OrderBy(r => r.CertificationLevel.SortOrder)
            .Select(r => new
            {
                r.FeeRateId,
                r.CertificationLevelId,
                LevelName = r.CertificationLevel.Name,
                r.AmountInclusiveGst,
                r.GstPercent,
                r.EffectiveFrom,
                r.EffectiveTo,
                r.Notes,
            })
            .ToListAsync(ct);

        var goiPercent = category.TotalSubsidyPercent;

        var rows = rates.Select(r =>
        {
            var goiShare = decimal.Round(r.AmountInclusiveGst * goiPercent / 100m, 2);
            var msmeShare = r.AmountInclusiveGst - goiShare;
            var taxable = decimal.Round(msmeShare / (1m + r.GstPercent / 100m), 2);

            return new FeeStructureRowDto(
                r.FeeRateId,
                r.CertificationLevelId,
                r.LevelName,
                r.AmountInclusiveGst,
                r.GstPercent,
                goiShare,
                msmeShare,
                taxable,
                msmeShare - taxable,
                r.EffectiveFrom,
                r.EffectiveTo,
                r.Notes,
                IsActive: true);
        }).ToList();

        return Ok(new
        {
            subsidyCategory = new
            {
                category.SubsidyCategoryId,
                category.Code,
                category.Name,
                goiPercent,
                msmePercent = 100m - goiPercent,
            },
            gstPercent = rows.Count > 0 ? rows[0].GstPercent : 18m,
            rows,
        });
    }

    /// <summary>
    /// One certification level in full: its fee and rates, the payment
    /// structure across every subsidy category, and the TDS deductions.
    ///
    /// The arithmetic is the scheme's and is done here rather than in the
    /// browser, so the figure on screen and the figure on an invoice come from
    /// the same place:
    ///
    ///   GoI share    = fee x subsidy%          (carries neither GST nor TDS)
    ///   MSME share   = fee - GoI share         (GST-inclusive)
    ///   MSME taxable = MSME share / (1 + GST%) (the base for TDS)
    ///   GST          = MSME share - taxable
    ///
    /// TDS is then applied to the taxable value: 194C for implementing
    /// agencies, 194J for consultants and assessors.
    /// </summary>
    [HttpGet("level/{code}")]
    [HasPermission(Permissions.FeeStructure, Permissions.View)]
    public async Task<IActionResult> GetLevel(string code, CancellationToken ct)
    {
        var levelCode = code.Trim().ToUpperInvariant();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var level = await db.CertificationLevels.AsNoTracking()
            .SingleOrDefaultAsync(l => l.Code == levelCode, ct);

        if (level is null) return NotFound();

        var rate = await db.FeeRates.AsNoTracking()
            .Where(r => r.CertificationLevelId == level.CertificationLevelId
                     && r.EffectiveFrom <= today
                     && (r.EffectiveTo == null || r.EffectiveTo >= today))
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync(ct);

        var fee = rate?.AmountInclusiveGst ?? 0m;
        var gstPercent = rate?.GstPercent ?? 18m;

        var tds = await db.TdsSections.AsNoTracking()
            .Where(t => t.EffectiveFrom <= today && (t.EffectiveTo == null || t.EffectiveTo >= today))
            .ToListAsync(ct);

        var tds194C = tds.FirstOrDefault(t => t.SectionCode == "194C")?.RatePercent ?? 0m;
        var tds194J = tds.FirstOrDefault(t => t.SectionCode == "194J")?.RatePercent ?? 0m;

        var categories = await db.SubsidyCategories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .ToListAsync(ct);

        var rows = categories.Select(c =>
        {
            var goiShare = decimal.Round(fee * c.TotalSubsidyPercent / 100m, 2);
            var msmeShare = fee - goiShare;
            var taxable = decimal.Round(msmeShare / (1m + gstPercent / 100m), 2);

            return new
            {
                code = c.Code,
                name = c.Name,
                subsidyPercent = c.TotalSubsidyPercent,
                goiShare,
                msmeShare,
                gstAmount = msmeShare - taxable,
                msmeTaxable = taxable,
                // TDS is deducted from the taxable value, never from the gross.
                tds194C = decimal.Round(taxable * tds194C / 100m, 2),
                tds194J = decimal.Round(taxable * tds194J / 100m, 2),
                netAfter194C = decimal.Round(msmeShare - taxable * tds194C / 100m, 2),
                netAfter194J = decimal.Round(msmeShare - taxable * tds194J / 100m, 2),
            };
        }).ToList();

        return Ok(new
        {
            certificationLevelId = level.CertificationLevelId,
            code = level.Code,
            name = level.Name,
            feeRateId = rate?.FeeRateId,
            fee,
            gstPercent,
            tds194CPercent = tds194C,
            tds194JPercent = tds194J,
            isFree = fee == 0m,
            rows,
        });
    }

    /// <summary>The subsidy categories behind the share percentages.</summary>
    [HttpGet("subsidy-categories")]
    [HasPermission(Permissions.FeeStructure, Permissions.View)]
    public async Task<IActionResult> GetSubsidyCategories(CancellationToken ct)
        => Ok(await db.SubsidyCategories.AsNoTracking()
            .Where(c => c.IsActive)
            .OrderBy(c => c.SortOrder)
            .Select(c => new SubsidyCategoryRowDto(
                c.SubsidyCategoryId, c.Code, c.Name,
                c.BaseSubsidyPercent, c.AdditionalPercent, c.TotalSubsidyPercent))
            .ToListAsync(ct));

    /// <summary>Edits one level's fee.</summary>
    [HttpPut("rates/{id:int}")]
    [HasPermission(Permissions.FeeStructure, Permissions.Edit)]
    public async Task<IActionResult> UpdateFeeRate(int id, [FromBody] FeeRateSaveRequest request, CancellationToken ct)
    {
        var rate = await db.FeeRates.AsTracking().SingleOrDefaultAsync(r => r.FeeRateId == id, ct);
        if (rate is null) return NotFound();

        rate.AmountInclusiveGst = request.AmountInclusiveGst;
        rate.GstPercent = request.GstPercent;
        rate.Notes = request.Notes?.Trim();

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Saves the "Certification Fee &amp; Rates" card: the level's fee and GST,
    /// plus both TDS rates. The TDS rates are scheme-wide, so editing them here
    /// changes them for every level — which is what the screen intends.
    /// </summary>
    [HttpPut("level/{code}")]
    [HasPermission(Permissions.FeeStructure, Permissions.Edit)]
    public async Task<IActionResult> UpdateLevel(
        string code, [FromBody] LevelRatesSaveRequest request, CancellationToken ct)
    {
        var levelCode = code.Trim().ToUpperInvariant();
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        var level = await db.CertificationLevels.AsNoTracking()
            .SingleOrDefaultAsync(l => l.Code == levelCode, ct);

        if (level is null) return NotFound();

        var rate = await db.FeeRates.AsTracking()
            .Where(r => r.CertificationLevelId == level.CertificationLevelId
                     && r.EffectiveFrom <= today
                     && (r.EffectiveTo == null || r.EffectiveTo >= today))
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefaultAsync(ct);

        if (rate is null) return NotFound();

        rate.AmountInclusiveGst = request.Fee;
        rate.GstPercent = request.GstPercent;

        var sections = await db.TdsSections.AsTracking()
            .Where(t => t.EffectiveFrom <= today && (t.EffectiveTo == null || t.EffectiveTo >= today))
            .ToListAsync(ct);

        var c194 = sections.FirstOrDefault(t => t.SectionCode == "194C");
        var j194 = sections.FirstOrDefault(t => t.SectionCode == "194J");

        if (c194 is not null) c194.RatePercent = request.Tds194CPercent;
        if (j194 is not null) j194.RatePercent = request.Tds194JPercent;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>The TDS rate table shown below the fees.</summary>
    [HttpGet("tds")]
    [HasPermission(Permissions.FeeStructure, Permissions.View)]
    public async Task<IActionResult> GetTdsSections(CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(DateTime.UtcNow);

        return Ok(await db.TdsSections.AsNoTracking()
            .Where(t => t.EffectiveFrom <= today && (t.EffectiveTo == null || t.EffectiveTo >= today))
            .OrderBy(t => t.SectionCode)
            .Select(t => new TdsSectionDto(
                t.TdsSectionId, t.SectionCode, t.Description,
                t.RatePercent, t.ApplicableTo, t.EffectiveFrom, t.EffectiveTo))
            .ToListAsync(ct));
    }

    /// <summary>The Edit TDS Rate screen.</summary>
    [HttpPut("tds/{id:int}")]
    [HasPermission(Permissions.FeeStructure, Permissions.Edit)]
    public async Task<IActionResult> UpdateTdsSection(int id, [FromBody] TdsSectionSaveRequest request, CancellationToken ct)
    {
        var section = await db.TdsSections.AsTracking().SingleOrDefaultAsync(t => t.TdsSectionId == id, ct);
        if (section is null) return NotFound();

        section.RatePercent = request.RatePercent;
        section.Description = request.Description.Trim();
        section.ApplicableTo = request.ApplicableTo.Trim();

        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

public sealed record FeeStructureRowDto(
    int FeeRateId,
    byte CertificationLevelId,
    string LevelName,
    decimal AmountInclusiveGst,
    decimal GstPercent,
    decimal GoiShare,
    decimal MsmeShare,
    decimal MsmeTaxable,
    decimal GstAmount,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo,
    string? Notes,
    bool IsActive);

public sealed record SubsidyCategoryRowDto(
    byte SubsidyCategoryId,
    string Code,
    string Name,
    decimal BaseSubsidyPercent,
    decimal AdditionalPercent,
    decimal TotalSubsidyPercent);

public sealed record TdsSectionDto(
    int TdsSectionId,
    string SectionCode,
    string Description,
    decimal RatePercent,
    string ApplicableTo,
    DateOnly EffectiveFrom,
    DateOnly? EffectiveTo);

public sealed class FeeRateSaveRequest
{
    [Range(0, 100_000_000)]
    public decimal AmountInclusiveGst { get; init; }

    [Range(0, 100)]
    public decimal GstPercent { get; init; } = 18m;

    [StringLength(500)]
    public string? Notes { get; init; }
}

public sealed class TdsSectionSaveRequest
{
    [Range(0, 100)]
    public decimal RatePercent { get; init; }

    [Required, StringLength(300)]
    public string Description { get; init; } = string.Empty;

    [Required, StringLength(200)]
    public string ApplicableTo { get; init; } = string.Empty;
}

public sealed class LevelRatesSaveRequest
{
    [Range(0, 100_000_000)]
    public decimal Fee { get; init; }

    [Range(0, 100)]
    public decimal GstPercent { get; init; } = 18m;

    [Range(0, 100)]
    public decimal Tds194CPercent { get; init; }

    [Range(0, 100)]
    public decimal Tds194JPercent { get; init; }
}

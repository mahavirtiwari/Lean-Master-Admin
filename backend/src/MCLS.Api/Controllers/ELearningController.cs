using System.ComponentModel.DataAnnotations;

using MCLS.Api.Authorization;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Msme;
using MCLS.Domain.Enums;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Controllers;

/// <summary>
/// E-Learning — the LEAN Bronze course list.
///
/// One shared list, not one per enterprise: every participant takes every
/// active course and then the single exam on the LMS. A course carries a title
/// and a description, which is what the enterprise sees in Courses &amp; Exam.
///
/// Courses are disabled rather than deleted once anything has been studied
/// against them, on the same reasoning as Sectors: a participant's "8 of 11"
/// means nothing if the eleven can silently become ten.
/// </summary>
[ApiController]
[Route("api/e-learning")]
[Authorize]
public sealed class ELearningController(MclsDbContext db, ICurrentUser currentUser) : ControllerBase
{
    /// <summary>The course list behind E-Learning, newest sort order first.</summary>
    [HttpGet("courses")]
    [HasPermission(Permissions.ELearning, Permissions.View)]
    public async Task<IActionResult> GetCourses(
        [FromQuery] bool includeInactive = false,
        [FromQuery] string? search = null,
        CancellationToken ct = default)
    {
        var query = db.BronzeCourses.AsNoTracking();

        if (!includeInactive) query = query.Where(c => c.IsActive);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var term = search.Trim();
            query = query.Where(c => c.Title.Contains(term)
                                  || (c.Description != null && c.Description.Contains(term)));
        }

        var courses = await query
            .OrderBy(c => c.SortOrder).ThenBy(c => c.BronzeCourseId)
            .Select(c => new
            {
                c.BronzeCourseId,
                c.SortOrder,
                c.Title,
                c.Description,
                c.IsActive,
            })
            .ToListAsync(ct);

        return Ok(new { courses });
    }

    /// <summary>Adds a course to the end of the list.</summary>
    [HttpPost("courses")]
    [HasPermission(Permissions.ELearning, Permissions.Create)]
    public async Task<IActionResult> CreateCourse([FromBody] CourseSaveRequest request, CancellationToken ct)
    {
        var title = request.Title.Trim();

        if (await db.BronzeCourses.AnyAsync(c => c.Title == title, ct))
        {
            return Conflict(new { message = "A course with that name already exists." });
        }

        // Appended rather than inserted: the order the administrator sees is the
        // order participants study in, and a new course belongs at the end until
        // it is moved.
        var nextOrder = await db.BronzeCourses.AnyAsync(ct)
            ? await db.BronzeCourses.MaxAsync(c => (int)c.SortOrder, ct) + 1
            : 1;

        var course = new BronzeCourse
        {
            Title = title,
            Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim(),
            SortOrder = (byte)Math.Clamp(request.SortOrder ?? nextOrder, 1, 255),
            IsActive = true,
            CreatedOnUtc = DateTime.UtcNow,
        };

        db.BronzeCourses.Add(course);
        await db.SaveChangesAsync(ct);

        return Ok(new { course.BronzeCourseId });
    }

    /// <summary>Renames a course or rewrites what it covers.</summary>
    [HttpPut("courses/{id:int}")]
    [HasPermission(Permissions.ELearning, Permissions.Edit)]
    public async Task<IActionResult> UpdateCourse(int id, [FromBody] CourseSaveRequest request, CancellationToken ct)
    {
        // AsTracking: the context is NoTracking by default, so without it the
        // edits below would be made to a detached object and SaveChanges would
        // report success having written nothing.
        var course = await db.BronzeCourses.AsTracking()
            .FirstOrDefaultAsync(c => c.BronzeCourseId == id, ct);

        if (course is null) return NotFound(new { message = "That course does not exist." });

        var title = request.Title.Trim();

        if (await db.BronzeCourses.AnyAsync(c => c.Title == title && c.BronzeCourseId != id, ct))
        {
            return Conflict(new { message = "A course with that name already exists." });
        }

        course.Title = title;
        course.Description = string.IsNullOrWhiteSpace(request.Description) ? null : request.Description.Trim();
        if (request.SortOrder is int order) course.SortOrder = (byte)Math.Clamp(order, 1, 255);
        course.ModifiedOnUtc = DateTime.UtcNow;
        course.ModifiedByUserId = currentUser.UserId;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }

    /// <summary>
    /// Takes a course out of the list, or puts it back.
    ///
    /// Disabled rather than deleted: participants' progress is counted against
    /// the active courses, so removing a row outright would rewrite what
    /// "8 of 11 courses" meant for everyone who has already studied it.
    /// </summary>
    [HttpPost("courses/{id:int}/status")]
    [HasPermission(Permissions.ELearning, Permissions.Edit)]
    public async Task<IActionResult> SetCourseStatus(int id, [FromBody] StatusChangeRequest request, CancellationToken ct)
    {
        var course = await db.BronzeCourses.AsTracking()
            .FirstOrDefaultAsync(c => c.BronzeCourseId == id, ct);

        if (course is null) return NotFound(new { message = "That course does not exist." });

        course.IsActive = request.IsActive;
        course.ModifiedOnUtc = DateTime.UtcNow;
        course.ModifiedByUserId = currentUser.UserId;

        await db.SaveChangesAsync(ct);
        return NoContent();
    }
}

public sealed class CourseSaveRequest
{
    [Required, StringLength(200, MinimumLength = 3)]
    public string Title { get; init; } = string.Empty;

    [StringLength(1000)]
    public string? Description { get; init; }

    public int? SortOrder { get; init; }
}

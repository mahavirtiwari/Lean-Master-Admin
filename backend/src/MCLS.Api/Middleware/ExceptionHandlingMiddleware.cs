using System.Diagnostics;
using System.Text.Json;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Audit;
using MCLS.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace MCLS.Api.Middleware;

/// <summary>
/// Turns an unhandled exception into an RFC 7807 problem response and records
/// it in <c>audit.ErrorLog</c>.
///
/// The response carries a correlation id and nothing else about the failure.
/// The detail goes to the log, so a stack trace or a connection string can
/// never reach a browser, while support can still find the exact row from the
/// id the user quotes.
/// </summary>
public sealed class ExceptionHandlingMiddleware(
    RequestDelegate next,
    ILogger<ExceptionHandlingMiddleware> logger,
    IHostEnvironment environment)
{
    /// <summary>
    /// "Client closed request". Not a standard code and not in
    /// <see cref="StatusCodes"/>, but the honest answer when the caller has
    /// already gone away.
    /// </summary>
    private const int ClientClosedRequest = 499;

    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (Exception ex)
        {
            await HandleAsync(context, ex);
        }
    }

    private async Task HandleAsync(HttpContext context, Exception ex)
    {
        // A short id the user can quote. The active trace id is logged
        // alongside it, so a support call maps to both the row and the trace.
        var correlationId = Guid.NewGuid();
        var traceId = Activity.Current?.TraceId.ToString();

        var (status, title) = ex switch
        {
            DbUpdateConcurrencyException => (StatusCodes.Status409Conflict,
                "The record was changed by someone else. Reload and try again."),

            // A unique-index violation reaching here means a race the handler
            // did not guard. 409 is honest: retrying may succeed.
            DbUpdateException { InnerException: Microsoft.Data.SqlClient.SqlException { Number: 2601 or 2627 } }
                => (StatusCodes.Status409Conflict, "That record already exists."),

            UnauthorizedAccessException => (StatusCodes.Status403Forbidden,
                "You do not have permission to perform this action."),

            OperationCanceledException => (ClientClosedRequest,
                "The request was cancelled."),

            _ => (StatusCodes.Status500InternalServerError,
                "An unexpected error occurred. Quote the reference below when reporting it."),
        };

        logger.LogError(ex,
            "Unhandled {ExceptionType} on {Method} {Path}. Correlation {CorrelationId}, trace {TraceId}",
            ex.GetType().Name, context.Request.Method, context.Request.Path, correlationId, traceId);

        // A cancelled request has no client left to answer, and the response
        // may already be on the wire.
        if (status == ClientClosedRequest || context.Response.HasStarted)
        {
            return;
        }

        await TryPersistAsync(context, ex, status, correlationId);

        var problem = new ProblemDetails
        {
            Status = status,
            Title = title,
            Instance = context.Request.Path,
            Type = $"https://httpstatuses.io/{status}",
        };

        problem.Extensions["correlationId"] = correlationId;

        // Only ever expose the exception detail outside production.
        if (!environment.IsProduction())
        {
            problem.Detail = ex.ToString();
        }

        context.Response.Clear();
        context.Response.StatusCode = status;
        context.Response.ContentType = "application/problem+json";

        await context.Response.WriteAsync(JsonSerializer.Serialize(problem, JsonOptions));
    }

    /// <summary>
    /// Writes the error row. Wrapped in its own try/catch: if the database is
    /// what failed, the logging attempt must not replace the original error
    /// with a second one.
    ///
    /// The change tracker is cleared first. Without that, an exception thrown
    /// by the request's own SaveChanges left its pending entries on the
    /// context, this save picked them up, and it threw for the same reason —
    /// so the errors most worth recording were the ones that never appeared.
    /// </summary>
    private async Task TryPersistAsync(HttpContext context, Exception ex, int status, Guid correlationId)
    {
        try
        {
            var db = context.RequestServices.GetService<MclsDbContext>();
            if (db is null) return;

            var currentUser = context.RequestServices.GetService<ICurrentUser>();

            // The request's own context is what failed, and whatever it was
            // holding is still pending on it — so saving the log row would try
            // to save that too and throw again, losing the very error we are
            // here to record. Dropping the pending work first leaves this
            // SaveChanges with nothing but the log row.
            db.ChangeTracker.Clear();

            db.ErrorLogs.Add(new ErrorLog
            {
                OccurredOnUtc = DateTime.UtcNow,
                Severity = status >= 500 ? "Critical" : "Error",
                Source = "MCLS.Api",
                ExceptionType = ex.GetType().FullName,
                // ErrorLog.Message is non-nullable; Exception.Message never is,
                // but Truncate's signature accepts null so the result widens.
                Message = Truncate(ex.Message, 2000) ?? string.Empty,
                StackTrace = ex.StackTrace,
                RequestMethod = context.Request.Method,
                RequestPath = Truncate(context.Request.Path.Value, 500),
                QueryString = Truncate(context.Request.QueryString.Value, 1000),
                StatusCode = status,
                UserId = currentUser?.UserId,
                IpAddress = currentUser?.IpAddress,
                CorrelationId = correlationId,
                MachineName = Environment.MachineName,
            });

            await db.SaveChangesAsync(context.RequestAborted);
        }
        catch (Exception logFailure)
        {
            logger.LogError(logFailure, "Could not write to audit.ErrorLog.");
        }
    }

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    };

    private static string? Truncate(string? value, int max)
        => value is null || value.Length <= max ? value : value[..max];
}

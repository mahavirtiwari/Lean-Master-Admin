using System.Net;
using System.Net.Mail;
using MCLS.Application.Common.Interfaces;
using MCLS.Domain.Entities.Comm;
using MCLS.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MCLS.Infrastructure.Email;

public sealed class SmtpOptions
{
    public const string SectionName = "Smtp";

    public string Host { get; set; } = "localhost";
    public int Port { get; set; } = 587;
    public bool UseStartTls { get; set; } = true;
    public string? UserName { get; set; }
    public string? Password { get; set; }
    public string FromAddress { get; set; } = "no-reply@mcls.gov.in";
    public string FromName { get; set; } = "MCLS Portal";

    /// <summary>How many queued messages one dispatch cycle sends.</summary>
    public int BatchSize { get; set; } = 100;

    /// <summary>Seconds between dispatch cycles.</summary>
    public int PollSeconds { get; set; } = 30;

    public int MaxRetries { get; set; } = 3;

    /// <summary>
    /// When true, messages are marked sent without contacting an SMTP server.
    /// For development and for a UAT environment that must not e-mail real
    /// officials.
    /// </summary>
    public bool PickupDirectoryOnly { get; set; }
}

/// <summary>
/// Writes to the outbox. Nothing is sent on the request thread, so an SMTP
/// outage delays mail but never fails the user action that triggered it.
/// </summary>
public sealed class EmailQueueService(
    MclsDbContext db,
    IDateTimeProvider clock,
    ILogger<EmailQueueService> logger) : IEmailQueue
{
    public async Task QueueTemplatedAsync(
        string templateCode,
        string toAddress,
        int? toUserId,
        IReadOnlyDictionary<string, string> mergeValues,
        CancellationToken ct = default)
    {
        var template = await db.EmailTemplates
            .AsNoTracking()
            .SingleOrDefaultAsync(t => t.Code == templateCode && t.IsActive, ct);

        if (template is null)
        {
            // A missing template is a configuration fault, not a user error.
            // Log and carry on rather than failing the caller's operation.
            logger.LogError("E-mail template {TemplateCode} was not found; message not queued.", templateCode);
            return;
        }

        db.EmailMessages.Add(new EmailMessage
        {
            EmailTemplateId = template.EmailTemplateId,
            ToAddress = toAddress,
            ToUserId = toUserId,
            Subject = Merge(template.Subject, mergeValues),
            BodyHtml = MailShell.Wrap(Merge(template.BodyHtml, mergeValues)),
            Status = "Queued",
            QueuedOnUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
    }

    public async Task QueueRawAsync(
        string toAddress, string subject, string bodyHtml, int? toUserId = null, CancellationToken ct = default)
    {
        db.EmailMessages.Add(new EmailMessage
        {
            ToAddress = toAddress,
            ToUserId = toUserId,
            Subject = subject,
            BodyHtml = bodyHtml,
            Status = "Queued",
            QueuedOnUtc = clock.UtcNow,
        });

        await db.SaveChangesAsync(ct);
    }

    /// <summary>
    /// Substitutes <c>{{tag}}</c> placeholders. Values are HTML-encoded, so a
    /// unit name containing markup cannot inject into the message body.
    /// </summary>
    private static string Merge(string template, IReadOnlyDictionary<string, string> values)
    {
        if (values.Count == 0) return template;

        var result = template;
        foreach (var (key, value) in values)
        {
            var token = key.StartsWith("{{", StringComparison.Ordinal) ? key : $"{{{{{key}}}}}";
            result = result.Replace(token, WebUtility.HtmlEncode(value), StringComparison.Ordinal);
        }

        return result;
    }
}


/// <summary>
/// The letterhead every message is wrapped in.
///
/// It lives here rather than inside each stored template because the template
/// editor is a plain-text box: it strips a body to text to display it and
/// writes that text back on save, so a frame kept in the body is lost the
/// first time anybody opens the template and presses Save. Templates hold
/// their content; this supplies the frame.
/// </summary>
public static class MailShell
{
    private const string Open = """
        <div style="margin:0;padding:0;background:#F4F7F5;">
          <table width="100%" bgcolor="#F0F8F3" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="padding:28px 12px;">
              <table width="600" bgcolor="#ffffff" cellpadding="0" cellspacing="0" border="0"
                     style="max-width:600px;border-radius:8px;overflow:hidden;border:1px solid #DEE7E1;">
                <tr><td align="center" style="padding:22px;border-bottom:3px solid #0F7B45;">
                  <div style="font:700 19px Segoe UI,Arial,sans-serif;color:#16211A;">MSME Competitive (LEAN) Scheme</div>
                  <div style="font:400 11px Segoe UI,Arial,sans-serif;color:#5D6B62;padding-top:4px;">
                    Ministry of Micro, Small &amp; Medium Enterprises, Government of India</div>
                </td></tr>
                <tr><td bgcolor="#FFFFFF"
                        style="padding:26px 34px;background:#FFFFFF;font:400 13px/22px Segoe UI,Arial,sans-serif;color:#16211A;">
        """;

    private const string Close = """
                </td></tr>
              </table>
              <div style="padding-top:22px;font:400 11px Segoe UI,Arial,sans-serif;color:#5D6B62;">
                &copy; 2026 MSME Competitive (LEAN) Scheme</div>
            </td></tr>
          </table>
        </div>
        """;

    /// <summary>
    /// Wraps a template's content. Content that an administrator has typed as
    /// prose keeps its line breaks; content that is already markup is left
    /// alone, so the detail tables and buttons survive.
    /// </summary>
    public static string Wrap(string content)
    {
        // Prose typed into the editor keeps its line breaks; content that is
        // already markup is left alone, so the detail tables and the buttons
        // survive a round trip through the template screen.
        var body = LooksLikeMarkup(content)
            ? content
            : "<p style=\"margin:0;\">"
              + content.ReplaceLineEndings("<br>")
              + "</p>";

        return Open + body + Close;
    }

    private static bool LooksLikeMarkup(string content)
        => content.Contains('<') && content.Contains('>');
}

/// <summary>
/// Drains the outbox on a timer.
///
/// Claims a batch by flipping it to <c>Sending</c> in one statement before
/// sending anything, so two application-pool workers (or two servers in a
/// farm) cannot pick up the same message.
/// </summary>
public sealed class EmailDispatchService(
    IServiceScopeFactory scopeFactory,
    IOptions<SmtpOptions> options,
    ILogger<EmailDispatchService> logger) : BackgroundService
{
    private readonly SmtpOptions _options = options.Value;

    /// <summary>
    /// The Settings screen (audit.SystemSetting, category "E-mail") is where an
    /// administrator maintains the mail account, so it wins over appsettings.
    /// Anything left blank there falls back to configuration, which is what a
    /// fresh install runs on before anyone opens the screen.
    /// </summary>
    private static SmtpOptions Merge(SmtpOptions fallback, Dictionary<string, string?> saved)
    {
        string? Text(string key) =>
            saved.TryGetValue(key, out var v) && !string.IsNullOrWhiteSpace(v) ? v.Trim() : null;

        int Number(string key, int fallbackValue) =>
            int.TryParse(Text(key), out var n) ? n : fallbackValue;

        bool Flag(string key, bool fallbackValue) =>
            bool.TryParse(Text(key), out var b) ? b : fallbackValue;

        return new SmtpOptions
        {
            Host = Text("Email.SmtpHost") ?? fallback.Host,
            Port = Number("Email.SmtpPort", fallback.Port),
            UseStartTls = Flag("Email.SmtpUseTls", fallback.UseStartTls),
            UserName = Text("Email.SmtpUserName") ?? fallback.UserName,
            Password = Text("Email.SmtpPassword") ?? fallback.Password,
            FromAddress = Text("Email.FromAddress") ?? fallback.FromAddress,
            FromName = Text("Email.FromName") ?? fallback.FromName,
            BatchSize = Number("Email.BatchSize", fallback.BatchSize),
            MaxRetries = Number("Email.MaxRetries", fallback.MaxRetries),
            PollSeconds = fallback.PollSeconds,
            PickupDirectoryOnly = fallback.PickupDirectoryOnly,
        };
    }

    private static readonly string[] SettingKeys =
    [
        "Email.SmtpHost", "Email.SmtpPort", "Email.SmtpUseTls",
        "Email.SmtpUserName", "Email.SmtpPassword",
        "Email.FromAddress", "Email.FromName",
        "Email.BatchSize", "Email.MaxRetries",
    ];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        logger.LogInformation("E-mail dispatch service started; polling every {Seconds}s.", _options.PollSeconds);

        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(Math.Max(5, _options.PollSeconds)));

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await DispatchBatchAsync(stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                // Never let one bad cycle kill the service.
                logger.LogError(ex, "E-mail dispatch cycle failed.");
            }
        }
    }

    private async Task DispatchBatchAsync(CancellationToken ct)
    {
        using var scope = scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<MclsDbContext>();

        // Re-read each cycle: an administrator changing the mail account must
        // take effect without restarting the API.
        var saved = await db.SystemSettings
            .AsNoTracking()
            .Where(x => SettingKeys.Contains(x.Key))
            .ToDictionaryAsync(x => x.Key, x => x.Value, ct);

        var settings = Merge(_options, saved);

        // Claim first, send second.
        var claimed = await db.EmailMessages
            .Where(m => m.Status == "Queued" && m.AttemptCount < settings.MaxRetries)
            .OrderBy(m => m.QueuedOnUtc)
            .Take(settings.BatchSize)
            .Select(m => m.EmailMessageId)
            .ToListAsync(ct);

        if (claimed.Count == 0) return;

        await db.EmailMessages
            .Where(m => claimed.Contains(m.EmailMessageId) && m.Status == "Queued")
            .ExecuteUpdateAsync(s => s
                .SetProperty(m => m.Status, "Sending")
                .SetProperty(m => m.LastAttemptOnUtc, DateTime.UtcNow), ct);

        var messages = await db.EmailMessages
            .AsTracking()
            .Where(m => claimed.Contains(m.EmailMessageId) && m.Status == "Sending")
            .ToListAsync(ct);

        using var client = CreateClient(settings);

        foreach (var message in messages)
        {
            ct.ThrowIfCancellationRequested();

            message.AttemptCount++;
            message.LastAttemptOnUtc = DateTime.UtcNow;

            try
            {
                if (!settings.PickupDirectoryOnly)
                {
                    using var mail = new MailMessage
                    {
                        From = new MailAddress(settings.FromAddress, settings.FromName),
                        Subject = message.Subject,
                        Body = message.BodyHtml,
                        IsBodyHtml = true,
                    };
                    mail.To.Add(message.ToAddress);

                    await client.SendMailAsync(mail, ct);
                }

                message.Status = "Sent";
                message.SentOnUtc = DateTime.UtcNow;
                message.ErrorMessage = null;
            }
            catch (Exception ex)
            {
                // Back to Queued while retries remain, so a transient outage
                // resolves itself on the next cycle.
                message.Status = message.AttemptCount >= settings.MaxRetries ? "Failed" : "Queued";
                message.ErrorMessage = ex.Message.Length > 1000 ? ex.Message[..1000] : ex.Message;

                logger.LogWarning(ex,
                    "Failed to send message {MessageId} to {Recipient} (attempt {Attempt} of {Max}).",
                    message.EmailMessageId, message.ToAddress, message.AttemptCount, settings.MaxRetries);
            }
        }

        await db.SaveChangesAsync(ct);

        // Keep the campaign rollups in step with what actually went out.
        var campaignIds = messages
            .Where(m => m.EmailCampaignId is not null)
            .Select(m => m.EmailCampaignId!.Value)
            .Distinct()
            .ToList();

        foreach (var campaignId in campaignIds)
        {
            var sent = await db.EmailMessages.CountAsync(
                m => m.EmailCampaignId == campaignId && m.Status == "Sent", ct);
            var failed = await db.EmailMessages.CountAsync(
                m => m.EmailCampaignId == campaignId && m.Status == "Failed", ct);
            var pending = await db.EmailMessages.CountAsync(
                m => m.EmailCampaignId == campaignId && (m.Status == "Queued" || m.Status == "Sending"), ct);

            await db.EmailCampaigns
                .Where(c => c.EmailCampaignId == campaignId)
                .ExecuteUpdateAsync(s => s
                    .SetProperty(c => c.SentCount, sent)
                    .SetProperty(c => c.FailedCount, failed)
                    .SetProperty(c => c.Status, pending > 0 ? "Sending" : "Sent")
                    .SetProperty(c => c.SentOnUtc, pending > 0 ? (DateTime?)null : DateTime.UtcNow), ct);
        }
    }

    private static SmtpClient CreateClient(SmtpOptions settings)
    {
        var client = new SmtpClient(settings.Host, settings.Port)
        {
            EnableSsl = settings.UseStartTls,
            DeliveryMethod = SmtpDeliveryMethod.Network,
            Timeout = 30_000,
        };

        if (!string.IsNullOrWhiteSpace(settings.UserName))
        {
            client.Credentials = new NetworkCredential(settings.UserName, settings.Password);
        }
        else
        {
            // An internal relay that authorises by IP rather than credentials.
            client.UseDefaultCredentials = false;
        }

        return client;
    }
}

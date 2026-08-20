using System.Globalization;
using System.Xml.Linq;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace MCLS.Infrastructure.Udyam;

/// <summary>
/// Configuration for the Udyam registry lookup.
///
/// <see cref="Token"/> is a credential and must never be committed. It is read
/// from user secrets in development and from an environment variable or the IIS
/// configuration editor in production, exactly like Jwt:SigningKey.
/// </summary>
public sealed class UdyamOptions
{
    public const string SectionName = "Udyam";

    public string BaseUrl { get; set; } =
        "https://udyogaadhaar.gov.in/sv/UAMRestServiceAssist.svc";

    public string Token { get; set; } = string.Empty;

    public int TimeoutSeconds { get; set; } = 30;

    /// <summary>Turns the lookup off entirely, e.g. for an offline demo.</summary>
    public bool Enabled { get; set; } = true;
}

/// <summary>What the registry knows about an enterprise.</summary>
public sealed record UdyamRecord(
    string UdyamNumber,
    string? ApplicationId,
    string? OwnerName,
    string? EnterpriseName,
    string? OrganisationType,
    string? SocialCategory,
    string? Gender,
    bool? IsPhysicallyHandicapped,
    string? Pan,
    string? Address,
    string? StateName,
    string? StateCode,
    string? DistrictName,
    string? DistrictCode,
    string? Pincode,
    string? MajorActivity,
    string? EnterpriseType,
    DateOnly? IncorporationDate,
    DateOnly? CommencementDate,
    int? TotalEmployees,
    string? NicTwoDigit,
    string? NicFourDigit,
    string? NicFiveDigit,
    string? NicDescription,
    bool? WhetherProductionCommenced,
    string? DicName,
    DateOnly? AppliedDate,
    IReadOnlyList<UdyamActivity> Activities,
    IReadOnlyList<UdyamPlant> Plants,
    // The response verbatim, so a field the registry adds later can be
    // backfilled without re-fetching every record.
    string RawXml);

/// <summary>One NIC activity. The registry may report several.</summary>
public sealed record UdyamActivity(
    string? ApplicationId,
    string? Activity,
    string? NicTwoDigit,
    string? NicTwoDigitName,
    string? NicFourDigit,
    string? NicFourDigitName,
    string? NicFiveDigit,
    string? NicFiveDigitName);

/// <summary>One plant or unit, with its own address and district.</summary>
public sealed record UdyamPlant(
    string? ApplicationId,
    string? UnitIdNo,
    string? UnitName,
    string? UamNo,
    string? PlantIdNo,
    string? Address,
    string? Pincode,
    string? StateName,
    string? DistrictName,
    string? DistrictCode);

public interface IUdyamRegistry
{
    /// <summary>
    /// Looks an enterprise up. Returns null when the registry has no such
    /// record or the mobile number does not match the one on it.
    /// </summary>
    Task<UdyamRecord?> GetAsync(string udyamNumber, string mobile, CancellationToken ct = default);
}

/// <summary>
/// Reads the Ministry's Udyam registry.
///
/// The service answers with XML, not JSON, and returns HTTP 200 with an empty
/// or error-shaped body when a number is unknown — so a 200 is not on its own
/// evidence of a hit, and the response has to be inspected.
///
/// Three fields are the reason this exists at all: LG_ST_Code and LG_DT_Code
/// let the portal resolve the address against master.State / master.District by
/// code rather than by matching spelling, and Two_DigitActivity maps onto
/// master.Sector.NicCode. Gender, SocialCategory and EnterpriseType then feed
/// the dashboard's demographic panels.
/// </summary>
public sealed class UdyamRegistryClient(
    HttpClient http,
    IOptions<UdyamOptions> options,
    ILogger<UdyamRegistryClient> logger) : IUdyamRegistry
{
    private readonly UdyamOptions _options = options.Value;

    public async Task<UdyamRecord?> GetAsync(
        string udyamNumber, string mobile, CancellationToken ct = default)
    {
        if (!_options.Enabled)
        {
            logger.LogInformation("Udyam lookup is disabled by configuration.");
            return null;
        }

        if (string.IsNullOrWhiteSpace(_options.Token))
        {
            throw new InvalidOperationException(
                "Udyam:Token is not configured. Set it via user secrets in development " +
                "or an environment variable in production.");
        }

        // The service takes its three arguments as one comma-separated path
        // segment rather than as a query string.
        var path = $"GetUdyam/{Uri.EscapeDataString(udyamNumber.Trim())}," +
                   $"{Uri.EscapeDataString(mobile.Trim())}," +
                   $"{_options.Token}";

        string xml;

        try
        {
            using var response = await http.GetAsync(path, ct);

            if (!response.IsSuccessStatusCode)
            {
                logger.LogWarning(
                    "Udyam lookup for {Udyam} returned {Status}.",
                    udyamNumber, (int)response.StatusCode);
                return null;
            }

            xml = await response.Content.ReadAsStringAsync(ct);
        }
        catch (Exception ex) when (ex is HttpRequestException or TaskCanceledException)
        {
            // The registry being unreachable must not take the portal down with
            // it; the caller falls back to manual entry.
            logger.LogWarning(ex, "Udyam registry unreachable for {Udyam}.", udyamNumber);
            return null;
        }

        return Parse(udyamNumber, xml, logger);
    }

    /// <summary>
    /// Turns a registry response into a record. Public because the registration
    /// wizard re-parses the payload it stored at step 2 on every later step,
    /// rather than calling the registry again — the applicant should not be
    /// blocked by the registry going down midway through the form.
    /// </summary>
    public static UdyamRecord? Parse(string udyamNumber, string xml, ILogger logger)
    {
        if (string.IsNullOrWhiteSpace(xml)) return null;

        XDocument doc;

        try
        {
            doc = XDocument.Parse(xml);
        }
        catch (System.Xml.XmlException ex)
        {
            logger.LogWarning(ex, "Udyam returned a body that is not XML for {Udyam}.", udyamNumber);
            return null;
        }

        var basic = doc.Root?.Element("BasicDetail");

        // An unknown number still comes back 200, with no BasicDetail.
        if (basic is null)
        {
            logger.LogInformation("Udyam has no record for {Udyam}.", udyamNumber);
            return null;
        }

        // A refusal is also a 200, shaped like a record:
        //   <UdyogAadharNo>NO</UdyogAadharNo><Error>Wrong Detail</Error><ErrorCode>1</ErrorCode>
        // Checking only that UdyogAadharNo is non-empty accepted that as a hit,
        // because the literal text is "NO" — so a WRONG MOBILE NUMBER passed
        // verification and produced an enterprise with no plants or activities.
        // ErrorCode is the authoritative signal; the sentinel is belt and braces.
        var errorCode = Value(basic, "ErrorCode");
        var errorText = Value(basic, "Error");
        var number = Value(basic, "UdyogAadharNo");

        if (!string.IsNullOrWhiteSpace(errorCode) && errorCode != "0")
        {
            logger.LogInformation(
                "Udyam refused {Udyam}: {Code} {Error}.", udyamNumber, errorCode, errorText);
            return null;
        }

        if (string.IsNullOrWhiteSpace(number)
            || number.Equals("NO", StringComparison.OrdinalIgnoreCase))
        {
            logger.LogInformation("Udyam has no record for {Udyam}.", udyamNumber);
            return null;
        }

        // Both blocks repeat. The sample record carries one of each, but a unit
        // with several NIC activities across several plants is ordinary, so
        // every child is read rather than just the first.
        var activityElements = doc.Root?.Element("ActivityDetail")?.Elements("Activities").ToList()
            ?? [];
        var plantElements = doc.Root?.Element("PlantDetail")?.Elements("Plant").ToList()
            ?? [];

        var activities = activityElements.Select(a => new UdyamActivity(
            Value(a, "ApplicationId"),
            Value(a, "Activity"),
            CodeOf(Value(a, "Two_DigitActivity")),
            TextOf(Value(a, "Two_DigitActivity")),
            CodeOf(Value(a, "Four_DigitActivity")),
            TextOf(Value(a, "Four_DigitActivity")),
            CodeOf(Value(a, "Five_DigitActivity")),
            TextOf(Value(a, "Five_DigitActivity")))).ToList();

        var plants = plantElements.Select(pl => new UdyamPlant(
            Value(pl, "ApplicationId"),
            Value(pl, "UnitIdNo"),
            Value(pl, "UnitName"),
            Value(pl, "UAM_No"),
            Value(pl, "PlantIdNo"),
            Value(pl, "PAddress"),
            Value(pl, "PPin"),
            Titleise(Value(pl, "state_name")),
            Titleise(Value(pl, "DISTRICT_NAME")),
            Value(pl, "LG_DT_Code"))).ToList();

        // The first activity is the enterprise's headline NIC.
        var activity = activityElements.FirstOrDefault();

        return new UdyamRecord(
            Value(basic, "UdyogAadharNo") ?? udyamNumber,
            Value(basic, "ApplicationId"),
            Value(basic, "OwnerName"),
            Value(basic, "EnterpriseName"),
            Value(basic, "OrganisationType"),
            Value(basic, "SocialCategory"),
            Value(basic, "Gender"),
            YesNo(Value(basic, "PH")),
            Value(basic, "PanNo"),
            Value(basic, "Address"),
            Titleise(Value(basic, "state_name")),
            Value(basic, "LG_ST_Code"),
            Titleise(Value(basic, "DISTRICT_NAME")),
            Value(basic, "LG_DT_Code"),
            Value(basic, "PINCode"),
            Value(basic, "MajorActivity"),
            Value(basic, "EnterpriseType"),
            ParseDate(Value(basic, "IncorporationDate")),
            ParseDate(Value(basic, "CommmenceDate")),   // sic: the registry's spelling
            ParseInt(Value(basic, "TotalEmp")),
            CodeOf(Value(activity, "Two_DigitActivity")),
            CodeOf(Value(activity, "Four_DigitActivity")),
            CodeOf(Value(activity, "Five_DigitActivity")),
            TextOf(Value(activity, "Five_DigitActivity"))
                ?? TextOf(Value(activity, "Two_DigitActivity")),
            YesNo(Value(basic, "WhetherProdCommenced")),
            Value(basic, "Dic_Name"),
            ParseDate(Value(basic, "AppliedDate")),
            activities,
            plants,
            xml);
    }

    private static string? Value(XElement? parent, string name)
    {
        var raw = parent?.Element(name)?.Value?.Trim();
        return string.IsNullOrEmpty(raw) ? null : raw;
    }

    private static bool? YesNo(string? value) => value switch
    {
        null => null,
        _ => value.Equals("Yes", StringComparison.OrdinalIgnoreCase),
    };

    /// <summary>Registry dates are dd/MM/yyyy.</summary>
    private static DateOnly? ParseDate(string? value)
        => DateOnly.TryParseExact(value, "dd/MM/yyyy", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var parsed)
            ? parsed
            : null;

    private static int? ParseInt(string? value)
        => int.TryParse(value, out var parsed) ? parsed : null;

    /// <summary>"32-Other manufacturing" -&gt; "32".</summary>
    private static string? CodeOf(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var dash = value.IndexOf('-');
        return dash > 0 ? value[..dash].Trim() : value.Trim();
    }

    /// <summary>"32-Other manufacturing" -&gt; "Other manufacturing".</summary>
    private static string? TextOf(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        var dash = value.IndexOf('-');
        return dash > 0 && dash < value.Length - 1 ? value[(dash + 1)..].Trim() : null;
    }

    /// <summary>
    /// The registry shouts place names ("UTTAR PRADESH"). The portal shows them
    /// in title case, and the code is what it actually joins on, so this is
    /// presentation only.
    /// </summary>
    private static string? Titleise(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;

        return CultureInfo.GetCultureInfo("en-IN").TextInfo
            .ToTitleCase(value.Trim().ToLowerInvariant());
    }
}

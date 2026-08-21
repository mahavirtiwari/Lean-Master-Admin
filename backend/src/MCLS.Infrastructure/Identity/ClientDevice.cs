namespace MCLS.Infrastructure.Identity;

/// <summary>What a request came from, as far as it can be told.</summary>
/// <param name="DeviceType">Desktop, Mobile, Tablet, App or Unknown.</param>
/// <param name="OperatingSystem">Windows, macOS, Linux, Android, iOS or Unknown.</param>
/// <param name="Browser">Chrome, Edge, Firefox, Safari, the mobile app, or Unknown.</param>
public sealed record ClientDescription(string DeviceType, string OperatingSystem, string Browser);

/// <summary>
/// Reads the device and operating system out of a User-Agent string.
///
/// Kept deliberately small. A full user-agent database is a dependency that has
/// to be updated forever to keep recognising new browsers, and what the audit
/// trail needs is the coarse answer — was this a phone or a desktop, Windows or
/// Android — not the exact build of a browser. The raw string is stored beside
/// these columns anyway, so nothing is lost by the parser being simple: a case
/// it cannot classify is still there in full to be read by a person.
///
/// One thing no user agent can tell you: a laptop from a desktop. Browsers do
/// not report chassis type, and nothing in the request does. Both are reported
/// as Desktop, and it would be dishonest to split them.
/// </summary>
public static class ClientDevice
{
    public static readonly ClientDescription Unknown = new("Unknown", "Unknown", "Unknown");

    /// <summary>
    /// Describes a client from its User-Agent, and from the platform header the
    /// mobile app sends about itself.
    ///
    /// The header wins where it is present: a React Native app's user agent is
    /// whatever the platform's HTTP stack chose to send, which on Android is
    /// indistinguishable from a browser. The app knows what it is; the string
    /// only guesses.
    /// </summary>
    public static ClientDescription Describe(string? userAgent, string? clientPlatform = null)
    {
        if (!string.IsNullOrWhiteSpace(clientPlatform))
        {
            var platform = clientPlatform.Trim();

            // e.g. "android/1.0.0" or "ios"
            var name = platform.Split('/')[0].Trim().ToLowerInvariant();

            var described = name switch
            {
                "android" => new ClientDescription("Mobile", "Android", "MCLS mobile app"),
                "ios" => new ClientDescription("Mobile", "iOS", "MCLS mobile app"),
                _ => null,
            };

            if (described is not null) return described;
        }

        if (string.IsNullOrWhiteSpace(userAgent)) return Unknown;

        var ua = userAgent;

        var os =
            Has(ua, "Android") ? "Android"
            : Has(ua, "iPhone") || Has(ua, "iPad") || Has(ua, "iPod") ? "iOS"
            : Has(ua, "Windows") ? "Windows"
            : Has(ua, "Mac OS X") || Has(ua, "Macintosh") ? "macOS"
            : Has(ua, "CrOS") ? "ChromeOS"
            : Has(ua, "Linux") ? "Linux"
            : "Unknown";

        // Tablets first: an Android tablet's agent says Android and omits
        // "Mobile", which is the only signal Android gives.
        var device =
            Has(ua, "iPad") || (os == "Android" && !Has(ua, "Mobile")) || Has(ua, "Tablet") ? "Tablet"
            : Has(ua, "Mobi") || os == "Android" || os == "iOS" ? "Mobile"
            : Has(ua, "bot") || Has(ua, "crawler") || Has(ua, "spider") ? "Bot"
            : os == "Unknown" ? "Unknown"
            : "Desktop";

        // Order matters: Edge and most others also claim Chrome, and Chrome
        // claims Safari.
        var browser =
            Has(ua, "Edg") ? "Edge"
            : Has(ua, "OPR") || Has(ua, "Opera") ? "Opera"
            : Has(ua, "SamsungBrowser") ? "Samsung Internet"
            : Has(ua, "Firefox") ? "Firefox"
            : Has(ua, "Chrome") || Has(ua, "CriOS") ? "Chrome"
            : Has(ua, "Safari") ? "Safari"
            : Has(ua, "okhttp") || Has(ua, "Dalvik") ? "MCLS mobile app"
            : "Unknown";

        return new ClientDescription(device, os, browser);
    }

    private static bool Has(string haystack, string needle)
        => haystack.Contains(needle, StringComparison.OrdinalIgnoreCase);
}

namespace MCLS.Api.Services;

/// <summary>
/// Addresses that leave the building — the ones printed on paper or put in a
/// QR code, where a wrong host cannot be fixed after the fact.
/// </summary>
public static class PortalLinks
{
    /// <summary>The page a scanned pledge certificate opens.</summary>
    public static string VerifyPledgeUrl(HttpRequest request, IConfiguration configuration, string reference)
        => $"{PortalBase(request, configuration)}/pledge/{Uri.EscapeDataString(reference)}";

    /// <summary>
    /// Where the portal answers.
    ///
    /// Portal:BaseUrl is the canonical address and wins wherever it is set to a
    /// real host. It is left pointing at localhost in development, though, and a
    /// certificate downloaded onto a phone has to carry an address that phone
    /// can actually reach — so a loopback setting falls back to the address the
    /// request itself arrived on, which is by definition reachable from where
    /// the download happened.
    /// </summary>
    private static string PortalBase(HttpRequest request, IConfiguration configuration)
    {
        var configured = configuration["Portal:BaseUrl"]?.TrimEnd('/');

        if (!string.IsNullOrWhiteSpace(configured) && !IsLoopback(configured)) return configured;

        return request.Host.HasValue
            ? $"{request.Scheme}://{request.Host.Value}"
            : configured ?? string.Empty;
    }

    private static bool IsLoopback(string url)
        => Uri.TryCreate(url, UriKind.Absolute, out var uri)
            && (uri.IsLoopback || uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase));
}

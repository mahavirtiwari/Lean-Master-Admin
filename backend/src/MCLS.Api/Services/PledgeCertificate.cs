using System.Globalization;

using QRCoder;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;

namespace MCLS.Api.Services;

/// <summary>What a certificate prints.</summary>
/// <param name="EnterpriseName">The enterprise, as the Udyam registry holds it.</param>
/// <param name="UnitAddress">The address of the unit the pledge is made for.</param>
/// <param name="UdyamNumber">The Udyam registration number.</param>
/// <param name="PledgedOn">The date the pledge was accepted.</param>
/// <param name="Reference">The certificate number, printed under the code.</param>
/// <param name="VerifyUrl">
/// Where the printed QR points. Scanning a certificate should answer the only
/// question a certificate raises — is this real, and whose is it — so the code
/// carries the address of the page that says so rather than the reference on
/// its own, which a phone can do nothing with.
/// </param>
public sealed record PledgeDetails(
    string EnterpriseName,
    string UnitAddress,
    string UdyamNumber,
    DateOnly PledgedOn,
    string Reference,
    string? VerifyUrl = null);

/// <summary>
/// The LEAN pledge certificate.
///
/// Rendered on demand and streamed; nothing is written to disk. A certificate
/// is a pure function of the registration behind it, so storing one would only
/// create a second copy to keep in step with the first — and the same applicant
/// asking twice must get the same document either way.
///
/// The artwork is the supplied template (Assets/pledge-certificate.jpg), drawn
/// full-bleed with the values placed on its ruled lines. Reproducing the design
/// in code instead would drift from the file the Ministry approved.
///
/// Every measurement below was read off the supplied specimen certificate
/// rather than estimated, and is expressed in points on this page size.
/// </summary>
public static class PledgeCertificate
{
    // The template is 2551 x 3568 at 300 dpi, so the page is that in points.
    private const float PageWidth = 2551f / 300f * 72f;   // 612.24
    private const float PageHeight = 3568f / 300f * 72f;  // 856.32

    // The four ruled lines, measured from the artwork itself.
    private const float NameRule = 503.4f;
    private const float AddressRule = 563.4f;
    private const float UdyamRule = 623.4f;
    private const float DateRule = 683.4f;

    // The ruled span. Note it is not centred on the page: the artwork carries a
    // vertical PLEDGE panel down the left edge, so the writing area sits right
    // of centre.
    private const float FieldLeft = 155f;
    private const float FieldRight = 488f;

    // Values sit on their rule, growing upwards, with this much air beneath.
    private const float SitOnRule = 3f;

    // The QR, and the reference printed under it. Centred on 329pt, which is
    // where the specimen puts them — again, not the page centre.
    private const float CodeCentre = 329f;
    private const float QrTop = 703.7f;
    private const float QrSize = 64f;
    private const float QrQuietZone = 6f;
    private const float ReferenceBottom = 786f;

    // The template carries a specimen QR. It is painted out in the paper colour
    // before ours is drawn, so no applicant is issued another enterprise's code.
    private const string PaperColour = "#FEFDF8";

    /// <summary>Where the artwork sits once the API is published.</summary>
    public static string TemplatePath { get; } =
        Path.Combine(AppContext.BaseDirectory, "Assets", "pledge-certificate.jpg");

    public static byte[] Render(PledgeDetails details, string templatePath)
    {
        var artwork = File.ReadAllBytes(templatePath);
        var qr = QrPng(details.VerifyUrl ?? details.Reference);
        var address = string.IsNullOrWhiteSpace(details.UnitAddress) ? "—" : details.UnitAddress.Trim();

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageWidth, PageHeight, Unit.Point);
                page.Margin(0);
                page.DefaultTextStyle(t => t.FontFamily(Fonts.Georgia).FontColor("#1A1A1A"));

                page.Content().Layers(layers =>
                {
                    // The template underneath, everything else on top of it.
                    layers.PrimaryLayer().Image(artwork).FitArea();

                    // ---- the four filled fields -------------------------------
                    Field(layers, NameRule, 46f, text => text
                        .Span(details.EnterpriseName)
                        .FontSize(15).Bold());

                    // The address is the one field that runs long — a Udyam
                    // address routinely carries five labelled parts — so its
                    // size follows its length rather than clipping. The room
                    // between the ENTERPRISE NAME caption and the rule below
                    // holds four lines, which is what the specimen uses.
                    Field(layers, AddressRule, 44f, text => text
                        .Span(address)
                        .FontSize(AddressFontSize(address)));

                    Field(layers, UdyamRule, 40f, text => text
                        .Span(details.UdyamNumber)
                        .FontSize(12).Bold());

                    Field(layers, DateRule, 40f, text => text
                        .Span(details.PledgedOn.ToString("dd-MM-yyyy", CultureInfo.InvariantCulture))
                        .FontSize(12));

                    // ---- the code block ---------------------------------------
                    layers.Layer().Element(e => e
                        .PaddingTop(QrTop - QrQuietZone)
                        .PaddingLeft(CodeCentre - QrSize / 2 - QrQuietZone)
                        .Width(QrSize + QrQuietZone * 2)
                        .Height(QrSize + QrQuietZone * 2)
                        .Background(PaperColour));

                    layers.Layer().Element(e => e
                        .PaddingTop(QrTop)
                        .PaddingLeft(CodeCentre - QrSize / 2)
                        .Width(QrSize)
                        .Height(QrSize)
                        .Image(qr).FitArea());

                    layers.Layer().Element(e => e
                        .PaddingTop(ReferenceBottom - 16)
                        .PaddingLeft(CodeCentre - 110)
                        .PaddingRight(PageWidth - CodeCentre - 110)
                        .Height(16)
                        .AlignBottom()
                        .Text(t =>
                        {
                            t.AlignCenter();
                            t.Span(details.Reference).FontSize(11);
                        }));
                });
            });
        }).GeneratePdf();
    }

    /// <summary>
    /// Writes one value onto a ruled line: centred on the writing area, sitting
    /// on the rule, and growing upwards into the space above it.
    /// </summary>
    private static void Field(LayersDescriptor layers, float rule, float height, Action<TextDescriptor> content)
        => layers.Layer().Element(e => e
            .PaddingTop(rule - SitOnRule - height)
            .PaddingLeft(FieldLeft)
            .PaddingRight(PageWidth - FieldRight)
            .Height(height)
            .AlignBottom()
            .Text(text =>
            {
                text.AlignCenter();
                text.ParagraphSpacing(0);
                content(text);
            }));

    /// <summary>
    /// Fits the address to the four lines the artwork leaves room for. The
    /// thresholds are where the wrap actually changes at this column width.
    /// </summary>
    private static int AddressFontSize(string address) => address.Length switch
    {
        <= 110 => 11,
        <= 170 => 10,
        <= 240 => 9,
        _ => 8,
    };

    /// <summary>
    /// The certificate's own QR, not the template's.
    ///
    /// The supplied artwork carries a specimen code; leaving it would print one
    /// enterprise's code on every certificate issued.
    /// </summary>
    private static byte[] QrPng(string payload)
    {
        using var generator = new QRCodeGenerator();
        using var data = generator.CreateQrCode(payload, QRCodeGenerator.ECCLevel.Q);
        using var png = new PngByteQRCode(data);

        // The quiet zone is drawn by the paper patch behind the code, so the
        // modules themselves fill the box the specimen reserves for them.
        return png.GetGraphic(8, [0, 0, 0], [0xFE, 0xFD, 0xF8], drawQuietZones: false);
    }

    /// <summary>
    /// The reference printed on the certificate and used as the file name, in
    /// the form the supplied specimen uses: LEAN_yyyyMMdd_nnnnn.
    ///
    /// It is not a random number: the date and the enterprise it belongs to can
    /// both be read back out of it, which is what lets a scanned certificate be
    /// looked up without keeping a table of issued certificates.
    /// </summary>
    public static string BuildReference(DateOnly pledgedOn, int enterpriseId)
        => $"LEAN_{pledgedOn:yyyyMMdd}_{enterpriseId:D5}";

    /// <summary>
    /// The reference for a certificate taken before the registration completed.
    ///
    /// Marked apart from the one above because registration ids and enterprise
    /// ids are separate numberings: without the D, the same reference could
    /// name two different records and verification would be a coin toss.
    /// </summary>
    public static string BuildDraftReference(DateOnly pledgedOn, int registrationId)
        => $"LEAN_{pledgedOn:yyyyMMdd}_D{registrationId:D5}";

    /// <summary>What a reference says about the record it names.</summary>
    /// <param name="PledgedOn">The date printed in the reference.</param>
    /// <param name="Id">The enterprise, or the registration when IsDraft.</param>
    /// <param name="IsDraft">True when the certificate was taken before completion.</param>
    public sealed record PledgeReference(DateOnly PledgedOn, int Id, bool IsDraft);

    /// <summary>
    /// Reads a reference back. Returns null for anything that is not one, so a
    /// scanned code that has been mistyped is a plain "not found" rather than
    /// an error.
    /// </summary>
    public static PledgeReference? ParseReference(string? reference)
    {
        if (string.IsNullOrWhiteSpace(reference)) return null;

        var parts = reference.Trim().Split('_');

        if (parts.Length != 3 || !parts[0].Equals("LEAN", StringComparison.OrdinalIgnoreCase)) return null;

        if (!DateOnly.TryParseExact(parts[1], "yyyyMMdd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var pledgedOn))
        {
            return null;
        }

        var tail = parts[2];
        var isDraft = tail.StartsWith('D') || tail.StartsWith('d');

        if (isDraft) tail = tail[1..];

        return int.TryParse(tail, NumberStyles.None, CultureInfo.InvariantCulture, out var id)
            ? new PledgeReference(pledgedOn, id, isDraft)
            : null;
    }
}

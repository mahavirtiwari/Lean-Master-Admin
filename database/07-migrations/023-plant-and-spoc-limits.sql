/* ---------------------------------------------------------------------------
   The message sent when a SPOC registers a second or third plant.

   They already have a login — Identity holds e-mail unique, so the new
   enterprise is attached to the account they have rather than given one of its
   own. The mail therefore carries the new LEAN ID and no password.

   Content only, like every template: MailShell supplies the letterhead.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DECLARE @body nvarchar(max) = N'
<p style="margin:0 0 8px;">Dear Madam/Sir,</p>
<p style="margin:0 0 14px;">A further plant has been registered under the &quot;MSME Competitive
(LEAN) Scheme&quot;. Your existing sign-in continues to work — no new password is issued.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FFFFFF;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Unit Name</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{unit_name}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">New LEAN ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{lean_id}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">Sign in with</td>
    <td style="padding:13px 16px;font-weight:700;">{{user_code}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#5D6B62;">(Quote the new LEAN ID in correspondence
about this plant. Sign in with the ID shown above and the password you already use.)</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{login_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Click here to Login</a>
</div>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>';

IF NOT EXISTS (SELECT 1 FROM comm.EmailTemplate WHERE Code = 'APPLICANT_ADDITIONAL_PLANT')
    INSERT INTO comm.EmailTemplate
        (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional, IsActive, TriggerEvent, CreatedOnUtc)
    VALUES ('APPLICANT_ADDITIONAL_PLANT', 'Applicant - further plant registered',
            'A further plant registered for the LEAN Scheme - {{lean_id}}',
            @body,
            '{{unit_name}}, {{lean_id}}, {{user_code}}, {{login_url}}, {{support_email}}',
            1, 1, 'Applicant registers an additional plant', SYSUTCDATETIME());
ELSE
    UPDATE comm.EmailTemplate
       SET BodyHtml = @body, ModifiedOnUtc = SYSUTCDATETIME()
     WHERE Code = 'APPLICANT_ADDITIONAL_PLANT';
GO

/* One plant may back one registration. The application checks this before it
   writes, but the index is what makes it true — two requests in flight at once
   would otherwise both pass the check.

   Filtered, because older Udyam records carry no plant id and several rows may
   legitimately hold NULL. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_EnterprisePlant_PlantIdNo')
BEGIN
    CREATE UNIQUE INDEX UX_EnterprisePlant_PlantIdNo
        ON msme.EnterprisePlant (PlantIdNo)
        WHERE PlantIdNo IS NOT NULL;
END
GO

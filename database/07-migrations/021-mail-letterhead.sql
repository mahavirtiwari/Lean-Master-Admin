/* ---------------------------------------------------------------------------
   One letterhead for every message the portal sends.

   The content sits on the landing page's light green (#F0F8F3) rather than
   white, and calls to action are blue buttons — the same pairing the screens
   use, so an e-mail reads as part of the portal.

   The remaining transactional templates were bare <p> tags with no frame at
   all. Each is restored to its seeded content and wrapped, so the admin's
   Emailer > Transactional list shows one consistent format.

   Bodies are written whole rather than extracted from the previous body: a
   first attempt tried to lift the inner content out of the old frame by
   searching for the closing cell, matched a </td></tr> inside a detail table,
   and truncated every template.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- The content cell is the change: #F0F8F3 inside the white card.
CREATE OR ALTER FUNCTION comm.fn_MailShellOpen()
RETURNS nvarchar(max)
AS
BEGIN
    RETURN N'
<div style="margin:0;padding:0;background:#F4F7F5;">
  <table width="100%" bgcolor="#0F7B45" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center" style="padding:28px 12px;">
      <table width="600" bgcolor="#ffffff" cellpadding="0" cellspacing="0" border="0"
             style="max-width:600px;border-radius:8px;overflow:hidden;">
        <tr><td align="center" style="padding:22px;border-bottom:3px solid #0F7B45;">
          <div style="font:700 19px Segoe UI,Arial,sans-serif;color:#16211A;">MSME Competitive (LEAN) Scheme</div>
          <div style="font:400 11px Segoe UI,Arial,sans-serif;color:#5D6B62;padding-top:4px;">
            Ministry of Micro, Small &amp; Medium Enterprises, Government of India</div>
        </td></tr>
        <tr><td bgcolor="#F0F8F3"
                style="padding:26px 34px;background:#F0F8F3;font:400 13px/22px Segoe UI,Arial,sans-serif;color:#16211A;">';
END
GO

CREATE OR ALTER FUNCTION comm.fn_MailShellClose()
RETURNS nvarchar(max)
AS
BEGIN
    RETURN N'
        </td></tr>
      </table>
      <div style="padding-top:22px;font:400 11px Segoe UI,Arial,sans-serif;color:#ffffff;">
        &copy; 2026 MSME Competitive (LEAN) Scheme</div>
    </td></tr>
  </table>
</div>';
END
GO

-- USER_PASSWORD_RESET
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>A password reset was requested for your account. The link below is valid for {{expiry_minutes}} minutes:</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{reset_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Reset password</a>
</div>
<p>If you did not request this, no action is needed and your password is unchanged.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_PASSWORD_RESET';

-- USER_DISABLED
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>Your portal account was disabled on {{action_date}}.</p>
<p>Reason recorded: {{reason}}</p>
<p>Contact your administrator if you believe this is in error.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_DISABLED';

-- APPLICATION_REGISTERED
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>Application <strong>{{application_no}}</strong> for {{unit_name}} has been registered for {{tier}} certification.</p>
<p>The next step is payment of the applicable fee. Your share after subsidy is {{payable_amount}}.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'APPLICATION_REGISTERED';

-- PAYMENT_RECEIVED
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>We have received {{amount}} against application <strong>{{application_no}}</strong>.</p>
<p>Handholding will begin shortly and your assigned consultant will be in touch.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'PAYMENT_RECEIVED';

-- ASSESSMENT_SCHEDULED
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>The {{tier}} assessment for <strong>{{unit_name}}</strong> is scheduled on <strong>{{assessment_date}}</strong>.</p>
<p>The assessment will be conducted by {{agency_name}}. Please keep the evidence records ready.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'ASSESSMENT_SCHEDULED';

-- NC_RAISED
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>{{nc_count}} non-conformance(s) were raised during the assessment of <strong>{{unit_name}}</strong>.</p>
<p>Corrective action is due by <strong>{{due_date}}</strong>.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'NC_RAISED';

-- CERTIFICATE_ISSUED
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>Congratulations. <strong>{{unit_name}}</strong> has been certified at <strong>{{tier}}</strong> level.</p>
<p>Certificate number {{certificate_no}}, valid until {{valid_till}}. Download it from the portal.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'CERTIFICATE_ISSUED';

-- APPLICATION_REJECTED
UPDATE comm.EmailTemplate
   SET BodyHtml = comm.fn_MailShellOpen() + N'
<p>Dear {{user_name}},</p>
<p>Application <strong>{{application_no}}</strong> for {{unit_name}} has not been approved.</p>
<p>Reason: {{reason}}</p>
<p>You may address the points raised and re-apply.</p>' + comm.fn_MailShellClose(),
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'APPLICATION_REJECTED';

/* Migration 020 rebuilds REG_OTP, APPLICANT_CREDENTIALS and USER_WELCOME from
   these same two functions, so re-running it after this picks up the green
   content cell and keeps their buttons. */
GO

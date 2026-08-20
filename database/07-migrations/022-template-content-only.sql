/* ---------------------------------------------------------------------------
   Templates hold their content only; the letterhead is applied when the
   message is queued (MailShell in MCLS.Infrastructure.Email).

   Why: the Emailer template editor loads a body, strips it to plain text to
   show it, and writes that plain text back on save. Opening REG_OTP and
   pressing Save flattened a 1,787-character letterhead to 527 characters of
   prose, and the next OTP went out with no design at all.

   Keeping the frame out of the stored body means an administrator can edit
   the wording without being able to lose the layout, and every message keeps
   one format whatever is typed into that box.

   The shell functions from 020/021 are dropped: the frame now lives in one
   place, in code, next to the renderer that applies it.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p style="margin:0 0 8px;">Dear Madam/Sir,</p>
<p style="margin:0 0 14px;">Greetings of the day!</p>
<p style="margin:0 0 14px;">Thank you for registering your enterprise under the &quot;MSME Competitive
(LEAN) Scheme&quot; notified by the Ministry of Micro, Small &amp; Medium Enterprises, Government of
India.</p>
<p style="margin:0 0 14px;">Your login details are as follows:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Unit Name</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{unit_name}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">LEAN ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{lean_id}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">Password</td>
    <td style="padding:13px 16px;font-weight:700;">{{password}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#5D6B62;">(Please use your LEAN ID in all future
correspondence for this Scheme, and change the password after signing in.)</p>
<p style="margin:14px 0 0;">One registration covers all three certification levels. You may apply for
Bronze, Silver or Gold from your dashboard.</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{login_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Click here to Login</a>
</div>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'APPLICANT_CREDENTIALS';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>Application <strong>{{application_no}}</strong> for {{unit_name}} has been registered for {{tier}} certification.</p>
<p>The next step is payment of the applicable fee. Your share after subsidy is {{payable_amount}}.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'APPLICATION_REGISTERED';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>Application <strong>{{application_no}}</strong> for {{unit_name}} has not been approved.</p>
<p>Reason: {{reason}}</p>
<p>You may address the points raised and re-apply.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'APPLICATION_REJECTED';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>The {{tier}} assessment for <strong>{{unit_name}}</strong> is scheduled on <strong>{{assessment_date}}</strong>.</p>
<p>The assessment will be conducted by {{agency_name}}. Please keep the evidence records ready.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'ASSESSMENT_SCHEDULED';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>Congratulations. <strong>{{unit_name}}</strong> has been certified at <strong>{{tier}}</strong> level.</p>
<p>Certificate number {{certificate_no}}, valid until {{valid_till}}. Download it from the portal.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'CERTIFICATE_ISSUED';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>{{nc_count}} non-conformance(s) were raised during the assessment of <strong>{{unit_name}}</strong>.</p>
<p>Corrective action is due by <strong>{{due_date}}</strong>.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'NC_RAISED';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>We have received {{amount}} against application <strong>{{application_no}}</strong>.</p>
<p>Handholding will begin shortly and your assigned consultant will be in touch.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'PAYMENT_RECEIVED';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p style="margin:0 0 14px;">Dear Madam/Sir,</p>
<p style="margin:0 0 14px;">Your one-time password for LEAN Scheme registration is:</p>
<div style="text-align:center;padding:18px 0;">
  <span style="display:inline-block;padding:12px 26px;background:#EFF4FA;border:1px solid #C3D8EE;
               border-radius:8px;font:700 26px Segoe UI,Arial,sans-serif;letter-spacing:6px;color:#1B4F8A;">{{otp}}</span>
</div>
<p style="margin:0 0 14px;">It is valid for {{valid_minutes}} minutes. Please do not share this code with anyone.</p>
<p style="margin:0 0 14px;">If you did not request this, you may ignore this message.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'REG_OTP';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>Your portal account was disabled on {{action_date}}.</p>
<p>Reason recorded: {{reason}}</p>
<p>Contact your administrator if you believe this is in error.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_DISABLED';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>A password reset was requested for your account. The link below is valid for {{expiry_minutes}} minutes:</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{reset_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Reset password</a>
</div>
<p>If you did not request this, no action is needed and your password is unchanged.</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_PASSWORD_RESET';

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p style="margin:0 0 8px;">Dear {{user_name}},</p>
<p style="margin:0 0 14px;">An account has been created for you on the MSME Competitive (LEAN) Scheme
portal as <strong>{{role_name}}</strong>.</p>
<p style="margin:0 0 14px;">Your login details are as follows:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Name</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{user_name}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">User ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{user_code}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">Password</td>
    <td style="padding:13px 16px;font-weight:700;">{{password}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#5D6B62;">Please change this password after signing in
for the first time. Do not share it with anyone.</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{portal_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Click here to Login</a>
</div>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_WELCOME';

GO

DROP FUNCTION IF EXISTS comm.fn_MailShellOpen;
DROP FUNCTION IF EXISTS comm.fn_MailShellClose;
DROP FUNCTION IF EXISTS comm.fn_MailButton;
GO

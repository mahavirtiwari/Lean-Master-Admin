/* ---------------------------------------------------------------------------
   Three transactional emailers, and the role an applicant account needs.

   The OTP was built as inline HTML inside RegistrationController, so it could
   not be edited from Emailer > Transactional like every other message. It is a
   template now, as are the two credential mails.

   Layout follows the ZED credential mail supplied as the reference: a coloured
   band, a white card, a three-row detail table and a single call to action.
   The band is the scheme's green rather than ZED's teal, and the mark is set
   as text — a remote image is blocked by default in most mail clients.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- An applicant signs in against account type 10; no role existed for it.
IF NOT EXISTS (SELECT 1 FROM auth.Role WHERE Code = 'ENTERPRISE_USER')
BEGIN
    INSERT INTO auth.Role
        (Code, Name, NormalizedName, ConcurrencyStamp, AccountTypeId, Description,
         IsSystemRole, IsActive, CreatedOnUtc)
    VALUES ('ENTERPRISE_USER', 'Enterprise User', 'ENTERPRISE USER',
            CAST(NEWID() AS nvarchar(50)), 10,
            'The applicant enterprise itself, signing in with its LEAN ID.',
            1, 1, SYSUTCDATETIME());
END
GO

-- The frame every message shares. Held in one place so a change to the
-- letterhead does not have to be repeated across three bodies.
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

-- ------------------------------------------------------------------ 1. OTP ---
DECLARE @body nvarchar(max) = comm.fn_MailShellOpen() + N'
<p style="margin:0 0 14px;">Dear Madam/Sir,</p>
<p style="margin:0 0 14px;">Your one-time password for LEAN Scheme registration is:</p>
<div style="text-align:center;padding:18px 0;">
  <span style="display:inline-block;padding:12px 26px;background:#EFF4FA;border:1px solid #C3D8EE;
               border-radius:8px;font:700 26px Segoe UI,Arial,sans-serif;letter-spacing:6px;color:#1B4F8A;">{{otp}}</span>
</div>
<p style="margin:0 0 14px;">It is valid for {{valid_minutes}} minutes. Please do not share this code with anyone.</p>
<p style="margin:0 0 14px;">If you did not request this, you may ignore this message.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>' + comm.fn_MailShellClose();

IF NOT EXISTS (SELECT 1 FROM comm.EmailTemplate WHERE Code = 'REG_OTP')
    INSERT INTO comm.EmailTemplate
        (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional, IsActive, TriggerEvent, CreatedOnUtc)
    VALUES ('REG_OTP', 'Registration OTP', 'Your LEAN Scheme registration OTP',
            @body, '{{otp}}, {{valid_minutes}}', 1, 1,
            'Registration OTP requested', SYSUTCDATETIME());
ELSE
    UPDATE comm.EmailTemplate
       SET Name = 'Registration OTP',
           Subject = 'Your LEAN Scheme registration OTP',
           BodyHtml = @body,
           AvailableTags = '{{otp}}, {{valid_minutes}}',
           TriggerEvent = 'Registration OTP requested',
           IsTransactional = 1, IsActive = 1, ModifiedOnUtc = SYSUTCDATETIME()
     WHERE Code = 'REG_OTP';
GO

-- ------------------------------------------ 2. applicant ID and password ---
DECLARE @body nvarchar(max) = comm.fn_MailShellOpen() + N'
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
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>' + comm.fn_MailShellClose();

IF NOT EXISTS (SELECT 1 FROM comm.EmailTemplate WHERE Code = 'APPLICANT_CREDENTIALS')
    INSERT INTO comm.EmailTemplate
        (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional, IsActive, TriggerEvent, CreatedOnUtc)
    VALUES ('APPLICANT_CREDENTIALS', 'Applicant login details',
            'Registration Details for the MSME Competitive (LEAN) Scheme - {{lean_id}}',
            @body, '{{unit_name}}, {{lean_id}}, {{password}}, {{login_url}}, {{support_email}}', 1, 1,
            'Applicant registration completed', SYSUTCDATETIME());
ELSE
    UPDATE comm.EmailTemplate
       SET Name = 'Applicant login details',
           Subject = 'Registration Details for the MSME Competitive (LEAN) Scheme - {{lean_id}}',
           BodyHtml = @body,
           AvailableTags = '{{unit_name}}, {{lean_id}}, {{password}}, {{login_url}}, {{support_email}}',
           TriggerEvent = 'Applicant registration completed',
           IsTransactional = 1, IsActive = 1, ModifiedOnUtc = SYSUTCDATETIME()
     WHERE Code = 'APPLICANT_CREDENTIALS';
GO

-- --------------------------------------- 3. portal user ID and password ---
DECLARE @body nvarchar(max) = comm.fn_MailShellOpen() + N'
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
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>' + comm.fn_MailShellClose();

UPDATE comm.EmailTemplate
   SET Name = 'Portal user login details',
       Subject = 'Your login details for the MSME Competitive (LEAN) Scheme portal',
       BodyHtml = @body,
       AvailableTags = '{{user_name}}, {{user_code}}, {{password}}, {{role_name}}, {{portal_url}}',
       TriggerEvent = 'Portal user account created',
       IsTransactional = 1, IsActive = 1, ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_WELCOME';
GO

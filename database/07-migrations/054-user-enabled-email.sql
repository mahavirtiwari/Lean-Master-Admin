/* ---------------------------------------------------------------------------
   Tell a user when their account is disabled or enabled again.

   USER_DISABLED has existed since the seed and was never sent: the status
   endpoint wrote the change and the person found out by failing to sign in.
   There was no enabled notice at all, so someone whose access was restored had
   no way of knowing.

   Both are styled on APPLICANT_CREDENTIALS, the mail every account holder has
   already seen, so the three read as one scheme rather than three systems.

   ASCII only: sqlcmd reads a script as ANSI unless given -f 65001.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE comm.EmailTemplate
   SET Subject  = N'Your access to the MSME Competitive (LEAN) Scheme portal has been suspended',
       BodyHtml = N'<p style="margin:0 0 8px;">Dear {{user_name}},</p>
<p style="margin:0 0 14px;">Greetings of the day!</p>
<p style="margin:0 0 14px;">Your account on the &quot;MSME Competitive (LEAN) Scheme&quot; portal,
notified by the Ministry of Micro, Small &amp; Medium Enterprises, Government of India, has been
disabled. You will not be able to sign in until it is enabled again.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">User ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{user_code}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Disabled on</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{action_date}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">Reason</td>
    <td style="padding:13px 16px;font-weight:700;">{{reason}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;">If you believe this is a mistake, please contact the administrator who
looks after your organisation, or write to the scheme helpdesk.</p>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       BodyText = N'Dear {{user_name}},

Your account ({{user_code}}) on the MSME Competitive (LEAN) Scheme portal was disabled on
{{action_date}}. Reason: {{reason}}

If you believe this is a mistake, contact your administrator or write to {{support_email}}.

Thanks and Regards,
LEAN Team',
       AvailableTags = N'{{user_name}},{{user_code}},{{action_date}},{{reason}},{{support_email}}',
       IsTransactional = 1,
       IsActive = 1,
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_DISABLED';
GO

MERGE comm.EmailTemplate AS tgt
USING (VALUES ('USER_ENABLED', N'Account enabled again', N'Your portal access has been restored'))
      AS src (Code, Name, Subject)
   ON tgt.Code = src.Code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Subject, BodyHtml, BodyText, AvailableTags, IsTransactional, IsActive, CreatedOnUtc)
    VALUES (src.Code, src.Name, src.Subject, N'', N'', N'', 1, 1, SYSUTCDATETIME());
GO

UPDATE comm.EmailTemplate
   SET Subject  = N'Your access to the MSME Competitive (LEAN) Scheme portal has been restored',
       BodyHtml = N'<p style="margin:0 0 8px;">Dear {{user_name}},</p>
<p style="margin:0 0 14px;">Greetings of the day!</p>
<p style="margin:0 0 14px;">Your account on the &quot;MSME Competitive (LEAN) Scheme&quot; portal,
notified by the Ministry of Micro, Small &amp; Medium Enterprises, Government of India, has been
enabled. You can sign in again with the same credentials.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">User ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{user_code}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">Enabled on</td>
    <td style="padding:13px 16px;font-weight:700;">{{action_date}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#5D6B62;">(Your password has not changed. If you no
longer remember it, use Forgot password on the sign-in screen.)</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{portal_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Click here to Login</a>
</div>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       BodyText = N'Dear {{user_name}},

Your account ({{user_code}}) on the MSME Competitive (LEAN) Scheme portal was enabled on
{{action_date}}. You can sign in again at {{portal_url}} with the same credentials.

In case of any query, write to {{support_email}}.

Thanks and Regards,
LEAN Team',
       AvailableTags = N'{{user_name}},{{user_code}},{{action_date}},{{portal_url}},{{support_email}}',
       IsTransactional = 1,
       IsActive = 1,
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_ENABLED';
GO

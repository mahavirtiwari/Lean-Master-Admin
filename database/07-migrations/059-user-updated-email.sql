/* ---------------------------------------------------------------------------
   Tell a user when their account details are changed.

   Creation, disabling and enabling all reach the holder; an edit did not. That
   is the one of the four they are most likely to want to know about and least
   likely to notice: a changed role quietly changes what the portal will let
   them do, and a changed designation or jurisdiction is how the scheme
   addresses them.

   The mail names what moved rather than restating the whole record - an
   account holder should be able to tell at a glance whether the change was the
   one they asked for.

   ASCII only: sqlcmd reads a script as ANSI unless given -f 65001.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

MERGE comm.EmailTemplate AS tgt
USING (VALUES ('USER_UPDATED', N'Account details changed', N'Your account details have been updated'))
      AS src (Code, Name, Subject)
   ON tgt.Code = src.Code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Subject, BodyHtml, BodyText, AvailableTags, IsTransactional, IsActive, CreatedOnUtc)
    VALUES (src.Code, src.Name, src.Subject, N'', N'', N'', 1, 1, SYSUTCDATETIME());
GO

UPDATE comm.EmailTemplate
   SET Subject  = N'Your account details on the MSME Competitive (LEAN) Scheme portal have been updated',
       BodyHtml = N'<p style="margin:0 0 8px;">Dear {{user_name}},</p>
<p style="margin:0 0 14px;">Greetings of the day!</p>
<p style="margin:0 0 14px;">Your account on the &quot;MSME Competitive (LEAN) Scheme&quot; portal,
notified by the Ministry of Micro, Small &amp; Medium Enterprises, Government of India, has been
updated by an administrator.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">User ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{user_code}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Updated on</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{action_date}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">What changed</td>
    <td style="padding:13px 16px;font-weight:700;">{{changes}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#5D6B62;">(Your password is unchanged. If your role
was changed, the new access applies the next time you sign in.)</p>
<p style="margin:14px 0 0;">If you did not expect this, please contact the administrator who looks
after your organisation.</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{portal_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Click here to Login</a>
</div>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       BodyText = N'Dear {{user_name}},

Your account ({{user_code}}) on the MSME Competitive (LEAN) Scheme portal was updated on
{{action_date}}. What changed: {{changes}}

Your password is unchanged. If your role was changed, the new access applies at your next sign-in.

Sign in at {{portal_url}}. In case of any query, write to {{support_email}}.

Thanks and Regards,
LEAN Team',
       AvailableTags = N'{{user_name}},{{user_code}},{{action_date}},{{changes}},{{portal_url}},{{support_email}}',
       IsTransactional = 1,
       IsActive = 1,
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_UPDATED';
GO

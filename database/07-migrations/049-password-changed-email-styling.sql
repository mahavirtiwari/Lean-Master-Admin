/* ---------------------------------------------------------------------------
   Style the password-changed notice like the registration e-mail.

   The registration mail (APPLICANT_CREDENTIALS) is the one every applicant has
   already seen, so it is what the scheme's e-mail looks like to them: the same
   greeting, the same bordered details table, the same centred blue button and
   the same sign-off. This notice now follows it exactly; only the words differ.

   The password is still not repeated — the person set it moments ago on the
   reset screen, and a working credential left sitting in a mailbox is a risk
   with nothing gained. The table carries the LEAN ID and when the change
   happened instead.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE comm.EmailTemplate
   SET Subject  = N'Password changed for the MSME Competitive (LEAN) Scheme - {{lean_id}}',
       BodyHtml = N'<p style="margin:0 0 8px;">Dear {{user_name}},</p>
<p style="margin:0 0 14px;">Greetings of the day!</p>
<p style="margin:0 0 14px;">The password for your account on the &quot;MSME Competitive (LEAN)
Scheme&quot; portal, notified by the Ministry of Micro, Small &amp; Medium Enterprises, Government of
India, has been changed successfully.</p>
<p style="margin:0 0 14px;">Your login details are as follows:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">LEAN ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{lean_id}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Password</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">The new password you have just set</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">Changed on</td>
    <td style="padding:13px 16px;font-weight:700;">{{changed_on}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#5D6B62;">(For your security the password is not
repeated in this e-mail, and every other session has been signed out.)</p>
<p style="margin:14px 0 0;">If you did not make this change, your account may be at risk. Please
reset the password again straight away and inform the scheme helpdesk.</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{login_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Click here to Login</a>
</div>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       AvailableTags = N'{{user_name}},{{lean_id}},{{changed_on}},{{login_url}},{{support_email}}',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_PASSWORD_CHANGED';
GO

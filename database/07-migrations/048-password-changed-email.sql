/* ---------------------------------------------------------------------------
   Confirm a password reset by e-mail.

   Finishing a reset changed the password and said nothing. Now the account is
   told: the LEAN ID it applies to, when it changed, and what to do if it was
   not them — which is the only way somebody learns their account was taken over
   through a leaked reset link.

   The password itself is deliberately not in this mail. The applicant chose it
   on the reset screen a moment earlier, so repeating it teaches them nothing
   and leaves a working credential sitting in a mailbox. Where the portal
   generates a password the applicant never saw — a new account, a Bronze
   participant — it is e-mailed, because there it is the only way they can have it.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

MERGE comm.EmailTemplate AS tgt
USING (VALUES
    ('USER_PASSWORD_CHANGED', N'Password changed',
     N'Your MCLS portal password was changed',
     N'<p>Dear {{user_name}},</p>
<p>The password for your MCLS portal account was changed on {{changed_on}}.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
  <tr><td style="padding:4px 18px 4px 0;color:#5D6B62;">LEAN ID</td>
      <td style="padding:4px 0;"><strong>{{lean_id}}</strong></td></tr>
</table>
<p>Sign in with your LEAN ID and the new password you have just set.</p>
<div style="text-align:center;padding:22px 0;">
  <a href="{{portal_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Sign in</a>
</div>
<p>For your security the password itself is not repeated here, and every other
session has been signed out.</p>
<p><strong>If this was not you</strong>, your account may be at risk. Reset the
password again straight away and tell the scheme helpdesk.</p>',
     N'{{user_name}},{{lean_id}},{{changed_on}},{{portal_url}}', 1)
) AS src (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    Name = src.Name, Subject = src.Subject, BodyHtml = src.BodyHtml,
    AvailableTags = src.AvailableTags, ModifiedOnUtc = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional, IsActive, CreatedOnUtc)
    VALUES (src.Code, src.Name, src.Subject, src.BodyHtml, src.AvailableTags, src.IsTransactional, 1, SYSUTCDATETIME());
GO

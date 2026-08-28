/* ---------------------------------------------------------------------------
   Show the LEAN ID in the password-reset email.

   The reset mail named the recipient but not which account the link belongs to.
   Add the applicant's LEAN ID (the account's own code) to the body, and declare
   the {{lean_id}} tag on AvailableTags so a super admin can move, reword or
   remove it from the Emailer -> Transactional editor. The value is supplied by
   the API (AuthController fills lean_id with the user's code).
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

UPDATE comm.EmailTemplate
   SET BodyHtml = N'
<p>Dear {{user_name}},</p>
<p>A password reset was requested for your account. The link below is valid for {{expiry_minutes}} minutes:</p>
<p style="margin:0 0 14px;">Your LEAN ID: <strong>{{lean_id}}</strong></p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{reset_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Reset password</a>
</div>
<p>If you did not request this, no action is needed and your password is unchanged.</p>',
       AvailableTags = N'{{user_name}},{{lean_id}},{{reset_url}},{{expiry_minutes}}',
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'USER_PASSWORD_RESET';
GO

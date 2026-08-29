/* ---------------------------------------------------------------------------
   The Bronze participant's temporary LMS account.

   Adding a participant issues them a LEAN ID and a password, e-mailed with the
   LMS link. The credential is for the LMS only — no portal user is created, so
   a participant cannot reach the applicant portal at all; that is enforced by
   construction rather than by a permission check.

   The account is temporary: it ends when the person passes (their certificate
   is e-mailed and the account is closed) or when they use up their three exam
   attempts. Only a hash of the password is kept, so the plaintext exists once,
   in the e-mail, and nowhere else.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('msme.BronzeParticipant', 'LmsLoginId') IS NULL
BEGIN
    ALTER TABLE msme.BronzeParticipant ADD
        /* The LEAN ID the participant signs in to the LMS with. */
        LmsLoginId        varchar(50)   NULL,
        /* Hash only. The password itself is e-mailed once and never stored. */
        PasswordHash      nvarchar(300) NULL,
        /* Exam attempts used, capped by MaxAttempts. */
        ExamAttempts      tinyint       NOT NULL CONSTRAINT DF_BronzeParticipant_Attempts DEFAULT (0),
        MaxAttempts       tinyint       NOT NULL CONSTRAINT DF_BronzeParticipant_MaxAttempts DEFAULT (3),
        /* Active | Completed | Locked — Completed on passing, Locked when the
           attempts run out. Both mean the account no longer works. */
        AccountState      varchar(20)   NOT NULL CONSTRAINT DF_BronzeParticipant_AccountState DEFAULT ('Active'),
        DeactivatedOnUtc  datetime2(3)  NULL,
        LastAttemptOnUtc  datetime2(3)  NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_BronzeParticipant_LmsLoginId')
BEGIN
    CREATE UNIQUE INDEX UX_BronzeParticipant_LmsLoginId
        ON msme.BronzeParticipant (LmsLoginId) WHERE LmsLoginId IS NOT NULL;
END
GO

/* ------------------------------------------------------------- templates ---
   Both are editable under Emailer -> Transactional, so the wording and the
   placement of each tag can change without a release. */
MERGE comm.EmailTemplate AS tgt
USING (VALUES
    ('BRONZE_PARTICIPANT_ACCOUNT', N'Bronze participant account',
     N'Your LEAN Bronze courses are ready',
     N'<p>Dear {{participant_name}},</p>
<p><strong>{{enterprise_name}}</strong> has nominated you for <strong>LEAN Bronze</strong>, the
e-learning stage of the MSME Competitive (LEAN) Scheme.</p>
<p>Sign in to the learning platform with these details:</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
  <tr><td style="padding:4px 18px 4px 0;color:#5D6B62;">LEAN ID</td>
      <td style="padding:4px 0;"><strong>{{lean_id}}</strong></td></tr>
  <tr><td style="padding:4px 18px 4px 0;color:#5D6B62;">Password</td>
      <td style="padding:4px 0;"><strong>{{password}}</strong></td></tr>
</table>
<div style="text-align:center;padding:22px 0;">
  <a href="{{lms_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Open the LMS</a>
</div>
<p>There are {{course_count}} courses and one final examination. You may sit the examination
up to {{max_attempts}} times.</p>
<p>This account is for the learning platform only, and closes once you have passed.</p>',
     N'{{participant_name}},{{enterprise_name}},{{lean_id}},{{password}},{{lms_url}},{{course_count}},{{max_attempts}}', 1),

    ('BRONZE_PARTICIPANT_CERTIFICATE', N'Bronze participant certificate',
     N'Your LEAN Bronze certificate',
     N'<p>Dear {{participant_name}},</p>
<p>You have passed the LEAN Bronze examination. Your certificate is attached below.</p>
<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
  <tr><td style="padding:4px 18px 4px 0;color:#5D6B62;">Certificate number</td>
      <td style="padding:4px 0;"><strong>{{certificate_no}}</strong></td></tr>
  <tr><td style="padding:4px 18px 4px 0;color:#5D6B62;">Enterprise</td>
      <td style="padding:4px 0;">{{enterprise_name}}</td></tr>
  <tr><td style="padding:4px 18px 4px 0;color:#5D6B62;">Issued on</td>
      <td style="padding:4px 0;">{{issued_on}}</td></tr>
</table>
<div style="text-align:center;padding:22px 0;">
  <a href="{{certificate_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#0F7B45;
            text-decoration:none;border-radius:6px;font-weight:600;">Download certificate</a>
</div>
<p>Your learning account has now been closed. Thank you for taking part.</p>',
     N'{{participant_name}},{{enterprise_name}},{{certificate_no}},{{issued_on}},{{certificate_url}}', 1)
) AS src (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    Name = src.Name, Subject = src.Subject, BodyHtml = src.BodyHtml,
    AvailableTags = src.AvailableTags, ModifiedOnUtc = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional, IsActive, CreatedOnUtc)
    VALUES (src.Code, src.Name, src.Subject, src.BodyHtml, src.AvailableTags, src.IsTransactional, 1, SYSUTCDATETIME());
GO

/* ---------------------------------------------------------------------------
   LEAN Silver intake - the three answers, and the verification they trigger.

   C02a-C02c ask an applicant three questions before a Silver application is
   accepted: which Implementing Agency will run the handholding, whether the
   enterprise belongs to an Industry Association, and whether it supplies an OEM
   or PSU. The last two carry a Member ID and a Vendor ID, and those claims are
   put to the bodies named rather than taken on trust.

   C02d/C02e then show the applicant where each stands. The rule the deck sets
   is that EITHER approval is enough to open payment - an enterprise is not held
   up because one of two bodies is slow, and it is not held up at all when it
   named neither.

   ASCII only: sqlcmd reads a script as ANSI unless given -f 65001, so a UTF-8
   character here would land in the database as mojibake.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* One row per claim put to one body. Two at most per enterprise per level -
   the association and the OEM/PSU - so the unique index is on that triple. */
IF OBJECT_ID('msme.PartnerVerification') IS NULL
BEGIN
    CREATE TABLE msme.PartnerVerification (
        PartnerVerificationId int IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_PartnerVerification PRIMARY KEY,
        EnterpriseId          int          NOT NULL,
        CertificationLevelId  tinyint      NOT NULL,
        /* Association | OemPsu - which of the two questions this answers. */
        PartnerKind           varchar(20)  NOT NULL,
        /* The body named, and the claim made against it. */
        OrganisationId        int          NOT NULL,
        ReferenceNo           nvarchar(80) NULL,
        /* Pending | Approved | Disputed */
        Status                varchar(20)  NOT NULL
            CONSTRAINT DF_PartnerVerification_Status DEFAULT ('Pending'),
        DecidedByUserId       int          NULL,
        DecidedOnUtc          datetime2(3) NULL,
        DecisionRemark        nvarchar(500) NULL,
        CreatedOnUtc          datetime2(3) NOT NULL
            CONSTRAINT DF_PartnerVerification_Created DEFAULT (SYSUTCDATETIME()),

        CONSTRAINT FK_PartnerVerification_Enterprise FOREIGN KEY (EnterpriseId)
            REFERENCES msme.Enterprise (EnterpriseId),
        CONSTRAINT FK_PartnerVerification_Organisation FOREIGN KEY (OrganisationId)
            REFERENCES auth.Organisation (OrganisationId),
        CONSTRAINT CK_PartnerVerification_Kind
            CHECK (PartnerKind IN ('Association', 'OemPsu')),
        CONSTRAINT CK_PartnerVerification_Status
            CHECK (Status IN ('Pending', 'Approved', 'Disputed'))
    );
END
GO

/* Re-answering the questions replaces the claim rather than stacking another
   one beside it, so one body is asked once per level. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_PartnerVerification_Claim'
               AND object_id = OBJECT_ID('msme.PartnerVerification'))
BEGIN
    CREATE UNIQUE INDEX UQ_PartnerVerification_Claim
        ON msme.PartnerVerification (EnterpriseId, CertificationLevelId, PartnerKind);
END
GO

/* The body's own queue: what is waiting on me. */
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_PartnerVerification_Queue'
               AND object_id = OBJECT_ID('msme.PartnerVerification'))
BEGIN
    CREATE INDEX IX_PartnerVerification_Queue
        ON msme.PartnerVerification (OrganisationId, Status)
        INCLUDE (EnterpriseId, PartnerKind, ReferenceNo, CreatedOnUtc);
END
GO

/* Where the applicant has reached in the C02 flow. Intake is answered before
   the application itself exists, so it is recorded on the enterprise. */
IF COL_LENGTH('msme.Enterprise', 'SilverIntakeOnUtc') IS NULL
BEGIN
    ALTER TABLE msme.Enterprise ADD SilverIntakeOnUtc datetime2(3) NULL;
END
GO

/* ------------------------------------------------------------ the e-mails ---
   Styled on APPLICANT_CREDENTIALS, which is the e-mail every applicant has
   already seen and therefore what the scheme's mail looks like to them. */
MERGE comm.EmailTemplate AS tgt
USING (VALUES
    ('PARTNER_VERIFICATION_REQUEST', N'Partner asked to verify a member or vendor claim',
     N'An enterprise has named your organisation - {{enterprise_name}}')
) AS src (Code, Name, Subject)
   ON tgt.Code = src.Code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Subject, BodyHtml, BodyText, AvailableTags, IsTransactional, IsActive, CreatedOnUtc)
    VALUES (src.Code, src.Name, src.Subject, N'', N'', N'', 1, 1, SYSUTCDATETIME());
GO

UPDATE comm.EmailTemplate
   SET Subject  = N'Please verify a claim from {{enterprise_name}} - MSME Competitive (LEAN) Scheme',
       BodyHtml = N'<p style="margin:0 0 8px;">Dear {{partner_name}},</p>
<p style="margin:0 0 14px;">Greetings of the day!</p>
<p style="margin:0 0 14px;">An enterprise applying for LEAN Silver certification under the &quot;MSME
Competitive (LEAN) Scheme&quot;, notified by the Ministry of Micro, Small &amp; Medium Enterprises,
Government of India, has named your organisation and given the reference below.</p>
<p style="margin:0 0 14px;">Please confirm or dispute it on the portal:</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Enterprise</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{enterprise_name}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">LEAN ID</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{lean_id}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Claimed as</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{claim_kind}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">{{reference_label}}</td>
    <td style="padding:13px 16px;font-weight:700;">{{reference_no}}</td>
  </tr>
</table>
<p style="margin:16px 0 0;font-size:12px;color:#5D6B62;">The enterprise is not held up while you
decide - the scheme lets it proceed once any one of the bodies it named has confirmed. Your answer
is still recorded against the application.</p>
<div style="text-align:center;padding:26px 0;">
  <a href="{{login_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Review the request</a>
</div>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       BodyText = N'Dear {{partner_name}},

{{enterprise_name}} (LEAN ID {{lean_id}}) has named your organisation while applying for LEAN Silver
certification, as {{claim_kind}}, with {{reference_label}} {{reference_no}}.

Please confirm or dispute it at {{login_url}}.

In case of any query, write to {{support_email}}.

Thanks and Regards,
LEAN Team',
       AvailableTags = N'{{partner_name}},{{enterprise_name}},{{lean_id}},{{claim_kind}},{{reference_label}},{{reference_no}},{{login_url}},{{support_email}}',
       IsTransactional = 1,
       IsActive = 1,
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'PARTNER_VERIFICATION_REQUEST';
GO

/* What the applicant is told when a body answers. */
MERGE comm.EmailTemplate AS tgt
USING (VALUES
    ('PARTNER_VERIFICATION_RESULT', N'Applicant told a named body has answered',
     N'{{partner_name}} has responded to your LEAN Silver application')
) AS src (Code, Name, Subject)
   ON tgt.Code = src.Code
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Subject, BodyHtml, BodyText, AvailableTags, IsTransactional, IsActive, CreatedOnUtc)
    VALUES (src.Code, src.Name, src.Subject, N'', N'', N'', 1, 1, SYSUTCDATETIME());
GO

UPDATE comm.EmailTemplate
   SET Subject  = N'{{partner_name}} has responded - LEAN Silver application {{lean_id}}',
       BodyHtml = N'<p style="margin:0 0 8px;">Dear {{applicant_name}},</p>
<p style="margin:0 0 14px;">Greetings of the day!</p>
<p style="margin:0 0 14px;">{{partner_name}}, which you named on your LEAN Silver application under
the &quot;MSME Competitive (LEAN) Scheme&quot;, has responded.</p>
<table width="100%" cellpadding="0" cellspacing="0" border="0"
       style="font:400 13px Segoe UI,Arial,sans-serif;background:#FAFCFB;border:1px solid #DEE7E1;border-radius:6px;">
  <tr>
    <td style="padding:13px 16px;width:36%;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Organisation</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{partner_name}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;color:#5D6B62;">Outcome</td>
    <td style="padding:13px 16px;border-bottom:1px solid #EDF2EF;font-weight:700;">{{outcome}}</td>
  </tr>
  <tr>
    <td style="padding:13px 16px;color:#5D6B62;">Remark</td>
    <td style="padding:13px 16px;font-weight:700;">{{remark}}</td>
  </tr>
</table>
<div style="text-align:center;padding:26px 0;">
  <a href="{{login_url}}" target="_blank"
     style="display:inline-block;padding:0 30px;line-height:44px;color:#ffffff;background:#1B4F8A;
            text-decoration:none;border-radius:6px;font-weight:600;">Open your dashboard</a>
</div>
<p style="margin:0 0 14px;">In case of any query, please write to us at {{support_email}}.</p>
<p style="margin:18px 0 0;">Thanks and Regards,<br>LEAN Team</p>',
       BodyText = N'Dear {{applicant_name}},

{{partner_name}} has responded to your LEAN Silver application: {{outcome}}.
{{remark}}

Open your dashboard at {{login_url}}.

Thanks and Regards,
LEAN Team',
       AvailableTags = N'{{applicant_name}},{{partner_name}},{{outcome}},{{remark}},{{lean_id}},{{login_url}},{{support_email}}',
       IsTransactional = 1,
       IsActive = 1,
       ModifiedOnUtc = SYSUTCDATETIME()
 WHERE Code = 'PARTNER_VERIFICATION_RESULT';
GO

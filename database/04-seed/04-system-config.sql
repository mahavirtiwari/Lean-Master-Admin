/*===========================================================================
  Seed 4 — system settings, transactional e-mail templates, the API registry
  and the seed organisations.

  The initial Super Admin account is deliberately NOT created here: its
  password must be hashed with ASP.NET Core Identity's PasswordHasher, which
  only the API can do correctly. MCLS.Infrastructure.Persistence.DbSeeder
  creates it on first start from the Bootstrap:* configuration section.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO
SET NOCOUNT ON;
SET XACT_ABORT ON;
GO

/*--------------------------------------------------------------- Organisation
  The bodies the seeded accounts belong to. OrganisationCode is stable so the
  API bootstrapper can find them without guessing at names.
---------------------------------------------------------------------------*/
MERGE auth.Organisation AS tgt
USING (
    SELECT v.OrganisationCode, v.Name, at.AccountTypeId, v.RegistrationNo,
           v.AddressLine, s.StateId, v.Pincode, v.ContactEmail, v.JurisdictionScope
    FROM (VALUES
        ('ORG-MIN-001', N'Ministry of Micro, Small & Medium Enterprises', 'MINISTRY_OF_MSME', NULL,
         N'Room No. 468, Udyog Bhawan, Rafi Marg, New Delhi 110011', 'DL', '110011',
         N'contact@msme.gov.in', N'National'),

        ('ORG-IA-001',  N'National Productivity Council (NPC)',           'IMPLEMENTING_AGENCY', 'AAATN2451K',
         N'5-6 Institutional Area, Lodhi Road, New Delhi 110003', 'DL', '110003',
         N'contact@npcindia.gov.in', N'National'),

        ('ORG-IA-002',  N'Quality Council of India (QCI)',                'IMPLEMENTING_AGENCY', 'AAATQ1188C',
         N'2nd Floor, Institution of Engineers Building, Bahadur Shah Zafar Marg, New Delhi 110002', 'DL', '110002',
         N'contact@qcin.org', N'National'),

        ('ORG-STA-001', N'Directorate of Industries, Government of Maharashtra', 'STATE_SPECIFIC', NULL,
         N'2nd Floor, Udyog Bhavan, Mantralaya Road, Mumbai 400032', 'MH', '400032',
         N'di@maharashtra.gov.in', N'Maharashtra'),

        ('ORG-STA-002', N'Gujarat Industries Department',                 'STATE_SPECIFIC', NULL,
         N'Block 5, Sachivalaya, Gandhinagar 382010', 'GJ', '382010',
         N'industries@gujarat.gov.in', N'Gujarat'),

        ('ORG-COR-001', N'QuadTech Advisory LLP',                         'CONSULTANT_ORG', 'AAFQ7781M',
         N'407 Iscon Emporio, Satellite, Ahmedabad 380015', 'GJ', '380015',
         N'admin@quadtech.in', N'West India'),

        ('ORG-AGY-001', N'NABET Assessment Services',                     'ASSESSMENT_AGENCY', 'AABCN5521J',
         N'ITPI Building, 4-A Ring Road, IP Estate, New Delhi 110002', 'DL', '110002',
         N'admin@nabet-as.in', N'Silver & Gold')
    ) AS v (OrganisationCode, Name, AccountTypeCode, RegistrationNo, AddressLine,
            StateCode, Pincode, ContactEmail, JurisdictionScope)
    JOIN auth.AccountType at ON at.Code = v.AccountTypeCode
    JOIN master.State         s  ON s.Code  = v.StateCode
) AS src
   ON tgt.OrganisationCode = src.OrganisationCode
WHEN MATCHED THEN UPDATE SET
    Name = src.Name, RegistrationNo = src.RegistrationNo, AddressLine = src.AddressLine,
    StateId = src.StateId, Pincode = src.Pincode, ContactEmail = src.ContactEmail,
    JurisdictionScope = src.JurisdictionScope, ModifiedOnUtc = SYSUTCDATETIME()
WHEN NOT MATCHED BY TARGET THEN
    INSERT (OrganisationCode, Name, AccountTypeId, RegistrationNo, AddressLine,
            StateId, Pincode, ContactEmail, JurisdictionScope)
    VALUES (src.OrganisationCode, src.Name, src.AccountTypeId, src.RegistrationNo,
            src.AddressLine, src.StateId, src.Pincode, src.ContactEmail, src.JurisdictionScope);
GO

/*------------------------------------------------------------- SystemSetting
  Settings > System. IsSensitive marks the values the UI masks and the audit
  interceptor must never capture.
---------------------------------------------------------------------------*/
MERGE audit.SystemSetting AS tgt
USING (VALUES
    -- key                          value                     type      category         display name                              sensitive editable sort
    ('Portal.Name',                 N'MCLS Master Admin',     'String', N'General',      N'Portal name',                            0, 1,  1),
    ('Portal.SupportEmail',         N'support@mcls.gov.in',   'String', N'General',      N'Support e-mail address',                 0, 1,  2),
    ('Portal.SupportPhone',         N'1800-180-6763',         'String', N'General',      N'Support helpline',                       0, 1,  3),
    ('Portal.SessionTimeoutMinutes',N'30',                    'Int',    N'General',      N'Idle session timeout (minutes)',         0, 1,  4),

    ('Security.PasswordMinLength',      N'12',                'Int',    N'Security',     N'Minimum password length',                0, 1, 10),
    ('Security.PasswordExpiryDays',     N'90',                'Int',    N'Security',     N'Password expiry (days)',                 0, 1, 11),
    ('Security.MaxFailedAttempts',      N'5',                 'Int',    N'Security',     N'Failed attempts before lockout',         0, 1, 12),
    ('Security.LockoutMinutes',         N'15',                'Int',    N'Security',     N'Lockout duration (minutes)',             0, 1, 13),
    ('Security.RequireTwoFactor',       N'false',             'Bool',   N'Security',     N'Require two-factor authentication',      0, 1, 14),
    ('Security.PasswordHistoryCount',   N'5',                 'Int',    N'Security',     N'Passwords remembered before reuse',      0, 1, 15),

    ('Scheme.CertificateValidityYears', N'3',                 'Int',    N'Scheme',       N'Certificate validity (years)',           0, 1, 20),
    ('Scheme.InvoiceDueDays',           N'30',                'Int',    N'Scheme',       N'Invoice due period (days)',              0, 1, 21),
    ('Scheme.NcClosureDays',            N'30',                'Int',    N'Scheme',       N'Days allowed to close an NC',            0, 1, 22),
    ('Scheme.HandholdingTargetDays',    N'180',               'Int',    N'Scheme',       N'Target handholding duration (days)',     0, 1, 23),

    ('Upload.MaxFileSizeMb',            N'25',                'Int',    N'Uploads',      N'Maximum upload size (MB)',               0, 1, 30),
    ('Upload.AllowedExtensions',        N'.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg',
                                                              'String', N'Uploads',      N'Permitted file extensions',              0, 1, 31),
    ('Upload.RootPath',                 N'D:\MCLS\Uploads',   'String', N'Uploads',      N'Upload root folder on the server',       0, 0, 32),

    ('Email.FromAddress',               N'no-reply@mcls.gov.in','String',N'E-mail',      N'Sender address',                         0, 1, 40),
    ('Email.FromName',                  N'MCLS Portal',       'String', N'E-mail',       N'Sender display name',                    0, 1, 41),
    ('Email.SmtpHost',                  N'smtp.gov.in',       'String', N'E-mail',       N'SMTP host',                              0, 1, 42),
    ('Email.SmtpPort',                  N'587',               'Int',    N'E-mail',       N'SMTP port',                              0, 1, 43),
    ('Email.SmtpUseTls',                N'true',              'Bool',   N'E-mail',       N'Use STARTTLS',                           0, 1, 44),
    ('Email.SmtpUserName',              N'',                  'String', N'E-mail',       N'SMTP user name',                         0, 1, 45),
    ('Email.SmtpPassword',              N'',                  'String', N'E-mail',       N'SMTP password',                          1, 1, 46),
    ('Email.BatchSize',                 N'100',               'Int',    N'E-mail',       N'Messages dispatched per cycle',          0, 1, 47),
    ('Email.MaxRetries',                N'3',                 'Int',    N'E-mail',       N'Send attempts before giving up',         0, 1, 48),

    ('Retention.AuditLogDays',          N'2555',              'Int',    N'Retention',    N'Audit log retention (days)',             0, 1, 50),
    ('Retention.ErrorLogDays',          N'365',               'Int',    N'Retention',    N'Error log retention (days)',             0, 1, 51),
    ('Retention.EmailLogDays',          N'180',               'Int',    N'Retention',    N'E-mail log retention (days)',            0, 1, 52),

    ('Feature.EmailerEnabled',          N'true',              'Bool',   N'Features',     N'Emailer module enabled',                 0, 1, 60),
    ('Feature.PaymentGatewayEnabled',   N'false',             'Bool',   N'Features',     N'Online payment gateway enabled',         0, 1, 61),
    ('Feature.UdyamVerificationEnabled',N'false',             'Bool',   N'Features',     N'Live Udyam verification enabled',        0, 1, 62)
) AS src ([Key], Value, DataType, Category, DisplayName, IsSensitive, IsEditable, SortOrder)
   ON tgt.[Key] = src.[Key]
/* Only the metadata is refreshed on re-seed. The value is left alone so an
   upgrade never silently reverts a setting an administrator has changed. */
WHEN MATCHED THEN UPDATE SET
    DataType = src.DataType, Category = src.Category, DisplayName = src.DisplayName,
    IsSensitive = src.IsSensitive, IsEditable = src.IsEditable, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT ([Key], Value, DataType, Category, DisplayName, IsSensitive, IsEditable, SortOrder)
    VALUES (src.[Key], src.Value, src.DataType, src.Category, src.DisplayName,
            src.IsSensitive, src.IsEditable, src.SortOrder);
GO

/*-------------------------------------------------------------- EmailTemplate
  Transactional templates. Merge tags are the {{snake_case}} form the template
  editor offers; AvailableTags is both the editor's palette and the renderer's
  whitelist, so an unknown tag in a body is a validation error rather than a
  silent blank.
---------------------------------------------------------------------------*/
MERGE comm.EmailTemplate AS tgt
USING (VALUES
    ('USER_WELCOME', N'Welcome — account created',
     N'Your MCLS portal account is ready',
     N'<p>Dear {{user_name}},</p>
<p>An account has been created for you on the MCLS Master Admin portal as <strong>{{role_name}}</strong>.</p>
<p>Your user ID is <strong>{{user_code}}</strong>. Please sign in at {{portal_url}} and set a new password on first use.</p>
<p>Regards,<br/>MCLS Portal</p>',
     N'{{user_name}},{{user_code}},{{role_name}},{{portal_url}}', 1),

    ('USER_PASSWORD_RESET', N'Password reset',
     N'Reset your MCLS portal password',
     N'<p>Dear {{user_name}},</p>
<p>A password reset was requested for your account. Use the link below within {{expiry_minutes}} minutes:</p>
<p><a href="{{reset_url}}">Reset password</a></p>
<p>If you did not request this, no action is needed and your password is unchanged.</p>',
     N'{{user_name}},{{reset_url}},{{expiry_minutes}}', 1),

    ('USER_DISABLED', N'Account disabled',
     N'Your MCLS portal account has been disabled',
     N'<p>Dear {{user_name}},</p>
<p>Your portal account was disabled on {{action_date}}.</p>
<p>Reason recorded: {{reason}}</p>
<p>Contact your administrator if you believe this is in error.</p>',
     N'{{user_name}},{{action_date}},{{reason}}', 1),

    ('APPLICATION_REGISTERED', N'Application registered',
     N'MCLS application {{application_no}} registered',
     N'<p>Dear {{user_name}},</p>
<p>Application <strong>{{application_no}}</strong> for {{unit_name}} has been registered for {{tier}} certification.</p>
<p>The next step is payment of the applicable fee. Your share after subsidy is {{payable_amount}}.</p>',
     N'{{user_name}},{{unit_name}},{{application_no}},{{tier}},{{payable_amount}}', 1),

    ('PAYMENT_RECEIVED', N'Payment received',
     N'Payment received for {{application_no}}',
     N'<p>Dear {{user_name}},</p>
<p>We have received {{amount}} against application <strong>{{application_no}}</strong>.</p>
<p>Handholding will begin shortly and your assigned consultant will be in touch.</p>',
     N'{{user_name}},{{application_no}},{{amount}},{{unit_name}}', 1),

    ('ASSESSMENT_SCHEDULED', N'Assessment scheduled',
     N'{{tier}} assessment scheduled for {{unit_name}}',
     N'<p>Dear {{user_name}},</p>
<p>The {{tier}} assessment for <strong>{{unit_name}}</strong> is scheduled on <strong>{{assessment_date}}</strong>.</p>
<p>The assessment will be conducted by {{agency_name}}. Please keep the evidence records ready.</p>',
     N'{{user_name}},{{unit_name}},{{tier}},{{assessment_date}},{{agency_name}}', 1),

    ('NC_RAISED', N'Non-conformance raised',
     N'Non-conformance raised against {{application_no}}',
     N'<p>Dear {{user_name}},</p>
<p>{{nc_count}} non-conformance(s) were raised during the assessment of <strong>{{unit_name}}</strong>.</p>
<p>Corrective action is due by <strong>{{due_date}}</strong>.</p>',
     N'{{user_name}},{{unit_name}},{{application_no}},{{nc_count}},{{due_date}}', 1),

    ('CERTIFICATE_ISSUED', N'Certificate issued',
     N'{{tier}} certificate issued to {{unit_name}}',
     N'<p>Dear {{user_name}},</p>
<p>Congratulations. <strong>{{unit_name}}</strong> has been certified at <strong>{{tier}}</strong> level.</p>
<p>Certificate number {{certificate_no}}, valid until {{valid_till}}. Download it from the portal.</p>',
     N'{{user_name}},{{unit_name}},{{tier}},{{certificate_no}},{{valid_till}}', 1),

    ('APPLICATION_REJECTED', N'Application rejected',
     N'MCLS application {{application_no}} not approved',
     N'<p>Dear {{user_name}},</p>
<p>Application <strong>{{application_no}}</strong> for {{unit_name}} has not been approved.</p>
<p>Reason: {{reason}}</p>
<p>You may address the points raised and re-apply.</p>',
     N'{{user_name}},{{unit_name}},{{application_no}},{{reason}}', 1)
) AS src (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional)
   ON tgt.Code = src.Code
/* Bodies are editable in the portal, so an existing template is not
   overwritten — only a missing one is created. */
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Subject, BodyHtml, AvailableTags, IsTransactional)
    VALUES (src.Code, src.Name, src.Subject, src.BodyHtml, src.AvailableTags, src.IsTransactional);
GO

/* Who each transactional template is addressed to. */
MERGE comm.EmailTemplateAudience AS tgt
USING (
    SELECT t.EmailTemplateId, at.AccountTypeId
    FROM (VALUES
        ('USER_WELCOME',           'ALL'),
        ('USER_PASSWORD_RESET',    'ALL'),
        ('USER_DISABLED',          'ALL'),
        ('ASSESSMENT_SCHEDULED',   'ASSESSMENT_AGENCY'),
        ('ASSESSMENT_SCHEDULED',   'ASSESSORS'),
        ('NC_RAISED',              'CONSULTANTS'),
        ('NC_RAISED',              'CONSULTANT_ORG'),
        ('CERTIFICATE_ISSUED',     'IMPLEMENTING_AGENCY'),
        ('APPLICATION_REJECTED',   'IMPLEMENTING_AGENCY')
    ) AS v (TemplateCode, AccountTypeCode)
    JOIN comm.EmailTemplate t ON t.Code = v.TemplateCode
    JOIN auth.AccountType at
      ON v.AccountTypeCode = 'ALL' OR at.Code = v.AccountTypeCode
) AS src
   ON tgt.EmailTemplateId = src.EmailTemplateId AND tgt.AccountTypeId = src.AccountTypeId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (EmailTemplateId, AccountTypeId) VALUES (src.EmailTemplateId, src.AccountTypeId);
GO

/*----------------------------------------------------------------- ApiRegistry
  Settings > APIs. SecretRef names the configuration key or Windows credential
  holding the secret — the secret itself is never stored in the database.
---------------------------------------------------------------------------*/
MERGE audit.ApiRegistry AS tgt
USING (VALUES
    ('UDYAM_VERIFY',   N'Udyam Registration Verification',
     N'Verifies a unit''s Udyam registration number against the MSME registry.',
     'Outbound', N'https://udyamregistration.gov.in/api/v1', 'ApiKey', 'Integrations:Udyam:ApiKey', 30, 0),

    ('PAYMENT_GATEWAY',N'Payment Gateway',
     N'Collects the unit''s share of the certification fee.',
     'Outbound', N'https://api.payment-gateway.gov.in/v2', 'OAuth2', 'Integrations:PaymentGateway:ClientSecret', 45, 0),

    ('SMS_GATEWAY',    N'SMS Gateway',
     N'Transactional SMS for assessment scheduling and OTP.',
     'Outbound', N'https://sms.gov.in/api', 'ApiKey', 'Integrations:Sms:ApiKey', 20, 0),

    ('GSTN_LOOKUP',    N'GSTN Taxpayer Lookup',
     N'Validates the GSTIN captured against an enterprise.',
     'Outbound', N'https://api.gst.gov.in/taxpayerapi/v1.0', 'ApiKey', 'Integrations:Gstn:ApiKey', 30, 0),

    ('MCLS_PUBLIC',    N'MCLS Public Certificate Verification',
     N'Inbound endpoint letting third parties verify a certificate number.',
     'Inbound', NULL, 'ApiKey', 'Integrations:PublicApi:ApiKey', 30, 1)
) AS src (Code, Name, Description, Direction, BaseUrl, AuthType, SecretRef, TimeoutSeconds, IsEnabled)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    Name = src.Name, Description = src.Description, Direction = src.Direction,
    AuthType = src.AuthType, SecretRef = src.SecretRef
WHEN NOT MATCHED BY TARGET THEN
    INSERT (Code, Name, Description, Direction, BaseUrl, AuthType, SecretRef, TimeoutSeconds, IsEnabled)
    VALUES (src.Code, src.Name, src.Description, src.Direction, src.BaseUrl, src.AuthType,
            src.SecretRef, src.TimeoutSeconds, src.IsEnabled);
GO

PRINT N'Seed 4 — system configuration loaded.';
PRINT N'NOTE: the initial Super Admin is created by the API on first start.';
GO

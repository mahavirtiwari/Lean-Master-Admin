/*
    009 — System Settings screen (33-settings-system-green.svg).
    ------------------------------------------------------------------------
    The screen draws four named groups, a payment-gateway panel and a
    maintenance-mode panel. Three things are needed for that:

      1. audit.SystemSetting gains DefaultValue (the "Reset to Default" button
         has nothing to reset to without it), plus CategorySortOrder and
         IconKey so the group cards render in the drawn order with the drawn
         tile.

      2. The settings the design names are seeded. Where a setting already
         existed under a different name it is MOVED, not duplicated — e.g.
         Portal.SessionTimeoutMinutes becomes "Session Timeout (minutes)" in
         "Security & Access" rather than a second row saying the same thing.

      3. audit.PaymentGateway is created and seeded with the six gateways
         drawn, four of them active.

    Settings outside the drawn groups (E-mail, Uploads, Retention, Features)
    are real configuration and are kept; they sort after the drawn ones.

    Idempotent. Safe to re-run.
*/

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- ----------------------------------------------------------- 1. columns ---
IF COL_LENGTH('audit.SystemSetting', 'DefaultValue') IS NULL
    ALTER TABLE audit.SystemSetting ADD DefaultValue nvarchar(4000) NULL;
GO

IF COL_LENGTH('audit.SystemSetting', 'CategorySortOrder') IS NULL
    ALTER TABLE audit.SystemSetting ADD CategorySortOrder smallint NOT NULL
        CONSTRAINT DF_SystemSetting_CatSort DEFAULT 90;
GO

IF COL_LENGTH('audit.SystemSetting', 'IconKey') IS NULL
    ALTER TABLE audit.SystemSetting ADD IconKey varchar(30) NULL;
GO

-- ------------------------------------------------------- 2. the settings ---
-- One row per drawn field. MERGE so a re-run corrects the metadata without
-- overwriting a value an administrator has since changed.
DECLARE @s TABLE
(
    [Key]        varchar(100),
    Category     nvarchar(160),
    CatSort      smallint,
    IconKey      varchar(30),
    DisplayName  nvarchar(400),
    DataType     varchar(15),
    DefaultValue nvarchar(4000),
    SortOrder    smallint,
    Descr        nvarchar(1000)
);

INSERT INTO @s VALUES
 ('Portal.Name',       N'General', 1, 'sliders', N'Portal Display Name', 'String', N'MSME Competitive (LEAN) Scheme', 1, N'Shown in the masthead and on outgoing e-mail.'),
 ('Portal.FiscalYear', N'General', 1, 'sliders', N'Current Fiscal Year', 'String', N'FY 2026-27', 2, N'Drives the fiscal-year filter on the dashboard and reports.'),
 ('Portal.TimeZone',   N'General', 1, 'sliders', N'Default Time Zone',   'String', N'(GMT +05:30) India Standard Time', 3, N'Timestamps are stored in UTC and displayed in this zone.'),
 ('Portal.Language',   N'General', 1, 'sliders', N'Default Language',    'String', N'English (EN)', 4, N'Default interface language for new accounts.'),

 ('Scheme.CertificateValidityMonths', N'Certification Rules', 2, 'award', N'Certificate Validity (months)',       'Int',  N'36',    1, N'How long a LEAN certificate stays valid once issued.'),
 ('Scheme.RenewalWindowDays',         N'Certification Rules', 2, 'award', N'Renewal Window Before Expiry (days)', 'Int',  N'90',    2, N'How early an MSME may begin renewal.'),
 ('Scheme.AutoExpireLapsed',          N'Certification Rules', 2, 'award', N'Auto-expire Lapsed Certificates',     'Bool', N'true',  3, N'Moves a certificate to Expired without manual action.'),
 ('Scheme.AllowDirectBronzeToGold',   N'Certification Rules', 2, 'award', N'Allow Direct Bronze to Gold',         'Bool', N'false', 4, N'When off, Silver must be earned before Gold.'),

 ('Notify.Email',             N'Notifications', 3, 'bell', N'Email Notifications',           'Bool', N'true',  1, N'Master switch for transactional e-mail.'),
 ('Notify.Sms',               N'Notifications', 3, 'bell', N'SMS Notifications',             'Bool', N'true',  2, N'Master switch for SMS alerts.'),
 ('Notify.AssessorAllotment', N'Notifications', 3, 'bell', N'Assessor Allotment Alerts',     'Bool', N'true',  3, N'Notifies assessors and MSMEs when an allotment is made.'),
 ('Notify.WeeklyMisDigest',   N'Notifications', 3, 'bell', N'Weekly MIS Digest to Ministry', 'Bool', N'false', 4, N'Sends the weekly MIS summary to Ministry recipients.'),

 ('Security.RequireTwoFactor',    N'Security & Access', 4, 'shield', N'Enforce Two-Factor Authentication', 'Bool', N'true',  1, N'Requires a second factor for every administrative sign-in.'),
 ('Portal.SessionTimeoutMinutes', N'Security & Access', 4, 'shield', N'Session Timeout (minutes)',         'Int',  N'30',    2, N'Idle time before a session is ended.'),
 ('Security.PasswordExpiryDays',  N'Security & Access', 4, 'shield', N'Password Rotation (days)',          'Int',  N'90',    3, N'How often a password must be changed.'),
 ('Security.IpAllowListAdmin',    N'Security & Access', 4, 'shield', N'IP Allow-list for Admin Roles',     'Bool', N'false', 4, N'Restricts administrative sign-in to approved addresses.'),

 ('Maintenance.Enabled',    N'Maintenance Mode', 5, 'wrench', N'Maintenance Mode',              'Bool',   N'false', 1, N'Takes the portal offline for MSMEs while keeping admin access available.'),
 ('Maintenance.Banner',     N'Maintenance Mode', 5, 'wrench', N'Banner Message Shown to Users', 'String', N'Scheduled maintenance 02:00-04:00 IST. Assessment booking will be unavailable.', 2, N'Displayed to MSMEs while maintenance mode is on.'),
 ('Maintenance.WindowFrom', N'Maintenance Mode', 5, 'wrench', N'Window From',                   'String', N'02:00', 3, N'Start of the scheduled window, IST.'),
 ('Maintenance.WindowTo',   N'Maintenance Mode', 5, 'wrench', N'Window To',                     'String', N'04:00', 4, N'End of the scheduled window, IST.');

MERGE audit.SystemSetting AS t
USING @s AS s ON t.[Key] = s.[Key]
WHEN MATCHED THEN UPDATE SET
    t.Category          = s.Category,
    t.CategorySortOrder = s.CatSort,
    t.IconKey           = s.IconKey,
    t.DisplayName       = s.DisplayName,
    t.DataType          = s.DataType,
    t.DefaultValue      = s.DefaultValue,
    t.SortOrder         = s.SortOrder,
    t.Description       = s.Descr
WHEN NOT MATCHED THEN
    INSERT ([Key], Value, DataType, Category, CategorySortOrder, IconKey, DisplayName,
            Description, IsSensitive, IsEditable, SortOrder, DefaultValue)
    VALUES (s.[Key], s.DefaultValue, s.DataType, s.Category, s.CatSort, s.IconKey, s.DisplayName,
            s.Descr, 0, 1, s.SortOrder, s.DefaultValue);

-- Certificate validity is expressed in months on this screen; the years row
-- would otherwise say the same thing twice.
DELETE FROM audit.SystemSetting WHERE [Key] = 'Scheme.CertificateValidityYears';

-- The General card is drawn with exactly four fields. The support contacts
-- were filed under General but are not on it, so they move to their own
-- category rather than stretching the card.
UPDATE audit.SystemSetting
SET    Category = N'Support', CategorySortOrder = 90, IconKey = 'headset'
WHERE  [Key] IN ('Portal.SupportEmail', 'Portal.SupportPhone');

-- Everything not drawn keeps working and simply sorts below the drawn groups.
UPDATE audit.SystemSetting
SET    DefaultValue = ISNULL(DefaultValue, Value);

-- A setting nobody has edited should read as the screen draws it. Rows an
-- administrator HAS changed keep their value — the point of the MERGE above is
-- that re-running this migration must not undo somebody's work.
UPDATE audit.SystemSetting
SET    Value = DefaultValue
WHERE  ModifiedOnUtc IS NULL
  AND  DefaultValue IS NOT NULL
  AND  Category IN (N'General', N'Certification Rules', N'Notifications',
                    N'Security & Access', N'Maintenance Mode');

-- Every card draws a tile, including the groups the artboard does not name.
UPDATE audit.SystemSetting SET IconKey = 'sliders' WHERE IconKey IS NULL;

-- A category is one card, so every row in it must carry the same sort value —
-- otherwise a category that holds both drawn and undrawn settings (General
-- does: the drawn four plus the support contacts) renders as two cards with
-- the same heading.
UPDATE t
SET    t.CategorySortOrder = m.CatSort,
       t.IconKey           = ISNULL(t.IconKey, m.Icon)
FROM   audit.SystemSetting AS t
INNER JOIN
(
    SELECT Category,
           CatSort = MIN(CategorySortOrder),
           Icon    = MIN(IconKey)
    FROM   audit.SystemSetting
    GROUP  BY Category
) AS m ON m.Category = t.Category;
GO

-- -------------------------------------------------- 3. payment gateways ---
IF OBJECT_ID('audit.PaymentGateway') IS NULL
BEGIN
    CREATE TABLE audit.PaymentGateway
    (
        PaymentGatewayId int IDENTITY(1,1) NOT NULL,
        Code             varchar(30)   NOT NULL,
        Name             nvarchar(120) NOT NULL,
        -- "Primary" / "Fallback" / "Disabled", drawn under the gateway name.
        RoleLabel        nvarchar(30)  NOT NULL CONSTRAINT DF_PayGw_Role    DEFAULT N'Fallback',
        Mode             varchar(10)   NOT NULL CONSTRAINT DF_PayGw_Mode    DEFAULT 'Test',
        -- Masked at rest: the real merchant key never reaches this table.
        MerchantKeyMask  nvarchar(60)  NULL,
        Priority         tinyint       NULL,
        LastTxnOnUtc     datetime2(3)  NULL,
        SuccessRate      decimal(5,2)  NULL,
        IsEnabled        bit           NOT NULL CONSTRAINT DF_PayGw_Enabled DEFAULT 0,
        SortOrder        smallint      NOT NULL CONSTRAINT DF_PayGw_Sort    DEFAULT 0,
        ModifiedOnUtc    datetime2(3)  NULL,
        ModifiedByUserId int           NULL,
        CONSTRAINT PK_PaymentGateway PRIMARY KEY (PaymentGatewayId),
        CONSTRAINT UQ_PaymentGateway_Code UNIQUE (Code),
        CONSTRAINT CK_PaymentGateway_Mode CHECK (Mode IN ('Live', 'Test'))
    );
END;
GO

MERGE audit.PaymentGateway AS t
USING (VALUES
    ('RAZORPAY', N'Razorpay',       N'Primary',  'Live', N'rzp_live_****7xK2',    1,    2,   98.40, 1, 1),
    ('PAYU',     N'PayU Money',     N'Fallback', 'Live', N'payu_****m9Lp',        2,    5,   97.10, 1, 2),
    ('SBIEPAY',  N'SBI ePay',       N'Fallback', 'Live', N'sbi_****3kRt',         3,   24,   96.20, 1, 3),
    ('BILLDESK', N'BillDesk',       N'Fallback', 'Live', N'bdk_****8Qw5',         4,   72,   94.80, 1, 4),
    ('HDFCEPAY', N'HDFC ePay',      N'Disabled', 'Test', NULL,                 NULL, NULL,    NULL, 0, 5),
    ('PAYTM',    N'Paytm Payments', N'Disabled', 'Test', N'ptm_test_****2Vb9', NULL,  288,    NULL, 0, 6)
) AS s (Code, Name, RoleLabel, Mode, MerchantKeyMask, Priority, HoursAgo, SuccessRate, IsEnabled, SortOrder)
ON t.Code = s.Code
WHEN NOT MATCHED THEN
    INSERT (Code, Name, RoleLabel, Mode, MerchantKeyMask, Priority, LastTxnOnUtc,
            SuccessRate, IsEnabled, SortOrder)
    VALUES (s.Code, s.Name, s.RoleLabel, s.Mode, s.MerchantKeyMask, s.Priority,
            CASE WHEN s.HoursAgo IS NULL THEN NULL
                 ELSE DATEADD(HOUR, -s.HoursAgo, SYSUTCDATETIME()) END,
            s.SuccessRate, s.IsEnabled, s.SortOrder);
GO

SELECT Category, CategorySortOrder, COUNT(*) AS Settings
FROM   audit.SystemSetting
GROUP  BY Category, CategorySortOrder
ORDER  BY CategorySortOrder, Category;

SELECT Code, Name, RoleLabel, Mode, Priority, SuccessRate, IsEnabled
FROM   audit.PaymentGateway ORDER BY SortOrder;

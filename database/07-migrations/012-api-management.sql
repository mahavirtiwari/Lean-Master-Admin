/*
    012 — API Management screen (36-settings-apis-green.svg).
    ------------------------------------------------------------------------
    audit.ApiRegistry already records the integrations the portal CALLS. This
    screen is about the other direction: the API the portal EXPOSES — its keys,
    its endpoints, the rate limits applied to callers and the webhooks it
    posts out. Four tables, because those are four different lifetimes:

      ApiKey        issued, rotated and revoked per consumer
      ApiEndpoint   published, versioned and eventually deprecated
      ApiRateLimit  a tier, changed by policy
      Webhook       an outbound subscription

    ApiKey stores a PREFIX ONLY (mcls_live_****4kA2). The key itself is shown
    once at generation and never again; a table that could return a live key on
    a GET is a credential store waiting to leak.

    Idempotent.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

-- --------------------------------------------------------------- keys -----
IF OBJECT_ID('audit.ApiKey') IS NULL
BEGIN
    CREATE TABLE audit.ApiKey
    (
        ApiKeyId      int IDENTITY(1,1) NOT NULL,
        Name          nvarchar(150) NOT NULL,
        -- Masked. The secret is hashed into KeyHash and never returned.
        KeyPrefix     nvarchar(40)  NOT NULL,
        KeyHash       varbinary(64) NULL,
        Owner         nvarchar(150) NOT NULL,
        Status        varchar(15)   NOT NULL CONSTRAINT DF_ApiKey_Status DEFAULT 'Live',
        LastUsedOnUtc datetime2(3)  NULL,
        CreatedOnUtc  datetime2(3)  NOT NULL CONSTRAINT DF_ApiKey_Created DEFAULT SYSUTCDATETIME(),
        RevokedOnUtc  datetime2(3)  NULL,
        SortOrder     smallint      NOT NULL CONSTRAINT DF_ApiKey_Sort DEFAULT 0,
        CONSTRAINT PK_ApiKey PRIMARY KEY (ApiKeyId),
        CONSTRAINT UQ_ApiKey_Prefix UNIQUE (KeyPrefix),
        CONSTRAINT CK_ApiKey_Status CHECK (Status IN ('Live', 'Revoked'))
    );
END;
GO

-- ---------------------------------------------------------- endpoints -----
IF OBJECT_ID('audit.ApiEndpoint') IS NULL
BEGIN
    CREATE TABLE audit.ApiEndpoint
    (
        ApiEndpointId int IDENTITY(1,1) NOT NULL,
        Method        varchar(10)   NOT NULL,
        Route         nvarchar(200) NOT NULL,
        Description   nvarchar(300) NULL,
        Calls24h      int           NOT NULL CONSTRAINT DF_ApiEndpoint_Calls DEFAULT 0,
        ErrorRate     decimal(5,2)  NOT NULL CONSTRAINT DF_ApiEndpoint_Err   DEFAULT 0,
        Status        varchar(15)   NOT NULL CONSTRAINT DF_ApiEndpoint_Status DEFAULT 'Live',
        SortOrder     smallint      NOT NULL CONSTRAINT DF_ApiEndpoint_Sort  DEFAULT 0,
        CONSTRAINT PK_ApiEndpoint PRIMARY KEY (ApiEndpointId),
        CONSTRAINT UQ_ApiEndpoint_Route UNIQUE (Method, Route),
        CONSTRAINT CK_ApiEndpoint_Status CHECK (Status IN ('Live', 'Deprecated'))
    );
END;
GO

-- -------------------------------------------------------- rate limits -----
IF OBJECT_ID('audit.ApiRateLimit') IS NULL
BEGIN
    CREATE TABLE audit.ApiRateLimit
    (
        ApiRateLimitId  int IDENTITY(1,1) NOT NULL,
        TierName        nvarchar(100) NOT NULL,
        RequestsPerMin  int           NOT NULL,
        -- What the tier is actually using, which is what the bar shows.
        CurrentUsage    int           NOT NULL CONSTRAINT DF_ApiRateLimit_Use DEFAULT 0,
        SortOrder       smallint      NOT NULL CONSTRAINT DF_ApiRateLimit_Sort DEFAULT 0,
        CONSTRAINT PK_ApiRateLimit PRIMARY KEY (ApiRateLimitId),
        CONSTRAINT UQ_ApiRateLimit_Tier UNIQUE (TierName)
    );
END;
GO

-- ----------------------------------------------------------- webhooks -----
IF OBJECT_ID('audit.Webhook') IS NULL
BEGIN
    CREATE TABLE audit.Webhook
    (
        WebhookId    int IDENTITY(1,1) NOT NULL,
        Event        nvarchar(120) NOT NULL,
        TargetUrl    nvarchar(400) NOT NULL,
        Status       varchar(15)   NOT NULL CONSTRAINT DF_Webhook_Status DEFAULT 'Live',
        LastSentUtc  datetime2(3)  NULL,
        SortOrder    smallint      NOT NULL CONSTRAINT DF_Webhook_Sort DEFAULT 0,
        CONSTRAINT PK_Webhook PRIMARY KEY (WebhookId),
        CONSTRAINT UQ_Webhook_Event UNIQUE (Event),
        CONSTRAINT CK_Webhook_Status CHECK (Status IN ('Live', 'Paused', 'Failing'))
    );
END;
GO

-- -------------------------------------------------------------- seed ------
MERGE audit.ApiKey AS t
USING (VALUES
    (N'Udyam Verification Integration', N'mcls_live_****4kA2', N'Ministry of MSME',   'Live',      0, 1),
    (N'Payment Gateway Callback',       N'mcls_live_****9Zt7', N'Payment Operations','Live',      0, 2),
    (N'State Portal Data Feed',         N'mcls_live_****2Qm4', N'State MSME Depts.', 'Live',      1, 3),
    (N'Assessment Agency Sync',         N'mcls_test_****7Bd1', N'IntegriCert Bureau','Revoked',   6, 4)
) AS s (Name, KeyPrefix, Owner, Status, DaysAgo, SortOrder)
ON t.KeyPrefix = s.KeyPrefix
WHEN NOT MATCHED THEN
    INSERT (Name, KeyPrefix, Owner, Status, LastUsedOnUtc, RevokedOnUtc, SortOrder)
    VALUES (s.Name, s.KeyPrefix, s.Owner, s.Status,
            DATEADD(DAY, -s.DaysAgo, SYSUTCDATETIME()),
            CASE WHEN s.Status = 'Revoked' THEN DATEADD(DAY, -s.DaysAgo, SYSUTCDATETIME()) END,
            s.SortOrder);

MERGE audit.ApiEndpoint AS t
USING (VALUES
    ('GET',  N'/v1/msme/{udyam}',            N'Udyam profile lookup',      128400, 0.11, 'Live',       1),
    ('POST', N'/v1/application/register',    N'Create registration',        42180, 0.28, 'Live',       2),
    ('GET',  N'/v1/application/{id}/status', N'Application status',         96220, 0.09, 'Live',       3),
    ('POST', N'/v1/assessment/schedule',     N'Schedule assessment',         8940, 0.61, 'Live',       4),
    ('GET',  N'/v1/certificate/{no}/verify', N'Certificate verification',   74660, 0.05, 'Live',       5),
    ('POST', N'/v1/payment/callback',        N'Gateway callback',           31020, 1.84, 'Live',       6),
    ('GET',  N'/v1/reports/mis',             N'MIS extract',                 2410, 0.42, 'Live',       7),
    ('GET',  N'/v0/msme/search',             N'Legacy enterprise search',    6180, 2.96, 'Deprecated', 8)
) AS s (Method, Route, Description, Calls24h, ErrorRate, Status, SortOrder)
ON t.Method = s.Method AND t.Route = s.Route
WHEN NOT MATCHED THEN
    INSERT (Method, Route, Description, Calls24h, ErrorRate, Status, SortOrder)
    VALUES (s.Method, s.Route, s.Description, s.Calls24h, s.ErrorRate, s.Status, s.SortOrder);

MERGE audit.ApiRateLimit AS t
USING (VALUES
    (N'Default tier',         1000,  420, 1),
    (N'Ministry integration', 5000, 3400, 2),
    (N'State portal feed',    2000, 1620, 3)
) AS s (TierName, RequestsPerMin, CurrentUsage, SortOrder)
ON t.TierName = s.TierName
WHEN NOT MATCHED THEN
    INSERT (TierName, RequestsPerMin, CurrentUsage, SortOrder)
    VALUES (s.TierName, s.RequestsPerMin, s.CurrentUsage, s.SortOrder);

MERGE audit.Webhook AS t
USING (VALUES
    (N'Payment settlement',   N'https://mcls.gov.in/hooks/pay',  'Live', 1),
    (N'Certificate issued',   N'https://mcls.gov.in/hooks/cert', 'Live', 2),
    (N'Assessment completed', N'https://mcls.gov.in/hooks/asmt', 'Live', 3)
) AS s (Event, TargetUrl, Status, SortOrder)
ON t.Event = s.Event
WHEN NOT MATCHED THEN
    INSERT (Event, TargetUrl, Status, LastSentUtc, SortOrder)
    VALUES (s.Event, s.TargetUrl, s.Status, DATEADD(MINUTE, -s.SortOrder * 17, SYSUTCDATETIME()), s.SortOrder);
GO

SELECT Keys_ = (SELECT COUNT(*) FROM audit.ApiKey),
       LiveKeys = (SELECT COUNT(*) FROM audit.ApiKey WHERE Status = 'Live'),
       Endpoints = (SELECT COUNT(*) FROM audit.ApiEndpoint),
       LiveEndpoints = (SELECT COUNT(*) FROM audit.ApiEndpoint WHERE Status = 'Live'),
       Tiers = (SELECT COUNT(*) FROM audit.ApiRateLimit),
       Hooks = (SELECT COUNT(*) FROM audit.Webhook);

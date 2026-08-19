/*
    Demo error log for the Error Logs screen.
    ------------------------------------------------------------------------
    The screen is drawn against a populated log: five count tiles, a fourteen-
    day volume chart and rows grouped by error code with an occurrence count.
    A freshly installed portal has raised no unhandled errors at all, so the
    screen is empty without this.

    These rows are SYNTHETIC and marked as such: every seeded row carries
    CorrelationId = '00000000-0000-0000-0000-0000000000DE', so they can be told
    apart from a genuine fault and removed in one statement.

    The eight codes and messages are the ones the artboard names; the volume
    behind each is generated so the chart and the COUNT column have something
    to show.

    Safe to re-run. NEVER run against production.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @marker uniqueidentifier = '00000000-0000-0000-0000-0000000000DE';

BEGIN TRANSACTION;

DELETE FROM audit.ErrorLog WHERE CorrelationId = @marker;

-- The faults the screen names, with the module each belongs to.
DECLARE @faults TABLE
(
    RowNo      int IDENTITY(1,1),
    ErrorCode  varchar(30),
    Severity   varchar(20),
    ModuleCode varchar(30),
    Message    nvarchar(500),
    Occurs     int,
    Status     varchar(15),
    Source     nvarchar(200),
    Path       nvarchar(300),
    StatusCode int
);

INSERT INTO @faults (ErrorCode, Severity, ModuleCode, Message, Occurs, Status, Source, Path, StatusCode) VALUES
 ('ERR-PAY-5021',  'Critical', 'FEE_STRUCTURE', N'Razorpay webhook signature mismatch on callback',            14,  'Open',         N'PaymentWebhookHandler', N'/api/payments/webhook',        400),
 ('ERR-ASM-3310',  'Error',    'ASSESSMENTS',  N'Assessor allotment failed - no assessor available in cluster', 32, 'Open',         N'AssessorAllotmentService', N'/api/assessments/allot',    409),
 ('ERR-DOC-2140',  'Error',    'DOCUMENTS',    N'File virus-scan timeout on 25MB upload',                       9,  'Acknowledged', N'DocumentScanService',   N'/api/documents/upload',        504),
 ('ERR-AUTH-1102', 'Warning',  'USER_MGMT',    N'Repeated failed login attempts from single IP',              118,  'Acknowledged', N'AuthController',        N'/api/auth/login',              429),
 ('ERR-RPT-4408',  'Error',    'REPORTS',      N'MIS export job exceeded 120s execution limit',                 6,  'Resolved',     N'ReportExportJob',       N'/api/reports/mis/export',      504),
 ('ERR-PAY-5044',  'Critical', 'FEE_STRUCTURE', N'Reconciliation mismatch - 3 transactions unsettled',           3,  'Open',         N'ReconciliationJob',     N'/api/payments/reconcile',      500),
 ('ERR-QNR-6017',  'Warning',  'QUES_SILVER',  N'Draft question published without negative-marking value',     21,  'Resolved',     N'QuestionnaireValidator', N'/api/questionnaires/publish', 422),
 ('ERR-API-7003',  'Error',    'SETTINGS',     N'Udyam verification API returned 503 upstream',                44,  'Resolved',     N'UdyamRegistryClient',   N'/api/udyam/lookup',            503);

-- One row per occurrence, spread across the last fourteen days so the volume
-- chart has a shape and the COUNT column adds up to what is drawn.
WITH N AS
(
    SELECT TOP (500) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.all_objects
)
INSERT INTO audit.ErrorLog
(
    OccurredOnUtc, Severity, Source, ExceptionType, Message, RequestMethod,
    RequestPath, StatusCode, ErrorCode, ModuleId, Status, IsResolved,
    ResolvedOnUtc, CorrelationId
)
SELECT
    -- Spread each fault's occurrences across the whole fourteen-day window.
    -- Scaling by Occurs matters: a fixed step leaves a fault with few
    -- occurrences bunched into the first day or two, which makes the volume
    -- chart read as two spikes and twelve empty days.
    DATEADD(MINUTE,
            -( (N.n * 20160 / f.Occurs) + (f.RowNo * 53 + N.n * 17) % 720 ),
            SYSUTCDATETIME()),
    f.Severity,
    f.Source,
    N'System.InvalidOperationException',
    f.Message,
    'POST',
    f.Path,
    f.StatusCode,
    f.ErrorCode,
    m.ModuleId,
    f.Status,
    CASE WHEN f.Status = 'Resolved' THEN 1 ELSE 0 END,
    CASE WHEN f.Status = 'Resolved'
         THEN DATEADD(HOUR, -( N.n % 72 ), SYSUTCDATETIME()) END,
    @marker
FROM   @faults AS f
INNER  JOIN N ON N.n <= f.Occurs
LEFT   JOIN auth.Module AS m ON m.Code = f.ModuleCode;

-- Background noise: the Info tile counts routine events, which is why it is
-- an order of magnitude larger than the rest.
WITH N AS
(
    SELECT TOP (1204) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS n
    FROM sys.all_objects a CROSS JOIN sys.all_objects b
)
INSERT INTO audit.ErrorLog
(
    OccurredOnUtc, Severity, Source, Message, RequestMethod, RequestPath,
    StatusCode, ErrorCode, ModuleId, Status, IsResolved, CorrelationId
)
SELECT
    DATEADD(MINUTE, -( n * 17 % 20160 ), SYSUTCDATETIME()),
    'Info',
    N'RequestLoggingMiddleware',
    N'Request completed with a non-2xx status',
    'GET',
    N'/api/reference/districts',
    404,
    'ERR-REQ-0404',
    NULL,
    'Resolved',
    1,
    @marker
FROM N;

COMMIT TRANSACTION;

SELECT Severity, COUNT(*) AS Entries FROM audit.ErrorLog GROUP BY Severity ORDER BY 2 DESC;

SELECT DistinctCodes = COUNT(DISTINCT ErrorCode), TotalEvents = COUNT(*)
FROM   audit.ErrorLog;

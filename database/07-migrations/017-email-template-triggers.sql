/*
    017 — Trigger event, reply-to and copy-to on transactional templates.
    ------------------------------------------------------------------------
    80-emailer-templates-green.svg lists a TRIGGER EVENT per template and states
    that it is fixed once the template is created; 81 adds REPLY-TO ADDRESS and
    COPY TO. None of the three had a column.

    TriggerEvent is the scheme event that fires the mail, in the reader's
    words ("MSME submits registration"). It is deliberately separate from Code:
    Code is the key the API sends by, TriggerEvent is what the screen shows, and
    conflating them would mean renaming a key to reword a label.

    A CHECK keeps ReplyToAddress looking like an address rather than validating
    deliverability, which only sending can establish.

    Idempotent.
*/

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

IF COL_LENGTH('comm.EmailTemplate', 'TriggerEvent') IS NULL
    ALTER TABLE comm.EmailTemplate ADD TriggerEvent nvarchar(150) NULL;
GO

IF COL_LENGTH('comm.EmailTemplate', 'ReplyToAddress') IS NULL
    ALTER TABLE comm.EmailTemplate ADD ReplyToAddress nvarchar(256) NULL;
GO

IF COL_LENGTH('comm.EmailTemplate', 'CopyToAddress') IS NULL
    ALTER TABLE comm.EmailTemplate ADD CopyToAddress nvarchar(256) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_EmailTemplate_ReplyTo')
    ALTER TABLE comm.EmailTemplate ADD CONSTRAINT CK_EmailTemplate_ReplyTo
        CHECK (ReplyToAddress IS NULL OR ReplyToAddress LIKE '%_@_%._%');
GO

-- The trigger wording the screen shows, mapped onto the templates that exist.
MERGE comm.EmailTemplate AS t
USING (VALUES
    ('APPLICATION_REGISTERED', N'MSME submits registration'),
    ('PAYMENT_RECEIVED',       N'Payment received'),
    ('HANDHOLDING_STARTED',    N'Handholding starts'),
    ('ASSESSMENT_SCHEDULED',   N'Assessment scheduled'),
    ('NC_RAISED',              N'Non-conformance raised'),
    ('NC_CLOSED',              N'Non-conformance closed'),
    ('CERTIFICATE_ISSUED',     N'Certificate issued'),
    ('APPLICATION_REJECTED',   N'Application rejected'),
    ('USER_ACTIVATED',         N'User account activated'),
    ('PASSWORD_RESET',         N'Password reset requested'),
    ('CERTIFICATE_EXPIRING',   N'Certificate nearing expiry'),
    ('INVOICE_RAISED',         N'Invoice raised')
) AS s (Code, TriggerEvent)
ON t.Code = s.Code
WHEN MATCHED AND t.TriggerEvent IS NULL THEN
    UPDATE SET t.TriggerEvent = s.TriggerEvent;

-- Anything still without a trigger gets one derived from its own name, so the
-- TRIGGER EVENT column is never blank on the screen.
UPDATE comm.EmailTemplate
SET    TriggerEvent = Name
WHERE  TriggerEvent IS NULL AND IsTransactional = 1;

-- The Ministry's no-reply mailbox, which is what the artboard shows.
UPDATE comm.EmailTemplate
SET    ReplyToAddress = N'no-reply@mcls.msme.gov.in'
WHERE  ReplyToAddress IS NULL AND IsTransactional = 1;
GO

SELECT Code, TriggerEvent, ReplyToAddress, IsActive
FROM   comm.EmailTemplate
WHERE  IsTransactional = 1
ORDER  BY Code;

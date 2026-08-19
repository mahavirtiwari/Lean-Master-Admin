/*===========================================================================
  Stored procedures — the operations that must be atomic or that enforce a
  rule the application layer should not be trusted to remember.

  Everything else (plain CRUD, list paging) goes through EF Core; there is no
  procedure here that exists only to wrap a SELECT.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*--------------------------------------------------------- audit.usp_NextSequence
  Hands out the next human-readable number for a sequence, atomically.

  The UPDATE ... SET @v = LastValue = LastValue + 1 pattern reads and writes
  under one exclusive lock, so two concurrent callers cannot receive the same
  number. MAX()+1 would race; an IDENTITY column cannot reset per year.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE audit.usp_NextSequence
    @SequenceName   varchar(50),
    @PeriodKey      varchar(10) = '',
    @FormattedValue varchar(40) OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    DECLARE @next int, @prefix varchar(20), @pad tinyint;

    /* Create the counter row on first use. The WHERE NOT EXISTS guard plus
       the primary key means a concurrent creator loses harmlessly. */
    IF NOT EXISTS (SELECT 1 FROM audit.SequenceCounter
                    WHERE SequenceName = @SequenceName AND PeriodKey = @PeriodKey)
    BEGIN
        BEGIN TRY
            INSERT INTO audit.SequenceCounter (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
            SELECT @SequenceName, @PeriodKey, 0, sc.Prefix, sc.PadWidth
            FROM (SELECT TOP 1 Prefix, PadWidth
                  FROM audit.SequenceCounter
                  WHERE SequenceName = @SequenceName) sc;

            /* No template row existed either — fall back to defaults. */
            IF @@ROWCOUNT = 0
                INSERT INTO audit.SequenceCounter (SequenceName, PeriodKey, LastValue, Prefix, PadWidth)
                VALUES (@SequenceName, @PeriodKey, 0, NULL, 6);
        END TRY
        BEGIN CATCH
            IF ERROR_NUMBER() <> 2627 AND ERROR_NUMBER() <> 2601 THROW;  -- lost the race: fine
        END CATCH
    END

    UPDATE audit.SequenceCounter
    SET  @next   = LastValue = LastValue + 1,
         @prefix = Prefix,
         @pad    = PadWidth
    WHERE SequenceName = @SequenceName AND PeriodKey = @PeriodKey;

    SET @FormattedValue =
        ISNULL(@prefix, '') +
        CASE WHEN @PeriodKey = '' THEN '' ELSE @PeriodKey + '/' END +
        RIGHT(REPLICATE('0', @pad) + CAST(@next AS varchar(10)), @pad);
END
GO

/*------------------------------------------------------ auth.usp_User_SetStatus
  Enable or disable an account. The portal always asks for a reason first, so
  the reason is mandatory here too and the history row is written in the same
  transaction as the status change — they cannot diverge.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE auth.usp_User_SetStatus
    @UserId         int,
    @ToStatusId     tinyint,
    @Reason         nvarchar(1000),
    @ChangedByUserId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF LEN(LTRIM(RTRIM(ISNULL(@Reason, N'')))) < 5
    BEGIN
        RAISERROR (N'A reason of at least 5 characters is required.', 16, 1);
        RETURN;
    END

    BEGIN TRAN;

        DECLARE @from tinyint;

        SELECT @from = StatusId
        FROM auth.[User] WITH (UPDLOCK, ROWLOCK)
        WHERE Id = @UserId AND IsDeleted = 0;

        IF @from IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'User %d was not found.', 16, 1, @UserId);
            RETURN;
        END

        IF @from = @ToStatusId
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'The account is already in that status.', 16, 1);
            RETURN;
        END

        UPDATE auth.[User]
        SET StatusId         = @ToStatusId,
            ModifiedOnUtc    = SYSUTCDATETIME(),
            ModifiedByUserId = @ChangedByUserId
        WHERE Id = @UserId;

        INSERT INTO auth.UserStatusHistory (UserId, FromStatusId, ToStatusId, Reason, ChangedByUserId)
        VALUES (@UserId, @from, @ToStatusId, @Reason, @ChangedByUserId);

        /* Disabling an account must also end its sessions, or the user keeps
           working until their refresh token expires. */
        IF EXISTS (SELECT 1 FROM auth.UserStatus WHERE StatusId = @ToStatusId AND Code <> 'ACTIVE')
            UPDATE auth.RefreshToken
            SET RevokedOnUtc = SYSUTCDATETIME()
            WHERE UserId = @UserId AND RevokedOnUtc IS NULL;

    COMMIT TRAN;
END
GO

/*------------------------------------------- auth.usp_User_ReplacePermissions
  The Edit Permissions screen posts the whole grid. Rather than diffing in the
  API, it sends the full desired set and this replaces the overrides in one go.

  @Permissions is a TVP of (PermissionId, IsGranted).
---------------------------------------------------------------------------*/
IF TYPE_ID(N'auth.PermissionGrantList') IS NULL
    CREATE TYPE auth.PermissionGrantList AS TABLE
    (
        PermissionId smallint NOT NULL PRIMARY KEY,
        IsGranted    bit      NOT NULL
    );
GO

CREATE OR ALTER PROCEDURE auth.usp_User_ReplacePermissions
    @UserId         int,
    @Permissions    auth.PermissionGrantList READONLY,
    @SetByUserId    int,
    @Reason         nvarchar(400) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

        IF NOT EXISTS (SELECT 1 FROM auth.[User] WHERE Id = @UserId AND IsDeleted = 0)
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'User %d was not found.', 16, 1, @UserId);
            RETURN;
        END

        /* Only store an override where the requested state differs from what
           the role already gives. Storing redundant overrides would freeze the
           user against future role changes. */
        ;WITH RoleGrant AS
        (
            SELECT rp.PermissionId
            FROM auth.[User] u
            JOIN auth.RolePermission rp ON rp.RoleId = u.RoleId
            WHERE u.Id = @UserId
        ),
        Desired AS
        (
            SELECT p.PermissionId, p.IsGranted,
                   CAST(CASE WHEN rg.PermissionId IS NULL THEN 0 ELSE 1 END AS bit) AS FromRole
            FROM @Permissions p
            LEFT JOIN RoleGrant rg ON rg.PermissionId = p.PermissionId
        )
        MERGE auth.UserPermissionOverride AS tgt
        USING (SELECT PermissionId, IsGranted FROM Desired WHERE IsGranted <> FromRole) AS src
           ON tgt.UserId = @UserId AND tgt.PermissionId = src.PermissionId
        WHEN MATCHED AND tgt.IsGranted <> src.IsGranted THEN
            UPDATE SET IsGranted = src.IsGranted,
                       Reason    = @Reason,
                       SetByUserId = @SetByUserId,
                       SetOnUtc  = SYSUTCDATETIME()
        WHEN NOT MATCHED BY TARGET THEN
            INSERT (UserId, PermissionId, IsGranted, Reason, SetByUserId)
            VALUES (@UserId, src.PermissionId, src.IsGranted, @Reason, @SetByUserId)
        WHEN NOT MATCHED BY SOURCE AND tgt.UserId = @UserId THEN
            DELETE;

    COMMIT TRAN;
END
GO

/*------------------------------------------ msme.usp_Application_ChangeStatus
  Moves an application along the pipeline. Refuses any transition that
  ApplicationStatusTransition does not list, and stamps the matching milestone
  column so the list views do not have to walk the history table.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE msme.usp_Application_ChangeStatus
    @ApplicationId  int,
    @ToStatusId     tinyint,
    @Remark         nvarchar(1000) = NULL,
    @ChangedByUserId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

        DECLARE @from tinyint, @toCode varchar(30), @needsRemark bit;

        SELECT @from = ApplicationStatusId
        FROM msme.Application WITH (UPDLOCK, ROWLOCK)
        WHERE ApplicationId = @ApplicationId;

        IF @from IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'Application %d was not found.', 16, 1, @ApplicationId);
            RETURN;
        END

        SELECT @needsRemark = t.RequiresRemark
        FROM msme.ApplicationStatusTransition t
        WHERE t.FromStatusId = @from AND t.ToStatusId = @ToStatusId;

        IF @needsRemark IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'Moving from status %d to status %d is not a permitted transition.',
                       16, 1, @from, @ToStatusId);
            RETURN;
        END

        IF @needsRemark = 1 AND LEN(LTRIM(RTRIM(ISNULL(@Remark, N'')))) = 0
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'This transition requires a remark.', 16, 1);
            RETURN;
        END

        SELECT @toCode = Code FROM msme.ApplicationStatus WHERE ApplicationStatusId = @ToStatusId;

        UPDATE msme.Application
        SET ApplicationStatusId = @ToStatusId,
            PaymentReceivedOnUtc      = CASE WHEN @toCode = 'PAYMENT_RECEIVED'     THEN SYSUTCDATETIME() ELSE PaymentReceivedOnUtc END,
            HandholdingStartedOnUtc   = CASE WHEN @toCode = 'HANDHOLDING_PROGRESS' THEN SYSUTCDATETIME() ELSE HandholdingStartedOnUtc END,
            HandholdingCompletedOnUtc = CASE WHEN @toCode = 'HANDHOLDING_DONE'     THEN SYSUTCDATETIME() ELSE HandholdingCompletedOnUtc END,
            CertifiedOnUtc            = CASE WHEN @toCode = 'CERTIFIED'            THEN SYSUTCDATETIME() ELSE CertifiedOnUtc END,
            RejectedOnUtc             = CASE WHEN @toCode = 'REJECTED'             THEN SYSUTCDATETIME() ELSE RejectedOnUtc END,
            RejectionReason           = CASE WHEN @toCode = 'REJECTED'             THEN @Remark ELSE RejectionReason END,
            ModifiedOnUtc    = SYSUTCDATETIME(),
            ModifiedByUserId = @ChangedByUserId
        WHERE ApplicationId = @ApplicationId;

        /* Certification issues the certificate number and a three-year validity. */
        IF @toCode = 'CERTIFIED'
        BEGIN
            DECLARE @certNo varchar(40), @year varchar(10) = CAST(YEAR(SYSUTCDATETIME()) AS varchar(4));
            EXEC audit.usp_NextSequence 'Certificate', @year, @certNo OUTPUT;

            UPDATE msme.Application
            SET CertificateNo = @certNo,
                CertificateValidTillUtc = DATEADD(YEAR, 3, SYSUTCDATETIME())
            WHERE ApplicationId = @ApplicationId AND CertificateNo IS NULL;
        END

        INSERT INTO msme.ApplicationStatusHistory (ApplicationId, FromStatusId, ToStatusId, Remark, ChangedByUserId)
        VALUES (@ApplicationId, @from, @ToStatusId, @Remark, @ChangedByUserId);

    COMMIT TRAN;
END
GO

/*--------------------------------------------------- fee.usp_Invoice_Raise
  Creates the invoice for an application, freezing the fee and the subsidy
  split at today's rates.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE fee.usp_Invoice_Raise
    @ApplicationId  int,
    @CreatedByUserId int,
    @InvoiceId      int OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

        DECLARE @levelId tinyint, @subCatId tinyint, @feeRateId int,
                @gross decimal(18,2), @pct decimal(5,2),
                @subsidy decimal(18,2), @payable decimal(18,2),
                @no varchar(40), @year varchar(10) = CAST(YEAR(SYSUTCDATETIME()) AS varchar(4));

        SELECT @levelId  = a.CertificationLevelId,
               @subCatId = e.SubsidyCategoryId
        FROM msme.Application a
        JOIN msme.Enterprise  e ON e.EnterpriseId = a.EnterpriseId
        WHERE a.ApplicationId = @ApplicationId;

        IF @levelId IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'Application %d was not found.', 16, 1, @ApplicationId);
            RETURN;
        END

        IF EXISTS (SELECT 1 FROM fee.Invoice
                    WHERE ApplicationId = @ApplicationId AND Status <> 'Cancelled')
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'An active invoice already exists for this application.', 16, 1);
            RETURN;
        END

        SELECT @feeRateId = FeeRateId, @gross = AmountInclusiveGst
        FROM fee.FeeRate
        WHERE CertificationLevelId = @levelId AND EffectiveTo IS NULL;

        IF @feeRateId IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'No current fee rate is configured for this certification level.', 16, 1);
            RETURN;
        END

        SELECT @pct = TotalSubsidyPercent FROM fee.SubsidyCategory WHERE SubsidyCategoryId = @subCatId;

        /* Round the subsidy, then derive the payable as the remainder, so the
           two always sum exactly to the gross — CK_Invoice_Split depends on it. */
        SET @subsidy = ROUND(@gross * @pct / 100.0, 2);
        SET @payable = @gross - @subsidy;

        EXEC audit.usp_NextSequence 'Invoice', @year, @no OUTPUT;

        INSERT INTO fee.Invoice (InvoiceNo, ApplicationId, FeeRateId, SubsidyCategoryId,
                                 GrossAmount, SubsidyPercent, SubsidyAmount, PayableByUnit,
                                 Status, DueOn)
        VALUES (@no, @ApplicationId, @feeRateId, @subCatId,
                @gross, @pct, @subsidy, @payable,
                CASE WHEN @payable = 0 THEN 'Paid' ELSE 'Issued' END,
                DATEADD(DAY, 30, CAST(SYSUTCDATETIME() AS date)));

        SET @InvoiceId = SCOPE_IDENTITY();

    COMMIT TRAN;
END
GO

/*----------------------------------------------------- fee.usp_Payment_Record
  Posts a receipt and re-derives the invoice status from the sum of successful
  payments. Advancing the application to Payment Received is left to the
  caller so that the workflow rules stay in one place.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE fee.usp_Payment_Record
    @InvoiceId      int,
    @Amount         decimal(18,2),
    @PaymentMode    varchar(20),
    @TransactionRef varchar(100) = NULL,
    @GatewayName    varchar(50)  = NULL,
    @PaidOnUtc      datetime2(3) = NULL,
    @RecordedByUserId int        = NULL,
    @PaymentId      int OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    SET @PaidOnUtc = ISNULL(@PaidOnUtc, SYSUTCDATETIME());

    BEGIN TRAN;

        DECLARE @payable decimal(18,2), @paid decimal(18,2);

        SELECT @payable = PayableByUnit
        FROM fee.Invoice WITH (UPDLOCK, ROWLOCK)
        WHERE InvoiceId = @InvoiceId AND Status <> 'Cancelled';

        IF @payable IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'Invoice %d was not found or has been cancelled.', 16, 1, @InvoiceId);
            RETURN;
        END

        INSERT INTO fee.Payment (InvoiceId, Amount, PaymentMode, TransactionRef, GatewayName,
                                 PaidOnUtc, Status, RecordedByUserId)
        VALUES (@InvoiceId, @Amount, @PaymentMode, @TransactionRef, @GatewayName,
                @PaidOnUtc, 'Success', @RecordedByUserId);

        SET @PaymentId = SCOPE_IDENTITY();

        SELECT @paid = SUM(Amount)
        FROM fee.Payment
        WHERE InvoiceId = @InvoiceId AND Status = 'Success';

        UPDATE fee.Invoice
        SET Status = CASE WHEN @paid >= @payable THEN 'Paid' ELSE 'PartPaid' END
        WHERE InvoiceId = @InvoiceId;

    COMMIT TRAN;
END
GO

/*------------------------------------------------ assess.usp_Assessment_Finalise
  Scores a completed assessment from its responses and writes the result back
  to both the assessment and the application.

  Scoring: Yes = full weight, Partial = half, No = zero. 'NA' checkpoints are
  excluded from the denominator so a non-applicable item cannot penalise a unit.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE assess.usp_Assessment_Finalise
    @AssessmentId   int,
    @Outcome        varchar(20),
    @Remarks        nvarchar(2000) = NULL,
    @FinalisedByUserId int
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    IF @Outcome NOT IN ('Recommended','NotRecommended')
    BEGIN
        RAISERROR (N'Outcome must be Recommended or NotRecommended.', 16, 1);
        RETURN;
    END

    BEGIN TRAN;

        DECLARE @applicationId int, @total decimal(6,2), @max decimal(6,2), @pct decimal(5,2);

        SELECT @applicationId = ApplicationId
        FROM assess.Assessment WITH (UPDLOCK, ROWLOCK)
        WHERE AssessmentId = @AssessmentId;

        IF @applicationId IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'Assessment %d was not found.', 16, 1, @AssessmentId);
            RETURN;
        END

        /* A major NC that is still open blocks a positive recommendation. */
        IF @Outcome = 'Recommended'
           AND EXISTS (SELECT 1 FROM assess.NonConformance
                        WHERE AssessmentId = @AssessmentId
                          AND Severity = 'Major' AND Status <> 'Closed')
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'The assessment has open major non-conformances and cannot be recommended.', 16, 1);
            RETURN;
        END

        SELECT
            @total = SUM(CASE r.Response WHEN 'Yes'     THEN c.Weight
                                         WHEN 'Partial' THEN c.Weight / 2.0
                                         ELSE 0 END),
            @max   = SUM(CASE WHEN r.Response = 'NA' THEN 0 ELSE c.Weight END)
        FROM assess.AssessmentResponse r
        JOIN assess.[Checkpoint] c ON c.CheckpointId = r.CheckpointId
        WHERE r.AssessmentId = @AssessmentId;

        SET @total = ISNULL(@total, 0);
        SET @max   = ISNULL(@max, 0);
        SET @pct   = CASE WHEN @max > 0 THEN CAST(@total * 100.0 / @max AS decimal(5,2)) ELSE 0 END;

        UPDATE assess.Assessment
        SET Status           = 'Completed',
            TotalScore       = @total,
            MaxPossibleScore = @max,
            ScorePercent     = @pct,
            Outcome          = @Outcome,
            AssessorRemarks  = ISNULL(@Remarks, AssessorRemarks),
            CompletedOnUtc   = SYSUTCDATETIME()
        WHERE AssessmentId = @AssessmentId;

        UPDATE msme.Application
        SET LatestScore = @pct,
            ModifiedOnUtc = SYSUTCDATETIME(),
            ModifiedByUserId = @FinalisedByUserId
        WHERE ApplicationId = @applicationId;

    COMMIT TRAN;
END
GO

/*------------------------------------------------ comm.usp_Campaign_Queue
  Expands a campaign's audience into individual outbox rows. Runs once per
  campaign; the guard on Status makes a double click harmless.
---------------------------------------------------------------------------*/
CREATE OR ALTER PROCEDURE comm.usp_Campaign_Queue
    @EmailCampaignId int,
    @QueuedCount     int OUTPUT
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;

    BEGIN TRAN;

        DECLARE @subject nvarchar(400), @body nvarchar(max), @status varchar(15);

        SELECT @subject = Subject, @body = BodyHtml, @status = Status
        FROM comm.EmailCampaign WITH (UPDLOCK, ROWLOCK)
        WHERE EmailCampaignId = @EmailCampaignId;

        IF @status IS NULL
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'Campaign %d was not found.', 16, 1, @EmailCampaignId);
            RETURN;
        END

        IF @status NOT IN ('Draft','Scheduled')
        BEGIN
            ROLLBACK TRAN;
            RAISERROR (N'Only a draft or scheduled campaign can be queued.', 16, 1);
            RETURN;
        END

        INSERT INTO comm.EmailMessage (EmailCampaignId, ToAddress, ToUserId, Subject, BodyHtml, Status)
        SELECT @EmailCampaignId, u.Email, u.Id, @subject, @body, 'Queued'
        FROM auth.[User] u
        JOIN comm.EmailCampaignAudience a ON a.AccountTypeId = u.AccountTypeId
        JOIN auth.UserStatus       us ON us.StatusId     = u.StatusId
        WHERE a.EmailCampaignId = @EmailCampaignId
          AND u.IsDeleted = 0
          AND us.Code = 'ACTIVE';

        SET @QueuedCount = @@ROWCOUNT;

        UPDATE comm.EmailCampaign
        SET Status = 'Sending',
            RecipientCount = @QueuedCount
        WHERE EmailCampaignId = @EmailCampaignId;

    COMMIT TRAN;
END
GO

PRINT N'Stored procedures created.';
GO

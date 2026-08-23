/* ---------------------------------------------------------------------------
   Payment against a submitted LEAN Silver application.

   After an application is submitted, the fee is paid before handholding
   starts. The fee itself is the scheme's (fee.FeeRate) less the government
   subsidy; what remains is what the unit pays. These columns record that the
   payment was made and how — a mock/simulated payment for now, so the whole
   flow can be walked without a live gateway. A real gateway later fills the
   same columns with its own reference.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF COL_LENGTH('msme.ApplicationSubmission', 'PaymentStatus') IS NULL
    ALTER TABLE msme.ApplicationSubmission
        ADD PaymentStatus varchar(20) NOT NULL CONSTRAINT DF_AppSub_Pay DEFAULT 'Unpaid';
GO

IF COL_LENGTH('msme.ApplicationSubmission', 'PaidAmount') IS NULL
    ALTER TABLE msme.ApplicationSubmission ADD PaidAmount decimal(12,2) NULL;
GO

IF COL_LENGTH('msme.ApplicationSubmission', 'PaidOnUtc') IS NULL
    ALTER TABLE msme.ApplicationSubmission ADD PaidOnUtc datetime2(0) NULL;
GO

IF COL_LENGTH('msme.ApplicationSubmission', 'PaymentMethod') IS NULL
    ALTER TABLE msme.ApplicationSubmission ADD PaymentMethod varchar(20) NULL;
GO

IF COL_LENGTH('msme.ApplicationSubmission', 'PaymentReference') IS NULL
    ALTER TABLE msme.ApplicationSubmission ADD PaymentReference varchar(40) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_AppSub_PaymentStatus')
    ALTER TABLE msme.ApplicationSubmission
        ADD CONSTRAINT CK_AppSub_PaymentStatus CHECK (PaymentStatus IN ('Unpaid', 'Paid'));
GO

PRINT N'Migration 041 — submission payment columns applied.';
GO

/*===========================================================================
  Schemas: fee, incentive
  Certification fees, the subsidy slabs, TDS sections and payments; plus the
  incentive schemes offered by each provider.

  Money is decimal(18,2) throughout. Percentages are decimal(5,2), which holds
  0.00 - 999.99 and is enough for every rate the scheme uses.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*------------------------------------------------------------ SubsidyCategory
  GEN 90+0, WOM/SC/ST/NER/OPA 90+5. The MSME's category decides how much of
  the certification fee the scheme bears.                                     */
CREATE TABLE fee.SubsidyCategory
(
    SubsidyCategoryId   tinyint         NOT NULL,
    Code                varchar(5)      NOT NULL,   -- GEN, WOM, SC, ST, NER, OPA
    Name                nvarchar(120)   NOT NULL,
    BaseSubsidyPercent  decimal(5,2)    NOT NULL,
    AdditionalPercent   decimal(5,2)    NOT NULL CONSTRAINT DF_SubCat_Additional DEFAULT (0),
    SortOrder           tinyint         NOT NULL,
    IsActive            bit             NOT NULL CONSTRAINT DF_SubCat_Active DEFAULT (1),
    /* Persisted so a filtered index and CHECK can rely on it, and so reports
       never re-derive the total independently. */
    TotalSubsidyPercent AS (BaseSubsidyPercent + AdditionalPercent) PERSISTED,
    CONSTRAINT PK_SubsidyCategory PRIMARY KEY CLUSTERED (SubsidyCategoryId),
    CONSTRAINT UQ_SubsidyCategory_Code UNIQUE (Code),
    CONSTRAINT CK_SubCat_Base CHECK (BaseSubsidyPercent BETWEEN 0 AND 100),
    CONSTRAINT CK_SubCat_Add  CHECK (AdditionalPercent  BETWEEN 0 AND 100)
);
GO
/* Total subsidy can never exceed the fee. */
ALTER TABLE fee.SubsidyCategory
    ADD CONSTRAINT CK_SubCat_Total CHECK (TotalSubsidyPercent <= 100);
GO

ALTER TABLE msme.Enterprise
    ADD CONSTRAINT FK_Enterprise_SubsidyCategory
        FOREIGN KEY (SubsidyCategoryId) REFERENCES fee.SubsidyCategory(SubsidyCategoryId);
GO

/*-------------------------------------------------------------------- FeeRate
  Fee per certification level, versioned by effective date. Bronze is zero
  today but is still a row, so a future notification that charges for Bronze
  needs data, not a code change.                                              */
CREATE TABLE fee.FeeRate
(
    FeeRateId           int             NOT NULL IDENTITY(1,1),
    CertificationLevelId tinyint        NOT NULL,
    /* Amount inclusive of GST, matching how the Fee Structure screen states it. */
    AmountInclusiveGst  decimal(18,2)   NOT NULL,
    GstPercent          decimal(5,2)    NOT NULL CONSTRAINT DF_FeeRate_Gst DEFAULT (18.00),
    EffectiveFrom       date            NOT NULL,
    EffectiveTo         date            NULL,       -- NULL = current
    Notes               nvarchar(500)   NULL,
    CreatedOnUtc        datetime2(3)    NOT NULL CONSTRAINT DF_FeeRate_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId     int             NULL,
    CONSTRAINT PK_FeeRate PRIMARY KEY CLUSTERED (FeeRateId),
    CONSTRAINT FK_FeeRate_Level FOREIGN KEY (CertificationLevelId) REFERENCES msme.CertificationLevel(CertificationLevelId),
    CONSTRAINT CK_FeeRate_Amount CHECK (AmountInclusiveGst >= 0),
    CONSTRAINT CK_FeeRate_Dates  CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
/* One open-ended (current) rate per level. */
CREATE UNIQUE INDEX UX_FeeRate_Current ON fee.FeeRate (CertificationLevelId) WHERE EffectiveTo IS NULL;
CREATE INDEX IX_FeeRate_Level ON fee.FeeRate (CertificationLevelId, EffectiveFrom DESC);
GO

/*----------------------------------------------------------------- TdsSection
  194C for contractors (Implementing Agencies), 194J for professional services
  (Consultants, Assessors, Assessment Agencies). Versioned the same way.      */
CREATE TABLE fee.TdsSection
(
    TdsSectionId    int             NOT NULL IDENTITY(1,1),
    SectionCode     varchar(10)     NOT NULL,   -- 194C / 194J
    Description     nvarchar(300)   NOT NULL,
    RatePercent     decimal(5,2)    NOT NULL,
    ApplicableTo    nvarchar(300)   NOT NULL,
    EffectiveFrom   date            NOT NULL,
    EffectiveTo     date            NULL,
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_Tds_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NULL,
    CONSTRAINT PK_TdsSection PRIMARY KEY CLUSTERED (TdsSectionId),
    CONSTRAINT CK_Tds_Rate  CHECK (RatePercent BETWEEN 0 AND 100),
    CONSTRAINT CK_Tds_Dates CHECK (EffectiveTo IS NULL OR EffectiveTo >= EffectiveFrom)
);
CREATE UNIQUE INDEX UX_TdsSection_Current ON fee.TdsSection (SectionCode) WHERE EffectiveTo IS NULL;
GO

/*------------------------------------------------- TdsSectionAccountType
  Which account types a TDS section applies to, so payouts pick the rate from
  data rather than from a string comparison on the payee's type name.         */
CREATE TABLE fee.TdsSectionAccountType
(
    TdsSectionId    int         NOT NULL,
    AccountTypeId   tinyint     NOT NULL,
    CONSTRAINT PK_TdsSectionAccountType PRIMARY KEY CLUSTERED (TdsSectionId, AccountTypeId),
    CONSTRAINT FK_TdsAT_Section FOREIGN KEY (TdsSectionId)  REFERENCES fee.TdsSection(TdsSectionId) ON DELETE CASCADE,
    CONSTRAINT FK_TdsAT_Type    FOREIGN KEY (AccountTypeId) REFERENCES auth.AccountType(AccountTypeId)
);
GO

/*----------------------------------------------------------------- Invoice
  Raised against an application once the level is chosen. The subsidy split is
  frozen onto the invoice: rates change, issued invoices must not.            */
CREATE TABLE fee.Invoice
(
    InvoiceId           int             NOT NULL IDENTITY(1,1),
    InvoiceNo           varchar(30)     NOT NULL,
    ApplicationId       int             NOT NULL,
    FeeRateId           int             NOT NULL,
    SubsidyCategoryId   tinyint         NOT NULL,

    GrossAmount         decimal(18,2)   NOT NULL,   -- the fee inclusive of GST
    SubsidyPercent      decimal(5,2)    NOT NULL,   -- frozen at issue
    SubsidyAmount       decimal(18,2)   NOT NULL,
    PayableByUnit       decimal(18,2)   NOT NULL,

    Status              varchar(15)     NOT NULL CONSTRAINT DF_Invoice_Status DEFAULT ('Issued'),
    IssuedOnUtc         datetime2(3)    NOT NULL CONSTRAINT DF_Invoice_Issued DEFAULT (SYSUTCDATETIME()),
    DueOn               date            NULL,
    CancelledOnUtc      datetime2(3)    NULL,
    CancellationReason  nvarchar(500)   NULL,
    RowVersion          rowversion      NOT NULL,

    CONSTRAINT PK_Invoice PRIMARY KEY CLUSTERED (InvoiceId),
    CONSTRAINT UQ_Invoice_No UNIQUE (InvoiceNo),
    CONSTRAINT FK_Invoice_Application FOREIGN KEY (ApplicationId)     REFERENCES msme.Application(ApplicationId),
    CONSTRAINT FK_Invoice_FeeRate     FOREIGN KEY (FeeRateId)         REFERENCES fee.FeeRate(FeeRateId),
    CONSTRAINT FK_Invoice_SubCat      FOREIGN KEY (SubsidyCategoryId) REFERENCES fee.SubsidyCategory(SubsidyCategoryId),
    CONSTRAINT CK_Invoice_Status CHECK (Status IN ('Issued','PartPaid','Paid','Cancelled')),
    CONSTRAINT CK_Invoice_Amounts CHECK (GrossAmount >= 0 AND SubsidyAmount >= 0 AND PayableByUnit >= 0),
    /* The split must add up — this is the invariant that matters most here. */
    CONSTRAINT CK_Invoice_Split CHECK (ABS(SubsidyAmount + PayableByUnit - GrossAmount) < 0.01)
);
CREATE INDEX IX_Invoice_Application ON fee.Invoice (ApplicationId, Status);
CREATE INDEX IX_Invoice_Status      ON fee.Invoice (Status, IssuedOnUtc DESC);
GO

/*----------------------------------------------------------------- Payment
  Receipts against an invoice. Several partial payments are allowed; the
  invoice status is maintained by fee.usp_Payment_Record.                     */
CREATE TABLE fee.Payment
(
    PaymentId       int             NOT NULL IDENTITY(1,1),
    InvoiceId       int             NOT NULL,
    Amount          decimal(18,2)   NOT NULL,
    PaymentMode     varchar(20)     NOT NULL,   -- NEFT / UPI / Card / NetBanking / DD
    /* The payment-gateway or bank reference. Unique when present so a
       duplicate callback cannot post the same receipt twice. */
    TransactionRef  varchar(100)    NULL,
    GatewayName     varchar(50)     NULL,
    PaidOnUtc       datetime2(3)    NOT NULL,
    Status          varchar(15)     NOT NULL CONSTRAINT DF_Payment_Status DEFAULT ('Success'),
    FailureReason   nvarchar(300)   NULL,
    RecordedByUserId int            NULL,       -- null when posted by the gateway callback
    RecordedOnUtc   datetime2(3)    NOT NULL CONSTRAINT DF_Payment_Recorded DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_Payment PRIMARY KEY CLUSTERED (PaymentId),
    CONSTRAINT FK_Payment_Invoice FOREIGN KEY (InvoiceId) REFERENCES fee.Invoice(InvoiceId),
    CONSTRAINT FK_Payment_User    FOREIGN KEY (RecordedByUserId) REFERENCES auth.[User](Id),
    CONSTRAINT CK_Payment_Amount CHECK (Amount > 0),
    CONSTRAINT CK_Payment_Mode   CHECK (PaymentMode IN ('NEFT','RTGS','UPI','Card','NetBanking','DD','Cheque','Other')),
    CONSTRAINT CK_Payment_Status CHECK (Status IN ('Pending','Success','Failed','Refunded'))
);
CREATE UNIQUE INDEX UX_Payment_TransactionRef ON fee.Payment (TransactionRef) WHERE TransactionRef IS NOT NULL;
CREATE INDEX IX_Payment_Invoice ON fee.Payment (InvoiceId, PaidOnUtc DESC);
GO

/*===========================================================================
  incentive
===========================================================================*/

/*-------------------------------------------------------------- Provider
  The four Incentives sub-menus: Ministry of MSME, State Govt., Financial
  Institutions, Others.                                                       */
CREATE TABLE incentive.Provider
(
    ProviderId  tinyint         NOT NULL,
    Code        varchar(20)     NOT NULL,   -- MINISTRY / STATE / FINANCIAL / OTHERS
    Name        nvarchar(120)   NOT NULL,
    Description nvarchar(500)   NULL,
    SortOrder   tinyint         NOT NULL,
    IsActive    bit             NOT NULL CONSTRAINT DF_Provider_Active DEFAULT (1),
    CONSTRAINT PK_Provider PRIMARY KEY CLUSTERED (ProviderId),
    CONSTRAINT UQ_Provider_Code UNIQUE (Code)
);
GO

/*------------------------------------------------------------------- Incentive */
CREATE TABLE incentive.Incentive
(
    IncentiveId         int             NOT NULL IDENTITY(1,1),
    Code                varchar(30)     NOT NULL,
    Name                nvarchar(250)   NOT NULL,
    ProviderId          tinyint         NOT NULL,
    /* The agency actually administering it — 'Ministry of MSME / QCI'. */
    AdministeringBody   nvarchar(200)   NULL,
    /* NULL = available at every certification level ('Both' on the screen). */
    CertificationLevelId tinyint        NULL,
    /* NULL = national. Set for a state-specific incentive. */
    StateId             smallint        NULL,
    Description         nvarchar(2000)  NULL,
    EligibilityCriteria nvarchar(2000)  NULL,
    BenefitDescription  nvarchar(1000)  NULL,
    /* Reported on the Incentives cards. Beneficiary counts are maintained by
       the disbursement rollup, not typed in. */
    OutlayAmount        decimal(18,2)   NULL,
    Status              varchar(15)     NOT NULL CONSTRAINT DF_Incentive_Status DEFAULT ('Draft'),
    ValidFrom           date            NULL,
    ValidTo             date            NULL,
    ExternalUrl         nvarchar(500)   NULL,
    CreatedOnUtc        datetime2(3)    NOT NULL CONSTRAINT DF_Incentive_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId     int             NULL,
    ModifiedOnUtc       datetime2(3)    NULL,
    ModifiedByUserId    int             NULL,
    RowVersion          rowversion      NOT NULL,
    CONSTRAINT PK_Incentive PRIMARY KEY CLUSTERED (IncentiveId),
    CONSTRAINT UQ_Incentive_Code UNIQUE (Code),
    CONSTRAINT FK_Incentive_Provider FOREIGN KEY (ProviderId)           REFERENCES incentive.Provider(ProviderId),
    CONSTRAINT FK_Incentive_Level    FOREIGN KEY (CertificationLevelId) REFERENCES msme.CertificationLevel(CertificationLevelId),
    CONSTRAINT FK_Incentive_State    FOREIGN KEY (StateId)              REFERENCES master.State(StateId),
    CONSTRAINT CK_Incentive_Status CHECK (Status IN ('Draft','Active','Suspended','Closed')),
    CONSTRAINT CK_Incentive_Dates  CHECK (ValidTo IS NULL OR ValidFrom IS NULL OR ValidTo >= ValidFrom),
    CONSTRAINT CK_Incentive_Outlay CHECK (OutlayAmount IS NULL OR OutlayAmount >= 0)
);
CREATE INDEX IX_Incentive_Provider ON incentive.Incentive (ProviderId, Status) INCLUDE (Name, OutlayAmount);
CREATE INDEX IX_Incentive_State    ON incentive.Incentive (StateId) WHERE StateId IS NOT NULL;
GO

/*----------------------------------------------------- IncentiveDisbursement
  What an enterprise actually received, so the beneficiary count and the
  amount disbursed on the Incentives cards are computed, never keyed in.      */
CREATE TABLE incentive.IncentiveDisbursement
(
    DisbursementId  bigint          NOT NULL IDENTITY(1,1),
    IncentiveId     int             NOT NULL,
    EnterpriseId    int             NOT NULL,
    ApplicationId   int             NULL,
    Amount          decimal(18,2)   NOT NULL,
    SanctionedOn    date            NOT NULL,
    DisbursedOn     date            NULL,
    Status          varchar(15)     NOT NULL CONSTRAINT DF_Disb_Status DEFAULT ('Sanctioned'),
    ReferenceNo     varchar(60)     NULL,
    Remarks         nvarchar(1000)  NULL,
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_Disb_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId int             NULL,
    CONSTRAINT PK_IncentiveDisbursement PRIMARY KEY CLUSTERED (DisbursementId),
    CONSTRAINT FK_Disb_Incentive  FOREIGN KEY (IncentiveId)   REFERENCES incentive.Incentive(IncentiveId),
    CONSTRAINT FK_Disb_Enterprise FOREIGN KEY (EnterpriseId)  REFERENCES msme.Enterprise(EnterpriseId),
    CONSTRAINT FK_Disb_Application FOREIGN KEY (ApplicationId) REFERENCES msme.Application(ApplicationId),
    CONSTRAINT CK_Disb_Amount CHECK (Amount >= 0),
    CONSTRAINT CK_Disb_Status CHECK (Status IN ('Sanctioned','Disbursed','Rejected','Withdrawn'))
);
CREATE INDEX IX_Disb_Incentive  ON incentive.IncentiveDisbursement (IncentiveId, Status) INCLUDE (Amount, EnterpriseId);
CREATE INDEX IX_Disb_Enterprise ON incentive.IncentiveDisbursement (EnterpriseId);
GO

PRINT N'Schemas [fee] and [incentive] created.';
GO

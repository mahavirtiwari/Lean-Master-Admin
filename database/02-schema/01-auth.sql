/*===========================================================================
  Schema: auth
  Accounts, organisations, roles and the module/right permission matrix.

  Named 'auth', not 'identity': IDENTITY is a reserved T-SQL keyword, so an
  unbracketed 'identity.Table' is a syntax error. Bracketing every reference
  would work but leaves a permanent trap for anyone writing a future query.

  The permission model is the one the portal already defines:
    * 15 modules            (Dashboard .. Settings)
    * 5 rights per module   (view, create, edit, delete, export)
    * 10 account types      (Super Admin + the 9 managed types)
  A role belongs to an account type and grants a set of (module, right) pairs.
  User Management additionally restricts *which account types* a role may
  administer — that is UserManagementScope below.
===========================================================================*/
USE [MCLS];
GO
SET ANSI_NULLS, QUOTED_IDENTIFIER ON;
GO

/*---------------------------------------------------------------- AccountType
  The nine managed types plus Super Admin. CanCreateDirectly mirrors the
  "Create New User" affordance that only appears on three of the type cards.  */
CREATE TABLE auth.AccountType
(
    AccountTypeId       tinyint         NOT NULL,
    Code                varchar(30)     NOT NULL,
    Name                nvarchar(100)   NOT NULL,
    ShortName           nvarchar(50)    NOT NULL,   -- sidebar spelling
    IconKey             varchar(30)     NULL,       -- building / bank / pin ...
    /* varchar, not char: char(3) pads a two-letter prefix such as 'IA' to
       'IA ', and the trailing space then appears in every user code the
       portal issues. */
    UserCodePrefix      varchar(3)      NOT NULL,   -- MCLS-<IA>-000142
    Description         nvarchar(400)   NULL,
    CanCreateDirectly   bit             NOT NULL CONSTRAINT DF_AccountType_Create DEFAULT (0),
    RequiresOrganisation bit            NOT NULL CONSTRAINT DF_AccountType_ReqOrg DEFAULT (0),
    SortOrder           tinyint         NOT NULL,
    IsActive            bit             NOT NULL CONSTRAINT DF_AccountType_Active DEFAULT (1),
    CONSTRAINT PK_AccountType PRIMARY KEY CLUSTERED (AccountTypeId),
    CONSTRAINT UQ_AccountType_Code   UNIQUE (Code),
    CONSTRAINT UQ_AccountType_Prefix UNIQUE (UserCodePrefix)
);
GO

/*--------------------------------------------------------------------- Module
  The 15 sidebar modules. Kept as data, not an enum, so Settings > System can
  reorder or hide one without a deployment.                                   */
CREATE TABLE auth.Module
(
    ModuleId        tinyint         NOT NULL,
    Code            varchar(30)     NOT NULL,   -- USER_MGMT, QUES_SILVER ...
    Name            nvarchar(80)    NOT NULL,   -- 'User Mgmt'
    RoutePath       varchar(120)    NULL,       -- '/user-management'
    IconKey         varchar(30)     NULL,
    SortOrder       tinyint         NOT NULL,
    IsActive        bit             NOT NULL CONSTRAINT DF_Module_Active DEFAULT (1),
    CONSTRAINT PK_Module PRIMARY KEY CLUSTERED (ModuleId),
    CONSTRAINT UQ_Module_Code UNIQUE (Code)
);
GO

/*----------------------------------------------------------------- RightType */
CREATE TABLE auth.RightType
(
    RightTypeId     tinyint         NOT NULL,
    Code            varchar(10)     NOT NULL,   -- view / create / edit / delete / export
    Name            nvarchar(40)    NOT NULL,
    SortOrder       tinyint         NOT NULL,
    CONSTRAINT PK_RightType PRIMARY KEY CLUSTERED (RightTypeId),
    CONSTRAINT UQ_RightType_Code UNIQUE (Code)
);
GO

/*----------------------------------------------------------------- Permission
  The cross product of module x right, materialised so roles can reference a
  single surrogate key and the API can emit compact claim strings.            */
CREATE TABLE auth.Permission
(
    PermissionId    smallint        NOT NULL IDENTITY(1,1),
    ModuleId        tinyint         NOT NULL,
    RightTypeId     tinyint         NOT NULL,
    PermissionKey   varchar(45)     NOT NULL,   -- 'USER_MGMT.edit' — the JWT claim value
    CONSTRAINT PK_Permission PRIMARY KEY CLUSTERED (PermissionId),
    CONSTRAINT UQ_Permission_Pair UNIQUE (ModuleId, RightTypeId),
    CONSTRAINT UQ_Permission_Key  UNIQUE (PermissionKey),
    CONSTRAINT FK_Permission_Module FOREIGN KEY (ModuleId)    REFERENCES auth.Module(ModuleId),
    CONSTRAINT FK_Permission_Right  FOREIGN KEY (RightTypeId) REFERENCES auth.RightType(RightTypeId)
);
GO

/*----------------------------------------------------------------------- Role
  Portal roles such as 'IA Admin', 'State Nodal Officer', 'Assessor'.
  System roles cannot be deleted or have their code changed.                  */
CREATE TABLE auth.Role
(
    RoleId              int             NOT NULL IDENTITY(1,1),
    Code                varchar(50)     NOT NULL,
    Name                nvarchar(120)   NOT NULL,

    /* Required by ASP.NET Core Identity's RoleStore. NormalizedName is what
       RoleManager.FindByNameAsync searches on; ConcurrencyStamp is Identity's
       own optimistic-concurrency token, separate from RowVersion. Omitting
       either makes the stock store throw 'Invalid column name'. */
    NormalizedName      nvarchar(256)   NULL,
    ConcurrencyStamp    nvarchar(max)   NULL,

    AccountTypeId       tinyint         NOT NULL,
    Description         nvarchar(400)   NULL,
    IsSystemRole        bit             NOT NULL CONSTRAINT DF_Role_System   DEFAULT (0),
    IsActive            bit             NOT NULL CONSTRAINT DF_Role_Active   DEFAULT (1),
    CreatedOnUtc        datetime2(3)    NOT NULL CONSTRAINT DF_Role_Created  DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId     int             NULL,
    ModifiedOnUtc       datetime2(3)    NULL,
    ModifiedByUserId    int             NULL,
    RowVersion          rowversion      NOT NULL,
    CONSTRAINT PK_Role PRIMARY KEY CLUSTERED (RoleId),
    CONSTRAINT UQ_Role_Code UNIQUE (Code),
    CONSTRAINT FK_Role_AccountType FOREIGN KEY (AccountTypeId) REFERENCES auth.AccountType(AccountTypeId)
);
CREATE INDEX IX_Role_AccountType ON auth.Role (AccountTypeId) WHERE IsActive = 1;
CREATE UNIQUE INDEX UX_Role_NormalizedName ON auth.Role (NormalizedName) WHERE NormalizedName IS NOT NULL;
GO

/*------------------------------------------------------------- UserRoleLink
  ASP.NET Core Identity's user/role join table.

  The portal gives a user exactly one role, held as auth.User.RoleId, so
  nothing writes to this. It exists because Identity's UserStore queries it and
  fails if it is absent — mapped in MclsDbContext, empty in practice.
---------------------------------------------------------------------------*/
CREATE TABLE auth.UserRoleLink
(
    UserId  int NOT NULL,
    RoleId  int NOT NULL,
    CONSTRAINT PK_UserRoleLink PRIMARY KEY CLUSTERED (UserId, RoleId),
    CONSTRAINT FK_UserRoleLink_Role FOREIGN KEY (RoleId) REFERENCES auth.Role(RoleId) ON DELETE CASCADE
);
GO

/*------------------------------------------------------------- RolePermission */
CREATE TABLE auth.RolePermission
(
    RoleId          int             NOT NULL,
    PermissionId    smallint        NOT NULL,
    GrantedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_RolePerm_Granted DEFAULT (SYSUTCDATETIME()),
    GrantedByUserId int             NULL,
    CONSTRAINT PK_RolePermission PRIMARY KEY CLUSTERED (RoleId, PermissionId),
    CONSTRAINT FK_RolePerm_Role       FOREIGN KEY (RoleId)       REFERENCES auth.Role(RoleId) ON DELETE CASCADE,
    CONSTRAINT FK_RolePerm_Permission FOREIGN KEY (PermissionId) REFERENCES auth.Permission(PermissionId)
);
CREATE INDEX IX_RolePermission_Permission ON auth.RolePermission (PermissionId) INCLUDE (RoleId);
GO

/*----------------------------------------------------- UserManagementScope
  Which account types a role may administer. An Implementing Agency admin
  manages delivery-side accounts only and never a government one, so this is
  a genuine restriction rather than a UI convenience.                         */
CREATE TABLE auth.UserManagementScope
(
    RoleId              int         NOT NULL,
    ManagedAccountTypeId tinyint    NOT NULL,
    CONSTRAINT PK_UserManagementScope PRIMARY KEY CLUSTERED (RoleId, ManagedAccountTypeId),
    CONSTRAINT FK_UMScope_Role FOREIGN KEY (RoleId) REFERENCES auth.Role(RoleId) ON DELETE CASCADE,
    CONSTRAINT FK_UMScope_Type FOREIGN KEY (ManagedAccountTypeId) REFERENCES auth.AccountType(AccountTypeId)
);
GO

/*--------------------------------------------------------------- Organisation
  The employer/department behind an account: an implementing agency, a
  ministry department, a state directorate, a consultant firm or an
  assessment agency. Individual consultants and assessors may also be linked
  to the organisation that empanelled them.                                   */
CREATE TABLE auth.Organisation
(
    OrganisationId      int             NOT NULL IDENTITY(1,1),
    OrganisationCode    varchar(30)     NOT NULL,
    Name                nvarchar(250)   NOT NULL,
    AccountTypeId       tinyint         NOT NULL,
    RegistrationNo      varchar(50)     NULL,       -- CIN / registration number
    CategoryLookupId    int             NULL,       -- e.g. 'Central Implementing Agency'
    AddressLine         nvarchar(500)   NULL,
    StateId             smallint        NULL,
    DistrictId          int             NULL,
    Pincode             char(6)         NULL,
    ContactEmail        nvarchar(256)   NULL,
    ContactPhone        varchar(20)     NULL,
    JurisdictionScope   nvarchar(120)   NULL,       -- 'National', 'Maharashtra', 'Silver & Gold'
    IsActive            bit             NOT NULL CONSTRAINT DF_Org_Active DEFAULT (1),
    CreatedOnUtc        datetime2(3)    NOT NULL CONSTRAINT DF_Org_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId     int             NULL,
    ModifiedOnUtc       datetime2(3)    NULL,
    ModifiedByUserId    int             NULL,
    RowVersion          rowversion      NOT NULL,
    CONSTRAINT PK_Organisation PRIMARY KEY CLUSTERED (OrganisationId),
    CONSTRAINT UQ_Organisation_Code UNIQUE (OrganisationCode),
    CONSTRAINT FK_Org_AccountType FOREIGN KEY (AccountTypeId) REFERENCES auth.AccountType(AccountTypeId),
    CONSTRAINT CK_Org_Pincode CHECK (Pincode IS NULL OR Pincode LIKE '[1-9][0-9][0-9][0-9][0-9][0-9]')
);
CREATE INDEX IX_Organisation_Type  ON auth.Organisation (AccountTypeId, IsActive) INCLUDE (Name);
CREATE INDEX IX_Organisation_State ON auth.Organisation (StateId) WHERE StateId IS NOT NULL;
GO

/*----------------------------------------------------------------------- User
  ASP.NET Core Identity's IdentityUser<int> surface plus the portal's own
  columns. Column names match what EF Core's Identity mapping expects so the
  stock stores work unchanged.                                                */
CREATE TABLE auth.[User]
(
    Id                      int             NOT NULL IDENTITY(1,1),

    -- ---- ASP.NET Core Identity ------------------------------------------
    UserName                nvarchar(256)   NOT NULL,
    NormalizedUserName      nvarchar(256)   NOT NULL,
    Email                   nvarchar(256)   NOT NULL,
    NormalizedEmail         nvarchar(256)   NOT NULL,
    EmailConfirmed          bit             NOT NULL CONSTRAINT DF_User_EmailConf DEFAULT (0),
    PasswordHash            nvarchar(max)   NULL,
    SecurityStamp           nvarchar(max)   NULL,
    ConcurrencyStamp        nvarchar(max)   NULL,
    PhoneNumber             nvarchar(30)    NULL,
    PhoneNumberConfirmed    bit             NOT NULL CONSTRAINT DF_User_PhoneConf DEFAULT (0),
    TwoFactorEnabled        bit             NOT NULL CONSTRAINT DF_User_2FA       DEFAULT (0),
    LockoutEnd              datetimeoffset(7) NULL,
    LockoutEnabled          bit             NOT NULL CONSTRAINT DF_User_LockoutOn DEFAULT (1),
    AccessFailedCount       int             NOT NULL CONSTRAINT DF_User_Failed    DEFAULT (0),

    -- ---- MCLS ------------------------------------------------------------
    UserCode                varchar(25)     NOT NULL,   -- MCLS-IA-000142
    FullName                nvarchar(200)   NOT NULL,
    Initials                nvarchar(4)     NULL,       -- avatar chip
    Designation             nvarchar(150)   NULL,
    AccountTypeId           tinyint         NOT NULL,
    RoleId                  int             NOT NULL,
    OrganisationId          int             NULL,
    StateId                 smallint        NULL,       -- for State Specific accounts
    DistrictId              int             NULL,
    Jurisdiction            nvarchar(120)   NULL,       -- display scope: 'National', 'Gujarat'
    StatusId                tinyint         NOT NULL CONSTRAINT DF_User_Status DEFAULT (1),
    MustChangePassword      bit             NOT NULL CONSTRAINT DF_User_MustChg DEFAULT (1),
    PasswordChangedOnUtc    datetime2(3)    NULL,
    LastLoginOnUtc          datetime2(3)    NULL,
    LastActivityOnUtc       datetime2(3)    NULL,

    CreatedOnUtc            datetime2(3)    NOT NULL CONSTRAINT DF_User_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByUserId         int             NULL,
    ModifiedOnUtc           datetime2(3)    NULL,
    ModifiedByUserId        int             NULL,
    IsDeleted               bit             NOT NULL CONSTRAINT DF_User_Deleted DEFAULT (0),
    RowVersion              rowversion      NOT NULL,

    CONSTRAINT PK_User PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_User_AccountType FOREIGN KEY (AccountTypeId) REFERENCES auth.AccountType(AccountTypeId),
    CONSTRAINT FK_User_Role  FOREIGN KEY (RoleId)         REFERENCES auth.Role(RoleId),
    CONSTRAINT FK_User_Org   FOREIGN KEY (OrganisationId) REFERENCES auth.Organisation(OrganisationId),
    CONSTRAINT CK_User_Mobile CHECK (PhoneNumber IS NULL OR LEN(PhoneNumber) >= 10)
);
GO

/* Identity's stores look these up by the normalised columns; filtered to
   exclude soft-deleted rows so a deleted account frees its e-mail. */
CREATE UNIQUE INDEX UX_User_NormalizedUserName ON auth.[User] (NormalizedUserName) WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_User_NormalizedEmail    ON auth.[User] (NormalizedEmail)    WHERE IsDeleted = 0;
CREATE UNIQUE INDEX UX_User_UserCode           ON auth.[User] (UserCode)           WHERE IsDeleted = 0;

/* Drives the User Management list: filter by type + status, sort by name. */
CREATE INDEX IX_User_Type_Status ON auth.[User] (AccountTypeId, StatusId)
    INCLUDE (FullName, Email, RoleId, Jurisdiction, LastLoginOnUtc) WHERE IsDeleted = 0;
CREATE INDEX IX_User_Organisation ON auth.[User] (OrganisationId) WHERE IsDeleted = 0;
CREATE INDEX IX_User_State        ON auth.[User] (StateId)        WHERE IsDeleted = 0;
GO

/*----------------------------------------------------------------- UserStatus */
CREATE TABLE auth.UserStatus
(
    StatusId    tinyint     NOT NULL,
    Code        varchar(20) NOT NULL,
    Name        nvarchar(40) NOT NULL,
    BadgeColour varchar(9)  NULL,
    CONSTRAINT PK_UserStatus PRIMARY KEY CLUSTERED (StatusId),
    CONSTRAINT UQ_UserStatus_Code UNIQUE (Code)
);
GO
ALTER TABLE auth.[User]
    ADD CONSTRAINT FK_User_Status FOREIGN KEY (StatusId) REFERENCES auth.UserStatus(StatusId);
GO

/*-------------------------------------------------------- UserStatusHistory
  Every enable/disable in the portal captures a typed reason before it will
  commit, so the reason is NOT NULL here — the audit trail is the point.      */
CREATE TABLE auth.UserStatusHistory
(
    UserStatusHistoryId bigint          NOT NULL IDENTITY(1,1),
    UserId              int             NOT NULL,
    FromStatusId        tinyint         NULL,
    ToStatusId          tinyint         NOT NULL,
    Reason              nvarchar(1000)  NOT NULL,
    ChangedByUserId     int             NOT NULL,
    ChangedOnUtc        datetime2(3)    NOT NULL CONSTRAINT DF_USH_On DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_UserStatusHistory PRIMARY KEY CLUSTERED (UserStatusHistoryId),
    CONSTRAINT FK_USH_User FOREIGN KEY (UserId)       REFERENCES auth.[User](Id),
    CONSTRAINT FK_USH_From FOREIGN KEY (FromStatusId) REFERENCES auth.UserStatus(StatusId),
    CONSTRAINT FK_USH_To   FOREIGN KEY (ToStatusId)   REFERENCES auth.UserStatus(StatusId),
    CONSTRAINT CK_USH_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) >= 5)
);
CREATE INDEX IX_USH_User ON auth.UserStatusHistory (UserId, ChangedOnUtc DESC);
GO

/*------------------------------------------------- UserPermissionOverride
  The "Edit Permissions" screen tweaks one user away from their role without
  minting a new role. Allow = 1 grants, Allow = 0 revokes an inherited right. */
CREATE TABLE auth.UserPermissionOverride
(
    UserId          int         NOT NULL,
    PermissionId    smallint    NOT NULL,
    IsGranted       bit         NOT NULL,
    Reason          nvarchar(400) NULL,
    SetByUserId     int         NOT NULL,
    SetOnUtc        datetime2(3) NOT NULL CONSTRAINT DF_UPO_On DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_UserPermissionOverride PRIMARY KEY CLUSTERED (UserId, PermissionId),
    CONSTRAINT FK_UPO_User FOREIGN KEY (UserId)       REFERENCES auth.[User](Id) ON DELETE CASCADE,
    CONSTRAINT FK_UPO_Perm FOREIGN KEY (PermissionId) REFERENCES auth.Permission(PermissionId)
);
GO

/*------------------------------------- ASP.NET Identity satellite tables ----*/
CREATE TABLE auth.UserClaim
(
    Id          int             NOT NULL IDENTITY(1,1),
    UserId      int             NOT NULL,
    ClaimType   nvarchar(256)   NULL,
    ClaimValue  nvarchar(1000)  NULL,
    CONSTRAINT PK_UserClaim PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_UserClaim_User FOREIGN KEY (UserId) REFERENCES auth.[User](Id) ON DELETE CASCADE
);
CREATE INDEX IX_UserClaim_UserId ON auth.UserClaim (UserId);

CREATE TABLE auth.UserLogin
(
    LoginProvider       nvarchar(128)   NOT NULL,
    ProviderKey         nvarchar(128)   NOT NULL,
    ProviderDisplayName nvarchar(200)   NULL,
    UserId              int             NOT NULL,
    CONSTRAINT PK_UserLogin PRIMARY KEY CLUSTERED (LoginProvider, ProviderKey),
    CONSTRAINT FK_UserLogin_User FOREIGN KEY (UserId) REFERENCES auth.[User](Id) ON DELETE CASCADE
);
CREATE INDEX IX_UserLogin_UserId ON auth.UserLogin (UserId);

CREATE TABLE auth.UserToken
(
    UserId          int             NOT NULL,
    LoginProvider   nvarchar(128)   NOT NULL,
    Name            nvarchar(128)   NOT NULL,
    Value           nvarchar(max)   NULL,
    CONSTRAINT PK_UserToken PRIMARY KEY CLUSTERED (UserId, LoginProvider, Name),
    CONSTRAINT FK_UserToken_User FOREIGN KEY (UserId) REFERENCES auth.[User](Id) ON DELETE CASCADE
);

CREATE TABLE auth.RoleClaim
(
    Id          int             NOT NULL IDENTITY(1,1),
    RoleId      int             NOT NULL,
    ClaimType   nvarchar(256)   NULL,
    ClaimValue  nvarchar(1000)  NULL,
    CONSTRAINT PK_RoleClaim PRIMARY KEY CLUSTERED (Id),
    CONSTRAINT FK_RoleClaim_Role FOREIGN KEY (RoleId) REFERENCES auth.Role(RoleId) ON DELETE CASCADE
);
CREATE INDEX IX_RoleClaim_RoleId ON auth.RoleClaim (RoleId);
GO

/*--------------------------------------------------------------- RefreshToken
  Rotating refresh tokens. Only the SHA-256 hash is stored, so a database
  disclosure does not yield usable tokens.                                    */
CREATE TABLE auth.RefreshToken
(
    RefreshTokenId  bigint          NOT NULL IDENTITY(1,1),
    UserId          int             NOT NULL,
    TokenHash       binary(32)      NOT NULL,
    ExpiresOnUtc    datetime2(3)    NOT NULL,
    CreatedOnUtc    datetime2(3)    NOT NULL CONSTRAINT DF_RT_Created DEFAULT (SYSUTCDATETIME()),
    CreatedByIp     varchar(45)     NULL,
    RevokedOnUtc    datetime2(3)    NULL,
    RevokedByIp     varchar(45)     NULL,
    ReplacedByTokenId bigint        NULL,
    UserAgent       nvarchar(400)   NULL,
    CONSTRAINT PK_RefreshToken PRIMARY KEY CLUSTERED (RefreshTokenId),
    CONSTRAINT FK_RefreshToken_User FOREIGN KEY (UserId) REFERENCES auth.[User](Id) ON DELETE CASCADE,
    CONSTRAINT FK_RefreshToken_Replaced FOREIGN KEY (ReplacedByTokenId) REFERENCES auth.RefreshToken(RefreshTokenId)
);
CREATE UNIQUE INDEX UX_RefreshToken_Hash ON auth.RefreshToken (TokenHash);
CREATE INDEX IX_RefreshToken_User_Active ON auth.RefreshToken (UserId, ExpiresOnUtc) WHERE RevokedOnUtc IS NULL;
GO

/*----------------------------------------------------------------- LoginAudit
  Both successes and failures, so the Settings > Audit logs screen can show
  lockouts and brute-force attempts alongside normal sign-ins.                */
CREATE TABLE auth.LoginAudit
(
    LoginAuditId    bigint          NOT NULL IDENTITY(1,1),
    UserId          int             NULL,           -- null when the e-mail matched nothing
    AttemptedEmail  nvarchar(256)   NULL,
    IsSuccess       bit             NOT NULL,
    FailureReason   nvarchar(200)   NULL,
    IpAddress       varchar(45)     NULL,
    UserAgent       nvarchar(400)   NULL,
    OccurredOnUtc   datetime2(3)    NOT NULL CONSTRAINT DF_LoginAudit_On DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_LoginAudit PRIMARY KEY CLUSTERED (LoginAuditId),
    CONSTRAINT FK_LoginAudit_User FOREIGN KEY (UserId) REFERENCES auth.[User](Id)
);
CREATE INDEX IX_LoginAudit_Occurred ON auth.LoginAudit (OccurredOnUtc DESC) INCLUDE (UserId, IsSuccess);
CREATE INDEX IX_LoginAudit_User     ON auth.LoginAudit (UserId, OccurredOnUtc DESC);
GO

PRINT N'Schema [auth] created.';
GO

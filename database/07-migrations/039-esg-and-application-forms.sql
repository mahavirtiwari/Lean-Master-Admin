/* ---------------------------------------------------------------------------
   Two new super-admin menus, and the tables behind them.

   1. ESG Checklist  — the questionnaire an applicant answers on the LEAN Silver
      application: sections, each holding questions answered Yes / No / Not
      Applicable. Some questions are conditional: they appear only when a parent
      question was answered a particular way (Yes or No). Not every question has
      a parent.

   2. Basic Information & Documents — the two configurable lists the same
      application collects before ESG: the basic-information items (site
      photographs, declarations, energy sources) and the document-upload
      checklist (the pictures and certificates the desk assessor works from).

   Both are administered like Sectors and Parameters — a code, a name, a sort
   order, disabled rather than deleted so an application already filed against
   an item keeps its meaning. Each becomes a sidebar module, because the menu
   and the permission model are the same thing here: a module carries its five
   rights (view/create/edit/delete/export) and the sidebar shows a module only
   to a user who holds its view right (auth.vw_MenuForUser).

   The two modules are 16 and 17, extending the fifteen the seed defines. The
   seed files carry the same two modules and the extended permission matrix for
   a fresh install; this migration brings an existing database in line.
--------------------------------------------------------------------------- */
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

/* ----------------------------------------------------------------- modules ---
   Adding a module row makes the Permission cross-join (Module x RightType)
   below generate its five rights automatically, exactly as the seed does. */
MERGE auth.Module AS tgt
USING (VALUES
    (16, 'ESG_CHECKLIST',   N'ESG Checklist',            '/esg-checklist',        'leaf',   16),
    (17, 'BASIC_INFO_DOCS', N'Basic Info & Documents',   '/basic-info-documents', 'folder', 17)
) AS src (ModuleId, Code, Name, RoutePath, IconKey, SortOrder)
   ON tgt.ModuleId = src.ModuleId
WHEN MATCHED THEN UPDATE SET
    Code = src.Code, Name = src.Name, RoutePath = src.RoutePath,
    IconKey = src.IconKey, SortOrder = src.SortOrder
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, Code, Name, RoutePath, IconKey, SortOrder)
    VALUES (src.ModuleId, src.Code, src.Name, src.RoutePath, src.IconKey, src.SortOrder);
GO

/* Their permissions — the same module x right cross-product the seed uses, so a
   new module gains its five rights without them being typed out. */
MERGE auth.Permission AS tgt
USING (
    SELECT m.ModuleId, rt.RightTypeId,
           CAST(m.Code + '.' + rt.Code AS varchar(45)) AS PermissionKey
    FROM auth.Module m
    CROSS JOIN auth.RightType rt
    WHERE m.ModuleId IN (16, 17)
) AS src
   ON tgt.ModuleId = src.ModuleId AND tgt.RightTypeId = src.RightTypeId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, RightTypeId, PermissionKey)
    VALUES (src.ModuleId, src.RightTypeId, src.PermissionKey);
GO

/* Who may see and manage them. Scheme-content configuration, so the same three
   roles that run Sectors and Parameters: Super Admin and Operations Admin in
   full, Ministry Reviewer read-and-configure. Everyone else gets nothing here,
   which is the default (no row = no right). Granted directly rather than through
   the seed's bit-string, which only spans the original fifteen modules. */
MERGE auth.RolePermission AS tgt
USING (
    SELECT r.RoleId, p.PermissionId
    FROM auth.Permission p
    JOIN auth.Role r ON r.Code IN ('SUPER_ADMIN', 'OPERATIONS_ADMIN', 'MINISTRY_REVIEWER')
    WHERE p.ModuleId IN (16, 17)
) AS src
   ON tgt.RoleId = src.RoleId AND tgt.PermissionId = src.PermissionId
WHEN NOT MATCHED BY TARGET THEN
    INSERT (RoleId, PermissionId) VALUES (src.RoleId, src.PermissionId);
GO

/* ------------------------------------------------------------- menu items ---
   Top-level, each gated by its own module. Placed after Technology Upgradation
   and before Documents, where scheme-content configuration sits. */
MERGE auth.MenuItem AS tgt
USING (VALUES
    ('ESG_CHECKLIST',   16, N'ESG Checklist',          '/esg-checklist',        'leaf',   1150),
    ('BASIC_INFO_DOCS', 17, N'Basic Info & Documents', '/basic-info-documents', 'folder', 1160)
) AS src (Code, ModuleId, Label, RoutePath, IconKey, SortOrder)
   ON tgt.Code = src.Code
WHEN MATCHED THEN UPDATE SET
    ModuleId = src.ModuleId, Label = src.Label, RoutePath = src.RoutePath,
    IconKey = src.IconKey, SortOrder = src.SortOrder, IsActive = 1
WHEN NOT MATCHED BY TARGET THEN
    INSERT (ModuleId, ParentMenuItemId, Code, Label, RoutePath, IconKey, SortOrder, AccountTypeId, IsActive)
    VALUES (src.ModuleId, NULL, src.Code, src.Label, src.RoutePath, src.IconKey, src.SortOrder, NULL, 1);
GO

/* ============================================================ ESG checklist ===
   Sections hold questions. A question's options are always Yes / No / Not
   Applicable, so they are not a table — the answer set is a constant.

   A conditional question carries ParentQuestionId and ShowWhenAnswer: it is
   shown only when the parent was answered that way. ParentQuestionId null is
   the normal case, an always-shown question. */
IF OBJECT_ID('master.EsgSection', 'U') IS NULL
BEGIN
    CREATE TABLE master.EsgSection
    (
        EsgSectionId smallint       NOT NULL IDENTITY(1,1),
        Code         varchar(30)    NOT NULL,
        Name         nvarchar(200)  NOT NULL,
        Description  nvarchar(500)  NULL,
        SortOrder    smallint       NOT NULL CONSTRAINT DF_EsgSection_Sort   DEFAULT 0,
        IsActive     bit            NOT NULL CONSTRAINT DF_EsgSection_Active DEFAULT 1,

        CONSTRAINT PK_EsgSection PRIMARY KEY (EsgSectionId),
        CONSTRAINT UQ_EsgSection_Code UNIQUE (Code)
    );
END
GO

IF OBJECT_ID('master.EsgQuestion', 'U') IS NULL
BEGIN
    CREATE TABLE master.EsgQuestion
    (
        EsgQuestionId    int            NOT NULL IDENTITY(1,1),
        EsgSectionId     smallint       NOT NULL,
        Code             varchar(30)    NOT NULL,
        Text             nvarchar(1000) NOT NULL,
        HelpText         nvarchar(500)  NULL,
        SortOrder        smallint       NOT NULL CONSTRAINT DF_EsgQuestion_Sort   DEFAULT 0,

        /* Conditional display: shown only when the parent question is answered
           ShowWhenAnswer. Null parent = always shown. */
        ParentQuestionId int            NULL,
        ShowWhenAnswer   varchar(3)     NULL,

        IsActive         bit            NOT NULL CONSTRAINT DF_EsgQuestion_Active DEFAULT 1,

        CONSTRAINT PK_EsgQuestion PRIMARY KEY (EsgQuestionId),
        CONSTRAINT UQ_EsgQuestion_Code UNIQUE (Code),
        CONSTRAINT FK_EsgQuestion_Section FOREIGN KEY (EsgSectionId)
            REFERENCES master.EsgSection (EsgSectionId),
        /* A parent question cannot be deleted out from under a child; and a
           child in a different section would read oddly, but that is a UI
           concern, not enforced here. NO ACTION avoids a multiple-cascade-path
           error on the self reference. */
        CONSTRAINT FK_EsgQuestion_Parent FOREIGN KEY (ParentQuestionId)
            REFERENCES master.EsgQuestion (EsgQuestionId),
        CONSTRAINT CK_EsgQuestion_ShowWhen
            CHECK (ShowWhenAnswer IS NULL OR ShowWhenAnswer IN ('Yes', 'No')),
        /* A trigger answer without a parent, or a parent without a trigger, is a
           half-defined condition. Both or neither. */
        CONSTRAINT CK_EsgQuestion_Conditional
            CHECK ((ParentQuestionId IS NULL AND ShowWhenAnswer IS NULL)
                OR (ParentQuestionId IS NOT NULL AND ShowWhenAnswer IS NOT NULL))
    );

    CREATE INDEX IX_EsgQuestion_Section ON master.EsgQuestion (EsgSectionId, SortOrder);
    CREATE INDEX IX_EsgQuestion_Parent  ON master.EsgQuestion (ParentQuestionId)
        WHERE ParentQuestionId IS NOT NULL;
END
GO

/* ============================================== Basic-information items ======
   The declared part of the application's first step: site photographs, yes/no
   declarations, the energy-source checklist. InputType tells the app how to
   render each — a photo capture, a Yes/No, free text, or a tick list — so the
   form is data, not code, and an item can be added without a release. */
IF OBJECT_ID('master.BasicInfoItem', 'U') IS NULL
BEGIN
    CREATE TABLE master.BasicInfoItem
    (
        BasicInfoItemId smallint       NOT NULL IDENTITY(1,1),
        Code            varchar(30)    NOT NULL,

        /* Which part of the basic-info screen the item sits under, e.g.
           Photographs, Audits, Process & Energy. Free-grouping by name. */
        GroupName       nvarchar(100)  NOT NULL,
        Label           nvarchar(300)  NOT NULL,
        HelpText        nvarchar(300)  NULL,

        /* photo | yesno | text | number | checklist */
        InputType       varchar(20)    NOT NULL,

        IsRequired      bit            NOT NULL CONSTRAINT DF_BasicInfoItem_Req  DEFAULT 1,
        SortOrder       smallint       NOT NULL CONSTRAINT DF_BasicInfoItem_Sort DEFAULT 0,
        IsActive        bit            NOT NULL CONSTRAINT DF_BasicInfoItem_Act  DEFAULT 1,

        CONSTRAINT PK_BasicInfoItem PRIMARY KEY (BasicInfoItemId),
        CONSTRAINT UQ_BasicInfoItem_Code UNIQUE (Code),
        CONSTRAINT CK_BasicInfoItem_InputType
            CHECK (InputType IN ('photo', 'yesno', 'text', 'number', 'checklist'))
    );
END
GO

/* ============================================ Document-upload requirements ====
   The checklist of documents an applicant uploads — one row per required item
   on the application's document step. AcceptedTypes is the MIME allow-list the
   picker enforces; CertificationLevelId scopes an item to a level, null = all.*/
IF OBJECT_ID('master.DocumentRequirement', 'U') IS NULL
BEGIN
    CREATE TABLE master.DocumentRequirement
    (
        DocumentRequirementId smallint       NOT NULL IDENTITY(1,1),
        Code                  varchar(30)    NOT NULL,
        Name                  nvarchar(300)  NOT NULL,
        HelpText              nvarchar(300)  NULL,

        CertificationLevelId  tinyint        NULL,
        AcceptedTypes         varchar(200)   NOT NULL
            CONSTRAINT DF_DocReq_Types DEFAULT 'image/*,application/pdf',

        IsMandatory           bit            NOT NULL CONSTRAINT DF_DocReq_Mand DEFAULT 1,
        SortOrder             smallint       NOT NULL CONSTRAINT DF_DocReq_Sort DEFAULT 0,
        IsActive              bit            NOT NULL CONSTRAINT DF_DocReq_Act  DEFAULT 1,

        CONSTRAINT PK_DocumentRequirement PRIMARY KEY (DocumentRequirementId),
        CONSTRAINT UQ_DocumentRequirement_Code UNIQUE (Code),
        CONSTRAINT FK_DocumentRequirement_Level FOREIGN KEY (CertificationLevelId)
            REFERENCES msme.CertificationLevel (CertificationLevelId)
    );
END
GO

PRINT N'Migration 039 — ESG checklist and application-form config applied.';
GO

namespace MCLS.Domain.Enums;

/// <summary>
/// The nine managed account types. Values match
/// <c>auth.AccountType.AccountTypeId</c>; Super Admin is a role inside
/// <see cref="MinistryOfMsme"/>, not a type of its own.
/// </summary>
public enum AccountTypeId
{
    ImplementingAgency = 1,
    MinistryOfMsme = 2,
    StateSpecific = 3,
    OemPsuIa = 4,
    OperationAdmin = 5,
    ConsultantOrganisation = 6,
    AssessmentAgency = 7,
    Consultants = 8,
    Assessors = 9,
}

/// <summary>
/// The fifteen sidebar modules, in sidebar order. Values match
/// <c>auth.Module.ModuleId</c>.
/// </summary>
public enum ModuleId
{
    Dashboard = 1,
    Handholding = 2,
    Assessments = 3,
    UserManagement = 4,
    Sectors = 5,
    Parameter = 6,
    QuestionnaireSilver = 7,
    QuestionnaireGold = 8,
    FeeStructure = 9,
    Incentives = 10,
    TechnologyUpgradation = 11,
    Documents = 12,
    Reports = 13,
    Emailer = 14,
    Settings = 15,
}

/// <summary>The five rights each module can carry.</summary>
public enum RightTypeId
{
    View = 1,
    Create = 2,
    Edit = 3,
    Delete = 4,
    Export = 5,
}

public enum UserStatusId
{
    Active = 1,
    Inactive = 2,
    PendingActivation = 3,
    Locked = 4,
}

public enum CertificationLevelId
{
    Bronze = 1,
    Silver = 2,
    Gold = 3,
}

/// <summary>
/// The application state machine. Legal transitions live in
/// <c>msme.ApplicationStatusTransition</c>, not in code, so the workflow can
/// be corrected without a deployment.
/// </summary>
public enum ApplicationStatusId
{
    Registered = 1,
    PaymentReceived = 2,
    HandholdingInProgress = 3,
    HandholdingCompleted = 4,
    AssessmentScheduled = 5,
    AssessmentInProgress = 6,
    NcRaised = 7,
    QualityCheck = 8,
    Certified = 9,
    Rejected = 10,
}

public enum IncentiveProviderId
{
    Ministry = 1,
    StateGovernment = 2,
    FinancialInstitutions = 3,
    Others = 4,
}

/// <summary>
/// Permission keys as the API and the JWT use them: <c>MODULE.right</c>, e.g.
/// <c>USER_MGMT.edit</c>. Declared as constants so a controller attribute is
/// checked at compile time instead of relying on a hand-typed string.
/// </summary>
public static class Permissions
{
    public const string Dashboard = "DASHBOARD";
    public const string Handholding = "HANDHOLDING";
    public const string Assessments = "ASSESSMENTS";
    public const string UserManagement = "USER_MGMT";
    public const string Sectors = "SECTORS";
    public const string Parameter = "PARAMETER";
    public const string QuestionnaireSilver = "QUES_SILVER";
    public const string QuestionnaireGold = "QUES_GOLD";
    public const string FeeStructure = "FEE_STRUCTURE";
    public const string Incentives = "INCENTIVES";
    public const string TechnologyUpgradation = "TECH_UPGRAD";
    public const string Documents = "DOCUMENTS";
    public const string Reports = "REPORTS";
    public const string Emailer = "EMAILER";
    public const string Settings = "SETTINGS";
    public const string EsgChecklist = "ESG_CHECKLIST";
    public const string BasicInfoDocs = "BASIC_INFO_DOCS";
    public const string ELearning = "E_LEARNING";
    public const string PartnerOrgs = "PARTNER_ORGS";

    public const string View = "view";
    public const string Create = "create";
    public const string Edit = "edit";
    public const string Delete = "delete";
    public const string Export = "export";

    /// <summary>Builds the <c>MODULE.right</c> key.</summary>
    public static string Key(string module, string right) => $"{module}.{right}";
}

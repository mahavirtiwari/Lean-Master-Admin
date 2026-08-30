// Contracts shared with the .NET API. Names match the JSON the controllers
// emit (camelCase via JsonNamingPolicy.CamelCase), so no mapping layer is
// needed between HTTP and the components.

export interface MenuItem {
  menuItemId: number;
  code: string;
  label: string;
  routePath: string | null;
  iconKey: string | null;
  children: MenuItem[];
}

export interface CurrentUser {
  userId: number;
  userCode: string;
  fullName: string;
  initials: string;
  email: string;
  designation: string | null;
  accountTypeId: number;
  accountTypeName: string;
  roleName: string;
  roleCode: string;
  organisationId: number | null;
  organisationName: string | null;
  jurisdiction: string | null;
  mustChangePassword: boolean;
  permissions: string[];
  menu: MenuItem[];
}

export interface LoginResponse {
  accessToken: string;
  expiresOnUtc: string;
  refreshToken: string;
  refreshTokenExpiresOnUtc: string;
  user: CurrentUser;
}

export interface Paged<T> {
  items: T[];
  totalCount: number;
  pageNumber: number;
  pageSize: number;
  totalPages: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

// ------------------------------------------------------------- masters ---

export interface Sector {
  sectorId: number;
  nicCode: string;
  name: string;
  description: string | null;
  isActive: boolean;
  msmesMapped: number;
}

export interface Parameter {
  parameterId: number;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface Technology {
  technologyId: number;
  code: string;
  name: string;
  description: string | null;
  technologyCategoryId: number;
  categoryName: string;
  sectorId: number | null;
  sectorName: string | null;
  isActive: boolean;
}

export interface TechnologyCategory {
  technologyCategoryId: number;
  code: string;
  name: string;
  isActive: boolean;
  technologyCount: number;
}

// ---------------------------------------------------------------- users ---

export interface AccountType {
  accountTypeId: number;
  code: string;
  name: string;
  description: string | null;
  userCount?: number;
}

/** The nine cards on the User Management landing screen. */
export interface AccountTypeSummary {
  accountTypeId: number;
  code: string;
  name: string;
  shortName: string;
  iconKey: string | null;
  description: string | null;
  /**
   * False for the six types the portal does not issue directly — an OEM or a
   * consultant is created by the organisation that empanels them, so the card
   * lists them but offers no "Create New User".
   */
  canCreateDirectly: boolean;
  sortOrder: number;
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;

  /**
   * Set only on a card that stands for several account types — the deck shows
   * OEMs, PSUs and IAs as one industry-partner group, so selecting that card
   * has to select all three underneath.
   */
  groupedTypeIds?: number[];
}

export interface UserDetail {
  /** States and districts a State Specific officer covers. */
  jurisdictions?: { stateId: number; districtIds: number[] }[];

  userId: number;
  userCode: string;
  fullName: string;
  initials: string | null;
  email: string;
  mobile: string | null;
  designation: string | null;
  accountTypeId: number;
  accountTypeName: string;
  roleId: number;
  roleName: string;
  organisationId: number | null;
  organisationName: string | null;
  stateId: number | null;
  jurisdiction: string | null;
  statusId: number;
  statusName: string;
  lastLoginOnUtc: string | null;
  createdOnUtc: string;
  permissions: string[];
}

/** One module x right cell in the Edit Role & Permissions grid. */
export interface PermissionMatrixRow {
  permissionId: number;
  permissionKey: string;
  moduleId: number;
  moduleCode: string;
  moduleName: string;
  sortOrder: number;
  rightCode: string;
  /** Granted by the user's role rather than by an override. */
  fromRole: boolean;
  hasOverride: boolean;
  isGranted: boolean;
}

/** The Role & Permission Matrix on the User Management landing screen. */
export interface PermissionMatrixModule {
  moduleId: number;
  code: string;
  name: string;
  sortOrder: number;
}

export interface PermissionMatrixAccessRow {
  accountTypeId: number | null;
  label: string;
  isSuperAdmin: boolean;
  /** One flag per module, in `modules` order. */
  access: boolean[];
}

export interface PermissionMatrix {
  modules: PermissionMatrixModule[];
  rows: PermissionMatrixAccessRow[];
}

export interface UserRow {
  userId: number;
  userCode: string;
  fullName: string;
  initials: string | null;
  email: string;
  mobile: string | null;
  designation: string | null;
  accountTypeId: number;
  accountTypeName: string;
  accountTypeShortName: string;
  roleId: number;
  roleName: string;
  organisationId: number | null;
  organisationName: string | null;
  stateId: number | null;
  stateName: string | null;
  jurisdiction: string | null;
  statusId: number;
  statusName: string;
  statusColour: string | null;
  lastLoginOnUtc: string | null;
  createdOnUtc: string;
  createdByName: string | null;
}

export interface Role {
  roleId: number;
  code: string;
  name: string;
  accountTypeId: number | null;
}

export interface Organisation {
  organisationId: number;
  code: string;
  name: string;
  accountTypeId: number;
}

/** A master.LookupValue row, e.g. AGENCY_CATEGORY. */
export interface LookupValue {
  lookupValueId: number;
  code: string;
  name: string;
}

export interface StateRef {
  stateId: number;
  code: string;
  name: string;
  isUnionTerritory: boolean;
  isNorthEastern: boolean;
}

export interface DistrictRef {
  districtId: number;
  stateId: number;
  name: string;
}

// ------------------------------------------------------------------ fee ---

export interface FeeStructureRow {
  feeRateId: number;
  certificationLevelId: number;
  levelName: string;
  amountInclusiveGst: number;
  gstPercent: number;
  goiShare: number;
  msmeShare: number;
  msmeTaxable: number;
  gstAmount: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface FeeStructure {
  subsidyCategory: {
    subsidyCategoryId: number;
    code: string;
    name: string;
    goiPercent: number;
    msmePercent: number;
  };
  gstPercent: number;
  rows: FeeStructureRow[];
}

/** One subsidy category's split for a level, computed server-side. */
export interface FeeLevelRow {
  code: string;
  name: string;
  subsidyPercent: number;
  goiShare: number;
  msmeShare: number;
  gstAmount: number;
  msmeTaxable: number;
  tds194C: number;
  tds194J: number;
  netAfter194C: number;
  netAfter194J: number;
}

export interface FeeLevel {
  certificationLevelId: number;
  code: string;
  name: string;
  feeRateId: number | null;
  fee: number;
  gstPercent: number;
  tds194CPercent: number;
  tds194JPercent: number;
  isFree: boolean;
  rows: FeeLevelRow[];
}

export interface SubsidyCategory {
  subsidyCategoryId: number;
  code: string;
  name: string;
  baseSubsidyPercent: number;
  additionalPercent: number;
  totalSubsidyPercent: number;
}

export interface TdsSection {
  tdsSectionId: number;
  sectionCode: string;
  description: string;
  ratePercent: number;
  applicableTo: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}

// ----------------------------------------------------------- incentives ---

export interface IncentiveProvider {
  providerId: number;
  code: string;
  name: string;
  description: string | null;
  activeIncentiveCount: number;
}

export interface Incentive {
  incentiveId: number;
  code: string;
  name: string;
  providerId: number;
  providerName: string;
  administeringBody: string | null;
  certificationLevelId: number | null;
  certificationLevelName: string | null;
  stateId: number | null;
  stateName: string | null;
  description: string | null;
  eligibilityCriteria: string | null;
  benefitDescription: string | null;
  outlayAmount: number | null;
  status: string;
  validFrom: string | null;
  validTo: string | null;
  externalUrl: string | null;
}

// ------------------------------------------------------------ documents ---

export interface DocumentRow {
  documentId: number;
  title: string;
  description: string | null;
  categoryLookupId: number | null;
  categoryName: string | null;
  isActive: boolean;
  createdOnUtc: string;
  currentVersionLabel: string | null;
  currentFileName: string | null;
  currentFileSizeBytes: number | null;
  currentUploadedOnUtc: string | null;
  versionCount: number;
  uploadedByName: string | null;
  accountTypeIds: number[];

  /** Set when the row is a hosted video rather than an uploaded file. */
  videoUrl: string | null;
}

/** One of the ten columns in the document role matrix. */
export interface DocumentAudience {
  accountTypeId: number;
  code: string;
  name: string;
  shortName: string;
}

export interface DocumentVersion {
  documentVersionId: number;
  versionLabel: string;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  isLive: boolean;
  uploadedOnUtc: string;
  uploadedByName: string;
}

export interface DocumentDetail extends Omit<DocumentRow, 'currentVersionLabel' | 'currentFileName' | 'currentFileSizeBytes' | 'currentUploadedOnUtc' | 'versionCount'> {
  versions: DocumentVersion[];
}

// -------------------------------------------------------------- emailer ---

export interface EmailCampaign {
  emailCampaignId: number;
  name: string;
  subject: string;
  status: string;
  scheduledForUtc: string | null;
  sentOnUtc: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  createdOnUtc: string;
  accountTypeIds: number[];
}

export interface EmailTemplate {
  emailTemplateId: number;
  code: string;
  name: string;
  subject: string;
  bodyHtml: string;
  availableTags: string | null;
  /** The scheme event that fires this mail. Fixed once the template exists. */
  triggerEvent: string | null;
  replyToAddress: string | null;
  copyToAddress: string | null;
  isTransactional: boolean;
  isActive: boolean;
  modifiedOnUtc: string | null;
  accountTypeIds: number[];
}

/**
 * One addressable account type on the Campaign screen. Distinct from
 * AccountTypeSummary, which is the User Management list and excludes MSME
 * Enterprise.
 */
export interface EmailerAudience {
  accountTypeId: number;
  code: string;
  name: string;
  shortName: string;
  sortOrder: number;
  activeUsers: number;
}

/** The four count tiles on the Campaign screen. */
export interface EmailerSummary {
  campaigns: number;
  templates: number;
  recipients: number;
  deliveryRate: number;
}

// ------------------------------------------------------------- settings ---

export interface SystemSetting {
  systemSettingId: number;
  key: string;
  value: string | null;
  dataType: string;
  category: string;
  displayName: string;
  description: string | null;
  isSensitive: boolean;
  isEditable: boolean;
  /** What the setting shipped as; drives "Reset to Default". */
  defaultValue: string | null;
  categorySortOrder: number;
  iconKey: string | null;
  modifiedOnUtc: string | null;
}

export interface SettingGroup {
  category: string;
  iconKey: string | null;
  sortOrder: number;
  settings: SystemSetting[];
}

/**
 * Maintenance Mode is drawn as its own panel at the foot of the screen rather
 * than as another group card, so the API hands it over separately.
 */
export interface SystemSettingsResponse {
  groups: SettingGroup[];
  maintenance: SystemSetting[];
}

export interface PaymentGateway {
  paymentGatewayId: number;
  code: string;
  name: string;
  /** Primary, Fallback or Disabled — drawn under the gateway name. */
  roleLabel: string;
  mode: string;
  merchantKeyMask: string | null;
  priority: number | null;
  lastTxnOnUtc: string | null;
  successRate: number | null;
  isEnabled: boolean;
}

export interface PaymentGatewayResponse {
  gateways: PaymentGateway[];
  activeCount: number;
  totalCount: number;
  defaultGateway: string | null;
}

export interface AuditLog {
  auditLogId: number;
  occurredOnUtc: string;
  userId: number | null;
  userName: string | null;
  /** The role the actor held at the time, not the one they hold now. */
  roleName: string | null;
  moduleId: number | null;
  moduleName: string | null;
  action: string;
  entityName: string;
  entityKey: string | null;
  affectedColumns: string | null;
  ipAddress: string | null;
  outcome: string;
  correlationId: string | null;
}

/** The four count tiles above the Audit Trail. */
export interface AuditSummary {
  totalEntries: number;
  modulesTracked: number;
  distinctUsers: number;
  failedActions: number;
}

export interface AuditFilters {
  users: { userId: number; name: string; roleName: string | null; entries: number }[];
  modules: { moduleId: number; name: string }[];
  actions: string[];
}

/**
 * One fault on the Error Log. The screen shows a row per error CODE with an
 * occurrence count, not a row per occurrence — 118 failed-login events are one
 * problem, not 118 rows.
 */
export interface ErrorGroup {
  latestErrorLogId: number;
  errorCode: string;
  lastSeenUtc: string;
  severity: string;
  moduleId: number | null;
  moduleName: string | null;
  message: string;
  occurrences: number;
  status: string;
}

export interface ErrorSummary {
  critical: number;
  error: number;
  warning: number;
  info: number;
  resolvedLast7Days: number;
  totalEvents: number;
}

export interface ErrorVolume {
  series: { day: string; count: number }[];
  peak: number;
}

export interface ErrorFilters {
  severities: string[];
  statuses: string[];
  modules: { moduleId: number; name: string }[];
}

export interface ErrorLog {
  errorLogId: number;
  occurredOnUtc: string;
  severity: string;
  source: string | null;
  exceptionType: string | null;
  message: string;
  requestMethod: string | null;
  requestPath: string | null;
  statusCode: number | null;
  userId: number | null;
  correlationId: string | null;
  isResolved: boolean;
  resolvedOnUtc: string | null;
}

// ------------------------------------------------------- API management ---

export interface ApiKeyRow {
  apiKeyId: number;
  name: string;
  /** A mask such as mcls_live_****4kA2. The secret is never returned. */
  keyPrefix: string;
  owner: string;
  status: string;
  lastUsedOnUtc: string | null;
}

export interface ApiEndpointRow {
  apiEndpointId: number;
  method: string;
  route: string;
  description: string | null;
  calls24h: number;
  errorRate: number;
  status: string;
}

export interface ApiRateLimitRow {
  apiRateLimitId: number;
  tierName: string;
  requestsPerMin: number;
  currentUsage: number;
  usagePercent: number;
}

export interface WebhookRow {
  webhookId: number;
  event: string;
  targetUrl: string;
  status: string;
  lastSentUtc: string | null;
}

export interface ApiManagement {
  keys: ApiKeyRow[];
  endpoints: ApiEndpointRow[];
  rateLimits: ApiRateLimitRow[];
  webhooks: WebhookRow[];
  summary: {
    activeEndpoints: number;
    liveKeys: number;
    calls24h: number;
    errorRate: number;
  };
}

export interface ApiRegistryRow {
  apiRegistryId: number;
  code: string;
  name: string;
  description: string | null;
  direction: string;
  baseUrl: string | null;
  authType: string | null;
  timeoutSeconds: number;
  isEnabled: boolean;
  lastCheckedOnUtc: string | null;
  lastStatusCode: number | null;
  lastLatencyMs: number | null;
}

// ------------------------------------------------------- questionnaires ---

export interface QuestionnaireLevelSummary {
  certificationLevelId: number;
  code: string;
  name: string;
  questions: number;
  modules: number;
  questionnaires: number;
}

export interface Questionnaire {
  questionnaireId: number;
  code: string;
  name: string;
  certificationLevelId: number;
  certificationLevelName: string;
  sectorId: number | null;
  sectorName: string | null;
  versionNo: number;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedOnUtc: string | null;
  requirementCount: number;
  checkpointCount: number;
}


// ---------------------------------------------------------- demographics ---
// The Gender / Enterprise Type / Social Category / NIC panels. All four are
// counted from columns the Udyam registry supplies.

export interface DemographicSlice {
  label: string;
  count: number;
  percent: number;
}

export interface NicSlice {
  code: string;
  name: string | null;
  enterprises: number;
  certified: number;
  percent: number;
}

export interface Demographics {
  total: number;
  gender: DemographicSlice[];
  enterpriseType: DemographicSlice[];
  socialCategory: DemographicSlice[];
  nic: NicSlice[];
}

// ------------------------------------------------- questionnaire manager ---
// A "question" on this screen is a checkpoint: the assessment content is
// already Questionnaire -> Requirement -> Checkpoint, and the bank is that
// tree flattened rather than a fourth table repeating it.

export interface QuestionnaireLevelCard {
  certificationLevelId: number;
  code: string;
  name: string;
  questions: number;
  modules: number;
  passMark: number | null;
  status: string;
  lastUpdatedUtc: string | null;
}

export interface ExamConfigRow {
  code: string;
  levelName: string;
  totalQuestions: number;
  passMarkPercent: number;
  /** 0 means no negative marking, which the screen renders as "No". */
  negativeMarkPerWrong: number;
  timeLimitMinutes: number;
  maxAttempts: number;
}

export interface BankQuestion {
  checkpointId: number;
  questionId: string;
  preview: string;
  levelCode: string;
  levelName: string;
  module: string;
  difficulty: string;
  status: string;
  version: string;
  requirementId: number;
}

export interface QuestionnaireManager {
  levels: QuestionnaireLevelCard[];
  examConfig: ExamConfigRow[];
  bank: { items: BankQuestion[]; totalCount: number; pageNumber: number; pageSize: number };
}

// ---------------------------------------------------------------- ESG checklist ---

export interface EsgSection {
  esgSectionId: number;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  questionCount: number;
}

export interface EsgSectionSave {
  code: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
}

export interface EsgQuestion {
  esgQuestionId: number;
  esgSectionId: number;
  code: string;
  text: string;
  helpText: string | null;
  sortOrder: number;
  parentQuestionId: number | null;
  parentText: string | null;
  showWhenAnswer: 'Yes' | 'No' | null;
  isActive: boolean;
}

export interface EsgQuestionSave {
  esgSectionId: number;
  code: string;
  text: string;
  helpText?: string | null;
  sortOrder?: number;
  parentQuestionId?: number | null;
  showWhenAnswer?: 'Yes' | 'No' | null;
}

export interface EsgParentOption {
  esgQuestionId: number;
  code: string;
  text: string;
}

// ------------------------------------------------- basic info + documents ---

export interface BasicInfoItem {
  basicInfoItemId: number;
  code: string;
  groupName: string;
  label: string;
  helpText: string | null;
  inputType: 'photo' | 'yesno' | 'text' | 'number' | 'checklist';
  isRequired: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface BasicInfoItemSave {
  code: string;
  groupName: string;
  label: string;
  helpText?: string | null;
  inputType: string;
  isRequired: boolean;
  sortOrder?: number;
}

export interface DocumentRequirement {
  documentRequirementId: number;
  code: string;
  name: string;
  helpText: string | null;
  certificationLevelId: number | null;
  acceptedTypes: string;
  isMandatory: boolean;
  sortOrder: number;
  isActive: boolean;
}

export interface DocumentRequirementSave {
  code: string;
  name: string;
  helpText?: string | null;
  certificationLevelId?: number | null;
  acceptedTypes?: string;
  isMandatory: boolean;
  sortOrder?: number;
}

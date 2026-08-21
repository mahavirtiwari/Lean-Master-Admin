import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import * as M from './models';
import { Demographics } from './models';

/**
 * One typed client for the whole API.
 *
 * A service per module would be tidier on paper, but every one of them would
 * hold the same three lines of HttpClient plumbing, and the screens routinely
 * need two modules at once (a user form wants roles and states; the technology
 * form wants categories and sectors). Keeping it in one place means a screen
 * injects one thing.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBase;

  // ------------------------------------------------------------ reference ---

  states(): Observable<M.StateRef[]> {
    return this.http.get<M.StateRef[]>(`${this.base}/reference/states`);
  }

  districts(stateId?: number): Observable<M.DistrictRef[]> {
    return this.http.get<M.DistrictRef[]>(`${this.base}/reference/districts`, {
      params: params({ stateId }),
    });
  }

  lookupValues(typeCode: string): Observable<M.LookupValue[]> {
    return this.http.get<M.LookupValue[]>(`${this.base}/reference/lookups/${typeCode}`);
  }

  accountTypes(): Observable<M.AccountType[]> {
    return this.http.get<M.AccountType[]>(`${this.base}/reference/account-types`);
  }

  roles(accountTypeId?: number): Observable<M.Role[]> {
    return this.http.get<M.Role[]>(`${this.base}/reference/roles`, {
      params: params({ accountTypeId }),
    });
  }

  organisations(accountTypeId?: number): Observable<M.Organisation[]> {
    return this.http.get<M.Organisation[]>(`${this.base}/reference/organisations`, {
      params: params({ accountTypeId }),
    });
  }

  // ---------------------------------------------------------------- users ---

  userAccountTypes(): Observable<M.AccountTypeSummary[]> {
    return this.http.get<M.AccountTypeSummary[]>(`${this.base}/users/account-types`);
  }

  permissionMatrix(): Observable<M.PermissionMatrix> {
    return this.http.get<M.PermissionMatrix>(`${this.base}/users/permission-matrix`);
  }

  users(query: Record<string, unknown>): Observable<M.Paged<M.UserRow>> {
    return this.http.get<M.Paged<M.UserRow>>(`${this.base}/users`, { params: params(query) });
  }

  user(id: number): Observable<M.UserDetail> {
    return this.http.get<M.UserDetail>(`${this.base}/users/${id}`);
  }

  createUser(body: unknown): Observable<unknown> {
    return this.http.post(`${this.base}/users`, body);
  }

  updateUser(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/users/${id}`, body);
  }

  setUserStatus(id: number, body: unknown): Observable<void> {
    return this.http.post<void>(`${this.base}/users/${id}/status`, body);
  }

  userPermissions(id: number): Observable<M.PermissionMatrixRow[]> {
    return this.http.get<M.PermissionMatrixRow[]>(`${this.base}/users/${id}/permissions`);
  }

  saveUserPermissions(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/users/${id}/permissions`, body);
  }

  // -------------------------------------------------------------- sectors ---

  sectors(query: Record<string, unknown>): Observable<M.Paged<M.Sector>> {
    return this.http.get<M.Paged<M.Sector>>(`${this.base}/sectors`, { params: params(query) });
  }

  sectorSummary(): Observable<{ total: number; active: number; mapped: number }> {
    return this.http.get<{ total: number; active: number; mapped: number }>(
      `${this.base}/sectors/summary`,
    );
  }

  createSector(body: unknown): Observable<M.Sector> {
    return this.http.post<M.Sector>(`${this.base}/sectors`, body);
  }

  updateSector(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/sectors/${id}`, body);
  }

  setSectorStatus(id: number, isActive: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/sectors/${id}/status`, { isActive });
  }

  // ----------------------------------------------------------- parameters ---

  parameters(query: Record<string, unknown>): Observable<M.Paged<M.Parameter>> {
    return this.http.get<M.Paged<M.Parameter>>(`${this.base}/parameters`, {
      params: params(query),
    });
  }

  createParameter(body: unknown): Observable<M.Parameter> {
    return this.http.post<M.Parameter>(`${this.base}/parameters`, body);
  }

  updateParameter(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/parameters/${id}`, body);
  }

  setParameterStatus(id: number, isActive: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/parameters/${id}/status`, { isActive });
  }

  // --------------------------------------------------------- technologies ---

  technologies(query: Record<string, unknown>): Observable<M.Paged<M.Technology>> {
    return this.http.get<M.Paged<M.Technology>>(`${this.base}/technologies`, {
      params: params(query),
    });
  }

  technologySummary(): Observable<{
    totalTechnologies: number;
    active: number;
    categories: number;
    msmesAdopted: number;
  }> {
    return this.http.get<{
      totalTechnologies: number;
      active: number;
      categories: number;
      msmesAdopted: number;
    }>(`${this.base}/technologies/summary`);
  }

  technologyCategories(): Observable<M.TechnologyCategory[]> {
    return this.http.get<M.TechnologyCategory[]>(`${this.base}/technologies/categories`);
  }

  createTechnology(body: unknown): Observable<unknown> {
    return this.http.post(`${this.base}/technologies`, body);
  }

  updateTechnology(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/technologies/${id}`, body);
  }

  setTechnologyStatus(id: number, isActive: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/technologies/${id}/status`, { isActive });
  }

  // -------------------------------------------------------- fee structure ---

  feeStructure(subsidyCategoryCode?: string): Observable<M.FeeStructure> {
    return this.http.get<M.FeeStructure>(`${this.base}/fee-structure`, {
      params: params({ subsidyCategoryCode }),
    });
  }

  feeLevel(code: string): Observable<M.FeeLevel> {
    return this.http.get<M.FeeLevel>(`${this.base}/fee-structure/level/${code}`);
  }

  updateFeeLevel(code: string, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/fee-structure/level/${code}`, body);
  }

  subsidyCategories(): Observable<M.SubsidyCategory[]> {
    return this.http.get<M.SubsidyCategory[]>(`${this.base}/fee-structure/subsidy-categories`);
  }

  updateFeeRate(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/fee-structure/rates/${id}`, body);
  }

  tdsSections(): Observable<M.TdsSection[]> {
    return this.http.get<M.TdsSection[]>(`${this.base}/fee-structure/tds`);
  }

  updateTdsSection(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/fee-structure/tds/${id}`, body);
  }

  // ----------------------------------------------------------- incentives ---

  incentiveProviders(): Observable<M.IncentiveProvider[]> {
    return this.http.get<M.IncentiveProvider[]>(`${this.base}/incentives/providers`);
  }

  incentives(query: Record<string, unknown>): Observable<M.Paged<M.Incentive>> {
    return this.http.get<M.Paged<M.Incentive>>(`${this.base}/incentives`, {
      params: params(query),
    });
  }

  incentive(id: number): Observable<M.Incentive> {
    return this.http.get<M.Incentive>(`${this.base}/incentives/${id}`);
  }

  createIncentive(body: unknown): Observable<unknown> {
    return this.http.post(`${this.base}/incentives`, body);
  }

  updateIncentive(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/incentives/${id}`, body);
  }

  setIncentiveStatus(id: number, isActive: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/incentives/${id}/status`, { isActive });
  }

  // ------------------------------------------------------------ documents ---

  documents(query: Record<string, unknown>): Observable<M.Paged<M.DocumentRow>> {
    return this.http.get<M.Paged<M.DocumentRow>>(`${this.base}/documents`, {
      params: params(query),
    });
  }

  documentSummary(): Observable<{
    total: number;
    active: number;
    versions: number;
    categories: number;
  }> {
    return this.http.get<{ total: number; active: number; versions: number; categories: number }>(
      `${this.base}/documents/summary`,
    );
  }

  documentAudiences(): Observable<M.DocumentAudience[]> {
    return this.http.get<M.DocumentAudience[]>(`${this.base}/documents/audiences`);
  }

  document(id: number): Observable<M.DocumentDetail> {
    return this.http.get<M.DocumentDetail>(`${this.base}/documents/${id}`);
  }

  uploadDocument(form: FormData): Observable<unknown> {
    return this.http.post(`${this.base}/documents`, form);
  }

  updateDocument(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/documents/${id}`, body);
  }

  deleteDocument(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/documents/${id}`);
  }

  // -------------------------------------------------------------- emailer ---

  campaigns(query: Record<string, unknown>): Observable<M.Paged<M.EmailCampaign>> {
    return this.http.get<M.Paged<M.EmailCampaign>>(`${this.base}/emailer/campaigns`, {
      params: params(query),
    });
  }

  /** Account types a campaign can target, with reachable active-user counts. */
  emailerAudiences(): Observable<M.EmailerAudience[]> {
    return this.http.get<M.EmailerAudience[]>(`${this.base}/emailer/audiences`);
  }

  emailerSummary(): Observable<M.EmailerSummary> {
    return this.http.get<M.EmailerSummary>(`${this.base}/emailer/summary`);
  }

  createCampaign(body: unknown): Observable<unknown> {
    return this.http.post(`${this.base}/emailer/campaigns`, body);
  }

  sendCampaign(id: number): Observable<{ queued: number }> {
    return this.http.post<{ queued: number }>(`${this.base}/emailer/campaigns/${id}/send`, {});
  }

  emailTemplates(query: Record<string, unknown> = {}): Observable<M.EmailTemplate[]> {
    return this.http.get<M.EmailTemplate[]>(`${this.base}/emailer/templates`, {
      params: params(query),
    });
  }

  emailTemplate(id: number): Observable<M.EmailTemplate> {
    return this.http.get<M.EmailTemplate>(`${this.base}/emailer/templates/${id}`);
  }

  updateEmailTemplate(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/emailer/templates/${id}`, body);
  }

  // ------------------------------------------------------------- settings ---

  systemSettings(): Observable<M.SystemSettingsResponse> {
    return this.http.get<M.SystemSettingsResponse>(`${this.base}/settings/system`);
  }

  updateSystemSetting(id: number, value: string | null): Observable<void> {
    return this.http.put<void>(`${this.base}/settings/system/${id}`, { value });
  }

  /** The "Save Changes" button — the whole screen in one request. */
  saveSystemSettings(settings: { systemSettingId: number; value: string | null }[]): Observable<void> {
    return this.http.put<void>(`${this.base}/settings/system`, { settings });
  }

  resetSystemSettings(): Observable<{ reset: number }> {
    return this.http.post<{ reset: number }>(`${this.base}/settings/system/reset`, {});
  }

  paymentGateways(): Observable<M.PaymentGatewayResponse> {
    return this.http.get<M.PaymentGatewayResponse>(`${this.base}/settings/payment-gateways`);
  }

  updatePaymentGateway(id: number, isEnabled: boolean): Observable<void> {
    return this.http.put<void>(`${this.base}/settings/payment-gateways/${id}`, { isEnabled });
  }

  auditLogs(query: Record<string, unknown>): Observable<M.Paged<M.AuditLog>> {
    return this.http.get<M.Paged<M.AuditLog>>(`${this.base}/settings/audit-logs`, {
      params: params(query),
    });
  }

  auditSummary(query: Record<string, unknown>): Observable<M.AuditSummary> {
    return this.http.get<M.AuditSummary>(`${this.base}/settings/audit-logs/summary`, {
      params: params(query),
    });
  }

  auditFilters(): Observable<M.AuditFilters> {
    return this.http.get<M.AuditFilters>(`${this.base}/settings/audit-logs/filters`);
  }

  errorLogs(query: Record<string, unknown>): Observable<M.Paged<M.ErrorGroup>> {
    return this.http.get<M.Paged<M.ErrorGroup>>(`${this.base}/settings/error-logs`, {
      params: params(query),
    });
  }

  errorSummary(query: Record<string, unknown>): Observable<M.ErrorSummary> {
    return this.http.get<M.ErrorSummary>(`${this.base}/settings/error-logs/summary`, {
      params: params(query),
    });
  }

  errorVolume(days = 14): Observable<M.ErrorVolume> {
    return this.http.get<M.ErrorVolume>(`${this.base}/settings/error-logs/volume`, {
      params: params({ days }),
    });
  }

  errorFilters(): Observable<M.ErrorFilters> {
    return this.http.get<M.ErrorFilters>(`${this.base}/settings/error-logs/filters`);
  }

  /** Triages every occurrence of one fault, which is what the screen acts on. */
  setErrorStatus(errorCode: string, status: string, note?: string): Observable<{ updated: number }> {
    return this.http.post<{ updated: number }>(
      `${this.base}/settings/error-logs/code/${encodeURIComponent(errorCode)}/status`,
      { status, note },
    );
  }

  resolveErrorLog(id: number, resolutionNote: string | null): Observable<void> {
    return this.http.post<void>(`${this.base}/settings/error-logs/${id}/resolve`, {
      resolutionNote,
    });
  }

  apis(): Observable<M.ApiRegistryRow[]> {
    return this.http.get<M.ApiRegistryRow[]>(`${this.base}/settings/apis`);
  }

  apiManagement(): Observable<M.ApiManagement> {
    return this.http.get<M.ApiManagement>(`${this.base}/settings/api-management`);
  }

  revokeApiKey(id: number): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.base}/settings/api-management/keys/${id}/revoke`,
      {},
    );
  }

  updateApi(id: number, body: unknown): Observable<void> {
    return this.http.put<void>(`${this.base}/settings/apis/${id}`, body);
  }

  // ------------------------------------------------------- questionnaires ---

  questionnaireSummary(): Observable<M.QuestionnaireLevelSummary[]> {
    return this.http.get<M.QuestionnaireLevelSummary[]>(`${this.base}/questionnaires/summary`);
  }

  /** Everything the Questionnaire Manager draws, in one request. */
  questionnaireManager(query: Record<string, unknown>): Observable<M.QuestionnaireManager> {
    return this.http.get<M.QuestionnaireManager>(`${this.base}/questionnaires/manager`, {
      params: params(query),
    });
  }

  questionnaires(query: Record<string, unknown>): Observable<M.Paged<M.Questionnaire>> {
    return this.http.get<M.Paged<M.Questionnaire>>(`${this.base}/questionnaires`, {
      params: params(query),
    });
  }

  questionnaire(id: number): Observable<unknown> {
    return this.http.get(`${this.base}/questionnaires/${id}`);
  }

  // --------------------------------------------------------- applications ---

  applications(query: Record<string, unknown>): Observable<M.Paged<Record<string, unknown>>> {
    return this.http.get<M.Paged<Record<string, unknown>>>(`${this.base}/applications`, {
      params: params(query),
    });
  }

  demographics(query: Record<string, unknown> = {}): Observable<Demographics> {
    return this.http.get<Demographics>(`${this.base}/applications/dashboard/demographics`, {
      params: params(query),
    });
  }

  dashboardFilters(): Observable<{
    certificationLevels: { id: number; name: string }[];
    implementingAgencies: { id: number; name: string }[];
  }> {
    return this.http.get<{
      certificationLevels: { id: number; name: string }[];
      implementingAgencies: { id: number; name: string }[];
    }>(`${this.base}/applications/dashboard/filters`);
  }

  geography(query: Record<string, unknown> = {}): Observable<{
    states: { stateId: number; name: string; registered: number; certified: number }[];
    districts: { name: string; state: string; registered: number; certified: number }[];
  }> {
    return this.http.get<{
      states: { stateId: number; name: string; registered: number; certified: number }[];
      districts: { name: string; state: string; registered: number; certified: number }[];
    }>(`${this.base}/applications/geography`, { params: params(query) });
  }

  dashboard(query: Record<string, unknown> = {}): Observable<Record<string, unknown>> {
    return this.http.get<Record<string, unknown>>(`${this.base}/applications/dashboard`, {
      params: params(query),
    });
  }
}

/**
 * Drops null, undefined and empty-string entries.
 *
 * Without this an untouched filter would be sent as `?search=`, and the API
 * treats an empty search as a search for the empty string on some endpoints —
 * so a blank box would silently return nothing.
 */
function params(source: Record<string, unknown>): HttpParams {
  let result = new HttpParams();

  for (const [key, value] of Object.entries(source)) {
    if (value === null || value === undefined || value === '') continue;
    result = result.set(key, String(value));
  }

  return result;
}

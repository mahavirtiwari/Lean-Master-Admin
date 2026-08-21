import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Paged } from '../../core/models';

/** One of the five boxes the overview leads with. */
export interface IncentiveCategory {
  categoryId: number;
  code: string;
  name: string;
  description: string | null;
  typicalPartners: string | null;
  accentHex: string;
  activeCount: number;
  totalCount: number;
  activationBadge: 'Silver' | 'Gold' | 'Both';
}

/** One of the four sub-menus: who funds the benefit. */
export interface IncentiveProvider {
  providerId: number;
  code: string;
  name: string;
  description: string | null;
  activeIncentiveCount: number;
}

export interface IncentiveTotals {
  active: number;
  draft: number;
  total: number;
  beneficiaries: number;
  disbursed: number;
}

export interface IncentiveRow {
  incentiveId: number;
  code: string;
  name: string;
  categoryName: string | null;
  categoryAccent: string | null;
  activationLevel: 'Silver' | 'Gold' | 'Both';
  stakeholder: string;
  beneficiaries: number;
  valueDisbursed: number;
  status: string;
  videoCount: number;
  linkCount: number;
  documentCount: number;
  createdOnUtc: string;
}

export interface IncentiveResource {
  resourceId: number;
  kind: 'Video' | 'Link' | 'Document';
  title: string;
  url: string | null;
  fileName: string | null;
  sizeBytes: number | null;
}

export interface IncentiveDetail {
  incentiveId: number;
  code: string;
  name: string;
  providerId: number;
  providerCode: string;
  providerName: string;
  categoryId: number | null;
  categoryName: string | null;
  schemeCode: string | null;
  activationLevel: 'Silver' | 'Gold' | 'Both' | null;
  administeringBody: string | null;
  stateId: number | null;
  stateName: string | null;
  description: string | null;
  eligibilityCriteria: string | null;
  benefitDescription: string | null;
  outlayAmount: number | null;
  budgetHead: string | null;
  gazetteNo: string | null;
  productType: string | null;
  rateConcessionBps: number | null;
  agencyType: string | null;
  externalSchemeId: string | null;
  contactName: string | null;
  contactDesignation: string | null;
  contactMobile: string | null;
  contactEmail: string | null;
  visibleBeforeUnlock: boolean;
  notifyOnPublish: boolean;
  requireClaimDocument: boolean;
  status: string;
  validFrom: string | null;
  validTo: string | null;
  externalUrl: string | null;
  videoUrl: string | null;
  resources: IncentiveResource[];
}

export type IncentiveSave = Partial<Omit<IncentiveDetail, 'incentiveId' | 'resources'>> & {
  name: string;
  providerId: number;
};

export interface IncentiveListResponse {
  page: Paged<IncentiveRow>;
  totals: IncentiveTotals;
}

export interface IncentiveOverview {
  categories: IncentiveCategory[];
  providers: { providerId: number; code: string; name: string; active: number; total: number }[];
  totals: IncentiveTotals;
}

/**
 * The Incentives module's API.
 *
 * Its own client rather than another section of ApiService: incentives are a
 * self-contained module with a dozen calls of their own, and ApiService is
 * already the longest file in core.
 */
@Injectable({ providedIn: 'root' })
export class IncentivesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBase}/incentives`;

  overview(): Observable<IncentiveOverview> {
    return this.http.get<IncentiveOverview>(`${this.base}/overview`);
  }

  categories(): Observable<IncentiveCategory[]> {
    return this.http.get<IncentiveCategory[]>(`${this.base}/categories`);
  }

  providers(): Observable<IncentiveProvider[]> {
    return this.http.get<IncentiveProvider[]>(`${this.base}/providers`);
  }

  list(query: {
    providerCode?: string;
    search?: string;
    status?: string;
    categoryId?: number;
    activation?: string;
    pageNumber?: number;
    pageSize?: number;
  }): Observable<IncentiveListResponse> {
    const params: Record<string, string> = {};

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') params[key] = String(value);
    }

    return this.http.get<IncentiveListResponse>(this.base, { params });
  }

  get(id: number): Observable<IncentiveDetail> {
    return this.http.get<IncentiveDetail>(`${this.base}/${id}`);
  }

  create(body: IncentiveSave): Observable<{ incentiveId: number }> {
    return this.http.post<{ incentiveId: number }>(this.base, body);
  }

  update(id: number, body: IncentiveSave): Observable<void> {
    return this.http.put<void>(`${this.base}/${id}`, body);
  }

  setStatus(id: number, isActive: boolean): Observable<void> {
    return this.http.post<void>(`${this.base}/${id}/status`, { isActive });
  }

  uploadDocument(id: number, file: File, title?: string): Observable<IncentiveResource> {
    const form = new FormData();

    form.append('file', file);
    if (title) form.append('title', title);

    return this.http.post<IncentiveResource>(`${this.base}/${id}/documents`, form);
  }

  deleteResource(resourceId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/resources/${resourceId}`);
  }

  downloadUrl(resourceId: number): string {
    return `${this.base}/resources/${resourceId}/download`;
  }
}

/**
 * The four provider routes, and what each one's screens say.
 *
 * Kept in one place because the list and the form both need it and they are
 * reached by different routes — /incentives/ministry and
 * /incentives/ministry/new — so neither can hand it to the other.
 */
export interface ProviderProfile {
  slug: string;
  code: string;
  name: string;
  listTitle: string;
  listSubtitle: string;
  createSubtitle: string;
  ownerLabel: string;
  ownerPlaceholder: string;
  note: string;
  /** Bronze is never an activation level; some providers narrow it further. */
  allowSilverOnly: boolean;
}

export const PROVIDER_PROFILES: Record<string, ProviderProfile> = {
  ministry: {
    slug: 'ministry',
    code: 'MINISTRY',
    name: 'Ministry of MSME',
    listTitle: 'Ministry of MSME Incentives',
    listSubtitle:
      'Central schemes administered by the Ministry of MSME and the Office of DC (MSME)',
    createSubtitle:
      'Add a central scheme administered by the Ministry of MSME or the Office of DC (MSME)',
    ownerLabel: 'ADMINISTERING DEPARTMENT',
    ownerPlaceholder: 'e.g. Office of DC (MSME)',
    note: 'Central incentives activate only after Silver or Gold certification is issued. Bronze-certified MSMEs will see the benefit locked.',
    allowSilverOnly: true,
  },
  state: {
    slug: 'state',
    code: 'STATE',
    name: 'State Govt.',
    listTitle: 'State Government Incentives',
    listSubtitle: 'Benefits notified by State Governments and Union Territory administrations',
    createSubtitle: 'Add a benefit notified by a State Government or Union Territory',
    ownerLabel: 'STATE DEPARTMENT',
    ownerPlaceholder: 'e.g. Directorate of Industries',
    note: 'State incentives activate only after Silver or Gold certification is issued. Bronze-certified MSMEs will see the benefit locked.',
    allowSilverOnly: true,
  },
  financial: {
    slug: 'financial',
    code: 'FINANCIAL',
    name: 'Financial Institutions',
    listTitle: 'Financial Institution Incentives',
    listSubtitle: 'Concessional credit and fee benefits offered by banks and financial institutions',
    createSubtitle: 'Add a credit or fee benefit offered by a bank or financial institution',
    ownerLabel: 'FINANCIAL INSTITUTION',
    ownerPlaceholder: 'e.g. State Bank of India',
    note: 'Lending benefits activate only after Silver or Gold certification is issued. Bronze-certified MSMEs will see the benefit locked.',
    allowSilverOnly: true,
  },
  others: {
    slug: 'others',
    code: 'OTHERS',
    name: 'Others',
    listTitle: 'Other Incentives',
    listSubtitle: 'Support offered by agencies outside the Ministry, States and financial institutions',
    createSubtitle: 'Add support offered by an agency outside the categories above',
    ownerLabel: 'ISSUING AGENCY',
    ownerPlaceholder: 'e.g. Quality Council of India',
    note: 'These incentives activate only after Silver or Gold certification is issued. Bronze-certified MSMEs will see the benefit locked.',
    allowSilverOnly: true,
  },
};

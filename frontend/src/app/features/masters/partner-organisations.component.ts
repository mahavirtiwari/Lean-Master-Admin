import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { httpErrorMessage } from '../../shared/http-error';
import { istDateTime } from '../../shared/when';

/** A file-name stamp: 20260830-0241. */
function stampName(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

interface PartnerRow {
  organisationId: number;
  organisationCode: string;
  name: string;
  kind: 'Association' | 'OEM' | 'PSU';
  approvalStatus: 'Draft' | 'Pending' | 'Approved' | 'Rejected';
  jurisdictionScope: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  stateName: string | null;
  raisedBy: string | null;
  decidedOnUtc: string | null;
  decisionRemark: string | null;
  isActive: boolean;
  userCount: number;
  /** Raised by this caller's own agency, so theirs to change. */
  isMine: boolean;
}

interface VerificationRow {
  partnerVerificationId: number;
  partnerKind: 'Association' | 'OemPsu';
  referenceNo: string | null;
  status: 'Pending' | 'Approved' | 'Disputed';
  createdOnUtc: string;
  decidedOnUtc: string | null;
  decisionRemark: string | null;
  enterprise: { name: string; leanId: string | null; udyamRegistrationNo: string | null } | null;
}

/**
 * Associations, OEMs and PSUs — the panel both halves of the workflow use.
 *
 * Rendered inside User Management > OEMs, PSUs and IAs, one kind per screen:
 * those sub-menus are about exactly these bodies, so this is not a separate
 * place in the menu saying the same thing. `embeddedKind` is what narrows it,
 * and it also drops the page header the host screen already provides.
 *
 * An Implementing Agency raises a body and it sits Pending; a State Office
 * approves or rejects it. Implementing Agencies themselves are not here: the
 * Super Admin creates those and they are live at once.
 *
 * The same screen carries the claims queue, because an association signing in
 * to confirm one of its members is looking at the same subject from the other
 * side — not a different screen.
 */
@Component({
  selector: 'app-partner-organisations',
  imports: [FormsModule, RouterLink],
  templateUrl: './partner-organisations.component.html',
  styleUrl: './partner-organisations.component.scss',
})
export class PartnerOrganisationsComponent {
  /** Association | OEM | PSU when hosted inside a User Management screen. */
  readonly embeddedKind = input<'Association' | 'OEM' | 'PSU' | null>(null);

  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly base = environment.apiBase;

  readonly rows = signal<PartnerRow[]>([]);
  readonly claims = signal<VerificationRow[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);

  readonly kind = signal<'' | 'Association' | 'OEM' | 'PSU'>('');
  readonly status = signal<'' | 'Pending' | 'Approved' | 'Rejected'>('');
  readonly search = signal('');

  readonly adding = signal(false);
  readonly form = signal({
    kind: 'Association' as 'Association' | 'OEM' | 'PSU',
    name: '',
    jurisdictionScope: '',
    contactEmail: '',
    contactPhone: '',
  });
  readonly formError = signal<string | null>(null);
  readonly saving = signal(false);

  /** The body being looked at, edited, or taken out of use. */
  readonly viewing = signal<PartnerRow | null>(null);
  readonly editingId = signal<number | null>(null);
  readonly togglingStatus = signal<PartnerRow | null>(null);

  /** The record or claim being decided, and the remark being typed for it. */
  readonly deciding = signal<PartnerRow | null>(null);
  readonly decidingClaim = signal<VerificationRow | null>(null);
  readonly approving = signal(true);
  readonly remark = signal('');
  readonly decideError = signal<string | null>(null);

  /**
   * Raising a body is the Implementing Agency's job — it proposes what it works
   * with, and a State Office decides. A Super Admin holds every right in the
   * portal, so the rights alone would offer it the button; the account type is
   * what actually decides. auth.AccountType 1 is Implementing Agency.
   */
  readonly canCreate = this.auth.can('USER_MGMT', 'create')
    && this.auth.user()?.accountTypeId === 1;
  readonly canDecide = this.auth.can('USER_MGMT', 'edit');
  readonly canExport = this.auth.can('USER_MGMT', 'export');

  readonly pendingCount = computed(() => this.rows().filter((r) => r.approvalStatus === 'Pending').length);
  readonly approvedCount = computed(() => this.rows().filter((r) => r.approvalStatus === 'Approved').length);
  readonly openClaims = computed(() => this.claims().filter((c) => c.status === 'Pending').length);

  constructor() {
    // The host sets the kind from its account type, so the load waits for it
    // rather than fetching every body and then narrowing.
    effect(() => {
      const kind = this.embeddedKind();
      if (kind) this.kind.set(kind);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);

    const params = new URLSearchParams();
    const kind = this.embeddedKind() ?? this.kind();
    if (kind) params.set('kind', kind);
    if (this.status()) params.set('status', this.status());
    if (this.search().trim()) params.set('search', this.search().trim());

    this.http.get<{ rows: PartnerRow[] }>(`${this.base}/partner-organisations?${params}`).subscribe({
      next: (r) => {
        this.rows.set(r.rows ?? []);
        this.loading.set(false);
      },
      error: (e: unknown) => {
        this.loadError.set(httpErrorMessage(e));
        this.loading.set(false);
      },
    });

    // The claims queue is only populated for a body that has been named, so an
    // empty list is the normal case for an agency or a State Office.
    this.http.get<{ rows: VerificationRow[] }>(`${this.base}/partner-organisations/verifications`).subscribe({
      next: (r) => this.claims.set(r.rows ?? []),
      error: () => this.claims.set([]),
    });
  }

  startEdit(row: PartnerRow): void {
    this.editingId.set(row.organisationId);
    this.adding.set(true);
    this.formError.set(null);
    this.form.set({
      kind: row.kind === 'Association' ? 'Association' : row.kind,
      name: row.name,
      jurisdictionScope: row.jurisdictionScope ?? '',
      contactEmail: row.contactEmail ?? '',
      contactPhone: row.contactPhone ?? '',
    });
  }

  cancelForm(): void {
    this.adding.set(false);
    this.editingId.set(null);
    this.formError.set(null);
  }

  confirmStatus(): void {
    const row = this.togglingStatus();
    if (!row) return;

    this.http.post(`${this.base}/partner-organisations/${row.organisationId}/status`,
                   { isActive: !row.isActive }).subscribe({
      next: () => {
        this.togglingStatus.set(null);
        this.load();
      },
      error: () => this.togglingStatus.set(null),
    });
  }

  startAdd(): void {
    this.editingId.set(null);
    this.adding.set(true);
    this.formError.set(null);
    this.form.set({ kind: this.embeddedKind() ?? 'Association', name: '', jurisdictionScope: '', contactEmail: '', contactPhone: '' });
  }

  save(): void {
    const f = this.form();

    if (f.name.trim().length < 3) {
      this.formError.set('Enter the name of the body, at least three characters.');
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const body = {
      kind: f.kind,
      name: f.name.trim(),
      jurisdictionScope: f.jurisdictionScope.trim() || null,
      contactEmail: f.contactEmail.trim() || null,
      contactPhone: f.contactPhone.trim() || null,
    };

    const id = this.editingId();
    const request = id
      ? this.http.put(`${this.base}/partner-organisations/${id}`, body)
      : this.http.post(`${this.base}/partner-organisations`, body);

    request.subscribe({
      next: () => {
        this.saving.set(false);
        this.cancelForm();
        this.load();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.formError.set(httpErrorMessage(e, 'The body could not be added.'));
      },
    });
  }

  startDecision(row: PartnerRow, approve: boolean): void {
    this.deciding.set(row);
    this.approving.set(approve);
    this.remark.set('');
    this.decideError.set(null);
  }

  startClaimDecision(claim: VerificationRow, approve: boolean): void {
    this.decidingClaim.set(claim);
    this.approving.set(approve);
    this.remark.set('');
    this.decideError.set(null);
  }

  confirmDecision(): void {
    const row = this.deciding();
    const claim = this.decidingClaim();
    const approve = this.approving();

    if (!approve && !this.remark().trim()) {
      this.decideError.set(
        claim ? 'Give a reason when disputing a claim.' : 'Give a reason so the agency can correct it.',
      );
      return;
    }

    const url = claim
      ? `${this.base}/partner-organisations/verifications/${claim.partnerVerificationId}/decision`
      : `${this.base}/partner-organisations/${row!.organisationId}/decision`;

    this.http.post(url, { approve, remark: this.remark().trim() || null }).subscribe({
      next: () => {
        this.deciding.set(null);
        this.decidingClaim.set(null);
        this.load();
      },
      error: (e: unknown) => this.decideError.set(httpErrorMessage(e, 'The decision could not be saved.')),
    });
  }

  cancelDecision(): void {
    this.deciding.set(null);
    this.decidingClaim.set(null);
    this.decideError.set(null);
  }

  /**
   * Whether this caller may change this row.
   *
   * An agency sees every body — an applicant may name any of them — but only
   * corrects what it raised. Anyone who is not an agency is judged by rights
   * alone, which is how a State Office decides and a Super Admin corrects a
   * seeded record.
   */
  mayChange(row: PartnerRow): boolean {
    const isAgency = this.auth.user()?.accountTypeId === 1;
    return isAgency ? row.isMine : this.canDecide;
  }

  claimLabel(kind: string): string {
    return kind === 'Association' ? 'member of the association' : 'vendor to the OEM / PSU';
  }

  refLabel(kind: string): string {
    return kind === 'Association' ? 'Member ID' : 'Vendor ID';
  }

  when(iso: string | null): string {
    return iso ? istDateTime(iso) : '—';
  }

  /** The account type whose user list a body's accounts belong to. */
  accountTypeIdFor(): number {
    switch (this.embeddedKind()) {
      case 'OEM': return 4;
      case 'PSU': return 11;
      default: return 12;
    }
  }

  /**
   * The workbook comes from the API: the same filters, every column including
   * the ones the table has no room for, and a real .xlsx rather than a CSV
   * wearing the extension.
   */
  export(): void {
    const params = new URLSearchParams();
    const kind = this.embeddedKind() ?? this.kind();
    if (kind) params.set('kind', kind);
    if (this.status()) params.set('status', this.status());

    this.http.get(`${this.base}/partner-organisations/export?${params}`, { responseType: 'blob' })
      .subscribe((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(kind || 'bodies').toLowerCase()}-${stampName()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      });
  }

}

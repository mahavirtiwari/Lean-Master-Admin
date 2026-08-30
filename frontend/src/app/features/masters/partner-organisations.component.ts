import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AuthService } from '../../core/auth.service';
import { environment } from '../../../environments/environment';
import { httpErrorMessage } from '../../shared/http-error';
import { istDateTime } from '../../shared/when';
import { downloadCsv, stamp } from '../../shared/csv';

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
  imports: [FormsModule],
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

  /** The record or claim being decided, and the remark being typed for it. */
  readonly deciding = signal<PartnerRow | null>(null);
  readonly decidingClaim = signal<VerificationRow | null>(null);
  readonly approving = signal(true);
  readonly remark = signal('');
  readonly decideError = signal<string | null>(null);

  readonly canCreate = this.auth.can('USER_MGMT', 'create');
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

  startAdd(): void {
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

    this.http.post(`${this.base}/partner-organisations`, {
      kind: f.kind,
      name: f.name.trim(),
      jurisdictionScope: f.jurisdictionScope.trim() || null,
      contactEmail: f.contactEmail.trim() || null,
      contactPhone: f.contactPhone.trim() || null,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.adding.set(false);
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

  claimLabel(kind: string): string {
    return kind === 'Association' ? 'member of the association' : 'vendor to the OEM / PSU';
  }

  refLabel(kind: string): string {
    return kind === 'Association' ? 'Member ID' : 'Vendor ID';
  }

  when(iso: string | null): string {
    return iso ? istDateTime(iso) : '—';
  }

  export(): void {
    downloadCsv(
      `partner-organisations-${stamp()}`,
      ['Code', 'Name', 'Kind', 'Status', 'Coverage', 'Raised by', 'Decided on'],
      this.rows().map((r) => [
        r.organisationCode,
        r.name,
        r.kind,
        r.approvalStatus,
        r.jurisdictionScope ?? '',
        r.raisedBy ?? 'Super Admin',
        r.decidedOnUtc ? istDateTime(r.decidedOnUtc) : '',
      ]),
    );
  }
}
